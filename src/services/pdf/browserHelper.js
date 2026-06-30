// src/services/pdf/browserHelper.js
const puppeteer = require('puppeteer');
const fs = require('fs');

const findChromePath = () => {
  const possiblePaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ].filter(Boolean);

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`[browserHelper] Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }

  console.warn('[browserHelper] No system Chrome found, using bundled Puppeteer Chromium');
  return null;
};

// Launch a fresh browser per use — avoids stale singleton connection issues on VPS
const getBrowser = async () => {
  const chromePath = findChromePath();

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking'
    ]
  };

  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }

  const browser = await puppeteer.launch(launchOptions);
  return browser;
};

// Close the browser after use — caller is responsible for calling this
const closeBrowser = async (browser) => {
  if (browser) {
    await browser.close().catch(() => {});
  }
};

module.exports = { getBrowser, closeBrowser };
