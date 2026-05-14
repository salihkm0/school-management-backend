// services/noonMealPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser } = require('./browserHelper');

// ✅ GROUP LETTERS (A–X like PDF)
const GROUPS = [
  'A','B','C','D','E','F','G','H','I','J','K','L',
  'M','N','O','P','Q','R','S','T','U','V','W','X'
];

// ✅ Convert students → boys/girls grouped counts
const transformData = (students = []) => {
  const boys = {};
  const girls = {};

  GROUPS.forEach(g => {
    boys[g] = 0;
    girls[g] = 0;
  });

  students.forEach(s => {
    const letter = s.name?.charAt(0)?.toUpperCase();

    if (!GROUPS.includes(letter)) return;

    if (s.gender === 'Male') {
      boys[letter]++;
    } else {
      girls[letter]++;
    }
  });

  return { boys, girls };
};

const generateNoonMealPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/noonMeal.ejs');

    // ✅ AUTO FIX: transform students → boys/girls
    let boys = data.boys;
    let girls = data.girls;

    if (!boys || !girls) {
      const transformed = transformData(data.students || []);
      boys = transformed.boys;
      girls = transformed.girls;
    }

    const finalData = {
      ...data,
      boys,
      girls
    };

    const html = await ejs.renderFile(templatePath, finalData);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true, // ✅ correct property
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });

    await page.close();
    return pdfBuffer;

  } catch (error) {
    if (page) await page.close();
    throw error;
  }
};

module.exports = { generateNoonMealPDF };