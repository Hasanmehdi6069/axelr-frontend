#!/bin/bash
# deploy.sh - Production deployment script

echo "🚀 Starting deployment..."

# Get current timestamp for cache busting
TIMESTAMP=$(date +%Y%m%d%H%M%S)
VERSION="4.0.0"

echo "📦 Building with version: $VERSION"

# Update version in files
sed -i "s/APP_VERSION = '.*'/APP_VERSION = '$VERSION'/" script.js
sed -i "s/BUILD_DATE = '.*'/BUILD_DATE = '$(date +%Y-%m-%d)'/" script.js

# Update cache busting in index.html
sed -i "s/style.css?v=[0-9]*/style.css?v=$TIMESTAMP/g" index.html
sed -i "s/script.js?v=[0-9]*/script.js?v=$TIMESTAMP/g" index.html

# Deploy to your hosting platform
echo "📤 Deploying to production..."

# If using GitHub Pages
git add .
git commit -m "Deploy v$VERSION"
git push origin main

# If using Vercel
# vercel --prod

# If using Netlify
# netlify deploy --prod

echo "✅ Deployment complete!"
echo "📍 Version: $VERSION"
echo "🕐 Timestamp: $TIMESTAMP"