// services/studentListPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser } = require('./browserHelper');

const generateStudentListPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/studentList.ejs');

    const html = await ejs.renderFile(templatePath, data);

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
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });

    await page.close();

    return pdfBuffer;

  } catch (error) {
    if (page) await page.close();
    throw error;
  }
};

module.exports = { generateStudentListPDF };