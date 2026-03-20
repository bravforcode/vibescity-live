#!/usr/bin/env python3
"""
Alerting System for VibeCity Performance Threshold Violations
Monitors metrics and triggers alerts when thresholds are exceeded
"""

import json
import smtplib
import subprocess
import time
from datetime import datetime, timedelta
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import requests
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

class AlertChannel(Enum):
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    CONSOLE = "console"

@dataclass
class AlertThreshold:
    """Configuration for alert thresholds"""
    metric_name: str
    warning_threshold: float
    critical_threshold: float
    comparison: str  # "greater_than", "less_than", "equals"
    unit: str = ""

@dataclass
class Alert:
    """Alert data structure"""
    id: str
    timestamp: datetime
    severity: AlertSeverity
    title: str
    description: str
    metric_name: str
    current_value: float
    threshold: float
    channel: AlertChannel
    resolved: bool = False
    resolved_at: Optional[datetime] = None

class AlertingSystem:
    """Comprehensive alerting system for performance monitoring"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.config_file = self.project_root / ".agent" / "config" / "alerting_config.json"
        self.alerts_file = self.project_root / ".agent" / "alerts" / "active_alerts.json"
        self.metrics_file = self.project_root / ".agent" / "metrics" / "performance_metrics.json"
        
        # Ensure directories exist
        self.config_file.parent.mkdir(exist_ok=True)
        self.alerts_file.parent.mkdir(exist_ok=True)
        
        # Load configuration
        self.config = self.load_config()
        self.active_alerts = self.load_active_alerts()
        
        # Define default thresholds
        self.default_thresholds = [
            AlertThreshold("lighthouse_performance", 0.8, 0.7, "less_than", "score"),
            AlertThreshold("bundle_size", 400000, 500000, "greater_than", "bytes"),
            AlertThreshold("fcp", 2000, 3000, "greater_than", "ms"),
            AlertThreshold("lcp", 3000, 4000, "greater_than", "ms"),
            AlertThreshold("cls", 0.15, 0.25, "greater_than", "score"),
            AlertThreshold("api_response_time", 200, 500, "greater_than", "ms"),
            AlertThreshold("db_query_time", 100, 200, "greater_than", "ms"),
            AlertThreshold("error_rate", 0.01, 0.05, "greater_than", "percentage"),
            AlertThreshold("cache_hit_rate", 0.8, 0.7, "less_than", "percentage"),
        ]
        
        self.thresholds = self.config.get("thresholds", [asdict(t) for t in self.default_thresholds])
    
    def load_config(self) -> Dict[str, Any]:
        """Load alerting configuration"""
        default_config = {
            "enabled": True,
            "channels": {
                "email": {
                    "enabled": False,
                    "smtp_server": "smtp.gmail.com",
                    "smtp_port": 587,
                    "username": "",
                    "password": "",
                    "recipients": []
                },
                "slack": {
                    "enabled": False,
                    "webhook_url": "",
                    "channel": "#alerts"
                },
                "webhook": {
                    "enabled": False,
                    "url": "",
                    "headers": {}
                }
            },
            "thresholds": [asdict(t) for t in self.default_thresholds],
            "cooldown_minutes": 15,
            "max_alerts_per_hour": 10
        }
        
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                # Merge with defaults
                return {**default_config, **config}
            except Exception as e:
                logger.warning(f"Failed to load config, using defaults: {e}")
        
        return default_config
    
    def load_active_alerts(self) -> List[Alert]:
        """Load active alerts from file"""
        if not self.alerts_file.exists():
            return []
        
        try:
            with open(self.alerts_file, 'r') as f:
                data = json.load(f)
            
            alerts = []
            for alert_data in data:
                alert_data["timestamp"] = datetime.fromisoformat(alert_data["timestamp"])
                if alert_data.get("resolved_at"):
                    alert_data["resolved_at"] = datetime.fromisoformat(alert_data["resolved_at"])
                alerts.append(Alert(**alert_data))
            
            return alerts
        except Exception as e:
            logger.warning(f"Failed to load active alerts: {e}")
            return []
    
    def save_active_alerts(self) -> bool:
        """Save active alerts to file"""
        try:
            alerts_data = []
            for alert in self.active_alerts:
                alert_dict = asdict(alert)
                alert_dict["timestamp"] = alert.timestamp.isoformat()
                if alert.resolved_at:
                    alert_dict["resolved_at"] = alert.resolved_at.isoformat()
                alerts_data.append(alert_dict)
            
            with open(self.alerts_file, 'w') as f:
                json.dump(alerts_data, f, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Failed to save active alerts: {e}")
            return False
    
    def get_latest_metrics(self) -> Optional[Dict[str, Any]]:
        """Get latest metrics from file"""
        if not self.metrics_file.exists():
            return None
        
        try:
            with open(self.metrics_file, 'r') as f:
                metrics_history = json.load(f)
            
            if not metrics_history:
                return None
            
            return metrics_history[-1]  # Return latest metrics
        except Exception as e:
            logger.error(f"Failed to load metrics: {e}")
            return None
    
    def extract_metric_value(self, metrics: Dict[str, Any], metric_name: str) -> Optional[float]:
        """Extract metric value from metrics data"""
        try:
            if metric_name == "lighthouse_performance":
                return metrics.get("frontend", {}).get("lighthouse", {}).get("performance", 0)
            elif metric_name == "bundle_size":
                return metrics.get("frontend", {}).get("bundle_analysis", {}).get("bundle_size", 0)
            elif metric_name == "fcp":
                return metrics.get("frontend", {}).get("lighthouse", {}).get("fcp", 0)
            elif metric_name == "lcp":
                return metrics.get("frontend", {}).get("lighthouse", {}).get("lcp", 0)
            elif metric_name == "cls":
                return metrics.get("frontend", {}).get("lighthouse", {}).get("cls", 0)
            elif metric_name == "api_response_time":
                return metrics.get("backend", {}).get("api_performance", {}).get("response_time_ms", 0)
            elif metric_name == "db_query_time":
                return metrics.get("backend", {}).get("db_performance", {}).get("avg_query_time_ms", 0)
            elif metric_name == "error_rate":
                return metrics.get("backend", {}).get("api_performance", {}).get("error_rate", 0)
            elif metric_name == "cache_hit_rate":
                return metrics.get("backend", {}).get("db_performance", {}).get("cache_hit_rate", 0)
            else:
                logger.warning(f"Unknown metric: {metric_name}")
                return None
        except Exception as e:
            logger.error(f"Failed to extract metric {metric_name}: {e}")
            return None
    
    def check_threshold_violation(self, metric_name: str, value: float) -> Optional[AlertSeverity]:
        """Check if metric value violates any thresholds"""
        for threshold in self.thresholds:
            if threshold["metric_name"] == metric_name:
                comparison = threshold["comparison"]
                warning_threshold = threshold["warning_threshold"]
                critical_threshold = threshold["critical_threshold"]
                
                if comparison == "greater_than":
                    if value >= critical_threshold:
                        return AlertSeverity.CRITICAL
                    elif value >= warning_threshold:
                        return AlertSeverity.WARNING
                elif comparison == "less_than":
                    if value <= critical_threshold:
                        return AlertSeverity.CRITICAL
                    elif value <= warning_threshold:
                        return AlertSeverity.WARNING
                
                break
        
        return None
    
    def should_send_alert(self, metric_name: str, severity: AlertSeverity) -> bool:
        """Check if alert should be sent (cooldown and rate limiting)"""
        cooldown_minutes = self.config.get("cooldown_minutes", 15)
        max_alerts_per_hour = self.config.get("max_alerts_per_hour", 10)
        
        now = datetime.now()
        
        # Check cooldown
        recent_alerts = [
            alert for alert in self.active_alerts
            if alert.metric_name == metric_name 
            and alert.severity == severity
            and not alert.resolved
            and (now - alert.timestamp).total_seconds() < (cooldown_minutes * 60)
        ]
        
        if recent_alerts:
            return False
        
        # Check rate limiting
        hour_ago = now - timedelta(hours=1)
        alerts_last_hour = len([
            alert for alert in self.active_alerts
            if (now - alert.timestamp).total_seconds() < 3600
        ])
        
        if alerts_last_hour >= max_alerts_per_hour:
            return False
        
        return True
    
    def create_alert(self, metric_name: str, value: float, severity: AlertSeverity) -> Alert:
        """Create new alert"""
        threshold = next((t for t in self.thresholds if t["metric_name"] == metric_name), None)
        threshold_value = threshold.get("critical_threshold" if severity == AlertSeverity.CRITICAL else "warning_threshold", 0)
        
        alert_id = f"{metric_name}_{int(time.time())}"
        
        title = f"{severity.value.title()} Alert: {metric_name.replace('_', ' ').title()}"
        description = self.generate_alert_description(metric_name, value, threshold_value, severity)
        
        return Alert(
            id=alert_id,
            timestamp=datetime.now(),
            severity=severity,
            title=title,
            description=description,
            metric_name=metric_name,
            current_value=value,
            threshold=threshold_value,
            channel=self.get_alert_channel(severity)
        )
    
    def generate_alert_description(self, metric_name: str, value: float, threshold: float, severity: AlertSeverity) -> str:
        """Generate alert description"""
        threshold_config = next((t for t in self.thresholds if t["metric_name"] == metric_name), None)
        unit = threshold_config.get("unit", "") if threshold_config else ""
        
        if severity == AlertSeverity.CRITICAL:
            return f"CRITICAL: {metric_name} is {value}{unit} (threshold: {threshold}{unit}). Immediate action required."
        else:
            return f"WARNING: {metric_name} is {value}{unit} (threshold: {threshold}{unit}). Monitor closely."
    
    def get_alert_channel(self, severity: AlertSeverity) -> AlertChannel:
        """Determine alert channel based on severity"""
        if severity == AlertSeverity.CRITICAL:
            return AlertChannel.EMAIL  # Critical alerts go to email
        elif severity == AlertSeverity.WARNING:
            return AlertChannel.SLACK  # Warnings go to Slack
        else:
            return AlertChannel.CONSOLE  # Info alerts to console only
    
    def send_email_alert(self, alert: Alert) -> bool:
        """Send email alert"""
        try:
            email_config = self.config["channels"]["email"]
            
            if not email_config.get("enabled", False):
                logger.info("Email alerts disabled")
                return False
            
            msg = MimeMultipart()
            msg['From'] = email_config["username"]
            msg['To'] = ', '.join(email_config["recipients"])
            msg['Subject'] = f"[VibeCity Alert] {alert.title}"
            
            body = f"""
Alert Details:
- Severity: {alert.severity.value.upper()}
- Metric: {alert.metric_name}
- Current Value: {alert.current_value}
- Threshold: {alert.threshold}
- Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}

Description:
{alert.description}

This is an automated alert from VibeCity Performance Monitoring System.
            """
            
            msg.attach(MimeText(body, 'plain'))
            
            server = smtplib.SMTP(email_config["smtp_server"], email_config["smtp_port"])
            server.starttls()
            server.login(email_config["username"], email_config["password"])
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Email alert sent: {alert.title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False
    
    def send_slack_alert(self, alert: Alert) -> bool:
        """Send Slack alert"""
        try:
            slack_config = self.config["channels"]["slack"]
            
            if not slack_config.get("enabled", False):
                logger.info("Slack alerts disabled")
                return False
            
            webhook_url = slack_config["webhook_url"]
            channel = slack_config["channel"]
            
            color = "danger" if alert.severity == AlertSeverity.CRITICAL else "warning"
            
            payload = {
                "channel": channel,
                "username": "VibeCity Alerts",
                "icon_emoji": ":warning:",
                "attachments": [
                    {
                        "color": color,
                        "title": alert.title,
                        "text": alert.description,
                        "fields": [
                            {
                                "title": "Metric",
                                "value": alert.metric_name,
                                "short": True
                            },
                            {
                                "title": "Current Value",
                                "value": str(alert.current_value),
                                "short": True
                            },
                            {
                                "title": "Threshold",
                                "value": str(alert.threshold),
                                "short": True
                            },
                            {
                                "title": "Time",
                                "value": alert.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                                "short": True
                            }
                        ],
                        "footer": "VibeCity Performance Monitoring",
                        "ts": int(alert.timestamp.timestamp())
                    }
                ]
            }
            
            response = requests.post(webhook_url, json=payload, timeout=10)
            response.raise_for_status()
            
            logger.info(f"Slack alert sent: {alert.title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send Slack alert: {e}")
            return False
    
    def send_webhook_alert(self, alert: Alert) -> bool:
        """Send webhook alert"""
        try:
            webhook_config = self.config["channels"]["webhook"]
            
            if not webhook_config.get("enabled", False):
                logger.info("Webhook alerts disabled")
                return False
            
            url = webhook_config["url"]
            headers = webhook_config.get("headers", {})
            
            payload = {
                "alert_id": alert.id,
                "timestamp": alert.timestamp.isoformat(),
                "severity": alert.severity.value,
                "title": alert.title,
                "description": alert.description,
                "metric_name": alert.metric_name,
                "current_value": alert.current_value,
                "threshold": alert.threshold
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            logger.info(f"Webhook alert sent: {alert.title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send webhook alert: {e}")
            return False
    
    def send_alert(self, alert: Alert) -> bool:
        """Send alert through appropriate channel"""
        success = False
        
        if alert.channel == AlertChannel.EMAIL:
            success = self.send_email_alert(alert)
        elif alert.channel == AlertChannel.SLACK:
            success = self.send_slack_alert(alert)
        elif alert.channel == AlertChannel.WEBHOOK:
            success = self.send_webhook_alert(alert)
        elif alert.channel == AlertChannel.CONSOLE:
            print(f"🚨 {alert.title}")
            print(f"   {alert.description}")
            print(f"   Value: {alert.current_value}, Threshold: {alert.threshold}")
            success = True
        
        return success
    
    def check_and_send_alerts(self) -> List[Alert]:
        """Check metrics and send alerts for threshold violations"""
        if not self.config.get("enabled", True):
            logger.info("Alerting system disabled")
            return []
        
        metrics = self.get_latest_metrics()
        if not metrics:
            logger.warning("No metrics available for alerting")
            return []
        
        new_alerts = []
        
        for threshold in self.thresholds:
            metric_name = threshold["metric_name"]
            value = self.extract_metric_value(metrics, metric_name)
            
            if value is None:
                continue
            
            severity = self.check_threshold_violation(metric_name, value)
            
            if severity and self.should_send_alert(metric_name, severity):
                alert = self.create_alert(metric_name, value, severity)
                
                if self.send_alert(alert):
                    self.active_alerts.append(alert)
                    new_alerts.append(alert)
                    logger.info(f"Alert sent: {alert.title}")
                else:
                    logger.warning(f"Failed to send alert: {alert.title}")
        
        # Save active alerts
        if new_alerts:
            self.save_active_alerts()
        
        return new_alerts
    
    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve an alert"""
        for alert in self.active_alerts:
            if alert.id == alert_id and not alert.resolved:
                alert.resolved = True
                alert.resolved_at = datetime.now()
                self.save_active_alerts()
                logger.info(f"Alert resolved: {alert_id}")
                return True
        
        return False
    
    def get_active_alerts_summary(self) -> Dict[str, Any]:
        """Get summary of active alerts"""
        now = datetime.now()
        active_alerts = [alert for alert in self.active_alerts if not alert.resolved]
        
        critical_count = len([a for a in active_alerts if a.severity == AlertSeverity.CRITICAL])
        warning_count = len([a for a in active_alerts if a.severity == AlertSeverity.WARNING])
        
        recent_alerts = [
            alert for alert in active_alerts
            if (now - alert.timestamp).total_seconds() < 3600  # Last hour
        ]
        
        return {
            "total_active": len(active_alerts),
            "critical": critical_count,
            "warning": warning_count,
            "recent": len(recent_alerts),
            "last_check": now.isoformat()
        }

def main():
    import sys
    
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    alerting = AlertingSystem(project_root)
    
    print("🚨 Starting Alerting System Check...")
    
    try:
        new_alerts = alerting.check_and_send_alerts()
        summary = alerting.get_active_alerts_summary()
        
        print(f"📊 Alert Summary:")
        print(f"   Total Active: {summary['total_active']}")
        print(f"   Critical: {summary['critical']}")
        print(f"   Warning: {summary['warning']}")
        print(f"   Recent (1h): {summary['recent']}")
        
        if new_alerts:
            print(f"\n🚨 New Alerts Sent: {len(new_alerts)}")
            for alert in new_alerts:
                print(f"   - {alert.title}")
        
        if summary['critical'] > 0:
            print(f"\n❌ {summary['critical']} critical alerts require attention")
            sys.exit(1)
        elif summary['warning'] > 0:
            print(f"\n⚠️  {summary['warning']} warnings to monitor")
            sys.exit(2)
        else:
            print(f"\n✅ No active alerts")
            sys.exit(0)
            
    except Exception as e:
        logger.error(f"Alerting system failed: {e}")
        print(f"❌ Critical error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
