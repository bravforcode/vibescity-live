#!/bin/bash

# VibeCity Supabase Functions Deployment Script
# Deploys PII audit and Google Sheets analytics functions

set -e

echo "🚀 Starting VibeCity Supabase Functions Deployment"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if we're logged in
if ! supabase projects list &> /dev/null; then
    echo "🔑 Please login to Supabase first:"
    echo "supabase login"
    exit 1
fi

# Get project info
echo "📋 Getting project information..."
PROJECT_INFO=$(supabase projects list --output json)
PROJECT_REF=$(echo $PROJECT_INFO | jq -r '.[0].ref')

if [ -z "$PROJECT_REF" ]; then
    echo "❌ No Supabase project found. Please create one first."
    exit 1
fi

echo "🔧 Deploying to project: $PROJECT_REF"

# Deploy PII Audit System
echo "🔒 Deploying PII Audit System..."
cd supabase/functions/pii-audit-system

# Install dependencies
echo "📦 Installing PII audit dependencies..."
npm install

# Deploy function
echo "🚀 Deploying pii-audit-system..."
supabase functions deploy pii-audit-system --no-verify-jwt

# Set environment variables for PII audit
echo "⚙️ Setting PII audit environment variables..."
supabase secrets set PII_AUDIT_ENABLED=true
supabase secrets set PII_AUDIT_ADMIN_PIN=vibecity-secure-2026
supabase secrets set PII_AUDIT_SESSION_WINDOW_MINUTES=30
supabase secrets set PII_AUDIT_DASHBOARD_MAX_ROWS=50000
supabase secrets set PII_ACCESS_ALERT_ENABLED=true
supabase secrets set PII_ACCESS_ALERT_WINDOW_MINUTES=60
supabase secrets set PII_ACCESS_ALERT_TOTAL_THRESHOLD=50
supabase secrets set PII_ACCESS_ALERT_EXPORT_THRESHOLD=10
supabase secrets set PII_ACCESS_ALERT_PER_ACTOR_THRESHOLD=25

if [ -n "$DISCORD_WEBHOOK_URL" ]; then
    supabase secrets set DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK_URL"
    echo "📱 Discord webhook configured"
fi

cd ../..

# Deploy Google Sheets Analytics
echo "📊 Deploying Google Sheets Analytics..."
cd google-sheets-analytics

# Install dependencies
echo "📦 Installing Google Sheets dependencies..."
npm install

# Deploy function
echo "🚀 Deploying google-sheets-analytics..."
supabase functions deploy google-sheets-analytics --no-verify-jwt

# Set environment variables for Google Sheets
echo "⚙️ Setting Google Sheets environment variables..."
supabase secrets set GOOGLE_SHEETS_SPREADSHEET_ID="$GOOGLE_SHEETS_SPREADSHEET_ID"

if [ -n "$GOOGLE_SERVICE_ACCOUNT_EMAIL" ]; then
    supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="$GOOGLE_SERVICE_ACCOUNT_EMAIL"
fi

if [ -n "$GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" ]; then
    supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="$GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
fi

cd ../..

# Create database tables for functions
echo "🗄️ Creating database tables..."
supabase db push --schema=public

# Grant permissions
echo "🔐 Setting up permissions..."
supabase db <<EOF
-- Enable RLS for audit tables
ALTER TABLE pii_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own audit events" ON pii_audit_events
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Service role can manage audit events" ON pii_audit_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own analytics" ON analytics_events
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Service role can manage analytics" ON analytics_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage sync logs" ON sync_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pii_audit_events_timestamp ON pii_audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_pii_audit_events_user_id ON pii_audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at);

EOF

# Test deployed functions
echo "🧪 Testing deployed functions..."

# Test PII audit health
echo "🔒 Testing PII audit health..."
PII_HEALTH=$(curl -s -X GET "https://$PROJECT_REF.supabase.co/functions/v1/pii-audit-system/health" | jq -r '.status // "error"')
if [ "$PII_HEALTH" = "healthy" ]; then
    echo "✅ PII audit system is healthy"
else
    echo "❌ PII audit system health check failed: $PII_HEALTH"
fi

# Test Google Sheets health
echo "📊 Testing Google Sheets health..."
SHEETS_HEALTH=$(curl -s -X GET "https://$PROJECT_REF.supabase.co/functions/v1/google-sheets-analytics/health" | jq -r '.status // "error"')
if [ "$SHEETS_HEALTH" = "healthy" ]; then
    echo "✅ Google Sheets system is healthy"
else
    echo "❌ Google Sheets system health check failed: $SHEETS_HEALTH"
fi

# Get function URLs
echo "📋 Function URLs:"
echo "PII Audit: https://$PROJECT_REF.supabase.co/functions/v1/pii-audit-system"
echo "Google Sheets: https://$PROJECT_REF.supabase.co/functions/v1/google-sheets-analytics"

echo ""
echo "✅ Supabase Functions Deployment Complete!"
echo ""
echo "📊 Next Steps:"
echo "1. Update frontend to use new function endpoints"
echo "2. Test PII audit with real user data"
echo "3. Verify Google Sheets sync is working"
echo "4. Monitor function logs in Supabase dashboard"
echo ""
echo "🔗 Dashboard: https://app.supabase.com/project/$PROJECT_REF"
