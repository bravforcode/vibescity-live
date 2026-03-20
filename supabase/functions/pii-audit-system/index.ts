/**
 * Enterprise PII Audit System
 * 
 * Comprehensive Personally Identifiable Information monitoring and auditing system
 * for VibeCity with real-time alerts and compliance reporting.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

interface PIIAuditEvent {
  id: string
  timestamp: string
  userId?: string
  sessionId: string
  eventType: 'access' | 'export' | 'view' | 'modify'
  resourceType: 'user_profile' | 'venue_data' | 'analytics' | 'payment_info'
  resourcePath: string
  ipAddress: string
  userAgent: string
  piiFields: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  metadata: Record<string, any>
}

interface PIIAlert {
  id: string
  timestamp: string
  alertType: 'threshold_exceeded' | 'suspicious_pattern' | 'data_breach_attempt'
  severity: 'info' | 'warning' | 'critical'
  message: string
  events: PIIAuditEvent[]
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
}

class PIIAuditSystem {
  private supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  private readonly ALLOWED_ORIGINS = [
    'https://vibecity.live',
    'http://localhost:5173'
  ]

  private readonly ADMIN_PIN = Deno.env.get('PII_AUDIT_ADMIN_PIN') || 'vibecity-secure-2026'
  private readonly SESSION_WINDOW_MINUTES = 30
  private readonly ALERT_THRESHOLDS = {
    totalThreshold: 50,
    exportThreshold: 10,
    perActorThreshold: 25
  }

  async validateRequest(req: Request): Promise<{ valid: boolean; origin?: string }> {
    const origin = req.headers.get('origin')
    
    if (!origin || !this.ALLOWED_ORIGINS.includes(origin)) {
      return { valid: false }
    }

    return { valid: true, origin }
  }

  async logPIIAccess(event: Omit<PIIAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: PIIAuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    }

    // Store in Supabase
    const { error } = await this.supabase
      .from('pii_audit_events')
      .insert(auditEvent)

    if (error) {
      console.error('Failed to log PII event:', error)
      throw new Error('PII audit logging failed')
    }

    // Check for alert conditions
    await this.checkAlertConditions(auditEvent)
  }

  async checkAlertConditions(event: PIIAuditEvent): Promise<void> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - this.SESSION_WINDOW_MINUTES * 60 * 1000)

    // Check total access threshold
    const { data: totalEvents } = await this.supabase
      .from('pii_audit_events')
      .select('count')
      .gte('timestamp', windowStart.toISOString())

    if (totalEvents && totalEvents.length > 0 && totalEvents[0].count >= this.ALERT_THRESHOLDS.totalThreshold) {
      await this.createAlert({
        alertType: 'threshold_exceeded',
        severity: 'warning',
        message: `Total PII access threshold exceeded: ${totalEvents[0].count} accesses in ${this.SESSION_WINDOW_MINUTES} minutes`,
        events: [event]
      })
    }

    // Check export threshold
    if (event.eventType === 'export') {
      const { data: exportEvents } = await this.supabase
        .from('pii_audit_events')
        .select('count')
        .eq('eventType', 'export')
        .gte('timestamp', windowStart.toISOString())

      if (exportEvents && exportEvents.length > 0 && exportEvents[0].count >= this.ALERT_THRESHOLDS.exportThreshold) {
        await this.createAlert({
          alertType: 'threshold_exceeded',
          severity: 'critical',
          message: `PII export threshold exceeded: ${exportEvents[0].count} exports in ${this.SESSION_WINDOW_MINUTES} minutes`,
          events: [event]
        })
      }
    }

    // Check per-actor threshold
    if (event.userId) {
      const { data: userEvents } = await this.supabase
        .from('pii_audit_events')
        .select('count')
        .eq('userId', event.userId)
        .gte('timestamp', windowStart.toISOString())

      if (userEvents && userEvents.length > 0 && userEvents[0].count >= this.ALERT_THRESHOLDS.perActorThreshold) {
        await this.createAlert({
          alertType: 'threshold_exceeded',
          severity: 'warning',
          message: `Per-user PII access threshold exceeded: ${userEvents[0].count} accesses by ${event.userId} in ${this.SESSION_WINDOW_MINUTES} minutes`,
          events: [event]
        })
      }
    }
  }

  async createAlert(alert: Omit<PIIAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const piiAlert: PIIAlert = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      resolved: false,
      ...alert
    }

    const { error } = await this.supabase
      .from('pii_alerts')
      .insert(piiAlert)

    if (error) {
      console.error('Failed to create PII alert:', error)
    }

    // Send real-time notification
    await this.sendNotification(piiAlert)
  }

  async sendNotification(alert: PIIAlert): Promise<void> {
    const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL')
    
    if (!webhookUrl) {
      console.log('Discord webhook not configured, skipping notification')
      return
    }

    const message = {
      embeds: [{
        title: '🚨 PII Audit Alert',
        description: alert.message,
        color: this.getSeverityColor(alert.severity),
        fields: [
          {
            name: 'Alert Type',
            value: alert.alertType.replace('_', ' ').toUpperCase(),
            inline: true
          },
          {
            name: 'Severity',
            value: alert.severity.toUpperCase(),
            inline: true
          },
          {
            name: 'Timestamp',
            value: alert.timestamp,
            inline: true
          }
        ],
        timestamp: alert.timestamp
      }]
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      })
    } catch (error) {
      console.error('Failed to send Discord notification:', error)
    }
  }

  private getSeverityColor(severity: string): number {
    switch (severity) {
      case 'info': return 0x3498db
      case 'warning': return 0xf39c12
      case 'critical': return 0xe74c3c
      default: return 0x95a5a6
    }
  }

  async getAuditDashboard(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const { data: events } = await this.supabase
      .from('pii_audit_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: alerts } = await this.supabase
      .from('pii_alerts')
      .select('*')
      .eq('resolved', false)
      .order('timestamp', { ascending: false })
      .limit(10)

    return new Response(JSON.stringify({
      success: true,
      data: {
        events: events || [],
        alerts: alerts || [],
        pagination: {
          limit,
          offset,
          hasMore: (events?.length || 0) === limit
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  async exportAuditData(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const format = url.searchParams.get('format') || 'json'

    let query = this.supabase
      .from('pii_audit_events')
      .select('*')

    if (startDate) {
      query = query.gte('timestamp', startDate)
    }
    if (endDate) {
      query = query.lte('timestamp', endDate)
    }

    const { data: events } = await query.order('timestamp', { ascending: true })

    if (format === 'csv') {
      const csv = this.convertToCSV(events || [])
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="pii-audit-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      data: events || [],
      count: events?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  private convertToCSV(events: PIIAuditEvent[]): string {
    const headers = [
      'ID', 'Timestamp', 'User ID', 'Session ID', 'Event Type',
      'Resource Type', 'Resource Path', 'IP Address', 'Risk Level', 'PII Fields'
    ]

    const rows = events.map(event => [
      event.id,
      event.timestamp,
      event.userId || 'Anonymous',
      event.sessionId,
      event.eventType,
      event.resourceType,
      event.resourcePath,
      event.ipAddress,
      event.riskLevel,
      event.piiFields.join(';')
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }
}

const piiSystem = new PIIAuditSystem()

serve(async (req) => {
  const { valid } = await piiSystem.validateRequest(req)
  if (!valid) {
    return new Response('Unauthorized origin', { status: 401 })
  }

  const url = new URL(req.url)
  const path = url.pathname

  try {
    switch (path) {
      case '/':
        return new Response('PII Audit System API - VibeCity', {
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        })

      case '/log':
        if (req.method === 'POST') {
          const body = await req.json()
          await piiSystem.logPIIAccess(body)
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        break

      case '/dashboard':
        if (req.method === 'GET') {
          return await piiSystem.getAuditDashboard(req)
        }
        break

      case '/export':
        if (req.method === 'GET') {
          return await piiSystem.exportAuditData(req)
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
    console.error('PII Audit System Error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
