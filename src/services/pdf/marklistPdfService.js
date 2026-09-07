// services/marklistPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser } = require('./browserHelper');

const generateMarklistPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/marklist.ejs');

    const html = await ejs.renderFile(templatePath, data);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Ensure all images (logo & watermark) are completely loaded
    await page.evaluate(async () => {
      const selectors = Array.from(document.querySelectorAll('img'));
      await Promise.all(selectors.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
          setTimeout(resolve, 3000);
        });
      }));
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

    await page.close();

    return pdfBuffer;

  } catch (error) {
    if (page) await page.close();
    throw error;
  }
};

module.exports = { generateMarklistPDF };