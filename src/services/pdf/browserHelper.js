// src/services/pdf/browserHelper.js
const puppeteer = require('puppeteer');
const fs = require('fs');

let browserInstance = null;

const findChromePath = () => {
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ].filter(Boolean);

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }
  
  return null;
};

const getBrowser = async () => {
  if (!browserInstance) {
    const chromePath = findChromePath();
    
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (chromePath) {
      launchOptions.executablePath = chromePath;
      console.log('Using Chrome at:', chromePath);
    } else {
      console.log('No Chrome found, using default Puppeteer Chromium');
    }
    
    browserInstance = await puppeteer.launch(launchOptions);
  }
  return browserInstance;
};

const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
};

module.exports = { getBrowser, closeBrowser };