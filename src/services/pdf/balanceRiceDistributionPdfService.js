// // services/balanceRiceDistributionPdfService.js
// const ejs = require('ejs');
// const path = require('path');
// const puppeteer = require('puppeteer');

// let browserInstance = null;

// const getBrowser = async () => {
//   if (!browserInstance) {
//     browserInstance = await puppeteer.launch({
//       headless: true,
//       args: ['--no-sandbox', '--disable-setuid-sandbox']
//     });
//   }
//   return browserInstance;
// };

// const generateBalanceRiceDistributionPDF = async (data) => {
//   let page;

//   try {
//     const templatePath = path.join(__dirname, '../../views/balanceRiceDistribution.ejs');

//     const html = await ejs.renderFile(templatePath, data);

//     const browser = await getBrowser();
//     page = await browser.newPage();

//     await page.setContent(html, {
//       waitUntil: 'networkidle0'
//     });

//     await page.emulateMediaType('screen');

//     const pdfBuffer = await page.pdf({
//       format: 'A4',
//       orientation: 'portrait',
//       printBackground: true,
//       preferCSSPageSize: true,
//       margin: {
//         top: '5mm',
//         right: '5mm',
//         bottom: '5mm',
//         left: '5mm'
//       }
//     });

//     await page.close();

//     return pdfBuffer;

//   } catch (error) {
//     if (page) await page.close();
//     throw error;
//   }
// };

// module.exports = { generateBalanceRiceDistributionPDF };



const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

// Browser instance cache
let browserInstance = null;
let browserLaunchPromise = null;

// Get browser instance with error handling for Render
const getBrowser = async () => {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    try {
      console.log('Launching Puppeteer browser for balance rice...');
      
      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080'
        ],
        ignoreHTTPSErrors: true
      };

      // Try to use system Chromium if available (Render)
      const systemChromiumPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chrome',
        process.env.PUPPETEER_EXECUTABLE_PATH
      ].filter(Boolean);

      for (const chromiumPath of systemChromiumPaths) {
        if (fs.existsSync(chromiumPath)) {
          console.log(`Found Chromium at: ${chromiumPath}`);
          launchOptions.executablePath = chromiumPath;
          break;
        }
      }

      if (process.env.PUPPETEER_CACHE_DIR) {
        process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR;
      }

      browserInstance = await puppeteer.launch(launchOptions);
      console.log('Puppeteer browser launched successfully for balance rice');
      
      return browserInstance;
    } catch (error) {
      console.error('Failed to launch Puppeteer browser:', error);
      throw error;
    } finally {
      browserLaunchPromise = null;
    }
  })();

  return browserLaunchPromise;
};

const generateBalanceRiceDistributionPDF = async (data) => {
  let page = null;
  let browser = null;

  try {
    const templatePath = path.join(__dirname, '../../views/balanceRiceDistribution.ejs');

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    const html = await ejs.renderFile(templatePath, data, { async: true });

    browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

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
      },
      timeout: 30000
    });

    return pdfBuffer;

  } catch (error) {
    console.error('Error generating balance rice distribution PDF:', error);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(err => console.error('Error closing page:', err));
    }
  }
};

const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    console.log('Puppeteer browser closed');
  }
};

module.exports = { generateBalanceRiceDistributionPDF, closeBrowser };