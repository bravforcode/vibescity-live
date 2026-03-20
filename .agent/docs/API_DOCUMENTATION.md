# VibeCity DevOps System - API Documentation

> **🔗 Complete API reference for external integrations**

---

## 📋 Overview

The VibeCity DevOps System provides RESTful APIs for external integrations with metrics collection, security validation, alerting, and monitoring components.

**Base URL:** `http://localhost:8001/api/v1`

**Authentication:** API Key required (set in `X-API-Key` header)

---

## 🔐 Authentication

All API endpoints require authentication using an API key.

### Headers:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

### Get API Key:
```bash
# Generate new API key
curl -X POST http://localhost:8001/api/v1/auth/generate-key \
  -H "Content-Type: application/json" \
  -d '{"name": "integration-name", "permissions": ["read", "write"]}'
```

---

## 📊 Metrics Collection API

### Get Latest Metrics
Retrieve the most recent performance metrics.

**Endpoint:** `GET /metrics/latest`

**Response:**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "frontend": {
    "lighthouse": {
      "performance": 0.95,
      "accessibility": 0.90,
      "best_practices": 0.88,
      "seo": 0.92
    },
    "bundle_analysis": {
      "bundle_size": 350000,
      "status": "success"
    }
  },
  "backend": {
    "api_performance": {
      "response_time_ms": 150,
      "error_rate": 0.01
    },
    "db_performance": {
      "avg_query_time_ms": 45,
      "cache_hit_rate": 0.92
    }
  }
}
```

### Get Metrics History
Retrieve historical metrics with optional filtering.

**Endpoint:** `GET /metrics/history`

**Query Parameters:**
- `start_date` (optional): ISO date string (e.g., "2024-01-01")
- `end_date` (optional): ISO date string (e.g., "2024-01-07")
- `limit` (optional): Number of records (default: 100)
- `component` (optional): Filter by component ("frontend", "backend")

**Response:**
```json
{
  "metrics": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "frontend": {...},
      "backend": {...}
    }
  ],
  "total_count": 150,
  "has_more": true
}
```

### Submit Custom Metrics
Submit custom metrics for tracking.

**Endpoint:** `POST /metrics/custom`

**Request Body:**
```json
{
  "metric_name": "custom_conversion_rate",
  "value": 0.85,
  "component": "business",
  "tags": ["marketing", "q1-2024"],
  "metadata": {
    "source": "analytics_platform",
    "region": "us-west"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "metric_id": "custom_1641024000_abc123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## 🔒 Security Validation API

### Get Security Report
Retrieve the latest security validation report.

**Endpoint:** `GET /security/report`

**Response:**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "overall_status": "pass",
  "components": [
    {
      "component": "frontend",
      "checks": {
        "dependency_audit": {
          "status": "pass",
          "vulnerabilities": []
        },
        "code_patterns": {
          "status": "pass",
          "issues": []
        }
      }
    }
  ],
  "summary": {
    "total_issues": 0,
    "critical_issues": 0,
    "high_issues": 0,
    "medium_issues": 0
  }
}
```

### Trigger Security Scan
Manually trigger a new security validation scan.

**Endpoint:** `POST /security/scan`

**Request Body:**
```json
{
  "components": ["frontend", "backend"],
  "scan_type": "full",
  "priority": "high"
}
```

**Response:**
```json
{
  "scan_id": "scan_1641024000_xyz789",
  "status": "initiated",
  "estimated_duration": 120,
  "started_at": "2024-01-01T12:00:00Z"
}
```

### Get Scan Status
Check the status of a security scan.

**Endpoint:** `GET /security/scan/{scan_id}/status`

**Response:**
```json
{
  "scan_id": "scan_1641024000_xyz789",
  "status": "completed",
  "progress": 100,
  "started_at": "2024-01-01T12:00:00Z",
  "completed_at": "2024-01-01T12:02:00Z",
  "results": {...}
}
```

---

## 🚨 Alerting API

### Get Active Alerts
Retrieve all currently active alerts.

**Endpoint:** `GET /alerts/active`

**Query Parameters:**
- `severity` (optional): Filter by severity ("critical", "warning", "info")
- `limit` (optional): Number of alerts (default: 50)

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert_1641024000_def456",
      "timestamp": "2024-01-01T12:00:00Z",
      "severity": "warning",
      "title": "High Response Time Detected",
      "description": "API response time exceeded threshold",
      "metric_name": "api_response_time",
      "current_value": 250,
      "threshold": 200,
      "resolved": false
    }
  ],
  "total_count": 2,
  "critical_count": 0,
  "warning_count": 2
}
```

### Create Alert
Create a new alert manually.

**Endpoint:** `POST /alerts/create`

**Request Body:**
```json
{
  "severity": "warning",
  "title": "Custom Alert",
  "description": "Alert description",
  "metric_name": "custom_metric",
  "current_value": 150,
  "threshold": 100,
  "tags": ["manual", "custom"]
}
```

**Response:**
```json
{
  "alert_id": "alert_1641024000_ghi789",
  "status": "created",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Resolve Alert
Mark an alert as resolved.

**Endpoint:** `POST /alerts/{alert_id}/resolve`

**Request Body:**
```json
{
  "resolution_note": "Issue fixed by optimizing database query"
}
```

**Response:**
```json
{
  "status": "resolved",
  "resolved_at": "2024-01-01T12:05:00Z"
}
```

### Get Alert History
Retrieve historical alert data.

**Endpoint:** `GET /alerts/history`

**Query Parameters:**
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string
- `severity` (optional): Filter by severity
- `resolved` (optional): Filter by resolution status ("true", "false")

**Response:**
```json
{
  "alerts": [...],
  "summary": {
    "total_alerts": 150,
    "resolved_alerts": 145,
    "critical_alerts": 5,
    "avg_resolution_time_minutes": 15.5
  }
}
```

---

## 🏥 System Health API

### Get System Health
Retrieve overall system health status.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "components": {
    "metrics_collector": {
      "status": "operational",
      "last_check": "2024-01-01T11:55:00Z",
      "uptime_percentage": 99.9
    },
    "security_validator": {
      "status": "operational",
      "last_check": "2024-01-01T11:50:00Z",
      "uptime_percentage": 99.7
    },
    "alerting_system": {
      "status": "degraded",
      "last_check": "2024-01-01T11:45:00Z",
      "uptime_percentage": 98.5
    }
  },
  "overall_health_score": 92,
  "active_issues": 1
}
```

### Get Component Health
Get detailed health information for a specific component.

**Endpoint:** `GET /health/components/{component_name}`

**Response:**
```json
{
  "component": "metrics_collector",
  "status": "operational",
  "health_score": 98,
  "uptime_percentage": 99.9,
  "last_check": "2024-01-01T11:55:00Z",
  "metrics": {
    "avg_response_time_ms": 45,
    "success_rate": 99.5,
    "throughput_per_second": 120,
    "error_rate": 0.5
  },
  "recent_issues": [],
  "dependencies": {
    "database": "healthy",
    "file_system": "healthy",
    "network": "healthy"
  }
}
```

---

## 🧪 A/B Testing API

### Create A/B Test
Create a new A/B test.

**Endpoint:** `POST /ab-tests/create`

**Request Body:**
```json
{
  "name": "Performance Optimization Test",
  "description": "Test new caching strategy",
  "test_type": "performance",
  "variant_a_name": "Control",
  "variant_b_name": "New Caching",
  "sample_size": 1000,
  "duration_days": 7,
  "success_metrics": ["response_time", "throughput", "error_rate"]
}
```

**Response:**
```json
{
  "test_id": "test_1641024000_jkl012",
  "status": "created",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### Start A/B Test
Start an existing A/B test.

**Endpoint:** `POST /ab-tests/{test_id}/start`

**Response:**
```json
{
  "status": "started",
  "started_at": "2024-01-01T12:00:00Z",
  "estimated_completion": "2024-01-08T12:00:00Z"
}
```

### Record Test Metric
Record a metric value for an A/B test variant.

**Endpoint:** `POST /ab-tests/{test_id}/metrics`

**Request Body:**
```json
{
  "variant_name": "New Caching",
  "metric_name": "response_time",
  "value": 125.5,
  "user_id": "user_12345"
}
```

**Response:**
```json
{
  "status": "recorded",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Get Test Results
Get analysis and results for an A/B test.

**Endpoint:** `GET /ab-tests/{test_id}/results`

**Response:**
```json
{
  "test_id": "test_1641024000_jkl012",
  "status": "completed",
  "variant_a_results": {
    "response_time": {"mean": 150.2, "std": 25.1, "count": 500}
  },
  "variant_b_results": {
    "response_time": {"mean": 125.5, "std": 20.3, "count": 500}
  },
  "statistical_significance": {
    "response_time": true
  },
  "confidence_intervals": {
    "response_time": [-30.1, -19.3]
  },
  "effect_sizes": {
    "response_time": -0.98
  },
  "recommendation": "Strong recommendation to implement variant B. Positive effects observed in: response_time",
  "completed_at": "2024-01-08T12:00:00Z"
}
```

---

## 💾 Backup API

### Create Backup
Create a new backup of configuration and metrics.

**Endpoint:** `POST /backup/create`

**Request Body:**
```json
{
  "backup_type": "full",
  "description": "Weekly backup",
  "compression": true
}
```

**Response:**
```json
{
  "backup_id": "backup_1641024000_mno345",
  "status": "initiated",
  "estimated_size_mb": 250,
  "started_at": "2024-01-01T12:00:00Z"
}
```

### List Backups
List available backups.

**Endpoint:** `GET /backup/list`

**Query Parameters:**
- `backup_type` (optional): Filter by type ("full", "configuration", "metrics")
- `limit` (optional): Number of backups (default: 50)

**Response:**
```json
{
  "backups": [
    {
      "backup_id": "backup_1641024000_mno345",
      "backup_type": "full",
      "timestamp": "2024-01-01T12:00:00Z",
      "file_count": 1250,
      "total_size_mb": 245.8,
      "compressed": true,
      "description": "Weekly backup"
    }
  ],
  "total_count": 15
}
```

### Restore Backup
Restore from a backup.

**Endpoint:** `POST /backup/{backup_id}/restore`

**Request Body:**
```json
{
  "restore_path": "/tmp/restore_test",
  "verify_integrity": true
}
```

**Response:**
```json
{
  "status": "initiated",
  "restore_id": "restore_1641024000_pqr678",
  "estimated_duration": 300,
  "started_at": "2024-01-01T12:00:00Z"
}
```

---

## 📈 Monitoring API

### Get Performance Trends
Get performance trend data for charts and dashboards.

**Endpoint:** `GET /monitoring/trends`

**Query Parameters:**
- `metric` (required): Metric name ("response_time", "throughput", "error_rate")
- `period` (optional): Time period ("1h", "6h", "24h", "7d", "30d")
- `granularity` (optional): Data granularity ("minute", "hour", "day")

**Response:**
```json
{
  "metric": "response_time",
  "period": "24h",
  "granularity": "hour",
  "data_points": [
    {
      "timestamp": "2024-01-01T00:00:00Z",
      "value": 145.2,
      "sample_count": 1200
    }
  ],
  "statistics": {
    "mean": 150.5,
    "min": 120.1,
    "max": 180.9,
    "trend": "stable"
  }
}
```

### Get Anomalies
Get detected performance anomalies.

**Endpoint:** `GET /monitoring/anomalies`

**Query Parameters:**
- `severity` (optional): Filter by severity ("low", "medium", "high")
- `timeframe` (optional): Time window ("1h", "6h", "24h")

**Response:**
```json
{
  "anomalies": [
    {
      "id": "anomaly_1641024000_stu901",
      "timestamp": "2024-01-01T12:00:00Z",
      "metric": "response_time",
      "severity": "high",
      "description": "Response time increased by 200%",
      "expected_value": 150,
      "actual_value": 450,
      "confidence": 0.95
    }
  ],
  "total_count": 3,
  "high_severity_count": 1
}
```

---

## 🔧 Configuration API

### Get Configuration
Get system configuration settings.

**Endpoint:** `GET /config`

**Query Parameters:**
- `component` (optional): Specific component configuration

**Response:**
```json
{
  "metrics_collection": {
    "enabled": true,
    "interval_seconds": 300,
    "retention_days": 30
  },
  "alerting": {
    "enabled": true,
    "thresholds": {...},
    "channels": {...}
  },
  "backup": {
    "enabled": true,
    "interval_hours": 6,
    "retention_days": 30
  }
}
```

### Update Configuration
Update system configuration.

**Endpoint:** `PUT /config`

**Request Body:**
```json
{
  "alerting": {
    "thresholds": {
      "response_time_warning": 200,
      "response_time_critical": 500
    }
  }
}
```

**Response:**
```json
{
  "status": "updated",
  "updated_at": "2024-01-01T12:00:00Z",
  "changes": ["alerting.thresholds.response_time_warning", "alerting.thresholds.response_time_critical"]
}
```

---

## 📊 Webhooks

### Create Webhook
Create a new webhook for event notifications.

**Endpoint:** `POST /webhooks/create`

**Request Body:**
```json
{
  "name": "Slack Notifications",
  "url": "https://hooks.slack.com/services/...",
  "events": ["alert.created", "test.completed", "backup.completed"],
  "secret": "webhook_secret_key",
  "active": true
}
```

**Response:**
```json
{
  "webhook_id": "webhook_1641024000_vwx234",
  "status": "created",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### Test Webhook
Test a webhook endpoint.

**Endpoint:** `POST /webhooks/{webhook_id}/test`

**Response:**
```json
{
  "status": "success",
  "response_code": 200,
  "response_time_ms": 150,
  "tested_at": "2024-01-01T12:00:00Z"
}
```

---

## 🚫 Error Handling

### Error Response Format
All errors return consistent error responses:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or expired",
    "details": {
      "timestamp": "2024-01-01T12:00:00Z",
      "request_id": "req_1641024000_yza567"
    }
  }
}
```

### Common Error Codes
- `INVALID_API_KEY`: API key is invalid or missing
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `VALIDATION_ERROR`: Request validation failed
- `INTERNAL_ERROR`: Server-side error

---

## 📝 Rate Limiting

API requests are rate-limited to prevent abuse:

- **Standard endpoints:** 100 requests per minute
- **Heavy operations** (scans, backups): 10 requests per hour
- **Webhooks:** 1000 deliveries per hour

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641024060
```

---

## 🔍 SDK Examples

### Python SDK
```python
import requests

class VibeCityAPI:
    def __init__(self, api_key, base_url="http://localhost:8001/api/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }
    
    def get_latest_metrics(self):
        response = requests.get(
            f"{self.base_url}/metrics/latest",
            headers=self.headers
        )
        return response.json()
    
    def create_alert(self, severity, title, description, metric_name, current_value, threshold):
        data = {
            "severity": severity,
            "title": title,
            "description": description,
            "metric_name": metric_name,
            "current_value": current_value,
            "threshold": threshold
        }
        response = requests.post(
            f"{self.base_url}/alerts/create",
            headers=self.headers,
            json=data
        )
        return response.json()

# Usage
api = VibeCityAPI("your-api-key")
metrics = api.get_latest_metrics()
print(f"Latest performance score: {metrics['frontend']['lighthouse']['performance']}")
```

### JavaScript SDK
```javascript
class VibeCityAPI {
    constructor(apiKey, baseUrl = 'http://localhost:8001/api/v1') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.headers = {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
        };
    }
    
    async getLatestMetrics() {
        const response = await fetch(`${this.baseUrl}/metrics/latest`, {
            headers: this.headers
        });
        return response.json();
    }
    
    async createAlert(severity, title, description, metricName, currentValue, threshold) {
        const data = {
            severity,
            title,
            description,
            metric_name: metricName,
            current_value: currentValue,
            threshold
        };
        const response = await fetch(`${this.baseUrl}/alerts/create`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(data)
        });
        return response.json();
    }
}

// Usage
const api = new VibeCityAPI('your-api-key');
api.getLatestMetrics().then(metrics => {
    console.log(`Latest performance score: ${metrics.frontend.lighthouse.performance}`);
});
```

---

## 📞 Support

For API support and questions:
- **Documentation:** [VibeCity DevOps Guide](./DEVOPS_SYSTEM_GUIDE.md)
- **Issues:** Create issue in project repository
- **Email:** devops@vibecity.live
- **Status Page:** https://status.vibecity.live

---

## 🔄 Version History

- **v1.0.0**: Initial API release with core metrics and alerting
- **v1.1.0**: Added A/B testing and backup APIs
- **v1.2.0**: Enhanced security validation and monitoring
- **v1.3.0**: Added webhooks and improved error handling

---

**🚀 This API provides comprehensive integration capabilities for the VibeCity DevOps System!**
