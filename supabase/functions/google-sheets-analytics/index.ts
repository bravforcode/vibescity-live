/**
 * Enterprise Google Sheets Analytics Integration
 * 
 * Comprehensive analytics system that syncs VibeCity data to Google Sheets
 * with real-time updates, data transformation, and visualization support.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleAuth } from 'https://deno.land/x/google_auth@v0.0.3/mod.ts'

interface AnalyticsEvent {
  id: string
  timestamp: string
  eventType: 'page_view' | 'venue_click' | 'search' | 'filter' | 'map_interaction'
  userId?: string
  sessionId: string
  data: Record<string, any>
  metadata: {
    userAgent: string
    ipAddress: string
    referrer?: string
    viewport: string
  }
}

interface SheetConfig {
  spreadsheetId: string
  sheetName: string
  range: string
  columns: string[]
}

interface SyncResult {
  success: boolean
  rowsProcessed: number
  errors: string[]
  lastSyncTime: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
}

class GoogleSheetsAnalytics {
  private supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  private readonly SPREADSHEET_ID = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID')!
  private readonly SHEET_NAME = 'Anonymous Analytics'
  private readonly SYNC_INTERVAL = 15 // minutes
  private readonly DATA_RETENTION_DAYS = 30

  private googleAuth: GoogleAuth | null = null

  async initializeGoogleAuth() {
    try {
      const credentialsPath = Deno.env.get('GOOGLE_SHEETS_CREDENTIALS_PATH')
      
      if (credentialsPath && await this.fileExists(credentialsPath)) {
        const credentials = JSON.parse(await Deno.readTextFile(credentialsPath))
        this.googleAuth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        })
      } else {
        // Use service account credentials from environment
        const credentials = {
          client_email: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
          private_key: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n')
        }
        
        this.googleAuth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        })
      }
      
      return true
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error)
      return false
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await Deno.stat(path)
      return true
    } catch {
      return false
    }
  }

  async collectAnalyticsEvents(limit = 1000): Promise<AnalyticsEvent[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.DATA_RETENTION_DAYS)

    const { data: events, error } = await this.supabase
      .from('analytics_events')
      .select('*')
      .gte('timestamp', cutoffDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to fetch analytics events:', error)
      throw new Error('Analytics data fetch failed')
    }

    return events || []
  }

  async transformEventsForSheet(events: AnalyticsEvent[]): Promise<any[][]> {
    return events.map(event => [
      event.timestamp,
      event.eventType,
      event.userId || 'Anonymous',
      event.sessionId,
      JSON.stringify(event.data),
      event.metadata.userAgent,
      event.metadata.ipAddress,
      event.metadata.referrer || 'Direct',
      event.metadata.viewport,
      this.extractEventSpecificData(event)
    ])
  }

  private extractEventSpecificData(event: AnalyticsEvent): string {
    switch (event.eventType) {
      case 'venue_click':
        return `Venue: ${event.data.venueId || 'Unknown'} | Category: ${event.data.category || 'Unknown'}`
      case 'search':
        return `Query: ${event.data.query || 'Empty'} | Results: ${event.data.resultCount || 0}`
      case 'filter':
        return `Filters: ${Object.keys(event.data.filters || {}).join(', ')}`
      case 'map_interaction':
        return `Action: ${event.data.action || 'Unknown'} | Zoom: ${event.data.zoomLevel || 'N/A'}`
      case 'page_view':
        return `Path: ${event.data.path || '/'} | Title: ${event.data.title || 'VibeCity'}`
      default:
        return JSON.stringify(event.data)
    }
  }

  async getSheetData(): Promise<any[][]> {
    if (!this.googleAuth) {
      throw new Error('Google Auth not initialized')
    }

    const accessToken = await this.googleAuth.getToken()
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.SHEET_NAME}!A:J`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet data: ${response.statusText}`)
    }

    const data = await response.json()
    return data.values || []
  }

  async updateSheetData(newRows: any[][]): Promise<SyncResult> {
    if (!this.googleAuth) {
      throw new Error('Google Auth not initialized')
    }

    const startTime = new Date().toISOString()
    const errors: string[] = []
    let rowsProcessed = 0

    try {
      const accessToken = await this.googleAuth.getToken()
      
      // Get existing data to avoid duplicates
      const existingData = await this.getSheetData()
      const existingTimestamps = new Set(existingData.slice(1).map(row => row[0])) // Skip header

      // Filter out existing events
      const filteredRows = newRows.filter(row => !existingTimestamps.has(row[0]))
      
      if (filteredRows.length === 0) {
        return {
          success: true,
          rowsProcessed: 0,
          errors: [],
          lastSyncTime: startTime
        }
      }

      // Prepare batch update
      const range = `${this.SHEET_NAME}!A${existingData.length + 1}:J${existingData.length + filteredRows.length}`
      
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: filteredRows
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Sheet update failed: ${errorData.error?.message || response.statusText}`)
      }

      rowsProcessed = filteredRows.length

      // Mark events as synced in database
      await this.markEventsAsSynced(filteredRows.map(row => row[0]))

      return {
        success: true,
        rowsProcessed,
        errors,
        lastSyncTime: startTime
      }

    } catch (error) {
      console.error('Sheet update error:', error)
      errors.push(error.message)
      
      return {
        success: false,
        rowsProcessed,
        errors,
        lastSyncTime: startTime
      }
    }
  }

  private async markEventsAsSynced(timestamps: string[]) {
    if (timestamps.length === 0) return

    const { error } = await this.supabase
      .from('analytics_events')
      .update({ synced_to_sheets: true })
      .in('timestamp', timestamps)

    if (error) {
      console.error('Failed to mark events as synced:', error)
    }
  }

  async createDashboardSheet(): Promise<void> {
    if (!this.googleAuth) return

    try {
      const accessToken = await this.googleAuth.getToken()
      
      // Create dashboard sheet with formulas and charts
      const dashboardData = [
        ['Metric', 'Value', 'Trend', 'Last Updated'],
        ['Total Events', '=COUNT(Anonymous!A:A)', '', '=NOW()'],
        ['Unique Users', '=COUNTUNIQUE(Anonymous!C:C)', '', '=NOW()'],
        ['Page Views', '=COUNTIF(Anonymous!B:B, "page_view")', '', '=NOW()'],
        ['Venue Clicks', '=COUNTIF(Anonymous!B:B, "venue_click")', '', '=NOW()'],
        ['Searches', '=COUNTIF(Anonymous!B:B, "search")', '', '=NOW()'],
        ['Map Interactions', '=COUNTIF(Anonymous!B:B, "map_interaction")', '', '=NOW()'],
        ['Avg Session Duration', '=AVERAGEIFS(Anonymous!A:A, Anonymous!C:C, "<>")', '', '=NOW()'],
        ['Top Venue', '=INDEX(Anonymous!E:E, MATCH(MAX(COUNTIF(Anonymous!E:E, Anonymous!E:E)), COUNTIF(Anonymous!E:E, Anonymous!E:E), 0))', '', '=NOW()']
      ]

      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/Dashboard!A:D?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: dashboardData
          })
        }
      )

      if (!response.ok) {
        console.error('Failed to create dashboard sheet')
      }

    } catch (error) {
      console.error('Dashboard creation error:', error)
    }
  }

  async getAnalyticsSummary(): Promise<any> {
    const events = await this.collectAnalyticsEvents(10000)
    
    const summary = {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map(e => e.userId || e.sessionId)).size,
      eventTypeBreakdown: this.calculateEventTypeBreakdown(events),
      hourlyActivity: this.calculateHourlyActivity(events),
      topVenues: this.getTopVenues(events),
      searchQueries: this.getTopSearchQueries(events),
      dateRange: {
        start: events.length > 0 ? events[events.length - 1].timestamp : null,
        end: events.length > 0 ? events[0].timestamp : null
      }
    }

    return summary
  }

  private calculateEventTypeBreakdown(events: AnalyticsEvent[]) {
    const breakdown: Record<string, number> = {}
    
    events.forEach(event => {
      breakdown[event.eventType] = (breakdown[event.eventType] || 0) + 1
    })

    return Object.entries(breakdown)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }

  private calculateHourlyActivity(events: AnalyticsEvent[]) {
    const hourlyData: Record<number, number> = {}
    
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours()
      hourlyData[hour] = (hourlyData[hour] || 0) + 1
    })

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourlyData[hour] || 0
    }))
  }

  private getTopVenues(events: AnalyticsEvent[]) {
    const venueCounts: Record<string, number> = {}
    
    events
      .filter(event => event.eventType === 'venue_click' && event.data.venueId)
      .forEach(event => {
        const venueId = event.data.venueId
        venueCounts[venueId] = (venueCounts[venueId] || 0) + 1
      })

    return Object.entries(venueCounts)
      .map(([venueId, count]) => ({ venueId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  private getTopSearchQueries(events: AnalyticsEvent[]) {
    const queryCounts: Record<string, number> = {}
    
    events
      .filter(event => event.eventType === 'search' && event.data.query)
      .forEach(event => {
        const query = event.data.query
        queryCounts[query] = (queryCounts[query] || 0) + 1
      })

    return Object.entries(queryCounts)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  async performFullSync(): Promise<SyncResult> {
    console.log('🔄 Starting full Google Sheets sync')
    
    try {
      // Initialize Google Auth
      const authInitialized = await this.initializeGoogleAuth()
      if (!authInitialized) {
        throw new Error('Failed to initialize Google authentication')
      }

      // Collect analytics events
      const events = await this.collectAnalyticsEvents()
      console.log(`📊 Collected ${events.length} analytics events`)

      if (events.length === 0) {
        return {
          success: true,
          rowsProcessed: 0,
          errors: [],
          lastSyncTime: new Date().toISOString()
        }
      }

      // Transform events for sheet
      const sheetData = await this.transformEventsForSheet(events)
      console.log(`🔄 Transformed ${sheetData.length} rows for sheet`)

      // Update sheet
      const result = await this.updateSheetData(sheetData)
      console.log(`✅ Sync completed: ${result.rowsProcessed} rows processed`)

      // Update dashboard
      await this.createDashboardSheet()

      return result

    } catch (error) {
      console.error('❌ Full sync failed:', error)
      return {
        success: false,
        rowsProcessed: 0,
        errors: [error.message],
        lastSyncTime: new Date().toISOString()
      }
    }
  }

  async getSyncStatus(): Promise<any> {
    try {
      const lastSync = await this.supabase
        .from('sync_logs')
        .select('*')
        .eq('sync_type', 'google_sheets')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const pendingEvents = await this.supabase
        .from('analytics_events')
        .select('count')
        .eq('synced_to_sheets', false)
        .single()

      return {
        lastSync: lastSync.data || null,
        pendingEvents: pendingEvents.data?.count || 0,
        nextSync: new Date(Date.now() + this.SYNC_INTERVAL * 60 * 1000).toISOString()
      }
    } catch (error) {
      return {
        lastSync: null,
        pendingEvents: 0,
        nextSync: new Date(Date.now() + this.SYNC_INTERVAL * 60 * 1000).toISOString(),
        error: error.message
      }
    }
  }
}

const sheetsAnalytics = new GoogleSheetsAnalytics()

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname

  try {
    switch (path) {
      case '/':
        return new Response('Google Sheets Analytics API - VibeCity', {
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        })

      case '/sync':
        if (req.method === 'POST') {
          const result = await sheetsAnalytics.performFullSync()
          
          // Log sync result
          await sheetsAnalytics.supabase
            .from('sync_logs')
            .insert({
              sync_type: 'google_sheets',
              status: result.success ? 'success' : 'failed',
              rows_processed: result.rowsProcessed,
              errors: result.errors,
              created_at: result.lastSyncTime
            })

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        break

      case '/status':
        if (req.method === 'GET') {
          const status = await sheetsAnalytics.getSyncStatus()
          return new Response(JSON.stringify(status), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        break

      case '/summary':
        if (req.method === 'GET') {
          const summary = await sheetsAnalytics.getAnalyticsSummary()
          return new Response(JSON.stringify(summary), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        break

      case '/health':
        return new Response(JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      default:
        return new Response('Not Found', { status: 404 })
    }
  } catch (error) {
    console.error('Google Sheets Analytics Error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
