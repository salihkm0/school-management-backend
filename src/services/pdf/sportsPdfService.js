// src/services/pdf/sportsPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser, closeBrowser } = require('./browserHelper');

const generateSportsPDF = async (data) => {
  let browser;
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/sportsEntryForm.ejs');
    const html = await ejs.renderFile(templatePath, data);

    browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: ['domcontentloaded', 'load'],
      timeout: 30000
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      orientation: 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });

    return pdfBuffer;
  } catch (error) {
    console.error('Error generating Sports Meet Entry Form PDF:', error);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await closeBrowser(browser);
    }
  }
};

module.exports = { generateSportsPDF };
