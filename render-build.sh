#!/bin/bash
# Render build script - PROPER PUPPETEER CONFIGURATION

echo "🚀 Starting Render build process..."

# Display Node version
node --version
npm --version

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false --legacy-peer-deps

# Install Chromium for puppeteer on Render
echo "📦 Installing Chromium browser for puppeteer..."
apt-get update

# Try different package names for different Linux versions
apt-get install -y chromium-browser || \
apt-get install -y chromium || \
apt-get install -y chromium-bsu || \
echo "⚠️ Chromium not found via apt, puppeteer will download its own"

# Create required directories
echo "📁 Creating required directories..."
mkdir -p uploads logs public

# Configure puppeteer environment variables
echo "🔧 Configuring puppeteer environment..."
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "")

# If Chromium not found, set cache directory for puppeteer to download
if [ -z "$PUPPETEER_EXECUTABLE_PATH" ]; then
    echo "⚠️ No system Chromium found, puppeteer will download its own browser"
    export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
    mkdir -p /opt/render/.cache/puppeteer
fi

# Clean cache to reduce size
echo "🧹 Cleaning cache..."
npm cache clean --force

# Build summary
echo "✅ Build completed!"
echo "  - Node version: $(node --version)"
echo "  - NPM version: $(npm --version)"
echo "  - Chromium path: ${PUPPETEER_EXECUTABLE_PATH:-'Will be downloaded by puppeteer'}"
echo "  - Puppeteer cache dir: ${PUPPETEER_CACHE_DIR:-'Default'}"

exit 0