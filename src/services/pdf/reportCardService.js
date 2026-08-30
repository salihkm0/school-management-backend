// services/pdf/reportCardService.js
const ejs = require('ejs');
const path = require('path');
const { getBrowser, closeBrowser } = require('./browserHelper');

const generateReportCardPDF = async (data) => {
  let browser;
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/reportCard.ejs');
    const html = await ejs.renderFile(templatePath, data);

    browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      },
      timeout: 30000
    });

    return pdfBuffer;

  } catch (error) {
    console.error('Error generating single report card PDF:', error);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await closeBrowser(browser);
  }
};

const generateMultiReportCardPDF = async (data) => {
  let browser;
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/classReportCards.ejs');
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
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      },
      timeout: 60000
    });

    return pdfBuffer;

  } catch (error) {
    console.error('Error generating multi report card PDF:', error);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await closeBrowser(browser);
  }
};

const generateClassMarksTablePDF = async (data) => {
  let browser;
  let page;

  try {
    const templatePath = path.join(__dirname, '../../views/classMarksTable.ejs');
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
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      },
      timeout: 60000
    });

    return pdfBuffer;

  } catch (error) {
    console.error('Error generating class marks table PDF:', error);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await closeBrowser(browser);
  }
};

module.exports = { generateReportCardPDF, generateMultiReportCardPDF, generateClassMarksTablePDF };