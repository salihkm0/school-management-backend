#!/bin/bash
# Render build script - KEEP PUPPETEER INSTALLED

echo "🚀 Starting Render build process..."

# Display Node version
node --version
npm --version

# Install dependencies (including puppeteer)
echo "📦 Installing dependencies with puppeteer..."
npm install --production=false --legacy-peer-deps

# DO NOT remove puppeteer - Comment out the removal line
# echo "🗑️ Removing heavy dependencies not needed in production..."
# npm remove puppeteer phantomjs-prebuilt html-pdf 2>/dev/null || true

# Configure puppeteer for Render environment
echo "🔧 Configuring puppeteer for Render..."
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install Chromium for puppeteer (critical for PDF generation)
echo "📦 Installing Chromium browser for puppeteer..."
apt-get update && apt-get install -y chromium-browser || \
apt-get update && apt-get install -y chromium || \
echo "⚠️ Chromium not installed via apt, puppeteer will download its own"

# Create required directories
echo "📁 Creating required directories..."
mkdir -p uploads logs public

# Clean cache to reduce size (but keep puppeteer)
echo "🧹 Cleaning cache..."
npm cache clean --force

# Build summary
echo "✅ Build completed with puppeteer!"
echo "  - Node version: $(node --version)"
echo "  - NPM version: $(npm --version)"
echo "  - Puppeteer installed: $(npm list puppeteer --depth=0 || echo 'Checking...')"

exit 0