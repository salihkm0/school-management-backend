// // services/abstractPdfService.js
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

// const generateAbstractPDF = async (data) => {
//   let page;

//   try {
//     const templatePath = path.join(__dirname, '../../views/abstract.ejs');

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

// module.exports = { generateAbstractPDF };



const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

// Browser instance cache
let browserInstance = null;
let browserLaunchPromise = null;

// Get browser instance with error handling for Render
const getBrowser = async () => {
  // If browser instance exists and is connected, return it
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  // If there's a pending launch promise, wait for it
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  // Launch new browser
  browserLaunchPromise = (async () => {
    try {
      console.log('Launching Puppeteer browser...');
      
      // Configure for Render environment
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

      // Set cache directory for Render
      if (process.env.PUPPETEER_CACHE_DIR) {
        process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR;
      }

      browserInstance = await puppeteer.launch(launchOptions);
      console.log('Puppeteer browser launched successfully');
      
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

const generateAbstractPDF = async (data) => {
  let page = null;
  let browser = null;

  try {
    const templatePath = path.join(__dirname, '../../views/abstract.ejs');

    // Check if template file exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Render HTML from EJS template
    const html = await ejs.renderFile(templatePath, data, { async: true });

    // Get browser instance
    browser = await getBrowser();
    page = await browser.newPage();

    // Set page content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Generate PDF
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
    console.error('Error generating abstract PDF:', error);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(err => console.error('Error closing page:', err));
    }
    // Don't close browser here - keep it for reuse
  }
};

// Cleanup function for graceful shutdown
const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    console.log('Puppeteer browser closed');
  }
};

module.exports = { generateAbstractPDF, closeBrowser };