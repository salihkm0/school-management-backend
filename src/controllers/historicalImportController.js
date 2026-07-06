// // src/controllers/historicalImportController.js
// // Completely isolated — does not touch any existing model or controller
// const XLSX = require('xlsx');
// const path = require('path');
// const ejs = require('ejs');
// const { HistoricalImport, HistoricalStudent } = require('../models/HistoricalImport');
// const { getBrowser, closeBrowser } = require('../services/pdf/browserHelper');

// // ─────────────────────────────────────────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────────────────────────────────────────

// /**
//  * Normalize a language cell value.
//  * "Arabic(A)" → "Arabic", "URUDU" → "Urdu" (common Kerala school file typo)
//  */
// function normalizeLanguage(raw) {
//   if (!raw) return '';
//   let v = String(raw).trim();
//   v = v.replace(/\s*\([^)]*\)\s*/g, '').trim();  // remove (A), (U) etc.
//   const map = { URUDU: 'Urdu', URDU: 'Urdu', ARABIC: 'Arabic', MALAYALAM: 'Malayalam', HINDI: 'Hindi' };
//   return map[v.toUpperCase()] || v;
// }

// /**
//  * Guess language from sheet tab name when cell data is missing.
//  */
// function guessLanguageFromSheet(sheetName) {
//   const s = (sheetName || '').toUpperCase();
//   if (s.includes('ARABIC'))          return 'Arabic';
//   if (s.includes('MALAYALAM'))       return 'Malayalam';
//   if (s.includes('URDU') || s.includes('URUDU')) return 'Urdu';
//   if (s.includes('HINDI'))           return 'Hindi';
//   return '';
// }

// /**
//  * Parse section-header row text.
//  *
//  * ONLY matches Format 1:  "9 M (ENG MEDIUM, ARABIC GIRLS & BOYS)"
//  * (All PPMHSS section headers use this parenthesised format.)
//  *
//  * We deliberately do NOT match bare "9 M" or "9 B 2025-2026" patterns
//  * because those appear in column B of every data row (classCode field)
//  * and would cause data rows to be misidentified as section headers.
//  */
// function parseSectionHeader(text) {
//   if (!text || typeof text !== 'string') return null;
//   const t = text.trim();

//   // Must match: <grade> <division> (<medium info>)
//   // e.g. "10 A (MAL MEDIUM, MALAYALAM GIRLS & BOYS)"
//   //      "9 M (ENG MEDIUM, ARABIC GIRLS & BOYS)"
//   //      "10 O (ENG MEDIUM, MALAYALAM&ARABIC GIRLS & BOYS)"
//   const m = t.match(/^(\d{1,2})\s+([A-Z]{1,3})\s*\(([^)]+)\)/i);
//   if (!m) return null;

//   const [, grade, division, inside] = m;
//   if (parseInt(grade) < 1 || parseInt(grade) > 12) return null;

//   const parts = inside.split(',').map((s) => s.trim());
//   return {
//     grade:         grade.toString(),
//     division:      division.toUpperCase(),
//     medium:        parts[0] || '',
//     languageGroup: parts.slice(1).join(', '),
//   };
// }

// /**
//  * Detect if a row IS a section header.
//  *
//  * IMPORTANT: Only inspect column A (the first column).
//  * Column B contains classCode values like "9 B 2025-2026" which superficially
//  * resemble section headers — scanning all cells would cause false positives.
//  */
// function detectSectionHeader(row) {
//   // Primary check: column A only
//   const colA = row['A'];
//   if (typeof colA === 'string' && colA.trim()) {
//     const parsed = parseSectionHeader(colA.trim());
//     if (parsed) return parsed;
//   }

//   // Fallback: check all cells EXCEPT B (classCode) and numeric cells
//   // (handles rare cases where the header is in a merged cell reported under a different key)
//   for (const [key, val] of Object.entries(row)) {
//     if (key === 'B') continue; // skip classCode column
//     if (typeof val !== 'string') continue;
//     if (!val.trim()) continue;
//     // Only try if value looks like it starts with a grade number + space + division
//     if (!/^\d{1,2}\s+[A-Z]/i.test(val.trim())) continue;
//     const parsed = parseSectionHeader(val.trim());
//     if (parsed) return parsed;
//   }

//   return null;
// }

// /**
//  * Convert an Excel column letter to a sort rank (A=1, B=2, ..., Z=26, AA=27 ...)
//  */
// function colRank(k) {
//   let n = 0;
//   for (const c of String(k).toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
//   return n;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CONCRETE COLUMN LAYOUT DETECTION
// //
// // PPMHSS XLS files always use column letter keys (header:'A' in sheet_to_json).
// //
// // Class 9 layout  (9 subjects, subjects start at I):
// //   A=SL  B=ClassCode  C=RegNo  D=Name  E=UID(skip)  F=Gender  G=Language  H=Category
// //   I=LAN  J=MAL II  K=ENG  L=HIN  M=SS  N=PHY  O=CHE  P=BIO  Q=MATHS
// //   R=Total  S=ClassDivision
// //
// // Class 10 layout (9 subjects, subjects start at H):
// //   A=SL  B=ClassCode  C=RegNo  D=Name  E=Gender  F=Language  G=Category
// //   H=LAN  I=MAL II  J=ENG  K=HIN  L=SS  M=PHY  N=CHE  O=BIO  P=MATHS
// //   Q=Total  R=ClassDivision
// // ─────────────────────────────────────────────────────────────────────────────

// const LAYOUT_9 = {
//   slNo:     'A',
//   classCode:'B',
//   admNo:    'C',
//   name:     'D',
//   uid:      'E',   // skip — Aadhaar / UID
//   gender:   'F',
//   language: 'G',
//   category: 'H',
//   subjects: ['I','J','K','L','M','N','O','P','Q'],
//   total:    'R',
//   division: 'S',
// };

// const LAYOUT_10 = {
//   slNo:     'A',
//   classCode:'B',
//   admNo:    'C',
//   name:     'D',
//   gender:   'E',
//   language: 'F',
//   category: 'G',
//   subjects: ['H','I','J','K','L','M','N','O','P'],
//   total:    'Q',
//   division: 'R',
// };

// /**
//  * Detect which layout to use.
//  *
//  * Strategy:
//  *  1. If the section tells us grade 10 → use LAYOUT_10.
//  *  2. If grade < 10 or unknown → inspect column E of the first data row:
//  *       - If E is a long number (UID/Aadhaar ≥10 digits) → LAYOUT_9
//  *       - If E is F/M → LAYOUT_10 (unlikely for grade<10 but handle it)
//  *  3. Fallback: count subject columns — LAYOUT_9 starts at I (rank 9),
//  *     LAYOUT_10 starts at H (rank 8).
//  */
// function detectLayout(grade, firstDataRow) {
//   const g = parseInt(grade);
//   if (g === 10)   return LAYOUT_10;
//   if (g === 9 || g === 8) return LAYOUT_9;

//   // Unknown grade — inspect column E
//   if (firstDataRow) {
//     const eVal = String(firstDataRow['E'] || '').trim();
//     if (/^\d{9,}$/.test(eVal))     return LAYOUT_9;   // UID / Aadhaar
//     if (/^[FM]$/i.test(eVal))      return LAYOUT_10;  // gender in col E
//   }

//   return LAYOUT_9; // conservative default
// }

// /**
//  * Given a layout descriptor and subjectConfig, build the colMap
//  * (subject code → column letter) directly from fixed positions.
//  */
// function buildFixedColMap(layout, subjectConfig) {
//   const colMap = {};
//   layout.subjects.forEach((col, i) => {
//     if (i < subjectConfig.length) {
//       colMap[subjectConfig[i].code] = col;
//     }
//   });
//   return colMap;
// }

// /**
//  * Extract subject scores using fixed column positions.
//  */
// function extractSubjectScoresFixed(row, subjectConfig, layout) {
//   return layout.subjects
//     .slice(0, subjectConfig.length)
//     .map((col, i) => {
//       const subj = subjectConfig[i];
//       if (!subj) return null;
//       const raw     = String(row[col] || '').trim();
//       const obtained = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : 0;
//       return {
//         subjectCode:  subj.code,
//         subjectLabel: subj.label,
//         obtained:     isNaN(obtained) ? 0 : obtained,
//         maxMarks:     subj.maxMarks || 40,
//       };
//     })
//     .filter(Boolean);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // LEGACY HELPERS (kept as fallback for non-standard files)
// // ─────────────────────────────────────────────────────────────────────────────

// function detectColumns(headerRow) {
//   const cols = {};
//   for (const [key, val] of Object.entries(headerRow)) {
//     if (val === null || val === undefined || val === '') continue;
//     const v = String(val).trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
//     if      (['SL NO','SLNO','SL','SL NO'].includes(v))    cols.slNo    = key;
//     else if (v.startsWith('ADM') || v.startsWith('REG') || v === 'REG NO') cols.admNo = key;
//     else if (['NAME','STUDENT NAME'].includes(v))          cols.name     = key;
//     else if (['F','M/F','GENDER','SEX'].includes(v))       cols.gender   = key;
//     else if (['LANGUAGE','LANG','LNG'].includes(v))        cols.language = key;
//     else if (['CATEGORY','CAT','CASTE'].includes(v))       cols.category = key;
//     else if (['TOTAL','GRAND TOTAL','TOT'].includes(v))    cols.total    = key;
//     else if (['DIVISION','DIV','RESULT'].includes(v))      cols.division = key;
//   }
//   return cols;
// }

// function buildColMap(headerRow, subjectConfig) {
//   const colMap = {};
//   for (const [key, val] of Object.entries(headerRow)) {
//     if (!val) continue;
//     const v = String(val).trim().toUpperCase().replace(/[-\s]+/g, ' ').trim();
//     for (const subj of subjectConfig) {
//       const subjCode = subj.code.toUpperCase().replace(/[-\s]+/g, ' ');
//       if (v === subjCode || v.startsWith(subjCode)) {
//         if (!colMap[subj.code]) colMap[subj.code] = key;
//       }
//     }
//   }
//   return colMap;
// }

// function isHeaderRow(row) {
//   const cells = Object.values(row).map((v) => String(v || '').trim().toUpperCase());
//   const hasSL = cells.some((v) => ['SL NO','SLNO','SL','SL.NO','SL NO.'].includes(v));
//   const hasName = cells.some((v) => v === 'NAME' || v.includes('STUDENT'));
//   const hasSubject = cells.some((v) =>
//     ['ENG','ENGLISH','MATHS','MATHEMATICS','TOTAL','LAN','LANGUAGE'].includes(v));
//   if (hasSL && (hasName || hasSubject)) return true;
//   const subjectCodes = ['LAN','MAL','ENG','HIN','SS','PHY','CHE','BIO','MATHS','IT'];
//   const subjectMatches = cells.filter((v) => subjectCodes.some((s) => v.startsWith(s))).length;
//   const numericCount   = cells.filter((v) => v !== '' && !isNaN(Number(v))).length;
//   if (subjectMatches >= 3 && numericCount === 0) return true;
//   return false;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MAIN PARSER
// // ─────────────────────────────────────────────────────────────────────────────

// /**
//  * Parse all sheets in an uploaded XLS workbook.
//  * Uses CONCRETE POSITIONAL COLUMN MAPPING based on known PPMHSS file formats.
//  */
// function parseWorkbook(workbook, subjectConfig, academicYear) {
//   const allStudents  = [];
//   const sheetSummary = [];

//   for (const sheetName of workbook.SheetNames) {
//     const sheet = workbook.Sheets[sheetName];

//     const rows = XLSX.utils.sheet_to_json(sheet, {
//       header:    'A',
//       defval:    '',
//       blankrows: false,
//       raw:       false,
//     });

//     let currentSection = null;
//     let layout         = null;  // LAYOUT_9 or LAYOUT_10
//     let sheetCount     = 0;

//     for (let ri = 0; ri < rows.length; ri++) {
//       const row = rows[ri];

//       // Skip blank rows
//       if (Object.values(row).every((v) => v === '' || v === null || v === undefined)) continue;

//       // ── Section header? (e.g. "9 M (ENG MEDIUM, ARABIC GIRLS & BOYS)") ────
//       const sectionInfo = detectSectionHeader(row);
//       if (sectionInfo) {
//         currentSection = sectionInfo;
//         layout = null; // will be re-determined on next data row
//         continue;
//       }

//       // ── Skip explicit column-header rows (SL NO, NAME, etc.) ────────────
//       if (isHeaderRow(row)) continue;

//       // ── Must have a section to attach students to ────────────────────────
//       if (!currentSection) continue;

//       // ── Validate SL NO (column A must be a small positive integer) ───────
//       const slNoRaw = String(row['A'] || '').trim();
//       const slNo    = Number(slNoRaw);
//       if (isNaN(slNo) || slNo <= 0 || slNo > 9999) continue;

//       // ── Determine layout on first student row of each section ────────────
//       if (!layout) {
//         layout = detectLayout(currentSection.grade, row);
//       }

//       // ── Extract fields using fixed column positions ───────────────────────
//       const admNo   = String(row[layout.admNo]   || '').trim();
//       const name    = String(row[layout.name]    || '').trim();
//       if (!name || name.length < 2) continue;

//       const gRaw    = String(row[layout.gender]  || '').trim().toUpperCase();
//       const gender  = (gRaw === 'F' || gRaw === 'M') ? gRaw : '';

//       const rawLang = String(row[layout.language]|| '').trim();
//       const language = normalizeLanguage(rawLang) || guessLanguageFromSheet(sheetName);

//       const category = String(row[layout.category] || '').trim();

//       // Class code from column B (e.g. "9 M 2025-2026" or "10 AA 2025-2026")
//       const classCode = String(row['B'] || '').trim();

//       // Academic year — from classCode or supplied value
//       let detectedYear = academicYear;
//       if (!detectedYear && classCode) {
//         const ym = classCode.match(/(\d{4}-\d{4})/);
//         if (ym) detectedYear = ym[1];
//       }

//       // Total
//       const totalRaw = String(row[layout.total] || '0').trim();
//       let total = parseFloat(totalRaw) || 0;

//       // Division / result
//       const divisionResult = String(row[layout.division] || '').trim().toUpperCase();

//       // Subject scores (fixed positional)
//       const subjects = extractSubjectScoresFixed(row, subjectConfig, layout);

//       // If total is still 0, compute from subjects
//       if (total === 0 && subjects.length > 0) {
//         total = subjects.reduce((s, x) => s + (x.obtained || 0), 0);
//       }

//       const maxTotal = subjectConfig.reduce((s, c) => s + (c.maxMarks || 40), 0);

//       allStudents.push({
//         slNo,
//         classCode,
//         admissionNo: admNo,
//         name,
//         gender,
//         language,
//         category,
//         grade:         currentSection.grade    || '',
//         division:      currentSection.division  || '',
//         medium:        currentSection.medium    || '',
//         languageGroup: currentSection.languageGroup || '',
//         sheetName,
//         subjects,
//         total:         isNaN(total) ? 0 : total,
//         maxTotal,
//         divisionResult,
//       });

//       sheetCount++;
//     }

//     if (sheetCount > 0) {
//       sheetSummary.push({ name: sheetName, studentCount: sheetCount });
//     }
//   }

//   return { students: allStudents, sheetSummary };
// }


// // ─────────────────────────────────────────────────────────────────────────────
// // DEFAULT SUBJECT CONFIGS — offered in the upload UI
// // ─────────────────────────────────────────────────────────────────────────────
// // Subjects are the same 9 subjects for both grades (I–Q for grade 9, H–P for grade 10).
// // Max marks per subject match actual PPMHSS files: all 40 each.
// const SHARED_SUBJECTS = [
//   { code: 'LAN',    label: 'Language',      maxMarks: 40 },
//   { code: 'MAL II', label: 'Malayalam II',  maxMarks: 40 },
//   { code: 'ENG',    label: 'English',       maxMarks: 40 },
//   { code: 'HIN',    label: 'Hindi',         maxMarks: 40 },
//   { code: 'SS',     label: 'Social Science',maxMarks: 40 },
//   { code: 'PHY',    label: 'Physics',       maxMarks: 40 },
//   { code: 'CHE',    label: 'Chemistry',     maxMarks: 40 },
//   { code: 'BIO',    label: 'Biology',       maxMarks: 40 },
//   { code: 'MATHS',  label: 'Maths',         maxMarks: 40 },
// ];

// const PRESET_CONFIGS = {
//   // Class 8/9 — subjects at columns I–Q, total at R, result at S
//   'class_8_9':    SHARED_SUBJECTS,
//   // Class 10    — subjects at columns H–P, total at Q, result at R
//   'class_10_sslc': SHARED_SUBJECTS,
// };

// exports.getPresetConfigs = (_req, res) => {
//   res.json({ success: true, data: PRESET_CONFIGS });
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // UPLOAD XLS
// // POST /api/historical-imports/upload
// // Body: multipart/form-data  { file, academicYear, subjectConfig (JSON string), preset? }
// // ─────────────────────────────────────────────────────────────────────────────
// exports.uploadXLS = async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ message: 'No file uploaded' });
//   }

//   let subjectConfig;
//   try {
//     subjectConfig = JSON.parse(req.body.subjectConfig || '[]');
//   } catch {
//     return res.status(400).json({ message: 'Invalid subjectConfig JSON' });
//   }

//   // Use a preset if requested and no manual config provided
//   if ((!subjectConfig || subjectConfig.length === 0) && req.body.preset && PRESET_CONFIGS[req.body.preset]) {
//     subjectConfig = PRESET_CONFIGS[req.body.preset];
//   }

//   if (!subjectConfig || subjectConfig.length === 0) {
//     // Default to class 8/9 preset
//     subjectConfig = PRESET_CONFIGS['class_8_9'];
//   }

//   let academicYear = req.body.academicYear || '';

//   // Create the import batch record first
//   const importBatch = await HistoricalImport.create({
//     fileName: req.file.originalname,
//     academicYear: academicYear || 'Unknown',
//     uploadedBy: req.user._id,
//     uploadedByName: req.user.name || req.user.email,
//     subjectConfig,
//     status: 'processing',
//   });

//   // Parse workbook asynchronously, update status when done
//   setImmediate(async () => {
//     try {
//       const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellText: false, cellDates: false });
//       const { students, sheetSummary } = parseWorkbook(workbook, subjectConfig, academicYear);

//       if (students.length === 0) {
//         await HistoricalImport.findByIdAndUpdate(importBatch._id, {
//           status: 'error',
//           errorMessage: 'No student rows found. Make sure the file has section headers like "9 M (ENG MEDIUM, ...)" and a column header row with SL NO, NAME, TOTAL etc.',
//         });
//         return;
//       }

//       // Auto-detect year from first student if not provided
//       if (!academicYear && students[0]?.classCode) {
//         const m = students[0].classCode.match(/\d{4}-\d{4}/);
//         if (m) academicYear = m[0];
//       }

//       // Bulk insert students
//       const docs = students.map((s) => ({ ...s, importId: importBatch._id }));
//       await HistoricalStudent.insertMany(docs, { ordered: false });

//       await HistoricalImport.findByIdAndUpdate(importBatch._id, {
//         academicYear: academicYear || importBatch.academicYear,
//         totalStudents: students.length,
//         sheets: sheetSummary,
//         status: 'done',
//       });
//     } catch (err) {
//       console.error('Historical import error:', err);
//       await HistoricalImport.findByIdAndUpdate(importBatch._id, {
//         status: 'error',
//         errorMessage: err.message,
//       });
//     }
//   });

//   // Respond immediately with the batch ID
//   res.status(201).json({
//     success: true,
//     message: 'File received, processing...',
//     importId: importBatch._id,
//   });
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // LIST ALL IMPORTS
// // GET /api/historical-imports
// // ─────────────────────────────────────────────────────────────────────────────
// exports.getImports = async (req, res) => {
//   try {
//     const imports = await HistoricalImport.find()
//       .sort({ createdAt: -1 })
//       .select('-subjectConfig');
//     res.json({ success: true, data: imports });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // GET IMPORT STATUS (polling after upload)
// // GET /api/historical-imports/:id/status
// // ─────────────────────────────────────────────────────────────────────────────
// exports.getImportStatus = async (req, res) => {
//   try {
//     const batch = await HistoricalImport.findById(req.params.id).select(
//       'status errorMessage totalStudents sheets academicYear fileName'
//     );
//     if (!batch) return res.status(404).json({ message: 'Import not found' });
//     res.json({ success: true, data: batch });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // GET IMPORT DETAIL + SUBJECT CONFIG
// // GET /api/historical-imports/:id
// // ─────────────────────────────────────────────────────────────────────────────
// exports.getImportById = async (req, res) => {
//   try {
//     const batch = await HistoricalImport.findById(req.params.id);
//     if (!batch) return res.status(404).json({ message: 'Import not found' });

//     // Distinct class sections for the filter UI.
//     // Each group represents one section header from the XLS:
//     //   e.g. "10 M (ENG MEDIUM, MALAYALAM GIRLS & BOYS)"
//     const groups = await HistoricalStudent.aggregate([
//       { $match: { importId: batch._id } },
//       {
//         $group: {
//           _id: {
//             grade:         '$grade',
//             division:      '$division',
//             medium:        '$medium',
//             languageGroup: '$languageGroup',
//             sheetName:     '$sheetName',
//           },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { '_id.sheetName': 1, '_id.grade': 1, '_id.division': 1 } },
//     ]);

//     res.json({ success: true, data: batch, groups });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };


// // ─────────────────────────────────────────────────────────────────────────────
// // QUERY STUDENTS (paginated + filterable)
// // GET /api/historical-imports/:id/students
// // Query: grade, division, sheetName, search, page, limit
// // ─────────────────────────────────────────────────────────────────────────────
// exports.getStudents = async (req, res) => {
//   try {
//     const { grade, division, sheetName, language, search, page = 1, limit = 50 } = req.query;
//     const filter = { importId: req.params.id };
//     if (grade)     filter.grade    = grade;
//     if (division)  filter.division = division;
//     if (sheetName) filter.sheetName = sheetName;
//     if (language)  filter.language = { $regex: language, $options: 'i' };
//     if (search)    filter.name    = { $regex: search, $options: 'i' };

//     const pageNum  = Math.max(1, Number(page));
//     const limitNum = Math.min(200, Math.max(1, Number(limit)));

//     const [students, total] = await Promise.all([
//       HistoricalStudent.find(filter)
//         .sort({ sheetName: 1, grade: 1, division: 1, slNo: 1 })
//         .skip((pageNum - 1) * limitNum)
//         .limit(limitNum)
//         .select('-importId -__v'),
//       HistoricalStudent.countDocuments(filter),
//     ]);

//     res.json({
//       success: true,
//       data: students,
//       total,
//       page: pageNum,
//       limit: limitNum,
//       totalPages: Math.ceil(total / limitNum),
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };


// // ─────────────────────────────────────────────────────────────────────────────
// // DELETE IMPORT
// // DELETE /api/historical-imports/:id
// // ─────────────────────────────────────────────────────────────────────────────
// exports.deleteImport = async (req, res) => {
//   try {
//     const batch = await HistoricalImport.findByIdAndDelete(req.params.id);
//     if (!batch) return res.status(404).json({ message: 'Import not found' });
//     await HistoricalStudent.deleteMany({ importId: req.params.id });
//     res.json({ success: true, message: 'Import and all student records deleted' });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // GENERATE PDF MARK LIST
// // GET /api/historical-imports/:id/pdf
// // Query: grade, division, sheetName  (all optional — omit to get full batch)
// // ─────────────────────────────────────────────────────────────────────────────
// const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// function calculateGrade(obtained, maxMarks) {
//   if (!maxMarks || obtained === undefined || obtained === null || obtained === '-') return '-';
//   const percentage = (obtained / maxMarks) * 100;
//   if (percentage >= 90) return 'A+';
//   if (percentage >= 80) return 'A';
//   if (percentage >= 70) return 'B+';
//   if (percentage >= 60) return 'B';
//   if (percentage >= 50) return 'C+';
//   if (percentage >= 40) return 'C';
//   if (percentage >= 30) return 'D+';
//   if (percentage >= 20) return 'D';
//   return 'E';
// }

// const subjectOrder = [
//   'First language', 'Malayalam', 'English', 'Hindi', 'Arabic', 'Urdu',
//   'Social Science', 'Science', 'Physics', 'Chemistry', 'Biology', 'Mathematics', 'Maths',
//   'Computer Science', 'ICT', 'Information Technology'
// ];

// function sortSubjects(subjectsList) {
//   return [...subjectsList].sort((a, b) => {
//     const aIndex = subjectOrder.findIndex(s => a.name.toLowerCase().includes(s.toLowerCase()));
//     const bIndex = subjectOrder.findIndex(s => b.name.toLowerCase().includes(s.toLowerCase()));
//     if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
//     if (aIndex !== -1) return -1;
//     if (bIndex !== -1) return 1;
//     return a.name.localeCompare(b.name);
//   });
// }

// const generatePDFBuffer = async (studentsData, academicYear) => {
//   let page;
//   try {
//     const templatePath = path.join(__dirname, '../views/historicalMarklist.ejs');
//     const html = await ejs.renderFile(templatePath, {
//       schoolLogo: SCHOOL_LOGO_URL,
//       academicYear,
//       students: studentsData
//     });

//     const browser = await getBrowser();
//     page = await browser.newPage();

//     await page.setContent(html, {
//       waitUntil: 'networkidle0'
//     });

//     await page.emulateMediaType('screen');

//     const pdfBuffer = await page.pdf({
//       format: 'A4',
//       orientation: 'portrait',
//       printBackground: true,
//       preferCSSPageSize: true,
//       margin: {
//         top: '5mm',
//         right: '5mm',
//         bottom: '5mm',
//         left: '5mm'
//       }
//     });

//     await page.close();
//     return pdfBuffer;
//   } catch (error) {
//     if (page) await page.close();
//     throw error;
//   }
// };

// exports.generateMarklistPDF = async (req, res) => {
//   try {
//     const { grade, division, sheetName } = req.query;

//     const buildFilter = () => {
//       const f = { importId: req.params.id };
//       if (grade) f.grade = grade;
//       if (division) f.division = division;
//       if (sheetName) f.sheetName = sheetName;
//       return f;
//     };

//     const [batch, students] = await Promise.all([
//       HistoricalImport.findById(req.params.id),
//       HistoricalStudent.find(buildFilter()).sort({ sheetName: 1, grade: 1, division: 1, slNo: 1 }),
//     ]);

//     if (!batch) return res.status(404).json({ message: 'Import not found' });
//     if (students.length === 0)
//       return res.status(404).json({ message: 'No students found for the given filters' });

//     // Map students for EJS
//     const mappedStudents = students.map(student => {
//       let subjects = (student.subjects || []).map(subj => {
//         const maxVal = subj.maxMarks || 40;
//         const obtainedVal = subj.obtained !== undefined ? subj.obtained : 0;
//         return {
//           name: subj.subjectLabel || subj.subjectCode,
//           obtained: obtainedVal,
//           max: maxVal,
//           grade: calculateGrade(obtainedVal, maxVal)
//         };
//       });

//       subjects = sortSubjects(subjects);

//       return {
//         name: student.name,
//         class: `${student.grade} ${student.division}`.trim(),
//         admissionNo: student.admissionNo || '—',
//         subjects: subjects
//       };
//     });

//     const pdfBuffer = await generatePDFBuffer(mappedStudents, batch.academicYear);

//     const labelParts = [batch.academicYear];
//     if (grade) labelParts.push(`Grade${grade}`);
//     if (division) labelParts.push(division);
//     const filename = `HistoricalMarklist_${labelParts.join('_')}.pdf`;

//     res.set({
//       'Content-Type': 'application/pdf',
//       'Content-Disposition': `attachment; filename="${filename}"`,
//       'Content-Length': pdfBuffer.length,
//       'Cache-Control': 'no-cache',
//     });
//     res.send(pdfBuffer);
//   } catch (err) {
//     console.error('PDF generation error:', err);
//     res.status(500).json({ message: err.message });
//   }
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // INDIVIDUAL STUDENT PDF (school mark-list style)
// // GET /api/historical-imports/student/:studentId/pdf
// // ─────────────────────────────────────────────────────────────────────────────
// exports.generateStudentPDF = async (req, res) => {
//   try {
//     const student = await HistoricalStudent.findById(req.params.studentId);
//     if (!student) return res.status(404).json({ message: 'Student not found' });

//     const batch = await HistoricalImport.findById(student.importId);
//     if (!batch) return res.status(404).json({ message: 'Import batch not found' });

//     // Map single student for EJS
//     let subjects = (student.subjects || []).map(subj => {
//       const maxVal = subj.maxMarks || 40;
//       const obtainedVal = subj.obtained !== undefined ? subj.obtained : 0;
//       return {
//         name: subj.subjectLabel || subj.subjectCode,
//         obtained: obtainedVal,
//         max: maxVal,
//         grade: calculateGrade(obtainedVal, maxVal)
//       };
//     });

//     subjects = sortSubjects(subjects);

//     const mappedStudent = {
//       name: student.name,
//       class: `${student.grade} ${student.division}`.trim(),
//       admissionNo: student.admissionNo || '—',
//       subjects: subjects
//     };

//     const pdfBuffer = await generatePDFBuffer([mappedStudent], batch.academicYear);

//     const safeName = student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
//     const filename = `MarkSheet_${safeName}_${student.admissionNo || student._id}.pdf`;

//     res.set({
//       'Content-Type': 'application/pdf',
//       'Content-Disposition': `attachment; filename="${filename}"`,
//       'Content-Length': pdfBuffer.length,
//       'Cache-Control': 'no-cache',
//     });
//     res.send(pdfBuffer);
//   } catch (err) {
//     console.error('Student PDF error:', err);
//     res.status(500).json({ message: err.message });
//   }
// };


// src/controllers/historicalImportController.js
// Completely isolated — does not touch any existing model or controller
const XLSX = require('xlsx');
const path = require('path');
const ejs = require('ejs');
const { HistoricalImport, HistoricalStudent } = require('../models/HistoricalImport');
const { getBrowser, closeBrowser } = require('../services/pdf/browserHelper');
const { calculateGrade } = require('../services/gradingService');
const { Exam } = require('../models/Exam');
const Mark = require('../models/Mark');
const AcademicYear = require('../models/AcademicYear');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLanguage(raw) {
  if (!raw) return '';
  let v = String(raw).trim();
  v = v.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const map = { URUDU: 'Urdu', URDU: 'Urdu', ARABIC: 'Arabic', MALAYALAM: 'Malayalam', HINDI: 'Hindi' };
  return map[v.toUpperCase()] || v;
}

function guessLanguageFromSheet(sheetName) {
  const s = (sheetName || '').toUpperCase();
  if (s.includes('ARABIC'))          return 'Arabic';
  if (s.includes('MALAYALAM'))       return 'Malayalam';
  if (s.includes('URDU') || s.includes('URUDU')) return 'Urdu';
  if (s.includes('HINDI'))           return 'Hindi';
  return '';
}

function parseSectionHeader(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  const m = t.match(/^(\d{1,2})\s+([A-Z]{1,3})\s*\(([^)]+)\)/i);
  if (!m) return null;
  const [, grade, division, inside] = m;
  if (parseInt(grade) < 1 || parseInt(grade) > 12) return null;
  const parts = inside.split(',').map((s) => s.trim());
  return {
    grade:         grade.toString(),
    division:      division.toUpperCase(),
    medium:        parts[0] || '',
    languageGroup: parts.slice(1).join(', '),
  };
}

function detectSectionHeader(row) {
  const colA = row['A'];
  if (typeof colA === 'string' && colA.trim()) {
    const parsed = parseSectionHeader(colA.trim());
    if (parsed) return parsed;
  }
  for (const [key, val] of Object.entries(row)) {
    if (key === 'B') continue;
    if (typeof val !== 'string') continue;
    if (!val.trim()) continue;
    if (!/^\d{1,2}\s+[A-Z]/i.test(val.trim())) continue;
    const parsed = parseSectionHeader(val.trim());
    if (parsed) return parsed;
  }
  return null;
}

function isHeaderRow(row) {
  const cells = Object.values(row).map((v) => String(v || '').trim().toUpperCase());
  const hasSL = cells.some((v) => ['SL NO','SLNO','SL','SL.NO','SL NO.'].includes(v));
  const hasName = cells.some((v) => v === 'NAME' || v.includes('STUDENT'));
  const hasSubject = cells.some((v) =>
    ['ENG','ENGLISH','MATHS','MATHEMATICS','TOTAL','LAN','LANGUAGE'].includes(v));
  if (hasSL && (hasName || hasSubject)) return true;
  const subjectCodes = ['LAN','MAL','ENG','HIN','SS','PHY','CHE','BIO','MATHS','IT'];
  const subjectMatches = cells.filter((v) => subjectCodes.some((s) => v.startsWith(s))).length;
  const numericCount   = cells.filter((v) => v !== '' && !isNaN(Number(v))).length;
  if (subjectMatches >= 3 && numericCount === 0) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCRETE COLUMN LAYOUT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_9 = {
  slNo:     'A',
  classCode:'B',
  admNo:    'C',
  name:     'D',
  uid:      'E',
  gender:   'F',
  language: 'G',
  category: 'H',
  subjects: ['I','J','K','L','M','N','O','P','Q'],
  total:    'R',
  division: 'S',
};

const LAYOUT_10 = {
  slNo:     'A',
  classCode:'B',
  admNo:    'C',
  name:     'D',
  gender:   'E',
  language: 'F',
  category: 'G',
  subjects: ['H','I','J','K','L','M','N','O','P'],
  total:    'Q',
  division: 'R',
};

function detectLayout(grade, firstDataRow) {
  const g = parseInt(grade);
  if (g === 10)   return LAYOUT_10;
  if (g === 9 || g === 8) return LAYOUT_9;
  if (firstDataRow) {
    const eVal = String(firstDataRow['E'] || '').trim();
    if (/^\d{9,}$/.test(eVal))     return LAYOUT_9;
    if (/^[FM]$/i.test(eVal))      return LAYOUT_10;
  }
  return LAYOUT_9;
}

function extractSubjectScoresFixed(row, subjectConfig, layout) {
  return layout.subjects
    .slice(0, subjectConfig.length)
    .map((col, i) => {
      const subj = subjectConfig[i];
      if (!subj) return null;
      const raw     = String(row[col] || '').trim();
      let obtained  = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : 0;
      
      const max = subj.maxMarks || 50;
      if (obtained > 0) {
        const ceMarks = subj.ceMarks || 0;
        obtained += ceMarks;
      }

      return {
        subjectCode:  subj.code,
        subjectLabel: subj.label,
        obtained:     obtained,
        maxMarks:     max,
      };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseWorkbook(workbook, subjectConfig, academicYear) {
  const allStudents  = [];
  const sheetSummary = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header:    'A',
      defval:    '',
      blankrows: false,
      raw:       false,
    });

    let currentSection = null;
    let layout         = null;
    let sheetCount     = 0;
    let lastExtractedGrade = '';
    let lastExtractedDivision = '';

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (Object.values(row).every((v) => v === '' || v === null || v === undefined)) continue;

      const sectionInfo = detectSectionHeader(row);
      if (sectionInfo) {
        currentSection = sectionInfo;
        layout = null;
        continue;
      }

      if (isHeaderRow(row)) continue;
      if (!currentSection) continue;

      const slNoRaw = String(row['A'] || '').trim();
      const slNo    = Number(slNoRaw);
      if (isNaN(slNo) || slNo <= 0 || slNo > 9999) continue;

      if (!layout) {
        layout = detectLayout(currentSection.grade, row);
      }

      const admNo   = String(row[layout.admNo]   || '').trim();
      const name    = String(row[layout.name]    || '').trim();
      if (!name || name.length < 2) continue;

      const gRaw    = String(row[layout.gender]  || '').trim().toUpperCase();
      const gender  = (gRaw === 'F' || gRaw === 'M') ? gRaw : '';

      const rawLang = String(row[layout.language]|| '').trim();
      const language = normalizeLanguage(rawLang) || guessLanguageFromSheet(sheetName);

      const category = String(row[layout.category] || '').trim();
      const classCode = String(row['B'] || '').trim();

      let detectedYear = academicYear;
      if (!detectedYear && classCode) {
        const ym = classCode.match(/(\d{4}-\d{4})/);
        if (ym) detectedYear = ym[1];
      }

      const totalRaw = String(row[layout.total] || '0').trim();
      let total = parseFloat(totalRaw) || 0;
      const divisionResult = String(row[layout.division] || '').trim().toUpperCase();
      const subjects = extractSubjectScoresFixed(row, subjectConfig, layout);

      if (total === 0 && subjects.length > 0) {
        total = subjects.reduce((s, x) => s + (x.obtained || 0), 0);
      }

      const maxTotal = subjectConfig.reduce((s, c) => s + (c.maxMarks || 50), 0);

      if (classCode) {
        // Extract grade and division from classCode (e.g., "9 M 2025-2026" or "8B 2025-2026")
        const classMatch = classCode.match(/^(\d{1,2})\s*([A-Z])/i);
        if (classMatch) {
          lastExtractedGrade = classMatch[1];
          lastExtractedDivision = classMatch[2].toUpperCase();
        }
      }

      allStudents.push({
        slNo,
        classCode,
        admissionNo: admNo,
        name,
        gender,
        language,
        category,
        grade:         lastExtractedGrade,
        division:      lastExtractedDivision,
        medium:        currentSection.medium    || '',
        languageGroup: currentSection.languageGroup || '',
        sheetName,
        subjects,
        total:         isNaN(total) ? 0 : total,
        maxTotal,
        divisionResult,
      });

      sheetCount++;
    }

    if (sheetCount > 0) {
      sheetSummary.push({ name: sheetName, studentCount: sheetCount });
    }
  }

  return { students: allStudents, sheetSummary };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SUBJECT CONFIGS
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_CONFIG_8 = [
  { code: 'LAN',    label: 'Language I',    maxMarks: 50, ceMarks: 10 },
  { code: 'MAL',    label: 'Malayalam II',  maxMarks: 50, ceMarks: 10 },
  { code: 'ENG',    label: 'English',       maxMarks: 50, ceMarks: 10 },
  { code: 'HIN',    label: 'Hindi',         maxMarks: 50, ceMarks: 10 },
  { code: 'SS',     label: 'Social Science',maxMarks: 50, ceMarks: 10 },
  { code: 'PHY',    label: 'Physics',       maxMarks: 25, ceMarks: 5 },
  { code: 'CHE',    label: 'Chemistry',     maxMarks: 25, ceMarks: 5 },
  { code: 'BIO',    label: 'Biology',       maxMarks: 25, ceMarks: 5 },
  { code: 'MATHS',  label: 'Maths',         maxMarks: 50, ceMarks: 10 },
];

const PRESET_CONFIG_9 = [
  { code: 'LAN',    label: 'Language I',    maxMarks: 50, ceMarks: 10 },
  { code: 'MAL',    label: 'Malayalam II',  maxMarks: 50, ceMarks: 10 },
  { code: 'ENG',    label: 'English',       maxMarks: 100, ceMarks: 20 },
  { code: 'HIN',    label: 'Hindi',         maxMarks: 50, ceMarks: 10 },
  { code: 'SS',     label: 'Social Science',maxMarks: 100, ceMarks: 20 },
  { code: 'PHY',    label: 'Physics',       maxMarks: 50, ceMarks: 10 },
  { code: 'CHE',    label: 'Chemistry',     maxMarks: 50, ceMarks: 10 },
  { code: 'BIO',    label: 'Biology',       maxMarks: 50, ceMarks: 10 },
  { code: 'MATHS',  label: 'Maths',         maxMarks: 100, ceMarks: 20 },
];

const PRESET_CONFIGS = {
  'class_8': PRESET_CONFIG_8,
  'class_9': PRESET_CONFIG_9,
  'class_10_sslc': PRESET_CONFIG_9 // Fallback mapped to 9 for now, unless specified
};

// ─────────────────────────────────────────────────────────────────────────────
// GRADE CALCULATION & SUBJECT SORTING
// ─────────────────────────────────────────────────────────────────────────────
// Removed local calculateGrade in favor of imported gradingService
const subjectOrder = [
  'First language', 'Malayalam', 'English', 'Hindi', 'Arabic', 'Urdu',
  'Social Science', 'Basic Science', 'Science', 'Physics', 'Chemistry', 'Biology', 'Mathematics', 'Maths',
  'Computer Science', 'ICT', 'Information Technology'
];

function sortSubjects(subjectsList) {
  return [...subjectsList].sort((a, b) => {
    const aIndex = subjectOrder.findIndex(s => a.name.toLowerCase().includes(s.toLowerCase()));
    const bIndex = subjectOrder.findIndex(s => b.name.toLowerCase().includes(s.toLowerCase()));
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION USING EXISTING WORKING SERVICE
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Use the SAME PDF generation pattern that works for marklist
const generateHistoricalPDF = async (templateData) => {
  let page;
  try {
    const templatePath = path.join(__dirname, '../views/marklist.ejs');
    const html = await ejs.renderFile(templatePath, templateData);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      orientation: 'portrait',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm'
      }
    });

    await page.close();
    return pdfBuffer;
  } catch (error) {
    if (page) await page.close();
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER METHODS
// ─────────────────────────────────────────────────────────────────────────────

exports.getPresetConfigs = (_req, res) => {
  res.json({ success: true, data: PRESET_CONFIGS });
};

exports.uploadXLS = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  let subjectConfig;
  try {
    subjectConfig = JSON.parse(req.body.subjectConfig || '[]');
  } catch {
    return res.status(400).json({ message: 'Invalid subjectConfig JSON' });
  }

  if ((!subjectConfig || subjectConfig.length === 0) && req.body.preset && PRESET_CONFIGS[req.body.preset]) {
    subjectConfig = PRESET_CONFIGS[req.body.preset];
  }

  if (!subjectConfig || subjectConfig.length === 0) {
    subjectConfig = PRESET_CONFIGS['class_9'];
  }

  let academicYear = req.body.academicYear || '';

  const importBatch = await HistoricalImport.create({
    fileName: req.file.originalname,
    academicYear: academicYear || 'Unknown',
    uploadedBy: req.user._id,
    uploadedByName: req.user.name || req.user.email,
    subjectConfig,
    status: 'processing',
  });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellText: false, cellDates: false });
    const { students, sheetSummary } = parseWorkbook(workbook, subjectConfig, academicYear);

    if (students.length === 0) {
      await HistoricalImport.findByIdAndUpdate(importBatch._id, {
        status: 'error',
        errorMessage: 'No student rows found.',
      });
      return res.status(400).json({ success: false, message: 'No student rows found in the uploaded file.' });
    }

    if (!academicYear && students[0]?.classCode) {
      const m = students[0].classCode.match(/\d{4}-\d{4}/);
      if (m) academicYear = m[0];
    }

    const docs = students.map((s) => ({ ...s, importId: importBatch._id }));
    await HistoricalStudent.insertMany(docs, { ordered: false });

    await HistoricalImport.findByIdAndUpdate(importBatch._id, {
      academicYear: academicYear || importBatch.academicYear,
      totalStudents: students.length,
      sheets: sheetSummary,
      status: 'done',
    });

    res.status(201).json({
      success: true,
      message: 'File processed successfully',
      importId: importBatch._id,
    });
  } catch (err) {
    console.error('Historical import error:', err);
    await HistoricalImport.findByIdAndUpdate(importBatch._id, {
      status: 'error',
      errorMessage: err.message,
    });
    res.status(500).json({ success: false, message: 'Processing failed: ' + err.message });
  }
};

exports.getImports = async (req, res) => {
  try {
    const imports = await HistoricalImport.find()
      .sort({ createdAt: -1 })
      .select('-subjectConfig');
    res.json({ success: true, data: imports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getImportStatus = async (req, res) => {
  try {
    const batch = await HistoricalImport.findById(req.params.id).select(
      'status errorMessage totalStudents sheets academicYear fileName'
    );
    if (!batch) return res.status(404).json({ message: 'Import not found' });
    res.json({ success: true, data: batch });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getImportById = async (req, res) => {
  try {
    const batch = await HistoricalImport.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Import not found' });

    const groups = await HistoricalStudent.aggregate([
      { $match: { importId: batch._id } },
      {
        $group: {
          _id: {
            grade:         '$grade',
            division:      '$division',
            medium:        '$medium',
            languageGroup: '$languageGroup',
            sheetName:     '$sheetName',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.sheetName': 1, '_id.grade': 1, '_id.division': 1 } },
    ]);

    res.json({ success: true, data: batch, groups });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const { grade, division, sheetName, language, search, page = 1, limit = 50 } = req.query;
    const filter = { importId: req.params.id };
    if (grade)     filter.grade    = grade;
    if (division)  filter.division = division;
    if (sheetName) filter.sheetName = sheetName;
    if (language)  filter.language = { $regex: language, $options: 'i' };
    if (search)    filter.name    = { $regex: search, $options: 'i' };

    const pageNum  = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));

    const [students, total] = await Promise.all([
      HistoricalStudent.find(filter)
        .sort({ sheetName: 1, grade: 1, division: 1, slNo: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select('-importId -__v'),
      HistoricalStudent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: students,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteImport = async (req, res) => {
  try {
    const batch = await HistoricalImport.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Import not found' });
    await HistoricalStudent.deleteMany({ importId: req.params.id });
    res.json({ success: true, message: 'Import and all student records deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE BATCH PDF MARK LIST (Multiple students - one page each)
// GET /api/historical-imports/:id/pdf
// ─────────────────────────────────────────────────────────────────────────────
exports.generateMarklistPDF = async (req, res) => {
  try {
    const { grade, division, sheetName } = req.query;

    const buildFilter = () => {
      const f = { importId: req.params.id };
      if (grade) f.grade = grade;
      if (division) f.division = division;
      if (sheetName) f.sheetName = sheetName;
      return f;
    };

    const [batch, students] = await Promise.all([
      HistoricalImport.findById(req.params.id),
      HistoricalStudent.find(buildFilter()).sort({ sheetName: 1, grade: 1, division: 1, slNo: 1 }),
    ]);

    if (!batch) return res.status(404).json({ message: 'Import not found' });
    if (students.length === 0)
      return res.status(404).json({ message: 'No students found for the given filters' });

    // Generate PDFs for all students and merge them
    const pdfBuffers = [];

    for (const student of students) {
      let subjects = (student.subjects || []).map(subj => {
        const maxVal = subj.maxMarks || 40;
        const obtainedVal = subj.obtained !== undefined ? subj.obtained : 0;
        return {
          code: subj.subjectCode || subj.subjectLabel,
          name: subj.subjectLabel || subj.subjectCode,
          obtained: obtainedVal,
          max: maxVal,
          grade: calculateGrade(obtainedVal, maxVal)
        };
      });

      if (student.grade === '8') {
        const scienceCodes = ['PHY', 'CHE', 'BIO', 'Physics', 'Chemistry', 'Biology'];
        const scienceSubjects = subjects.filter(s => scienceCodes.includes(s.code) || scienceCodes.includes(s.name));
        
        if (scienceSubjects.length > 0) {
          const combinedMax = scienceSubjects.reduce((sum, s) => sum + s.max, 0);
          const combinedObtained = scienceSubjects.reduce((sum, s) => sum + s.obtained, 0);
          
          subjects = subjects.filter(s => !scienceCodes.includes(s.code) && !scienceCodes.includes(s.name));
          subjects.push({
            code: 'BASIC_SCI',
            name: 'Basic Science',
            obtained: combinedObtained,
            max: combinedMax,
            grade: calculateGrade(combinedObtained, combinedMax)
          });
        }
      }

      subjects = sortSubjects(subjects);

      const templateData = {
        schoolLogo: SCHOOL_LOGO_URL,
        academicYear: batch.academicYear,
        student: {
          name: student.name,
          class: `${student.grade} ${student.division}`.trim(),
          admissionNo: student.admissionNo || '—'
        },
        subjects: subjects
      };

      const pdfBuffer = await generateHistoricalPDF(templateData);
      pdfBuffers.push(pdfBuffer);
    }

    // If only one student, return single PDF
    if (pdfBuffers.length === 1) {
      const labelParts = [batch.academicYear];
      if (grade) labelParts.push(`Grade${grade}`);
      if (division) labelParts.push(division);
      const filename = `HistoricalMarklist_${labelParts.join('_')}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffers[0].length,
        'Cache-Control': 'no-cache',
      });
      return res.send(pdfBuffers[0]);
    }

    // Merge multiple PDFs using a simple concatenation approach
    // For proper merging, you might want to use a library like pdf-lib
    // For now, we'll just concatenate them (basic approach)
    const mergedBuffer = Buffer.concat(pdfBuffers);

    const labelParts = [batch.academicYear];
    if (grade) labelParts.push(`Grade${grade}`);
    if (division) labelParts.push(division);
    const filename = `HistoricalMarklist_${labelParts.join('_')}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': mergedBuffer.length,
      'Cache-Control': 'no-cache',
    });
    res.send(mergedBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL STUDENT PDF
// ─────────────────────────────────────────────────────────────────────────────
// HIERARCHICAL API ENDPOINTS (YEAR -> STANDARD -> MEDIUM -> CLASS)
// ─────────────────────────────────────────────────────────────────────────────

exports.getHierarchicalYears = async (req, res) => {
  try {
    const imports = await HistoricalImport.find({ status: 'done' }).select('academicYear source createdAt totalStudents').sort({ academicYear: -1 });
    // Group by year to return unique years with aggregated totalStudents
    const uniqueYearsMap = new Map();
    imports.forEach(imp => {
      if (!uniqueYearsMap.has(imp.academicYear)) {
        uniqueYearsMap.set(imp.academicYear, {
          academicYear: imp.academicYear,
          importId: imp._id,
          source: imp.source,
          createdAt: imp.createdAt,
          totalStudents: 0
        });
      }
      uniqueYearsMap.get(imp.academicYear).totalStudents += (imp.totalStudents || 0);
    });
    res.json({ success: true, data: Array.from(uniqueYearsMap.values()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHierarchicalStandards = async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'Year is required' });
    
    const imports = await HistoricalImport.find({ academicYear: year, status: 'done' });
    if (!imports.length) return res.json({ success: true, data: [] });

    const importIds = imports.map(i => i._id);
    const standardsAgg = await HistoricalStudent.aggregate([
      { $match: { importId: { $in: importIds } } },
      { $group: { _id: "$grade", count: { $sum: 1 } } }
    ]);
    
    const standards = standardsAgg.map(s => ({ item: s._id, count: s.count }));
    
    // Sort standards numerically if possible
    standards.sort((a, b) => {
      const numA = parseInt(a.item);
      const numB = parseInt(b.item);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.item).localeCompare(String(b.item));
    });

    res.json({ success: true, data: standards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHierarchicalMediums = async (req, res) => {
  try {
    const { year, standard } = req.query;
    if (!year || !standard) return res.status(400).json({ success: false, message: 'Year and Standard are required' });

    const imports = await HistoricalImport.find({ academicYear: year, status: 'done' });
    if (!imports.length) return res.json({ success: true, data: [] });

    const importIds = imports.map(i => i._id);
    const mediumsAgg = await HistoricalStudent.aggregate([
      { $match: { importId: { $in: importIds }, grade: standard } },
      { $group: { _id: "$medium", count: { $sum: 1 } } }
    ]);
    
    // Some might be null or empty, filter them out or replace with 'Unknown'
    const mediums = mediumsAgg
      .filter(m => m._id && m._id.trim() !== '')
      .map(m => ({ item: m._id, count: m.count }))
      .sort((a, b) => String(a.item).localeCompare(String(b.item)));
    
    res.json({ success: true, data: mediums });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHierarchicalClasses = async (req, res) => {
  try {
    const { year, standard, medium } = req.query;
    if (!year || !standard || !medium) return res.status(400).json({ success: false, message: 'Missing parameters' });

    const imports = await HistoricalImport.find({ academicYear: year, status: 'done' });
    if (!imports.length) return res.json({ success: true, data: [] });

    const importIds = imports.map(i => i._id);
    const classesAgg = await HistoricalStudent.aggregate([
      { 
        $match: { 
          importId: { $in: importIds }, 
          grade: standard,
          medium: medium
        } 
      },
      { $group: { _id: "$division", count: { $sum: 1 } } }
    ]);
    
    const classes = classesAgg
      .map(c => ({ item: c._id, count: c.count }))
      .sort((a, b) => String(a.item).localeCompare(String(b.item)));
      
    res.json({ success: true, data: classes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHierarchicalStudents = async (req, res) => {
  try {
    const { year, standard, medium, class: division } = req.query;
    if (!year || !standard || !medium || !division) return res.status(400).json({ success: false, message: 'Missing parameters' });

    const imports = await HistoricalImport.find({ academicYear: year, status: 'done' });
    if (!imports.length) return res.json({ success: true, data: [] });

    const importIds = imports.map(i => i._id);
    const students = await HistoricalStudent.find({ 
      importId: { $in: importIds }, 
      grade: standard,
      medium: medium,
      division: division
    }).sort({ slNo: 1, name: 1 });
    
    res.json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE FROM DB
// ─────────────────────────────────────────────────────────────────────────────

exports.generateFromDB = async (req, res) => {
  try {
    const { academicYearId, examId } = req.body;
    if (!academicYearId) return res.status(400).json({ success: false, message: 'Academic Year ID is required' });
    if (!examId) return res.status(400).json({ success: false, message: 'Exam ID is required' });

    const yearDoc = await AcademicYear.findById(academicYearId);
    if (!yearDoc) return res.status(404).json({ success: false, message: 'Academic Year not found' });

    // Find the specific exam
    const exam = await Exam.findById(examId);

    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    // Check if an import batch already exists for this exam
    let importBatch = await HistoricalImport.findOne({ examId: exam._id });
    if (importBatch) {
       // Delete existing students so we can regenerate
       await HistoricalStudent.deleteMany({ importId: importBatch._id });
       importBatch.status = 'processing';
       await importBatch.save();
    } else {
       importBatch = new HistoricalImport({
         fileName: `Generated from DB - ${yearDoc.name}`,
         academicYear: yearDoc.name,
         uploadedBy: req.user._id,
         uploadedByName: req.user.name,
         source: 'DB_GENERATION',
         examId: exam._id,
         status: 'processing'
       });
       await importBatch.save();
    }

    // Now, fetch all marks for this exam
    const marks = await Mark.find({ examId: exam._id })
      .populate('studentId')
      .populate({
        path: 'classId',
        select: 'name section'
      });

    // We need to group marks by student
    const studentMap = new Map();

    for (const mark of marks) {
      if (!mark.studentId || !mark.classId) continue;
      
      const stId = mark.studentId._id.toString();
      if (!studentMap.has(stId)) {
        studentMap.set(stId, {
           importId: importBatch._id,
           slNo: mark.studentId.rollNumber || 0,
           classCode: `${mark.classId.name} ${mark.classId.section || ''} ${yearDoc.name}`.trim(),
           admissionNo: mark.studentId.admissionNo || '',
           aadhaarNo: '', // We don't have this in student model usually
           name: mark.studentId.name || mark.studentId.fullName,
           gender: mark.studentId.gender === 'Female' || mark.studentId.gender === 'F' ? 'F' : (mark.studentId.gender === 'Male' || mark.studentId.gender === 'M' ? 'M' : ''),
           medium: mark.studentId.instructionMedium || 'Common',
           grade: mark.classId.name,
           division: mark.classId.section || '',
           subjects: [],
           total: 0,
           maxTotal: 0
        });
      }
      
      const st = studentMap.get(stId);
      
      if (mark.subjects && Array.isArray(mark.subjects)) {
        for (const subjMark of mark.subjects) {
          st.subjects.push({
            subjectCode: subjMark.subjectCode || subjMark.subjectName,
            subjectLabel: subjMark.subjectName,
            obtained: subjMark.totalScore || 0,
            maxMarks: subjMark.maxMarks || 100
          });
          st.total += subjMark.totalScore || 0;
          st.maxTotal += subjMark.maxMarks || 100;
        }
      }
    }

    const studentsToInsert = Array.from(studentMap.values());
    if (studentsToInsert.length > 0) {
      await HistoricalStudent.insertMany(studentsToInsert);
    }

    importBatch.totalStudents = studentsToInsert.length;
    importBatch.status = 'done';
    await importBatch.save();

    res.json({ success: true, data: importBatch, message: `Generated ${studentsToInsert.length} historical records.` });
  } catch (error) {
    console.error('Error generating from DB:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/historical-imports/student/:studentId/pdf
// ─────────────────────────────────────────────────────────────────────────────
exports.generateStudentPDF = async (req, res) => {
  try {
    const student = await HistoricalStudent.findById(req.params.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const batch = await HistoricalImport.findById(student.importId);
    if (!batch) return res.status(404).json({ message: 'Import batch not found' });

    // Map subjects EXACTLY like the working marklist controller
    let subjects = (student.subjects || []).map(subj => {
      const maxVal = subj.maxMarks || 40;
      const obtainedVal = subj.obtained !== undefined ? subj.obtained : 0;
      return {
        name: subj.subjectLabel || subj.subjectCode,
        obtained: obtainedVal,
        max: maxVal,
        grade: calculateGrade(obtainedVal, maxVal)
      };
    });

    subjects = sortSubjects(subjects);

    // Use EXACT same data structure as working marklist controller
    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: batch.academicYear,
      student: {
        name: student.name,
        class: `${student.grade} ${student.division}`.trim(),
        admissionNo: student.admissionNo || '—'
      },
      subjects: subjects
    };

    // Use the SAME PDF generation pattern
    const pdfBuffer = await generateHistoricalPDF(templateData);

    const safeName = student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `MarkSheet_${safeName}_${student.admissionNo || student._id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
  } catch (err) {
    console.error('Student PDF error:', err);
    res.status(500).json({ message: err.message });
  }
};