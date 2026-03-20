import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


class CSPConfig:
    """Content Security Policy configuration with environment-aware directives"""

    def __init__(self, env: str = "production", report_uri: str | None = None):
        self.env = env.lower()
        self.report_uri = report_uri

    def get_csp_header(self) -> str:
        """Generate CSP header based on environment"""
        directives = [
            "default-src 'self'",
            self._get_script_src(),
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com https://*.tile.openstreetmap.org https://api.mapbox.com",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.mapbox.com https://events.mapbox.com https://api.stripe.com https://*.sentry.io https://*.clarity.ms https://*.vercel-insights.com",
            "worker-src 'self' blob:",
            "frame-src https://js.stripe.com https://hooks.stripe.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests" if self.env == "production" else "",
        ]

        # Add report-uri if configured
        if self.report_uri:
            directives.append(f"report-uri {self.report_uri}")
            directives.append("report-to csp-endpoint")

        return "; ".join([directive for directive in directives if directive])

    def _get_script_src(self) -> str:
        """Get script-src directive based on environment"""
        base_sources = [
            "'self'",
            "https://js.stripe.com",
            "https://api.mapbox.com",
            "https://www.clarity.ms",
        ]
        
        # In development, allow unsafe-inline and unsafe-eval for hot reload
        if self.env in ["development", "local"]:
            base_sources.extend(["'unsafe-inline'", "'unsafe-eval'"])
        else:
            # In production, use nonces or hashes instead of unsafe-inline
            base_sources.append("'unsafe-inline'")  # TODO: Replace with nonces
            base_sources.append("'unsafe-eval'")  # Required for Mapbox

        return f"script-src {' '.join(base_sources)}"

    def get_report_to_header(self) -> str | None:
        """Generate Report-To header for CSP violation reporting"""
        if not self.report_uri:
            return None

        import json

        report_to = {
            "group": "csp-endpoint",
            "max_age": 86400,
            "endpoints": [{"url": self.report_uri}],
        }
        return json.dumps(report_to)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Comprehensive security headers middleware
    Task 4 (E1): Content Security Policy implementation
    """

    def __init__(
        self,
        app: ASGIApp,
        env: str = "production",
        csp_report_uri: str | None = None,
    ):
        super().__init__(app)
        self.csp_config = CSPConfig(env=env, report_uri=csp_report_uri)
        logger.info(f"SecurityHeadersMiddleware initialized for environment: {env}")

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Content Security Policy
        response.headers["Content-Security-Policy"] = self.csp_config.get_csp_header()

        # Report-To header for CSP violation reporting
        report_to = self.csp_config.get_report_to_header()
        if report_to:
            response.headers["Report-To"] = report_to

        # X-Frame-Options: Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # X-Content-Type-Options: Prevent MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-XSS-Protection: Enable XSS filter (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Strict-Transport-Security: Force HTTPS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Referrer-Policy: Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy: Control browser features
        response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"

        return response
