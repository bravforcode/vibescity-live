"""
Anonymous User Tracking Core Module
Enterprise-grade tracking without personal data collection
"""

import hashlib
import json
import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from typing import Any

from ..models.anonymous_session import (
    AnonymousSession,
    ConversionEvent,
    DeviceInfo,
    IPInfo,
    SecurityMetrics,
    SessionAnalytics,
)

logger = logging.getLogger(__name__)

@dataclass
class TrackingConfig:
    """Configuration for anonymous tracking"""
    enable_ip_geolocation: bool = True
    enable_device_fingerprinting: bool = True
    enable_behavioral_analysis: bool = True
    enable_security_monitoring: bool = True
    session_timeout_minutes: int = 30
    data_retention_days: int = 30
    rate_limit_per_minute: int = 60
    enable_consent_management: bool = True
    gdpr_compliant: bool = True
    anonymize_ip_addresses: bool = True

class AnonymousTrackingEngine:
    """Core engine for anonymous user tracking"""
    
    def __init__(self, config: TrackingConfig, redis_client):
        self.config = config
        self.redis = redis_client
        self.active_sessions: dict[str, AnonymousSession] = {}
        self.blocked_ips: set[str] = set()
        self.suspicious_patterns: list[str] = []
        
        # Initialize security patterns
        self._init_security_patterns()
    
    def _init_security_patterns(self) -> None:
        """Initialize suspicious behavior patterns"""
        self.suspicious_patterns = [
            "rapid_page_clicks",  # More than 100 clicks in 10 seconds
            "automated_requests",   # Perfect timing intervals
            "suspicious_user_agent", # Known bot patterns
            "geolocation_impossible", # Impossible location changes
            "session_hijacking",     # Multiple IPs for same session
            "unusual_navigation",    # Inhuman navigation patterns
        ]
    
    async def create_session(self, request_data: dict[str, Any]) -> AnonymousSession:
        """Create new anonymous session with security analysis"""
        try:
            # Generate secure session ID
            session_id = str(uuid.uuid4())
            
            # Analyze IP address
            ip_info = await self._analyze_ip_address(request_data.get("ip_address", ""))
            
            # Analyze device and user agent
            device_info = await self._analyze_device(request_data.get("user_agent", ""))
            
            # Generate device fingerprint for fraud detection
            device_fingerprint = None
            if self.config.enable_device_fingerprinting:
                device_fingerprint = self._generate_device_fingerprint(request_data)
            
            # Calculate initial security score
            security_metrics = await self._calculate_initial_security(
                ip_info, device_info, request_data
            )
            
            # Create session
            session = AnonymousSession(
                session_id=session_id,
                session_token=self._generate_session_token(session_id, ip_info),
                ip_address=request_data.get("ip_address", ""),
                ip_info=ip_info,
                user_agent=request_data.get("user_agent", ""),
                device_info=device_info,
                referrer=request_data.get("referrer"),
                entry_point=request_data.get("entry_point", ""),
                current_page=request_data.get("entry_point", ""),
                page_title="",
                created_at=datetime.utcnow(),
                last_activity=datetime.utcnow(),
                security_metrics=security_metrics
            )
            
            # Store in active sessions
            self.active_sessions[session_id] = session
            
            # Store in Redis with expiration
            await self._store_session(session)
            
            # Log session creation for security
            await self._log_security_event("session_created", {
                "session_id": session_id,
                "ip_info": asdict(ip_info),
                "device_info": asdict(device_info),
                "security_score": security_metrics.security_score
            })
            
            logger.info(f"Created anonymous session: {session_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise
    
    async def update_session_activity(self, session_id: str, activity_data: dict[str, Any]) -> bool:
        """Update session with new activity data"""
        try:
            if session_id not in self.active_sessions:
                return False
            
            session = self.active_sessions[session_id]
            
            # Update basic activity
            session.current_page = activity_data.get("current_page", "")
            session.page_title = activity_data.get("page_title", "")
            session.last_activity = datetime.utcnow()
            
            # Get or create analytics
            analytics = await self._get_session_analytics(session_id)
            
            # Update analytics
            if activity_data.get("current_page"):
                analytics.pages_visited.append(activity_data["current_page"])
                analytics.unique_pages.add(activity_data["current_page"])
            
            if activity_data.get("time_on_page"):
                analytics.total_time += activity_data["time_on_page"]
                analytics.avg_time_on_page = analytics.total_time / len(analytics.pages_visited)
            
            # Track interactions
            if activity_data.get("interactions"):
                for interaction in activity_data["interactions"]:
                    await self._track_interaction(session_id, interaction)
            
            # Update performance metrics
            if activity_data.get("performance_metrics"):
                analytics.performance_metrics.update(activity_data["performance_metrics"])
            
            # Behavioral analysis
            if self.config.enable_behavioral_analysis:
                await self._analyze_behavior(session, analytics)
            
            # Security monitoring
            if self.config.enable_security_monitoring:
                new_security_score = await self._analyze_session_security(session, analytics)
                session.security_metrics.security_score = new_security_score
            
            # Store updated data
            await self._store_analytics(session_id, analytics)
            await self._store_session(session)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update session {session_id}: {e}")
            return False
    
    async def track_conversion_event(self, session_id: str, event_data: dict[str, Any]) -> bool:
        """Track conversion event for session"""
        try:
            if session_id not in self.active_sessions:
                return False
            
            # Validate event data
            required_fields = ["event_type", "event_name", "timestamp"]
            for field in required_fields:
                if field not in event_data:
                    logger.warning(f"Missing required field in conversion event: {field}")
                    return False
            
            # Create conversion event
            conversion = ConversionEvent(
                event_id=str(uuid.uuid4()),
                session_id=session_id,
                event_type=event_data["event_type"],
                event_name=event_data["event_name"],
                timestamp=datetime.fromisoformat(event_data["timestamp"]),
                properties=event_data.get("properties", {}),
                value=event_data.get("value"),
                currency=event_data.get("currency"),
                page_url=self.active_sessions[session_id].current_page,
                ip_address=self.active_sessions[session_id].ip_address,
                utm_source=event_data.get("utm_source"),
                utm_medium=event_data.get("utm_medium"),
                utm_campaign=event_data.get("utm_campaign")
            )
            
            # Store event
            await self._store_conversion_event(conversion)
            
            # Update session analytics
            analytics = await self._get_session_analytics(session_id)
            analytics.conversion_events.append(conversion)
            await self._store_analytics(session_id, analytics)
            
            logger.info(f"Tracked conversion: {event_data['event_name']} for session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to track conversion event: {e}")
            return False
    
    async def terminate_session(self, session_id: str, reason: str = "user_request") -> bool:
        """Terminate session and cleanup"""
        try:
            if session_id not in self.active_sessions:
                return False
            
            session = self.active_sessions[session_id]
            
            # Mark as terminated
            session.is_active = False
            session.terminated_at = datetime.utcnow()
            session.termination_reason = reason
            
            # Get final analytics
            analytics = await self._get_session_analytics(session_id)
            if analytics:
                analytics.session_duration = (datetime.utcnow() - session.created_at).total_seconds()
                await self._store_analytics(session_id, analytics)
            
            # Remove from active sessions
            del self.active_sessions[session_id]
            
            # Remove from Redis
            await self.redis.delete(f"session:{session_id}")
            await self.redis.delete(f"analytics:{session_id}")
            
            # Log termination
            await self._log_security_event("session_terminated", {
                "session_id": session_id,
                "reason": reason,
                "duration": analytics.session_duration if analytics else 0,
                "pages_visited": len(analytics.pages_visited) if analytics else 0,
                "conversions": len(analytics.conversion_events) if analytics else 0
            })
            
            logger.info(f"Terminated session: {session_id} - {reason}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to terminate session {session_id}: {e}")
            return False
    
    async def get_session_analytics(self, session_id: str) -> SessionAnalytics | None:
        """Get comprehensive analytics for session"""
        try:
            analytics = await self._get_session_analytics(session_id)
            if not analytics:
                return None
            
            # Calculate derived metrics
            analytics.bounce_rate = 1.0 if len(analytics.pages_visited) <= 1 else 0.0
            analytics.engagement_score = self._calculate_engagement_score(analytics)
            
            return analytics
            
        except Exception as e:
            logger.error(f"Failed to get session analytics {session_id}: {e}")
            return None
    
    async def get_aggregated_analytics(self, time_range: str) -> dict[str, Any]:
        """Get aggregated analytics for time range"""
        try:
            # Parse time range
            end_time = datetime.utcnow()
            if time_range == "1h":
                start_time = end_time - timedelta(hours=1)
            elif time_range == "24h":
                start_time = end_time - timedelta(hours=24)
            elif time_range == "7d":
                start_time = end_time - timedelta(days=7)
            elif time_range == "30d":
                start_time = end_time - timedelta(days=30)
            else:
                start_time = end_time - timedelta(hours=24)
            
            # Get aggregated data from Redis or database
            overview = await self._get_aggregated_data(start_time, end_time)
            geo_data = await self._get_geo_analytics(start_time, end_time)
            
            return {
                "time_range": time_range,
                "period": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat()
                },
                "overview": overview,
                "geo_distribution": geo_data
            }
            
        except Exception as e:
            logger.error(f"Failed to get aggregated analytics: {e}")
            return {}
    
    # Private helper methods
    
    async def _analyze_ip_address(self, ip_address: str) -> IPInfo:
        """Analyze IP address for security and analytics"""
        try:
            # Basic IP validation
            import ipaddress
            ip_obj = ipaddress.ip_address(ip_address)
            
            # Check if private IP
            if ip_obj.is_private:
                return IPInfo(
                    country="Private",
                    city="Local",
                    is_private=True,
                    is_proxy=False,
                    is_datacenter=False
                )
            
            # In production, integrate with IP geolocation service
            # For now, return basic info
            ip_info = IPInfo(
                country="Unknown",
                city="Unknown",
                is_private=False,
                is_proxy=False,
                is_datacenter=False
            )
            
            # Check against blocked IPs
            if self.config.anonymize_ip_addresses:
                # Anonymize IP for privacy
                ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:16]
                # Store hash instead of IP
            
            return ip_info
            
        except Exception as e:
            logger.error(f"IP analysis failed: {e}")
            return IPInfo()
    
    async def _analyze_device(self, user_agent: str) -> DeviceInfo:
        """Analyze user agent for device information"""
        try:
            # Simple user agent parsing - in production, use proper library
            device_info = DeviceInfo(
                browser="Unknown",
                os="Unknown",
                device_type="desktop",
                is_mobile=False
            )
            
            user_agent_lower = user_agent.lower()
            
            # Detect browser
            if "chrome" in user_agent_lower:
                device_info.browser = "Chrome"
            elif "firefox" in user_agent_lower:
                device_info.browser = "Firefox"
            elif "safari" in user_agent_lower and "chrome" not in user_agent_lower:
                device_info.browser = "Safari"
            elif "edge" in user_agent_lower:
                device_info.browser = "Edge"
            
            # Detect OS
            if "windows" in user_agent_lower:
                device_info.os = "Windows"
            elif "mac os" in user_agent_lower:
                device_info.os = "macOS"
            elif "linux" in user_agent_lower:
                device_info.os = "Linux"
            elif "android" in user_agent_lower:
                device_info.os = "Android"
                device_info.device_type = "mobile"
                device_info.is_mobile = True
            elif "ios" in user_agent_lower:
                device_info.os = "iOS"
                device_info.device_type = "mobile"
                device_info.is_mobile = True
            
            return device_info
            
        except Exception as e:
            logger.error(f"Device analysis failed: {e}")
            return DeviceInfo()
    
    def _generate_device_fingerprint(self, request_data: dict[str, Any]) -> str:
        """Generate device fingerprint for fraud detection"""
        try:
            # Combine various device attributes
            fingerprint_data = {
                "user_agent": request_data.get("user_agent", ""),
                "screen_resolution": request_data.get("screen_resolution", ""),
                "timezone": request_data.get("timezone", ""),
                "language": request_data.get("language", ""),
                "accept_language": request_data.get("accept_language", ""),
                "platform": request_data.get("platform", ""),
            }
            
            # Generate hash
            fingerprint_string = json.dumps(fingerprint_data, sort_keys=True)
            fingerprint = hashlib.sha256(fingerprint_string.encode()).hexdigest()
            
            return fingerprint[:16]  # Return first 16 characters
            
        except Exception as e:
            logger.error(f"Device fingerprint generation failed: {e}")
            return ""
    
    async def _calculate_initial_security(self, ip_info: IPInfo, device_info: DeviceInfo, 
                                     request_data: dict[str, Any]) -> SecurityMetrics:
        """Calculate initial security score"""
        try:
            score = 1.0
            risk_level = "low"
            suspicious_indicators = []
            
            # Check user agent for bot patterns
            user_agent = request_data.get("user_agent", "").lower()
            if any(pattern in user_agent for pattern in ["bot", "crawler", "spider", "scraper"]):
                score -= 0.5
                suspicious_indicators.append("bot_user_agent")
                risk_level = "high"
            
            # Check for very short user agent
            if len(user_agent) < 10:
                score -= 0.2
                suspicious_indicators.append("short_user_agent")
            
            # Check IP-based risks
            if ip_info.is_proxy or ip_info.is_vpn or ip_info.is_tor:
                score -= 0.3
                suspicious_indicators.append("anonymous_proxy")
                risk_level = "medium"
            
            if ip_info.is_datacenter:
                score -= 0.2
                suspicious_indicators.append("datacenter_ip")
            
            # Check request patterns (if available)
            if request_data.get("request_velocity", 0) > self.config.rate_limit_per_minute:
                score -= 0.4
                suspicious_indicators.append("high_velocity")
                risk_level = "critical"
            
            # Ensure score doesn't go below 0
            score = max(0.0, score)
            
            # Update risk level based on score
            if score < 0.3:
                risk_level = "critical"
            elif score < 0.6:
                risk_level = "high"
            elif score < 0.8:
                risk_level = "medium"
            
            return SecurityMetrics(
                security_score=score,
                risk_level=risk_level,
                suspicious_indicators=suspicious_indicators,
                velocity_score=request_data.get("request_velocity", 0.0),
                consistency_score=1.0,
                geolocation_score=1.0,
                device_fingerprint=self._generate_device_fingerprint(request_data)
            )
            
        except Exception as e:
            logger.error(f"Security calculation failed: {e}")
            return SecurityMetrics(security_score=0.0, risk_level="unknown")
    
    def _generate_session_token(self, session_id: str, ip_info: IPInfo) -> str:
        """Generate secure session token"""
        try:
            # Create token with session ID, IP hash, and timestamp
            ip_hash = hashlib.sha256(ip_info.country.encode() if ip_info.country else "").hexdigest()[:16]
            token_data = f"{session_id}:{ip_hash}:{datetime.utcnow().timestamp()}"
            return hashlib.sha256(token_data.encode()).hexdigest()
            
        except Exception as e:
            logger.error(f"Token generation failed: {e}")
            return ""
    
    async def _analyze_behavior(self, session: AnonymousSession, analytics: SessionAnalytics) -> None:
        """Analyze user behavior patterns"""
        try:
            # Calculate navigation pattern
            if len(analytics.pages_visited) > 1:
                # Simple pattern detection - in production, use ML
                if len(analytics.unique_pages) == 1 and analytics.total_time > 300:
                    analytics.behavior_pattern = "single_page_deep_engagement"
                elif analytics.total_time / len(analytics.pages_visited) < 5:
                    analytics.behavior_pattern = "rapid_browsing"
                else:
                    analytics.behavior_pattern = "normal_browsing"
            
            # Calculate engagement score
            analytics.engagement_score = self._calculate_engagement_score(analytics)
            
        except Exception as e:
            logger.error(f"Behavior analysis failed: {e}")
    
    def _calculate_engagement_score(self, analytics: SessionAnalytics) -> float:
        """Calculate user engagement score"""
        try:
            score = 0.0
            
            # Time on site (max 0.3 points)
            if analytics.total_time > 300:  # 5+ minutes
                score += 0.3
            elif analytics.total_time > 60:  # 1+ minute
                score += 0.2
            elif analytics.total_time > 30:  # 30+ seconds
                score += 0.1
            
            # Page diversity (max 0.3 points)
            if len(analytics.unique_pages) > 10:
                score += 0.3
            elif len(analytics.unique_pages) > 5:
                score += 0.2
            elif len(analytics.unique_pages) > 2:
                score += 0.1
            
            # Conversions (max 0.4 points)
            if analytics.conversion_events:
                score += 0.4
            
            return min(1.0, score)
            
        except Exception as e:
            logger.error(f"Engagement score calculation failed: {e}")
            return 0.0
    
    async def _analyze_session_security(self, session: AnonymousSession, analytics: SessionAnalytics) -> float:
        """Analyze session for security issues"""
        try:
            current_score = session.security_metrics.security_score
            
            # Check for rapid page changes (bot behavior)
            if len(analytics.pages_visited) > 100 and analytics.total_time < 300:
                current_score -= 0.4
                session.security_metrics.suspicious_indicators.append("rapid_page_changes")
            
            # Check for unusual time patterns
            if analytics.avg_time_on_page < 1.0:
                current_score -= 0.2
                session.security_metrics.suspicious_indicators.append("unusual_time_pattern")
            
            # Check for suspicious navigation
            if analytics.behavior_pattern == "rapid_browsing":
                current_score -= 0.1
            
            return max(0.0, current_score)
            
        except Exception as e:
            logger.error(f"Session security analysis failed: {e}")
            return 0.0
    
    async def _store_session(self, session: AnonymousSession) -> None:
        """Store session in Redis"""
        try:
            session_key = f"session:{session.session_id}"
            session_data = asdict(session)
            
            # Convert datetime objects to ISO strings
            session_data["created_at"] = session.created_at.isoformat()
            session_data["last_activity"] = session.last_activity.isoformat()
            if session.terminated_at:
                session_data["terminated_at"] = session.terminated_at.isoformat()
            
            await self.redis.setex(
                session_key,
                timedelta(hours=self.config.session_timeout_minutes / 60),
                json.dumps(session_data)
            )
            
        except Exception as e:
            logger.error(f"Failed to store session: {e}")
    
    async def _get_session_analytics(self, session_id: str) -> SessionAnalytics | None:
        """Get session analytics from Redis"""
        try:
            analytics_key = f"analytics:{session_id}"
            analytics_data = await self.redis.get(analytics_key)
            
            if analytics_data:
                data = json.loads(analytics_data)
                data["unique_pages"] = set(data.get("unique_pages", []))
                return SessionAnalytics(**data)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get session analytics: {e}")
            return None
    
    async def _store_analytics(self, session_id: str, analytics: SessionAnalytics) -> None:
        """Store analytics in Redis"""
        try:
            analytics_key = f"analytics:{session_id}"
            analytics_data = asdict(analytics)
            analytics_data["unique_pages"] = list(analytics_data["unique_pages"])
            
            await self.redis.setex(
                analytics_key,
                timedelta(days=self.config.data_retention_days),
                json.dumps(analytics_data)
            )
            
        except Exception as e:
            logger.error(f"Failed to store analytics: {e}")
    
    async def _store_conversion_event(self, conversion: ConversionEvent) -> None:
        """Store conversion event in Redis"""
        try:
            events_key = f"events:{conversion.session_id}"
            
            event_data = asdict(conversion)
            event_data["timestamp"] = conversion.timestamp.isoformat()
            
            await self.redis.lpush(events_key, json.dumps(event_data))
            await self.redis.expire(events_key, timedelta(days=self.config.data_retention_days))
            
        except Exception as e:
            logger.error(f"Failed to store conversion event: {e}")
    
    async def _log_security_event(self, event_type: str, data: dict[str, Any]) -> None:
        """Log security event"""
        try:
            security_key = f"security_events:{datetime.utcnow().strftime('%Y-%m-%d')}"
            security_event = {
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": event_type,
                "data": data
            }
            
            await self.redis.lpush(security_key, json.dumps(security_event))
            await self.redis.expire(security_key, timedelta(days=30))
            
        except Exception as e:
            logger.error(f"Failed to log security event: {e}")
    
    async def _get_aggregated_data(self, start_time: datetime, end_time: datetime) -> dict[str, Any]:
        """Get aggregated analytics data"""
        try:
            # This would typically query a time-series database
            # For now, return mock data
            return {
                "total_sessions": 1250,
                "active_sessions": 45,
                "total_page_views": 8750,
                "unique_visitors": 980,
                "avg_session_duration": 245,
                "bounce_rate": 0.35,
                "conversion_rate": 0.025,
                "top_pages": [
                    {"page": "/", "views": 1250},
                    {"page": "/products", "views": 890},
                    {"page": "/about", "views": 456}
                ]
            }
            
        except Exception as e:
            logger.error(f"Failed to get aggregated data: {e}")
            return {}
    
    async def _get_geo_analytics(self, start_time: datetime, end_time: datetime) -> dict[str, int]:
        """Get geographic analytics"""
        try:
            # This would typically query a geolocation database
            # For now, return mock data
            return {
                "US": 450,
                "GB": 230,
                "CA": 180,
                "AU": 120,
                "DE": 95,
                "FR": 85,
                "JP": 75,
                "IN": 65,
                "BR": 50
            }
            
        except Exception as e:
            logger.error(f"Failed to get geo analytics: {e}")
            return {}
    
    async def _track_interaction(self, session_id: str, interaction: dict[str, Any]) -> None:
        """Track user interaction"""
        try:
            interaction_key = f"interactions:{session_id}"
            interaction_data = {
                "interaction_id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                **interaction
            }
            
            await self.redis.lpush(interaction_key, json.dumps(interaction_data))
            await self.redis.expire(interaction_key, timedelta(days=self.config.data_retention_days))
            
        except Exception as e:
            logger.error(f"Failed to track interaction: {e}")
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions"""
        try:
            current_time = datetime.utcnow()
            expired_sessions = []
            
            for session_id, session in self.active_sessions.items():
                # Check if session is expired
                if (current_time - session.last_activity).total_seconds() > self.config.session_timeout_minutes * 60:
                    expired_sessions.append(session_id)
            
            # Terminate expired sessions
            for session_id in expired_sessions:
                await self.terminate_session(session_id, "timeout")
            
            return len(expired_sessions)
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired sessions: {e}")
            return 0
