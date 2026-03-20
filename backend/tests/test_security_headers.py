"""
Tests for security headers middleware
Task 4 (E1): Content Security Policy implementation
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestSecurityHeaders:
    """Test security headers middleware"""
    
    def test_csp_header_present(self):
        """Test that CSP header is present"""
        response = client.get("/health")
        assert "Content-Security-Policy" in response.headers
        
        csp = response.headers["Content-Security-Policy"]
        assert "default-src 'self'" in csp
        assert "script-src" in csp
        assert "style-src" in csp
    
    def test_x_frame_options(self):
        """Test X-Frame-Options header"""
        response = client.get("/health")
        assert response.headers["X-Frame-Options"] == "DENY"
    
    def test_x_content_type_options(self):
        """Test X-Content-Type-Options header"""
        response = client.get("/health")
        assert response.headers["X-Content-Type-Options"] == "nosniff"
    
    def test_x_xss_protection(self):
        """Test X-XSS-Protection header"""
        response = client.get("/health")
        assert response.headers["X-XSS-Protection"] == "1; mode=block"
    
    def test_strict_transport_security(self):
        """Test HSTS header"""
        response = client.get("/health")
        hsts = response.headers["Strict-Transport-Security"]
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts
        assert "preload" in hsts
    
    def test_referrer_policy(self):
        """Test Referrer-Policy header"""
        response = client.get("/health")
        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    
    def test_permissions_policy(self):
        """Test Permissions-Policy header"""
        response = client.get("/health")
        assert "Permissions-Policy" in response.headers
        permissions = response.headers["Permissions-Policy"]
        assert "geolocation" in permissions
    
    def test_report_to_header(self):
        """Test Report-To header for CSP reporting"""
        response = client.get("/health")
        # Report-To header should be present if CSP reporting is configured
        if "Report-To" in response.headers:
            import json
            report_to = json.loads(response.headers["Report-To"])
            assert report_to["group"] == "csp-endpoint"
            assert "endpoints" in report_to


class TestCSPViolationReporting:
    """Test CSP violation reporting endpoints"""
    
    def test_csp_report_endpoint_accepts_violations(self):
        """Test that CSP report endpoint accepts violation reports"""
        violation_report = {
            "csp-report": {
                "document-uri": "https://example.com/page",
                "referrer": "",
                "violated-directive": "script-src",
                "effective-directive": "script-src",
                "original-policy": "default-src 'self'",
                "disposition": "enforce",
                "blocked-uri": "https://evil.com/malicious.js",
                "line-number": 42,
                "column-number": 15,
                "source-file": "https://example.com/app.js",
                "status-code": 200,
            }
        }
        
        response = client.post("/api/v1/security/csp-report", json=violation_report)
        assert response.status_code == 204
    
    def test_get_csp_violations(self):
        """Test getting CSP violations"""
        response = client.get("/api/v1/security/csp-violations")
        assert response.status_code == 200
        
        data = response.json()
        assert "total" in data
        assert "violations" in data
        assert "statistics" in data
    
    def test_get_csp_violations_with_limit(self):
        """Test getting CSP violations with limit"""
        response = client.get("/api/v1/security/csp-violations?limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["violations"]) <= 10
    
    def test_get_csp_violation_stats(self):
        """Test getting CSP violation statistics"""
        response = client.get("/api/v1/security/csp-violations/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_violations" in data
        assert "by_directive" in data
        assert "by_blocked_uri" in data
    
    def test_clear_csp_violations(self):
        """Test clearing CSP violations"""
        # First add a violation
        violation_report = {
            "csp-report": {
                "document-uri": "https://example.com/page",
                "violated-directive": "script-src",
                "effective-directive": "script-src",
                "original-policy": "default-src 'self'",
                "disposition": "enforce",
                "blocked-uri": "https://evil.com/malicious.js",
            }
        }
        client.post("/api/v1/security/csp-report", json=violation_report)
        
        # Clear violations
        response = client.delete("/api/v1/security/csp-violations")
        assert response.status_code == 200
        assert "message" in response.json()
        
        # Verify cleared
        response = client.get("/api/v1/security/csp-violations")
        data = response.json()
        assert data["total"] == 0


class TestCSPConfig:
    """Test CSP configuration"""
    
    def test_csp_includes_required_directives(self):
        """Test that CSP includes all required directives"""
        response = client.get("/health")
        csp = response.headers["Content-Security-Policy"]
        
        required_directives = [
            "default-src",
            "script-src",
            "style-src",
            "img-src",
            "connect-src",
            "font-src",
            "object-src",
            "base-uri",
            "form-action",
            "frame-ancestors",
        ]
        
        for directive in required_directives:
            assert directive in csp, f"Missing directive: {directive}"
    
    def test_csp_allows_required_domains(self):
        """Test that CSP allows required third-party domains"""
        response = client.get("/health")
        csp = response.headers["Content-Security-Policy"]
        
        # Check for required third-party services
        required_domains = [
            "stripe.com",  # Payments
            "mapbox.com",  # Maps
            "supabase.co",  # Database
        ]
        
        for domain in required_domains:
            assert domain in csp, f"Missing required domain: {domain}"
    
    def test_csp_restricts_dangerous_directives(self):
        """Test that dangerous directives are properly restricted"""
        response = client.get("/health")
        csp = response.headers["Content-Security-Policy"]
        
        # object-src should be 'none'
        assert "object-src 'none'" in csp
        
        # frame-ancestors should be 'none' (prevent clickjacking)
        assert "frame-ancestors 'none'" in csp
        
        # base-uri should be 'self'
        assert "base-uri 'self'" in csp
