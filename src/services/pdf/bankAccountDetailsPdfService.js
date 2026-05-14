// services/bankAccountDetailsPdfService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser } = require('./browserHelper');

const generateBankAccountDetailsPDF = async (data) => {
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/bankAccountDetails.ejs');

    const html = await ejs.renderFile(templatePath, data);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      orientation: 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '3mm',
        right: '3mm',
        bottom: '3mm',
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

module.exports = { generateBankAccountDetailsPDF };