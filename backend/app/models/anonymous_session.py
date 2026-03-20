"""
Anonymous Session Models
Enterprise-grade models for anonymous user tracking and analytics
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class SessionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TERMINATED = "terminated"
    SUSPICIOUS = "suspicious"

class EventType(str, Enum):
    PAGE_VIEW = "page_view"
    CLICK = "click"
    SCROLL = "scroll"
    FORM_SUBMIT = "form_submit"
    DOWNLOAD = "download"
    PURCHASE = "purchase"
    SIGNUP = "signup"
    LOGIN = "login"
    CUSTOM = "custom"

class DeviceType(str, Enum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"
    BOT = "bot"
    UNKNOWN = "unknown"

class IPInfo(BaseModel):
    """IP address information"""
    country: str | None = None
    region: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_private: bool = False
    is_proxy: bool = False
    is_vpn: bool = False
    is_datacenter: bool = False
    is_tor: bool = False
    asn: str | None = None
    organization: str | None = None

class DeviceInfo(BaseModel):
    """Device and browser information"""
    browser: str = "Unknown"
    browser_version: str | None = None
    os: str = "Unknown"
    os_version: str | None = None
    device_type: DeviceType = DeviceType.DESKTOP
    is_mobile: bool = False
    is_tablet: bool = False
    screen_resolution: str | None = None
    viewport_size: str | None = None
    language: str = "en"
    timezone: str = "UTC"

class SecurityMetrics(BaseModel):
    """Security and fraud detection metrics"""
    security_score: float = 1.0
    risk_level: str = "low"  # low, medium, high, critical
    suspicious_indicators: list[str] = Field(default_factory=list)
    velocity_score: float = 0.0  # Request velocity
    consistency_score: float = 1.0  # Behavioral consistency
    geolocation_score: float = 1.0  # Location consistency
    device_fingerprint: str | None = None

class AnonymousSession(BaseModel):
    """Main anonymous session model"""
    session_id: str
    session_token: str
    ip_address: str
    ip_info: IPInfo
    user_agent: str
    device_info: DeviceInfo
    referrer: str | None = None
    entry_point: str
    current_page: str | None = None
    page_title: str | None = None
    status: SessionStatus = SessionStatus.ACTIVE
    created_at: datetime
    last_activity: datetime
    terminated_at: datetime | None = None
    termination_reason: str | None = None
    security_metrics: SecurityMetrics
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class PageView(BaseModel):
    """Individual page view tracking"""
    url: str
    title: str
    timestamp: datetime
    time_on_page: int = 0  # seconds
    scroll_depth: float = 0.0  # percentage
    referrer: str | None = None
    performance_metrics: dict[str, Any] | None = None

class UserInteraction(BaseModel):
    """User interaction tracking"""
    interaction_id: str
    session_id: str
    timestamp: datetime
    interaction_type: str  # click, scroll, form_input, etc.
    target_element: str | None = None
    target_selector: str | None = None
    coordinates: dict[str, float] | None = None
    value: Any | None = None
    context: dict[str, Any] | None = None

class ConversionEvent(BaseModel):
    """Conversion and business event tracking"""
    event_id: str
    session_id: str
    event_type: EventType
    event_name: str
    timestamp: datetime
    properties: dict[str, Any] = Field(default_factory=dict)
    value: float | None = None
    currency: str | None = None
    page_url: str | None = None
    ip_address: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None

class SessionAnalytics(BaseModel):
    """Aggregated analytics for a session"""
    session_id: str
    pages_visited: list[str] = Field(default_factory=list)
    unique_pages: set[str] = Field(default_factory=set)
    page_views: list[PageView] = Field(default_factory=list)
    interactions: list[UserInteraction] = Field(default_factory=list)
    conversion_events: list[ConversionEvent] = Field(default_factory=list)
    total_time: int = 0  # seconds
    session_duration: float | None = None  # seconds
    bounce_rate: float = 0.0
    avg_time_on_page: float = 0.0
    scroll_depth_avg: float = 0.0
    click_count: int = 0
    form_submissions: int = 0
    error_count: int = 0
    performance_metrics: dict[str, Any] = Field(default_factory=dict)
    
    # Behavioral metrics
    engagement_score: float = 0.0
    behavior_pattern: str | None = None
    conversion_funnel_steps: list[str] = Field(default_factory=list)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            set: lambda v: list(v)
        }

class SessionSecurity(BaseModel):
    """Security tracking for sessions"""
    session_id: str
    security_events: list[dict[str, Any]] = Field(default_factory=list)
    risk_assessments: list[dict[str, Any]] = Field(default_factory=list)
    blocked_actions: list[str] = Field(default_factory=list)
    verification_challenges: list[dict[str, Any]] = Field(default_factory=list)
    ip_reputation_score: float = 1.0
    device_reputation_score: float = 1.0
    behavioral_anomalies: list[str] = Field(default_factory=list)

class UserBehavior(BaseModel):
    """User behavior analysis"""
    session_id: str
    behavior_segments: list[str] = Field(default_factory=list)
    navigation_pattern: str | None = None
    content_preferences: dict[str, int] = Field(default_factory=dict)
    time_patterns: dict[str, int] = Field(default_factory=dict)
    device_usage: dict[str, float] = Field(default_factory=dict)
    interaction_heatmap: dict[str, int] = Field(default_factory=dict)
    conversion_probability: float = 0.0
    churn_risk: float = 0.0
    
class FunnelStep(BaseModel):
    """Conversion funnel step tracking"""
    step_id: str
    step_name: str
    step_order: int
    session_id: str
    timestamp: datetime
    completed: bool = False
    time_to_complete: int | None = None  # seconds
    drop_off_reason: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)

class ConversionFunnel(BaseModel):
    """Complete conversion funnel analysis"""
    funnel_id: str
    funnel_name: str
    steps: list[FunnelStep] = Field(default_factory=list)
    total_sessions: int = 0
    conversion_rate: float = 0.0
    created_at: datetime
    updated_at: datetime

class SessionSegment(BaseModel):
    """Session segmentation for analytics"""
    segment_id: str
    segment_name: str
    criteria: dict[str, Any]  # Segment definition criteria
    session_count: int = 0
    conversion_rate: float = 0.0
    avg_session_value: float = 0.0
    created_at: datetime

class GeoAnalytics(BaseModel):
    """Geographic analytics model"""
    date: datetime
    country: str
    region: str | None = None
    city: str | None = None
    sessions: int = 0
    unique_visitors: int = 0
    page_views: int = 0
    avg_session_duration: float = 0.0
    bounce_rate: float = 0.0
    conversion_rate: float = 0.0

class TimeSeriesAnalytics(BaseModel):
    """Time-series analytics data"""
    timestamp: datetime
    metric_name: str
    metric_value: float
    session_count: int = 0
    unique_visitors: int = 0
    page_views: int = 0
    conversions: int = 0
    revenue: float = 0.0
    properties: dict[str, Any] = Field(default_factory=dict)

class PerformanceMetrics(BaseModel):
    """Performance tracking for sessions"""
    session_id: str
    page_load_times: list[float] = Field(default_factory=list)
    api_response_times: list[float] = Field(default_factory=list)
    error_rates: list[float] = Field(default_factory=list)
    core_web_vitals: dict[str, float] = Field(default_factory=dict)
    resource_usage: dict[str, float] = Field(default_factory=dict)
    network_quality: dict[str, float] = Field(default_factory=dict)
    device_performance: dict[str, float] = Field(default_factory=dict)

class PrivacySettings(BaseModel):
    """Privacy and consent settings"""
    session_id: str
    analytics_consent: bool = True
    marketing_consent: bool = False
    personalization_consent: bool = True
    data_retention_days: int = 30
    cookie_preferences: dict[str, bool] = Field(default_factory=dict)
    gdpr_compliant: bool = True
    ccpa_compliant: bool = True
    consent_timestamp: datetime | None = None
    consent_version: str = "1.0"

class SessionExport(BaseModel):
    """Session data export for compliance"""
    export_id: str
    session_id: str
    export_type: str  # json, csv, pdf
    data_fields: list[str] = Field(default_factory=list)
    created_at: datetime
    expires_at: datetime
    download_url: str | None = None
    status: str = "pending"  # pending, ready, expired

class ComplianceReport(BaseModel):
    """Compliance and privacy report"""
    report_id: str
    report_type: str  # gdpr, ccpa, custom
    period_start: datetime
    period_end: datetime
    total_sessions: int = 0
    data_requests: int = 0
    data_deletions: int = 0
    consent_withdrawals: int = 0
    compliance_score: float = 1.0
    generated_at: datetime
    file_path: str | None = None
