#!/bin/bash

echo "🚀 VibeCity Production Deployment"

# Deploy Supabase Functions
echo "🔒 Deploying Supabase Functions..."
./supabase/functions/deploy-functions.sh

# Enable Service Worker
echo "⚡ Enabling Service Worker..."
cp public/sw-register.js dist/sw-register.js

# Run Performance Baseline
echo "📈 Running Performance Baseline..."
node scripts/production/run-baseline.mjs

# Setup Analytics Dashboard
echo "📊 Setting up Analytics Dashboard..."
node scripts/analytics/setup-dashboard.mjs

echo "✅ Production deployment complete!"
echo "🌐 Visit: https://vibecity.live"
