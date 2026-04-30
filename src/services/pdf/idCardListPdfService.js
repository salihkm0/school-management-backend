// services/idCardListPdfService.js
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');

let browserInstance = null;

// Reuse browser (IMPORTANT for performance)
const getBrowser = async () => {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
};

const generateIdCardListPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/idCardList.ejs');

    // Render HTML
    const html = await ejs.renderFile(templatePath, data);

    const browser = await getBrowser();
    page = await browser.newPage();

    // Better rendering
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // IMPORTANT for print CSS
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      orientation: 'portrait',  // ✅ Changed to portrait
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

module.exports = { generateIdCardListPDF };