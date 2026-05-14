// services/abstractPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser } = require('./browserHelper');

const generateAbstractPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/abstract.ejs');

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

module.exports = { generateAbstractPDF };