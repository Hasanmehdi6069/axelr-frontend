#!/bin/bash
# deploy-frontend.sh - Frontend production deployment script

echo "🚀 Starting frontend deployment..."

# Get current timestamp for cache busting
TIMESTAMP=$(date +%Y%m%d%H%M%S)
VERSION="4.1.0"  # Bumped version after our fixes

echo "📦 Building with version: $VERSION"

# Update version in core files
sed -i "s/APP_VERSION = '.*'/APP_VERSION = '$VERSION'/" js/00-core.js
sed -i "s/BUILD_DATE = '.*'/BUILD_DATE = '$(date +%Y-%m-%d)'/" js/00-core.js

# Update service worker version to match
sed -i "s/SW_VERSION    = '.*'/SW_VERSION    = 'axelr-v4'/" sw.js

# Deploy to your hosting platform
echo "📤 Deploying frontend to production..."

# If using GitHub Pages
git add .
git commit -m "Deploy v$VERSION - Fixed cascade issue, removed old monolith files"
git push origin main

# If using Vercel
# vercel --prod

# If using Netlify
# netlify deploy --prod

echo "✅ Frontend deployment complete!"
echo "📍 Version: $VERSION"
echo "🕐 Timestamp: $TIMESTAMP"