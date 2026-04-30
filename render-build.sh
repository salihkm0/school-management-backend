#!/bin/bash
# Render build script

echo "🚀 Starting Render build process..."

# Display Node version
node --version
npm --version

# Install dependencies with fallbacks
echo "📦 Installing dependencies..."
npm ci --production=false --legacy-peer-deps || \
npm install --production --legacy-peer-deps

# Remove problematic heavy dependencies
echo "🗑️ Removing heavy dependencies not needed in production..."
npm remove puppeteer phantomjs-prebuilt html-pdf 2>/dev/null || true

# Create required directories
echo "📁 Creating required directories..."
mkdir -p uploads logs public

# Clean cache to reduce size
echo "🧹 Cleaning cache..."
npm cache clean --force

# Build summary
echo "✅ Build completed!"
echo "  - Node version: $(node --version)"
echo "  - NPM version: $(npm --version)"

exit 0