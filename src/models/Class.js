// models/Class.js
const mongoose = require('mongoose');

const SubjectTeacherSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  teacherName: {
    type: String
  },
  periodsPerWeek: {
    type: Number,
    default: 1,
    min: 1,
    max: 12
  }
}, { _id: false });

const ClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  section: {
    type: String,
    default: null
  },
  classTeacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  classTeacherName: {
    type: String
  },
  // All subjects (core + languages)
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  // Language subjects specific to this class (aggregated from students)
  languageSubjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  // Core subjects from template
  coreSubjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  // Subject-Teacher mapping for this class
  subjectTeachers: [SubjectTeacherSchema],
  capacity: {
    type: Number,
    default: 50
  },
  isActive: {
    type: Boolean,
    default: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  timetable: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    periods: [{
      subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
      },
      teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
      },
      teacherName: {
        type: String
      },
      startTime: String,
      endTime: String,
      room: String
    }]
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to auto-assign core subjects from template
ClassSchema.pre('save', async function(next) {
  if (this.isNew && (!this.coreSubjects || this.coreSubjects.length === 0)) {
    try {
      const SubjectClassTemplate = mongoose.model('SubjectClassTemplate');
      const template = await SubjectClassTemplate.findOne({ 
        className: this.name,
        isActive: true 
      });
      
      if (template) {
        let coreSubjectIds = [];
        
        if (template.sectionSpecific && template.sectionSubjects) {
          const sectionSubjects = template.sectionSubjects.get(this.section);
          if (sectionSubjects && sectionSubjects.length > 0) {
            coreSubjectIds = sectionSubjects;
          } else {
            coreSubjectIds = template.subjects;
          }
        } else {
          coreSubjectIds = template.subjects;
        }
        
        this.coreSubjects = coreSubjectIds;
        this.subjects = [...coreSubjectIds];
        console.log(`Auto-assigned ${this.coreSubjects.length} core subjects to class ${this.name}-${this.section || ''}`);
      }
    } catch (error) {
      console.error('Error auto-assigning subjects:', error);
    }
  }
  
  // Ensure subjects array contains both core and language subjects
  if (this.coreSubjects && this.coreSubjects.length > 0) {
    const allSubjects = new Set([
      ...this.coreSubjects.map(id => id.toString()),
      ...(this.languageSubjects || []).map(id => id.toString())
    ]);
    // Store as array of strings - Mongoose will handle ObjectId conversion
    this.subjects = Array.from(allSubjects);
  }
  
  next();
});

// Virtual field for student count
ClassSchema.virtual('studentCount', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'classId',
  count: true
});

// Virtual field for display name
ClassSchema.virtual('baseDisplayName').get(function() {
  return this.section ? `${this.name}-${this.section}` : this.name;
});

ClassSchema.virtual('fullDisplayName').get(function() {
  const baseName = this.section ? `${this.name}-${this.section}` : this.name;
  
  if (this.academicYearId && typeof this.academicYearId === 'object' && this.academicYearId.year) {
    return `${baseName} (${this.academicYearId.year})`;
  }
  
  return baseName;
});

// Method to sync language subjects from students in this class
ClassSchema.methods.syncLanguageSubjects = async function() {
  const Student = mongoose.model('Student');
  
  // Get all active students in this class
  const students = await Student.find({ 
    classId: this._id, 
    status: 'active' 
  }).select('firstLanguagePaper1 firstLanguagePaper2 thirdLanguage additionalLanguage');
  
  // Collect all unique language subject IDs as strings
  const languageSubjectIds = new Set();
  
  students.forEach(student => {
    const languages = [
      student.firstLanguagePaper1,
      student.firstLanguagePaper2,
      student.thirdLanguage,
      student.additionalLanguage
    ];
    
    languages.forEach(langId => {
      if (langId) {
        languageSubjectIds.add(langId.toString());
      }
    });
  });
  
  // Store as array of strings - Mongoose will handle ObjectId conversion
  this.languageSubjects = Array.from(languageSubjectIds);
  
  // Update combined subjects array
  const allSubjects = new Set([
    ...(this.coreSubjects || []).map(id => id.toString()),
    ...Array.from(languageSubjectIds)
  ]);
  
  // Store as array of strings
  this.subjects = Array.from(allSubjects);
  
  await this.save();
  
  return {
    coreCount: this.coreSubjects?.length || 0,
    languageCount: this.languageSubjects.length,
    totalCount: this.subjects.length,
    languageSubjectIds: this.languageSubjects
  };
};

// Method to get all distinct language subjects taught in this class
ClassSchema.methods.getLanguageSubjects = async function() {
  const Subject = mongoose.model('Subject');
  return await Subject.find({ 
    _id: { $in: this.languageSubjects || [] },
    department: 'Languages'
  });
};

// Method to get core subjects
ClassSchema.methods.getCoreSubjects = async function() {
  const Subject = mongoose.model('Subject');
  return await Subject.find({ _id: { $in: this.coreSubjects || [] } });
};

// Static method to sync language subjects for all classes in an academic year
ClassSchema.statics.syncAllClassesLanguageSubjects = async function(academicYearId) {
  const classes = await this.find({ academicYearId, isActive: true });
  const results = [];
  
  for (const classItem of classes) {
    const syncResult = await classItem.syncLanguageSubjects();
    results.push({
      classId: classItem._id,
      className: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name,
      ...syncResult
    });
  }
  
  return results;
};

// Indexes
ClassSchema.index({ name: 1, section: 1, academicYearId: 1 }, { unique: true });
ClassSchema.index({ academicYearId: 1 });
ClassSchema.index({ 'subjectTeachers.teacherId': 1 });
ClassSchema.index({ 'subjectTeachers.subjectId': 1 });

module.exports = mongoose.models.Class || mongoose.model('Class', ClassSchema);