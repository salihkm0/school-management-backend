// src/services/pdf/historicalMarklistPdfService.js
// Isolated PDF generation service for historical import mark lists.
// Mirrors the pattern used by marklistService.js but uses historicalMarklist.ejs.

const path = require('path');
const ejs  = require('ejs');
const { getBrowser } = require('./browserHelper');
const { calculateGrade } = require('../../services/gradingService');

const TEMPLATE_PATH = path.join(__dirname, '../../views/historicalMarklist.ejs');

const SCHOOL_LOGO_URL =
  'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// ─────────────────────────────────────────────────────────────────────────────
// Subject ordering
// ─────────────────────────────────────────────────────────────────────────────
const EXACT_SUBJECT_ORDER = [
  'Language I',
  'Malayalam II',
  'English',
  'Social Science',
  'Hindi',
  'Basic Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Maths',
  'Information Technology'
];

function normalizeSubjectName(rawName) {
  if (!rawName) return 'Unknown';
  const lower = rawName.toLowerCase();
  if (lower.includes('first language') || lower === 'lan' || lower === 'language' || lower.includes('language i')) return 'Language I';
  if (lower.includes('malayalam ii') || lower.includes('mal 2') || lower.includes('malayalam 2') || lower === 'mal ii') return 'Malayalam II';
  if (lower.includes('english') || lower === 'eng') return 'English';
  if (lower.includes('social') || lower.includes('soc') || lower === 'ss') return 'Social Science';
  if (lower.includes('hindi') || lower === 'hin') return 'Hindi';
  if (lower.includes('physics') || lower === 'phy') return 'Physics';
  if (lower.includes('chemistry') || lower === 'che') return 'Chemistry';
  if (lower.includes('biology') || lower === 'bio') return 'Biology';
  if (lower.includes('math') || lower === 'mathematics') return 'Maths';
  if (lower.includes('information technology') || lower.includes('ict') || lower === 'it') return 'Information Technology';
  return rawName;
}

function sortSubjects(list) {
  return [...list].sort((a, b) => {
    const ai = EXACT_SUBJECT_ORDER.indexOf(a.name);
    const bi = EXACT_SUBJECT_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Map a single HistoricalStudent document into the subject array for the PDF.
// IT mark = MAL II mark (both max 50).
// All subjects have max 50.
// No Result column.
// ─────────────────────────────────────────────────────────────────────────────
function buildSubjects(studentDoc, source) {
  const rawSubjects = (studentDoc.subjects || []).map(subj => ({
    name:     normalizeSubjectName(subj.subjectLabel || subj.subjectCode || 'Unknown'),
    obtained: subj.obtained !== undefined && subj.obtained !== null
              ? subj.obtained
              : 0,
    max:      subj.maxMarks || 50,
    code:     (subj.subjectCode || '').toUpperCase().trim(),
  }));

  let all = [...rawSubjects];

  // Only synthesize IT from MAL II for imported data (XLS_IMPORT)
  if (source !== 'DB_GENERATION') {
    const hasIT = all.some(s => s.name === 'Information Technology');
    if (!hasIT) {
      const malII = all.find(s => s.code === 'MAL II' || s.name === 'Malayalam II');
      all.push({
        name:     'Information Technology',
        obtained: malII ? malII.obtained : 0,
        max:      malII ? malII.max : 50,
        code:     'IT',
      });
    }
  }

  // Combine Physics, Chemistry, Biology into Basic Science if Grade 8
  const phy = all.find(s => s.name === 'Physics');
  const che = all.find(s => s.name === 'Chemistry');
  const bio = all.find(s => s.name === 'Biology');

  if (phy && che && bio && studentDoc.grade === '8') {
    const combinedMax = (phy.max || 0) + (che.max || 0) + (bio.max || 0);
    const basicSci = {
      name: 'Basic Science',
      obtained: (phy.obtained || 0) + (che.obtained || 0) + (bio.obtained || 0),
      max: combinedMax,
      code: 'BASIC_SCI'
    };
    // Remove individual subjects
    all = all.filter(s => s.name !== 'Physics' && s.name !== 'Chemistry' && s.name !== 'Biology');
    // Add Basic Science
    all.push(basicSci);
  }

  // Build final list — set grades
  all = all.map(s => ({
    name:     s.name,
    obtained: s.obtained,
    max:      s.max,
    grade:    calculateGrade(s.obtained, s.max),
  }));

  return sortSubjects(all);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: render EJS → PDF via Puppeteer
// ─────────────────────────────────────────────────────────────────────────────
async function renderHtmlToPdf(html) {
  let browser = null;
  let page = null;
  try {
    browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
    });

    return Buffer.from(pdfBuffer);
  } catch (err) {
    throw err;
  } finally {
    // Always close page and browser — fresh instance per call
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a PDF for one or more students (one page per student).
 * @param {object[]} studentDocs  — HistoricalStudent Mongoose documents
 * @param {object}   batchDoc    — HistoricalImport Mongoose document
 * @returns {Promise<Buffer>}
 */
async function generateHistoricalMarklistPdf(studentDocs, batchDoc) {
  const students = studentDocs.map(doc => {
    let displayClass = `${doc.grade} ${doc.division}`.trim();
    if (doc.classCode) {
      const match = doc.classCode.match(/^(\d+\s*[a-zA-Z]+)/);
      if (match) {
        displayClass = match[1].toUpperCase();
      }
    }
    
    return {
      name:        doc.name,
      class:       displayClass,
      admissionNo: doc.admissionNo || '—',
      subjects:    buildSubjects(doc, batchDoc.source),
    };
  });

  const templateData = {
    schoolLogo:   SCHOOL_LOGO_URL,
    academicYear: batchDoc.academicYear || '',
    students,
  };

  const html = await ejs.renderFile(TEMPLATE_PATH, templateData);
  return renderHtmlToPdf(html);
}

module.exports = { generateHistoricalMarklistPdf };
