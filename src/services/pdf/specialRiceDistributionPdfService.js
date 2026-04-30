// services/specialRiceDistributionPdfService.js
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');

let browserInstance = null;

const getBrowser = async () => {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
};

const generateSpecialRiceDistributionPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/specialRiceDistribution.ejs');

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
        right: '3mm',
        bottom: '5mm',
        left: '3mm'
      }
    });

    await page.close();

    return pdfBuffer;

  } catch (error) {
    if (page) await page.close();
    throw error;
  }
};

module.exports = { generateSpecialRiceDistributionPDF };