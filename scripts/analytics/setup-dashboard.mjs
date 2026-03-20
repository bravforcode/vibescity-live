#!/usr/bin/env node

/**
 * Analytics Dashboard Setup
 *
 * Sets up Google Sheets dashboard with formulas and charts
 * for VibeCity analytics monitoring.
 */

import { GoogleAuth } from 'https://deno.land/x/google_auth@v0.0.3/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SPREADSHEET_ID = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

class AnalyticsDashboard {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.googleAuth = null;
  }

  async initializeGoogleAuth() {
    const credentials = {
      client_email: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      private_key: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n')
    };

    this.googleAuth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }

  async setupDashboard() {
    console.log('📊 Setting up Analytics Dashboard...');

    await this.initializeGoogleAuth();

    // Create dashboard sheets
    await this.createDashboardSheets();

    // Add formulas and charts
    await this.addDashboardFormulas();

    // Test data sync
    await this.testDataSync();

    console.log('✅ Analytics Dashboard setup complete');
  }

  async createDashboardSheets() {
    const accessToken = await this.googleAuth.getToken();

    // Create dashboard sheets if they don't exist
    const sheets = [
      { name: 'Dashboard', data: this.getDashboardTemplate() },
      { name: 'Analytics', data: this.getAnalyticsTemplate() },
      { name: 'Performance', data: this.getPerformanceTemplate() }
    ];

    for (const sheet of sheets) {
      try {
        await this.createSheet(sheet.name, sheet.data, accessToken);
        console.log(`📋 Created sheet: ${sheet.name}`);
      } catch (error) {
        console.warn(`Sheet ${sheet.name} may already exist:`, error.message);
      }
    }
  }

  async createSheet(sheetName, data, accessToken) {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheetName}!A:Z?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: data
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create sheet: ${response.statusText}`);
    }
  }

  getDashboardTemplate() {
    return [
      ['VibeCity Analytics Dashboard'],
      [''],
      ['Key Metrics', 'Value', 'Trend', 'Last Updated'],
      ['Total Events', '=COUNT(Analytics!A:A)', '', '=NOW()'],
      ['Unique Users', '=COUNTUNIQUE(Analytics!C:C)', '', '=NOW()'],
      ['Page Views', '=COUNTIF(Analytics!B:B, "page_view")', '', '=NOW()'],
      ['Venue Clicks', '=COUNTIF(Analytics!B:B, "venue_click")', '', '=NOW()'],
      ['Searches', '=COUNTIF(Analytics!B:B, "search")', '', '=NOW()'],
      ['Map Interactions', '=COUNTIF(Analytics!B:B, "map_interaction")', '', '=NOW()'],
      ['Avg Session Duration', '=AVERAGEIFS(Analytics!A:A, Analytics!C:C, "<>")', '', '=NOW()'],
      ['Performance Score', '=Performance!B2', '', '=NOW()'],
      [''],
      ['Top Venues (Last 7 Days)', 'Clicks', 'Category'],
      ['=QUERY(Analytics!E:F, "SELECT E, COUNT(E) WHERE B = \'venue_click\' AND A > DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY E ORDER BY COUNT(E) DESC LIMIT 10", '', ''],
      [''],
      ['Search Trends (Last 7 Days)', 'Searches', 'Results'],
      ['=QUERY(Analytics!E:F, "SELECT E, COUNT(E) WHERE B = \'search\' AND A > DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY E ORDER BY COUNT(E) DESC LIMIT 10")', '', '']
    ];
  }

  getAnalyticsTemplate() {
    return [
      ['Timestamp', 'Event Type', 'User ID', 'Session ID', 'Data', 'User Agent', 'IP Address', 'Referrer', 'Viewport', 'Event Details']
    ];
  }

  getPerformanceTemplate() {
    return [
      ['Metric', 'Value', 'Target', 'Status'],
      ['Performance Score', '', '90', ''],
      ['LCP (ms)', '', '2500', ''],
      ['FID (ms)', '', '100', ''],
      ['CLS', '', '0.1', ''],
      ['TTI (ms)', '', '3800', ''],
      ['TBT (ms)', '', '200', ''],
      ['CLS Total', '', '0.25', '']
    ];
  }

  async addDashboardFormulas() {
    const accessToken = await this.googleAuth.getToken();

    // Add conditional formatting for performance metrics
    const requests = [
      {
        addConditionalFormatRule: {
          range: {
            sheetId: 0, // Dashboard sheet
            startRowIndex: 3,
            endRowIndex: 12,
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          rule: {
            ranges: [{
              startRowIndex: 3,
              endRowIndex: 12,
              startColumnIndex: 1,
              endColumnIndex: 2
            }],
            booleanRule: {
              condition: {
                type: 'NUMBER_GREATER',
                values: [{ userEnteredValue: '0' }]
              },
              format: {
                backgroundColor: { red: 0.9, green: 0.95, blue: 1 }
              }
            }
          }
        }
      }
    ];

    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests
          })
        }
      );
    } catch (error) {
      console.warn('Failed to add conditional formatting:', error.message);
    }
  }

  async testDataSync() {
    console.log('🧪 Testing data sync...');

    // Trigger a sync to test the system
    const response = await fetch(
      `https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1/google-sheets-analytics/sync`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Data sync test passed:', result);
    } else {
      console.error('❌ Data sync test failed:', await response.text());
    }
  }
}

// Run dashboard setup
const dashboard = new AnalyticsDashboard();
dashboard.setupDashboard().catch(console.error);
