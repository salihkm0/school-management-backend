// services/samboornaImportService.js
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const ImportBatch = require('../models/ImportBatch');
const Subject = require('../models/Subject');
const SubjectClassTemplate = require('../models/SubjectClassTemplate');
const Parent = require('../models/Parent');
const User = require('../models/User');
const Notification = require('../models/Notification');

class SamboornaImportService {
  constructor(academicYearId, userId, options = {}) {
    this.academicYearId = academicYearId;
    this.userId = userId;
    this.batchId = null;
    this.classCache = new Map();
    this.academicYearCache = new Map();
    this.subjectCache = new Map();
    this.classLanguageSubjects = new Map();
    this.options = {
      autoCreateClasses: options.autoCreateClasses !== false,
      updateExistingStudents: options.updateExistingStudents !== false,
      batchSize: options.batchSize || 100,
      autoAssignSubjects: options.autoAssignSubjects !== false,
      autoConnectParents: options.autoConnectParents !== false,
      ...options
    };
    
    this.statistics = {
      totalRows: 0,
      processedRows: 0,
      successfulInserts: 0,
      updatedRecords: 0,
      failedRecords: 0,
      skippedRecords: 0,
      classesCreated: 0,
      academicYearsCreated: 0,
      subjectsCreated: 0,
      subjectsAssigned: 0,
      parentsProcessed: 0,
      parentConnectionsUpdated: 0,
      parentCacheUpdated: 0,
      parentNotificationsSent: 0
    };
    
    this.errors = [];
    this.warnings = [];
  }

  parseExcel(filePath) {
    console.log('=== Parsing Excel file ===');
    
    const workbook = XLSX.readFile(filePath);
    
    const allSheetsRows = workbook.SheetNames.map(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
      });
    });

    if (allSheetsRows.length === 0) {
      console.error('No sheets found in Excel file');
      return [];
    }
    
    const primaryRows = allSheetsRows[0];
    console.log(`Total rows in primary sheet: ${primaryRows.length}`);
    
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, primaryRows.length); i++) {
      const row = primaryRows[i];
      if (row && row.some(cell => String(cell).includes('Student code'))) {
        headerRowIndex = i;
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      console.error('Could not find header row with "Student code"');
      return [];
    }
    
    const allHeaders = allSheetsRows.map(sheetRows => {
      if (headerRowIndex < sheetRows.length) {
        return (sheetRows[headerRowIndex] || []).map(h => this.cleanColumnName(String(h || '')));
      }
      return [];
    });
    
    const result = [];
    const maxDataRows = Math.max(...allSheetsRows.map(rows => rows.length));
    
    for (let i = headerRowIndex + 1; i < maxDataRows; i++) {
      const primaryRow = primaryRows[i] || [];
      const firstCell = String(primaryRow[0] || '').trim();
      
      if (!firstCell || firstCell === '' || !/^\d+$/.test(firstCell)) {
        continue;
      }
      
      const mergedObj = {};
      
      for (let s = 0; s < allSheetsRows.length; s++) {
        const sheetRows = allSheetsRows[s];
        const headers = allHeaders[s];
        const row = sheetRows[i] || [];
        
        for (let j = 0; j < headers.length; j++) {
          if (headers[j]) {
            if (mergedObj[headers[j]] === undefined || mergedObj[headers[j]] === '') {
              mergedObj[headers[j]] = row[j] !== undefined && row[j] !== null ? row[j] : '';
            }
          }
        }
      }
      result.push(mergedObj);
    }
    
    console.log(`Valid data rows parsed (merged from ${allSheetsRows.length} sheets): ${result.length}`);
    
    return result;
  }

  cleanColumnName(name) {
    if (!name) return '';
    return name
      .replace(/^\uFEFF/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getValue(row, ...possibleNames) {
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
        return row[name];
      }
      if (row['\uFEFF' + name] !== undefined) {
        return row['\uFEFF' + name];
      }
      for (const key of Object.keys(row)) {
        if (this.cleanColumnName(key).toLowerCase() === name.toLowerCase()) {
          return row[key];
        }
      }
    }
    return '';
  }

  parseDivisionField(divisionField, classField) {
    const cleanDivision = divisionField ? String(divisionField).trim() : '';
    const cleanClass = classField ? String(classField).trim() : '';

    const fullPattern = /^(\d+)\s+([A-Za-z]+)\s+(\d{4}-\d{4})$/;
    const match = cleanDivision.match(fullPattern);
    
    if (match) {
      return {
        className: match[1],
        division: match[2],
        academicYearString: match[3]
      };
    }

    return {
      className: cleanClass || cleanDivision.split(' ')[0] || null,
      division: cleanDivision.split(' ')[1] || null,
      academicYearString: cleanDivision.split(' ').slice(2).join(' ') || null
    };
  }

  parseAcademicYear(academicYearString) {
    if (!academicYearString) return null;
    
    const yearPattern = /^(\d{4})-(\d{4})$/;
    const match = academicYearString.match(yearPattern);
    
    if (match) {
      return {
        year: academicYearString,
        name: `Academic Year ${academicYearString}`,
        startYear: parseInt(match[1]),
        endYear: parseInt(match[2])
      };
    }
    
    return null;
  }

  async getOrCreateAcademicYear(academicYearString) {
    if (!academicYearString) return null;

    const cacheKey = academicYearString;
    if (this.academicYearCache.has(cacheKey)) {
      return this.academicYearCache.get(cacheKey);
    }

    const parsed = this.parseAcademicYear(academicYearString);
    if (!parsed) return null;

    let academicYear = await AcademicYear.findOne({ year: parsed.year });
    
    if (!academicYear && this.options.autoCreateClasses) {
      const startDate = new Date(parsed.startYear, 5, 1);
      const endDate = new Date(parsed.endYear, 2, 31);
      
      academicYear = await AcademicYear.create({
        name: parsed.name,
        year: parsed.year,
        startDate: startDate,
        endDate: endDate,
        isActive: true,
        isCurrent: false
      });
      
      this.statistics.academicYearsCreated++;
      console.log(`Auto-created academic year: ${parsed.year}`);
    }

    if (academicYear) {
      this.academicYearCache.set(cacheKey, academicYear);
    }

    return academicYear;
  }

  async getOrCreateClass(className, division, academicYearId) {
    if (!className) return null;

    const cacheKey = `${className}-${division || 'null'}-${academicYearId}`;
    
    if (this.classCache.has(cacheKey)) {
      return this.classCache.get(cacheKey);
    }

    let classDoc = await Class.findOne({
      name: className,
      section: division || null,
      academicYearId: academicYearId
    });

    if (!classDoc && this.options.autoCreateClasses) {
      classDoc = await Class.create({
        name: className,
        section: division || null,
        academicYearId: academicYearId,
        isActive: true,
        capacity: 50,
        subjects: []
      });
      
      this.statistics.classesCreated++;
      console.log(`Auto-created class: ${className} ${division || ''}`);
    }

    if (classDoc) {
      this.classCache.set(cacheKey, classDoc);
    }

    return classDoc;
  }

  async resolveClassAndAcademicYear(row) {
    const classField = this.getValue(row, 'Class');
    const divisionField = this.getValue(row, 'Division');
    
    const parsed = this.parseDivisionField(divisionField, classField);
    
    let academicYearId = this.academicYearId;
    
    if (parsed.academicYearString) {
      const academicYear = await this.getOrCreateAcademicYear(parsed.academicYearString);
      if (academicYear) {
        academicYearId = academicYear._id;
      }
    }

    const classInfo = await this.getOrCreateClass(
      parsed.className,
      parsed.division,
      academicYearId
    );

    return {
      classInfo,
      academicYearId,
      className: parsed.className,
      division: parsed.division,
      academicYearString: parsed.academicYearString
    };
  }

  async getOrCreateLanguageSubject(langName) {
    if (!langName || langName === 'Not Applicable' || langName.trim() === '') {
      return null;
    }
    
    let cleanName = langName.trim();
    
    if (cleanName.includes('(')) {
      cleanName = cleanName.split('(')[0].trim();
    }
    
    const cacheKey = cleanName.toLowerCase();
    if (this.subjectCache.has(cacheKey)) {
      return this.subjectCache.get(cacheKey);
    }
    
    const languageMap = {
      'Malayalam': { code: 'MAL', type: 'core' },
      'English': { code: 'ENG', type: 'core' },
      'Hindi': { code: 'HIN', type: 'core' },
      'Arabic': { code: 'ARB', type: 'elective' },
      'Arabic(A)': { code: 'ARB', type: 'elective' },
      'Urdu': { code: 'URD', type: 'elective' },
      'Sanskrit': { code: 'SAN', type: 'elective' },
      'Tamil': { code: 'TAM', type: 'elective' },
      'Kannada': { code: 'KAN', type: 'elective' },
      'French': { code: 'FRE', type: 'elective' },
      'German': { code: 'GER', type: 'elective' }
    };
    
    const mapped = languageMap[cleanName];
    let code, type;
    
    if (mapped) {
      code = mapped.code;
      type = mapped.type;
    } else {
      code = cleanName.substring(0, 3).toUpperCase();
      type = 'elective';
    }
    
    let subject = await Subject.findOne({ 
      $or: [{ name: cleanName }, { code: code }] 
    });
    
    if (!subject) {
      subject = await Subject.create({
        name: cleanName,
        code: code,
        description: `${cleanName} language`,
        type: type,
        creditHours: cleanName === 'English' || cleanName === 'Malayalam' ? 4 : 3,
        department: 'Languages',
        gradeLevel: 'all'
      });
      this.statistics.subjectsCreated++;
      console.log(`Created language subject: ${cleanName} (${code})`);
    }
    
    this.subjectCache.set(cacheKey, subject._id);
    return subject._id;
  }

  async resolveLanguageSubjects(row) {
    const firstLang = this.getValue(row, 'First Language(Paper I)');
    const secondLang = this.getValue(row, 'First Language(Paper II)');
    const thirdLang = this.getValue(row, 'Third language');
    const additionalLang = this.getValue(row, 'Additional language');
    
    const [firstLangId, secondLangId, thirdLangId, additionalLangId] = await Promise.all([
      this.getOrCreateLanguageSubject(firstLang),
      this.getOrCreateLanguageSubject(secondLang),
      this.getOrCreateLanguageSubject(thirdLang),
      this.getOrCreateLanguageSubject(additionalLang)
    ]);
    
    const languages = [firstLang, secondLang, thirdLang, additionalLang]
      .filter(l => l && l !== 'Not Applicable' && String(l).trim() !== '');
    
    const languageIds = [firstLangId, secondLangId, thirdLangId, additionalLangId]
      .filter(id => id !== null);
    
    return {
      firstLanguagePaper1: firstLangId || null,
      firstLanguagePaper2: secondLangId || null,
      thirdLanguage: thirdLangId || null,
      additionalLanguage: additionalLangId || null,
      languages: languages,
      languageIds: languageIds
    };
  }

  async autoAssignSubjectsFromTemplate(className, section, classId) {
    if (!this.options.autoAssignSubjects) return [];
    
    try {
      const template = await SubjectClassTemplate.findOne({ 
        className: className,
        isActive: true 
      });
      
      if (!template) {
        console.log(`No subject template found for class ${className}`);
        return [];
      }
      
      let subjectIds = [];
      
      if (template.sectionSpecific && template.sectionSubjects && section) {
        const sectionSubjects = template.sectionSubjects.get(section);
        if (sectionSubjects && sectionSubjects.length > 0) {
          subjectIds = sectionSubjects;
        } else {
          subjectIds = template.subjects;
        }
      } else {
        subjectIds = template.subjects;
      }
      
      if (subjectIds.length > 0) {
        await Class.findByIdAndUpdate(classId, {
          $addToSet: { subjects: { $each: subjectIds } }
        });
        this.statistics.subjectsAssigned += subjectIds.length;
        console.log(`Auto-assigned ${subjectIds.length} template subjects to class ${className}-${section || ''}`);
      }
      
      return subjectIds;
    } catch (error) {
      console.error('Error auto-assigning subjects from template:', error);
      return [];
    }
  }

  trackClassLanguageSubjects(classId, languageIds) {
    if (!classId || !languageIds || languageIds.length === 0) return;
    
    const classKey = classId.toString();
    if (!this.classLanguageSubjects.has(classKey)) {
      this.classLanguageSubjects.set(classKey, new Set());
    }
    
    languageIds.forEach(id => {
      if (id) {
        this.classLanguageSubjects.get(classKey).add(id.toString());
      }
    });
  }

  async updateAllClassLanguageSubjects() {
    console.log('\n=== Updating Class Language Subjects ===');
    
    for (const [classId, subjectIds] of this.classLanguageSubjects) {
      try {
        const uniqueSubjectIds = [...subjectIds];
        
        if (uniqueSubjectIds.length > 0) {
          await Class.findByIdAndUpdate(classId, {
            $addToSet: { subjects: { $each: uniqueSubjectIds } }
          });
          this.statistics.subjectsAssigned += uniqueSubjectIds.length;
          console.log(`Added ${uniqueSubjectIds.length} language subjects to class ${classId}`);
        }
      } catch (error) {
        console.error(`Error updating language subjects for class ${classId}:`, error.message);
      }
    }
  }

  async applyTemplatesToNewClasses() {
    console.log('\n=== Applying Templates to Classes ===');
    
    for (const [cacheKey, classDoc] of this.classCache) {
      try {
        const currentClass = await Class.findById(classDoc._id);
        if (currentClass && (!currentClass.subjects || currentClass.subjects.length === 0)) {
          await this.autoAssignSubjectsFromTemplate(
            currentClass.name, 
            currentClass.section, 
            currentClass._id
          );
        }
      } catch (error) {
        console.error(`Error applying template to class ${classDoc._id}:`, error.message);
      }
    }
  }

  // ==================== PARENT AUTO-CONNECTION ====================

  /**
   * Auto-connect parents to students after import
   */
  async autoConnectParents() {
    if (!this.options.autoConnectParents) {
      console.log('\n=== Parent auto-connection disabled ===');
      return;
    }
    
    console.log('\n=== Auto-connecting Parents to Students ===');
    
    try {
      const parents = await Parent.find({
        'students.0': { $exists: true }
      });
      
      this.statistics.parentsProcessed = parents.length;
      let connectionsUpdated = 0;
      let notificationsSent = 0;
      
      for (const parent of parents) {
        let needsUpdate = false;
        
        for (const connection of parent.students) {
          // Find current student for this connection in this academic year
          const student = await Student.findOne({
            studentCode: connection.studentCode,
            dateOfBirth: connection.dateOfBirth,
            academicYearId: this.academicYearId
          });
          
          if (student) {
            // Update cached details
            const newFullName = student.fullName;
            const newClassName = `${student.className || ''} ${student.division || ''}`.trim();
            
            if (connection.studentFullName !== newFullName || 
                connection.className !== newClassName) {
              connection.studentFullName = newFullName;
              connection.className = newClassName;
              needsUpdate = true;
              connectionsUpdated++;
              
              // Add parent to student's parentIds if not already
              if (!student.parentIds) {
                student.parentIds = [];
              }
              if (!student.parentIds.includes(parent._id)) {
                student.parentIds.push(parent._id);
                await student.save();
              }
              
              // Send notification to parent
              await this.sendParentConnectionNotification(parent, student);
              notificationsSent++;
              
              console.log(`Updated cached details for ${student.fullName} (${student.studentCode}) - Parent: ${parent.fullName}`);
            }
          }
        }
        
        if (needsUpdate) {
          await parent.save();
        }
      }
      
      this.statistics.parentConnectionsUpdated = connectionsUpdated;
      this.statistics.parentNotificationsSent = notificationsSent;
      
      console.log(`Parents processed: ${parents.length}`);
      console.log(`Connections updated: ${connectionsUpdated}`);
      console.log(`Notifications sent: ${notificationsSent}`);
      
    } catch (error) {
      console.error('Error auto-connecting parents:', error);
    }
  }

  /**
   * Send notification to parent about student connection update
   */
  async sendParentConnectionNotification(parent, student) {
    try {
      const user = await User.findById(parent.userId);
      if (!user) return;
      
      await Notification.create({
        userId: user._id,
        title: '📚 Student Information Updated',
        message: `${student.fullName} is now in ${student.className || ''} ${student.division || ''} for the new academic year.`,
        type: 'info',
        data: {
          studentCode: student.studentCode,
          studentName: student.fullName,
          className: `${student.className || ''} ${student.division || ''}`.trim(),
          academicYearId: this.academicYearId
        }
      });
    } catch (error) {
      console.error('Error sending parent notification:', error.message);
    }
  }

  /**
   * Update all parent cached details for the current academic year
   */
  async updateAllParentCachedDetails() {
    console.log('\n=== Updating All Parent Cached Details ===');
    
    try {
      const updatedCount = await Parent.updateCachedStudentDetails(this.academicYearId);
      this.statistics.parentCacheUpdated = updatedCount;
      console.log(`Updated cached details for ${updatedCount} parents`);
    } catch (error) {
      console.error('Error updating parent cached details:', error);
    }
  }

  /**
   * Sync parentIds in Student model with Parent connections
   */
  async syncStudentParentIds() {
    console.log('\n=== Syncing Student Parent IDs ===');
    
    try {
      const students = await Student.find({ academicYearId: this.academicYearId });
      let syncedCount = 0;
      
      for (const student of students) {
        const parents = await Parent.find({
          'students.studentCode': student.studentCode,
          'students.dateOfBirth': student.dateOfBirth
        });
        
        if (parents.length > 0) {
          const parentIds = parents.map(p => p._id);
          
          // Check if parentIds need updating
          const currentParentIds = (student.parentIds || []).map(id => id.toString());
          const newParentIds = parentIds.map(id => id.toString());
          
          const needsUpdate = newParentIds.some(id => !currentParentIds.includes(id)) ||
                              currentParentIds.some(id => !newParentIds.includes(id));
          
          if (needsUpdate) {
            student.parentIds = parentIds;
            await student.save();
            syncedCount++;
          }
        }
      }
      
      console.log(`Synced parent IDs for ${syncedCount} students`);
      this.statistics.parentSyncCount = syncedCount;
      
    } catch (error) {
      console.error('Error syncing student parent IDs:', error);
    }
  }


  /**
 * Sync language subjects for all classes after import
 */
async syncAllClassesLanguageSubjects() {
  console.log('\n=== Syncing Language Subjects for All Classes ===');
  
  try {
    const results = await Class.syncAllClassesLanguageSubjects(this.academicYearId);
    
    this.statistics.classesLanguageSynced = results.length;
    
    let totalLanguageSubjects = 0;
    results.forEach(r => {
      totalLanguageSubjects += r.languageCount;
      console.log(`Class ${r.className}: ${r.coreCount} core + ${r.languageCount} language = ${r.totalCount} total subjects`);
    });
    
    console.log(`Synced language subjects for ${results.length} classes`);
    console.log(`Total language subjects across all classes: ${totalLanguageSubjects}`);
    
  } catch (error) {
    console.error('Error syncing class language subjects:', error);
  }
}

  // ==================== MAIN IMPORT ====================

  async importFile(filePath, fileName) {
    const academicYear = await AcademicYear.findById(this.academicYearId);
    if (!academicYear) {
      throw new Error('Academic year not found');
    }

    const fileHash = await this.generateFileHash(filePath);
    const batch = await ImportBatch.create({
      academicYearId: this.academicYearId,
      fileName,
      fileHash,
      status: 'PROCESSING',
      importedBy: this.userId,
      statistics: this.statistics
    });
    
    this.batchId = batch._id;

    try {
      const rows = this.parseExcel(filePath);
      
      this.statistics.totalRows = rows.length;
      
      console.log(`\n=== Processing ${rows.length} students ===`);
      
      if (rows.length === 0) {
        await ImportBatch.findByIdAndUpdate(this.batchId, {
          status: 'COMPLETED',
          statistics: this.statistics,
          errors: [{ error: 'No valid data rows found in Excel file' }],
          completedAt: new Date()
        });
        return {
          batchId: this.batchId,
          statistics: this.statistics,
          status: 'COMPLETED'
        };
      }
      
      for (let i = 0; i < rows.length; i += this.options.batchSize) {
        const batchRows = rows.slice(i, i + this.options.batchSize);
        await this.processBatch(batchRows);
        
        this.statistics.processedRows = Math.min(i + this.options.batchSize, rows.length);
        await ImportBatch.findByIdAndUpdate(this.batchId, { 
          statistics: this.statistics
        });
        
        console.log(`Processed ${this.statistics.processedRows}/${rows.length} rows (Success: ${this.statistics.successfulInserts}, Failed: ${this.statistics.failedRecords})`);
      }

      // Post-import operations
      await this.applyTemplatesToNewClasses();
      await this.updateAllClassLanguageSubjects();
      await this.syncAllClassesLanguageSubjects();
      await this.autoConnectParents();
      await this.updateAllParentCachedDetails();
      await this.syncStudentParentIds();

      const finalStatus = this.statistics.failedRecords > 0 ? 'PARTIAL' : 'COMPLETED';
      await ImportBatch.findByIdAndUpdate(this.batchId, {
        status: finalStatus,
        statistics: this.statistics,
        errors: this.errors.slice(0, 100),
        warnings: this.warnings.slice(0, 100),
        completedAt: new Date()
      });

      console.log('\n=== Import Completed ===');
      console.log(`Total Students: ${this.statistics.totalRows}`);
      console.log(`Inserted: ${this.statistics.successfulInserts}`);
      console.log(`Updated: ${this.statistics.updatedRecords}`);
      console.log(`Failed: ${this.statistics.failedRecords}`);
      console.log(`Classes Created: ${this.statistics.classesCreated}`);
      console.log(`Subjects Created: ${this.statistics.subjectsCreated}`);
      console.log(`Subjects Assigned: ${this.statistics.subjectsAssigned}`);
      console.log(`Parents Processed: ${this.statistics.parentsProcessed}`);
      console.log(`Parent Connections Updated: ${this.statistics.parentConnectionsUpdated}`);
      console.log(`Parent Notifications Sent: ${this.statistics.parentNotificationsSent}`);
      
      return {
        batchId: this.batchId,
        statistics: this.statistics,
        status: finalStatus
      };
    } catch (error) {
      console.error('Import error:', error);
      await ImportBatch.findByIdAndUpdate(this.batchId, {
        status: 'FAILED',
        errors: [...this.errors, { error: error.message }]
      });
      throw error;
    }
  }

  async processBatch(rows) {
    for (const row of rows) {
      try {
        const result = await this.processStudentRow(row);
        if (result) {
          if (result.isNew) {
            this.statistics.successfulInserts++;
          } else {
            this.statistics.updatedRecords++;
          }
        }
      } catch (error) {
        this.statistics.failedRecords++;
        this.errors.push({
          studentCode: this.getValue(row, 'Student code') || 'Unknown',
          error: error.message,
          severity: 'ERROR'
        });
        console.error(`Error processing student: ${error.message}`);
      }
    }
  }

  async processStudentRow(row) {
    const studentCode = String(this.getValue(row, 'Student code')).trim();
    const fullName = String(this.getValue(row, 'Full name')).trim();
    const admissionNo = this.getValue(row, 'Admission no');
    
    if (!studentCode) {
      throw new Error('Student code is required');
    }
    if (!fullName) {
      throw new Error('Full name is required');
    }

    const { classInfo, academicYearId, className, division } = 
      await this.resolveClassAndAcademicYear(row);

    const languageSubjects = await this.resolveLanguageSubjects(row);
    
    if (classInfo && languageSubjects.languageIds.length > 0) {
      this.trackClassLanguageSubjects(classInfo._id, languageSubjects.languageIds);
    }

    const studentData = {
      studentCode,
      fullName,
      fullNameMalayalam: this.getValue(row, 'Full name(malayalam)'),
      gender: this.mapGender(this.getValue(row, 'Gender')),
      dateOfBirth: this.parseDate(this.getValue(row, 'Date of birth')),
      birthPlace: this.getValue(row, 'Birth place'),
      bloodGroup: this.normalizeBloodGroup(this.getValue(row, 'Blood group')),
      nationality: this.getValue(row, 'Nationality') || 'Indian',
      religion: this.getValue(row, 'Religion'),
      casteName: this.getValue(row, 'Caste name'),
      category: this.mapCategory(this.getValue(row, 'Category')),
      
      identificationMark1: this.getValue(row, 'Identification mark 1'),
      identificationMark2: this.getValue(row, 'Identification mark 2'),
      eid: this.getValue(row, 'EID'),
      udidNumber: this.getValue(row, 'UDID Number'),
      disabilityPercentage: this.parseNumber(this.getValue(row, 'Disability Percentage')),
      physicalChallenge: this.getValue(row, 'Physical Challenge'),
      reasonForNoUid: this.getValue(row, 'Reason for no uid'),
      
      houseName: this.getValue(row, 'House Name'),
      streetName: this.getValue(row, 'Street Name'),
      postOffice: this.getValue(row, 'Postoffice'),
      pincode: this.getValue(row, 'Pincode'),
      localBody: this.getValue(row, 'Localbody'),
      municipality: this.getValue(row, 'Municipality'),
      gramaPanchayath: this.getValue(row, 'Grama panchayath'),
      districtPanchayath: this.getValue(row, 'District panchayath'),
      corporation: this.getValue(row, 'Corporation'),
      taluk: this.getValue(row, 'Taluk'),
      blockPanchayath: this.getValue(row, 'Block panchayath'),
      revenueDistrict: this.getValue(row, 'Revenue district'),
      
      phoneNumber: this.normalizePhoneNumber(this.getValue(row, 'Phone Number/Mobile Number')),
      
      admissionNo: String(admissionNo || studentCode).trim(),
      admissionDate: this.parseDate(this.getValue(row, 'Admission date')),
      classOnAdmission: this.getValue(row, 'Class on admission'),
      instructionMedium: this.getValue(row, 'Instruction medium'),
      
      firstLanguagePaper1: languageSubjects.firstLanguagePaper1,
      firstLanguagePaper2: languageSubjects.firstLanguagePaper2,
      thirdLanguage: languageSubjects.thirdLanguage,
      additionalLanguage: languageSubjects.additionalLanguage,
      
      classId: classInfo?._id || null,
      academicYearId: academicYearId,
      className: className,
      division: division,
      status: 'active',
      confirmationStatus: this.getValue(row, 'Confirmation status'),
      
      fatherFullName: this.getValue(row, 'Father full name'),
      fatherNameMalayalam: this.getValue(row, "Father's Name(malayalam)"),
      motherFullName: this.getValue(row, 'Mother full name'),
      motherNameMalayalam: this.getValue(row, "Mother's Name(malayalam)"),
      guardian: this.getValue(row, 'Guardian') || this.getValue(row, 'Father full name'),
      relationOfGuardian: this.getValue(row, 'Relation of Guardian') || 'Father',
      occupationOfGuardian: this.getValue(row, 'Occupation of Guardian'),
      
      annualIncome: this.parseNumber(this.getValue(row, 'Annual income')),
      apl: String(this.getValue(row, 'APL')).toLowerCase() === 'true',
      midDayMealApplicable: String(this.getValue(row, 'Mid day meal applicable')).toLowerCase() === 'yes',
      
      bankName: this.getValue(row, 'Bank name'),
      branchName: this.getValue(row, 'Branch Name'),
      ifscCode: String(this.getValue(row, 'IFSC Code')).toUpperCase(),
      accountNumber: this.getValue(row, 'Account Number'),
      
      hostelites: this.getValue(row, 'Hostelites') || 'N',
      
      dateOfVaccination: this.parseDate(this.getValue(row, 'Date of vaccination')),
      
      importBatchId: this.batchId,
      isActive: true
    };

    const filter = {
      studentCode,
      academicYearId
    };

    let student;
    let isNew = false;

    if (this.options.updateExistingStudents) {
      // Preserve existing parentIds if updating
      const existing = await Student.findOne(filter);
      if (existing && existing.parentIds && existing.parentIds.length > 0) {
        studentData.parentIds = existing.parentIds;
      }
      
      student = await Student.findOneAndUpdate(
        filter,
        studentData,
        { upsert: true, new: true, runValidators: true }
      );
      isNew = student.createdAt.getTime() === student.updatedAt.getTime();
    } else {
      const existing = await Student.findOne(filter);
      if (existing) {
        return { isNew: false, skipped: true };
      }
      student = await Student.create(studentData);
      isNew = true;
    }

    return { isNew, student };
  }

  mapGender(gender) {
    if (!gender) return 'Other';
    const g = String(gender).toUpperCase().trim();
    if (g === 'M' || g === 'MALE') return 'M';
    if (g === 'F' || g === 'FEMALE') return 'F';
    return 'Other';
  }

  parseDate(dateString) {
    if (!dateString || String(dateString).trim() === '') return null;
    
    const str = String(dateString).trim();
    
    if (/^\d+$/.test(str) && str.length < 6) {
      const excelDate = parseInt(str);
      if (excelDate > 1 && excelDate < 100000) {
        return new Date((excelDate - 25569) * 86400 * 1000);
      }
    }
    
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
    }
    
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  }

  parseNumber(value) {
    if (!value || value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  normalizeBloodGroup(bloodGroup) {
    const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!bloodGroup) return '';
    const normalized = String(bloodGroup).toUpperCase().trim();
    return validGroups.includes(normalized) ? normalized : '';
  }

  normalizePhoneNumber(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '').slice(0, 15);
  }

  mapCategory(category) {
    if (!category) return '';
    
    const normalized = String(category).toLowerCase();
    if (normalized.includes('general')) return 'General';
    if (normalized.includes('obc')) return 'OBC';
    if (normalized.includes('sc')) return 'SC';
    if (normalized.includes('st')) return 'ST';
    
    return '';
  }

  async generateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

module.exports = SamboornaImportService;