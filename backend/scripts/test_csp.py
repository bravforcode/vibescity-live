#!/usr/bin/env python3
"""
CSP Testing Script
Task 4.2 (E1): Test CSP with CSP Evaluator

Tests Content Security Policy configuration for security issues
"""
import argparse
import json
import sys
from typing import Any

import requests


Finding = dict[str, str]


class CSPEvaluator:
    """Evaluate CSP policies for security issues"""

    # Known security issues
    UNSAFE_INLINE = "'unsafe-inline'"
    UNSAFE_EVAL = "'unsafe-eval'"
    WILDCARD = "*"

    def __init__(self):
        self.findings: list[Finding] = []

    def evaluate(self, csp_header: str) -> tuple[str, list[Finding]]:
        """
        Evaluate CSP header for security issues

        Returns:
            Tuple of (grade, findings)
        """
        self.findings = []

        if not csp_header:
            self.findings.append(
                {
                    "severity": "high",
                    "directive": "none",
                    "issue": "No CSP header found",
                    "description": "Content Security Policy is not configured",
                },
            )
            return "F", self.findings

        # Parse directives
        directives = self._parse_csp(csp_header)

        # Check for common issues
        self._check_unsafe_inline(directives)
        self._check_unsafe_eval(directives)
        self._check_wildcards(directives)
        self._check_missing_directives(directives)
        self._check_deprecated_directives(directives)
        self._check_base_uri(directives)
        self._check_object_src(directives)

        # Calculate grade
        grade = self._calculate_grade()

        return grade, self.findings

    def _parse_csp(self, csp_header: str) -> dict[str, list[str]]:
        """Parse CSP header into directives"""
        directives: dict[str, list[str]] = {}

        for directive in csp_header.split(";"):
            directive = directive.strip()
            if not directive:
                continue

            parts = directive.split()
            if not parts:
                continue

            directive_name = parts[0]
            directive_values = parts[1:] if len(parts) > 1 else []
            directives[directive_name] = directive_values

        return directives

    def _check_unsafe_inline(self, directives: dict[str, list[str]]) -> None:
        """Check for unsafe-inline usage"""
        risky_directives = ["script-src", "style-src", "default-src"]

        for directive in risky_directives:
            if directive in directives and self.UNSAFE_INLINE in directives[directive]:
                severity = "high" if directive == "script-src" else "medium"
                self.findings.append(
                    {
                        "severity": severity,
                        "directive": directive,
                        "issue": f"{directive} allows 'unsafe-inline'",
                        "description": "Inline scripts/styles are allowed, which can lead to XSS vulnerabilities",
                        "recommendation": "Use nonces or hashes instead of 'unsafe-inline'",
                    },
                )

    def _check_unsafe_eval(self, directives: dict[str, list[str]]) -> None:
        """Check for unsafe-eval usage"""
        risky_directives = ["script-src", "default-src"]

        for directive in risky_directives:
            if directive in directives and self.UNSAFE_EVAL in directives[directive]:
                self.findings.append(
                    {
                        "severity": "high",
                        "directive": directive,
                        "issue": f"{directive} allows 'unsafe-eval'",
                        "description": "eval() and similar functions are allowed, which can lead to code injection",
                        "recommendation": "Remove 'unsafe-eval' if possible, or use Web Workers",
                    },
                )

    def _check_wildcards(self, directives: dict[str, list[str]]) -> None:
        """Check for wildcard usage"""
        for directive, values in directives.items():
            for value in values:
                if value == self.WILDCARD or value.startswith("*."):
                    self.findings.append(
                        {
                            "severity": "medium",
                            "directive": directive,
                            "issue": f"{directive} uses wildcard: {value}",
                            "description": "Wildcards allow any subdomain, which may be too permissive",
                            "recommendation": "Specify exact domains when possible",
                        },
                    )

    def _check_missing_directives(self, directives: dict[str, list[str]]) -> None:
        """Check for missing important directives"""
        important = {
            "default-src": "Fallback for other directives",
            "script-src": "Controls script execution",
            "object-src": "Controls plugins like Flash",
            "base-uri": "Controls <base> tag URLs",
        }

        for directive, description in important.items():
            if directive not in directives:
                self.findings.append(
                    {
                        "severity": "low",
                        "directive": directive,
                        "issue": f"Missing {directive} directive",
                        "description": description,
                        "recommendation": f"Add {directive} directive",
                    },
                )

    def _check_deprecated_directives(self, directives: dict[str, list[str]]) -> None:
        """Check for deprecated directives"""
        deprecated = {
            "block-all-mixed-content": "Use upgrade-insecure-requests instead",
            "referrer": "Use Referrer-Policy header instead",
        }

        for directive, replacement in deprecated.items():
            if directive in directives:
                self.findings.append(
                    {
                        "severity": "low",
                        "directive": directive,
                        "issue": f"Deprecated directive: {directive}",
                        "description": replacement,
                        "recommendation": f"Remove {directive}",
                    },
                )

    def _check_base_uri(self, directives: dict[str, list[str]]) -> None:
        """Check base-uri configuration"""
        if "base-uri" in directives:
            values = directives["base-uri"]
            if "'self'" not in values and "'none'" not in values:
                self.findings.append(
                    {
                        "severity": "medium",
                        "directive": "base-uri",
                        "issue": "base-uri should be restricted to 'self' or 'none'",
                        "description": "Unrestricted base-uri can lead to base tag injection attacks",
                        "recommendation": "Set base-uri to 'self' or 'none'",
                    },
                )

    def _check_object_src(self, directives: dict[str, list[str]]) -> None:
        """Check object-src configuration"""
        if "object-src" in directives:
            values = directives["object-src"]
            if "'none'" not in values:
                self.findings.append(
                    {
                        "severity": "low",
                        "directive": "object-src",
                        "issue": "object-src should be set to 'none'",
                        "description": "Plugins like Flash are security risks",
                        "recommendation": "Set object-src to 'none'",
                    },
                )

    def _calculate_grade(self) -> str:
        """Calculate overall grade based on findings"""
        high_count = sum(1 for f in self.findings if f["severity"] == "high")
        medium_count = sum(1 for f in self.findings if f["severity"] == "medium")
        low_count = sum(1 for f in self.findings if f["severity"] == "low")
        
        if high_count >= 3:
            return "F"
        elif high_count >= 2:
            return "D"
        elif high_count >= 1:
            return "C"
        elif medium_count >= 3:
            return "C"
        elif medium_count >= 1:
            return "B"
        elif low_count >= 3:
            return "B"
        elif low_count >= 1:
            return "A"
        else:
            return "A+"


def test_csp_headers(url: str) -> dict[str, Any]:
    """Test CSP headers from a URL"""
    try:
        response = requests.get(url, timeout=10)

        # Get CSP header
        csp_header = response.headers.get("Content-Security-Policy", "")

        # Get other security headers
        security_headers = {
            "Content-Security-Policy": csp_header,
            "X-Frame-Options": response.headers.get("X-Frame-Options", ""),
            "X-Content-Type-Options": response.headers.get("X-Content-Type-Options", ""),
            "X-XSS-Protection": response.headers.get("X-XSS-Protection", ""),
            "Strict-Transport-Security": response.headers.get("Strict-Transport-Security", ""),
            "Referrer-Policy": response.headers.get("Referrer-Policy", ""),
            "Permissions-Policy": response.headers.get("Permissions-Policy", ""),
        }

        # Evaluate CSP
        evaluator = CSPEvaluator()
        grade, findings = evaluator.evaluate(csp_header)

        return {
            "url": url,
            "status_code": response.status_code,
            "security_headers": security_headers,
            "csp_grade": grade,
            "csp_findings": findings,
        }

    except Exception as exc:
        return {
            "url": url,
            "error": str(exc),
        }


def print_results(results: dict[str, Any]) -> None:
    """Print test results in a readable format"""
    print("\n" + "=" * 80)
    print(f"CSP Test Results for: {results['url']}")
    print("=" * 80)

    if "error" in results:
        print(f"\n❌ Error: {results['error']}")
        return

    print(f"\nStatus Code: {results['status_code']}")

    # Print security headers
    print("\n📋 Security Headers:")
    print("-" * 80)
    for header, value in results["security_headers"].items():
        status = "✅" if value else "❌"
        print(f"{status} {header}: {value or 'NOT SET'}")

    # Print CSP grade
    print(f"\n🎯 CSP Grade: {results['csp_grade']}")

    # Print findings
    if results["csp_findings"]:
        print(f"\n⚠️  CSP Findings ({len(results['csp_findings'])} issues):")
        print("-" * 80)

        for finding in results["csp_findings"]:
            severity_emoji = {
                "high": "🔴",
                "medium": "🟡",
                "low": "🟢",
            }
            emoji = severity_emoji.get(finding["severity"], "⚪")

            print(f"\n{emoji} {finding['severity'].upper()}: {finding['issue']}")
            print(f"   Directive: {finding['directive']}")
            print(f"   Description: {finding['description']}")
            if "recommendation" in finding:
                print(f"   Recommendation: {finding['recommendation']}")
    else:
        print("\n✅ No CSP issues found!")

    print("\n" + "=" * 80 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Test Content Security Policy configuration")
    parser.add_argument("url", help="URL to test (e.g., http://localhost:8000)")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")

    args = parser.parse_args()

    # Test CSP
    results = test_csp_headers(args.url)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print_results(results)

    # Exit with error code if grade is poor
    if "csp_grade" in results and results["csp_grade"] in ["F", "D"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
