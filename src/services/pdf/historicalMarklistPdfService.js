// src/services/pdf/historicalMarklistPdfService.js
// Isolated PDF generation service for historical import mark lists.
// Mirrors the pattern used by marklistService.js but uses historicalMarklist.ejs.

const path = require('path');
const ejs  = require('ejs');
const { getBrowser } = require('./browserHelper');

const TEMPLATE_PATH = path.join(__dirname, '../../views/historicalMarklist.ejs');

const SCHOOL_LOGO_URL =
  'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// ─────────────────────────────────────────────────────────────────────────────
// Grade helper (same scale as main marklist)
// ─────────────────────────────────────────────────────────────────────────────
function calculateGrade(obtained, maxMarks) {
  if (
    !maxMarks ||
    obtained === undefined ||
    obtained === null ||
    obtained === '-' ||
    obtained === ''
  )
    return '-';

  const pct = (obtained / maxMarks) * 100;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C+';
  if (pct >= 40) return 'C';
  if (pct >= 30) return 'D+';
  if (pct >= 20) return 'D';
  return 'E';
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject ordering
// ─────────────────────────────────────────────────────────────────────────────
const SUBJECT_ORDER = [
  'Language',
  'Malayalam II',
  'English',
  'Hindi',
  'Social Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Maths',
  'Information Technology',
];

function sortSubjects(list) {
  return [...list].sort((a, b) => {
    const ai = SUBJECT_ORDER.findIndex(s =>
      a.name.toLowerCase().includes(s.toLowerCase())
    );
    const bi = SUBJECT_ORDER.findIndex(s =>
      b.name.toLowerCase().includes(s.toLowerCase())
    );
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
function buildSubjects(studentDoc) {
  const MAX = 50;

  const rawSubjects = (studentDoc.subjects || []).map(subj => ({
    name:     subj.subjectLabel || subj.subjectCode || 'Unknown',
    obtained: subj.obtained !== undefined && subj.obtained !== null
              ? subj.obtained
              : 0,
    max:      MAX,
    code:     (subj.subjectCode || '').toUpperCase().trim(),
  }));

  // Find MAL II mark to use for IT
  const malII = rawSubjects.find(s =>
    s.code === 'MAL II' || s.name.toLowerCase().includes('malayalam ii')
  );

  // Add IT subject using MAL II obtained mark
  const itSubject = {
    name:     'Information Technology',
    obtained: malII ? malII.obtained : 0,
    max:      MAX,
    code:     'IT',
  };

  // Build final list — include IT, set grades
  const all = [...rawSubjects, itSubject].map(s => ({
    name:     s.name,
    obtained: s.obtained,
    max:      MAX,
    grade:    calculateGrade(s.obtained, MAX),
  }));

  return sortSubjects(all);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: render EJS → PDF via Puppeteer
// ─────────────────────────────────────────────────────────────────────────────
async function renderHtmlToPdf(html) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
    });

    await page.close();
    return Buffer.from(pdfBuffer); // ensure Node Buffer
  } catch (err) {
    if (page) await page.close().catch(() => {});
    throw err;
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
  const students = studentDocs.map(doc => ({
    name:        doc.name,
    class:       `${doc.grade} ${doc.division}`.trim(),
    admissionNo: doc.admissionNo || '—',
    subjects:    buildSubjects(doc),
  }));

  const templateData = {
    schoolLogo:   SCHOOL_LOGO_URL,
    academicYear: batchDoc.academicYear || '',
    students,
  };

  const html = await ejs.renderFile(TEMPLATE_PATH, templateData);
  return renderHtmlToPdf(html);
}

module.exports = { generateHistoricalMarklistPdf };
