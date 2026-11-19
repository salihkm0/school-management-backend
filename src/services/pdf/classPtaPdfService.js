// services/classPtaPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser, closeBrowser } = require('./browserHelper');

const generateClassPtaPDF = async (data) => {
  let page;
  let browser;

  try {
    const templatePath = path.join(__dirname, '../../views/classPta.ejs');

    const html = await ejs.renderFile(templatePath, data);

    browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      orientation: 'portrait',
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
    console.error('Class PTA PDF generation error in service:', error);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await closeBrowser(browser);
  }
};

module.exports = { generateClassPtaPDF };