#!/usr/bin/env python3
"""
Security Validation Script for VibeCity
Integrates comprehensive security scanning into validation pipeline
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Any
import re

class SecurityValidator:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.security_report = self.project_root / ".agent" / "reports" / "security_report.json"
        self.security_report.parent.mkdir(exist_ok=True)
        
    def run_frontend_security_audit(self) -> Dict[str, Any]:
        """Run frontend security audit"""
        results = {
            "component": "frontend",
            "timestamp": "2024-01-01T00:00:00Z",
            "checks": {}
        }
        
        # Dependency vulnerability scan
        try:
            result = subprocess.run(
                ["bun", "audit"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            vulnerabilities = []
            if result.returncode != 0:
                # Parse bun audit output for vulnerabilities
                lines = result.stdout.split('\n')
                for line in lines:
                    if 'high' in line.lower() or 'critical' in line.lower():
                        vulnerabilities.append({
                            "severity": "high" if "high" in line.lower() else "critical",
                            "description": line.strip()
                        })
            
            results["checks"]["dependency_audit"] = {
                "status": "pass" if len(vulnerabilities) == 0 else "fail",
                "vulnerabilities": vulnerabilities,
                "total_vulnerabilities": len(vulnerabilities)
            }
        except Exception as e:
            results["checks"]["dependency_audit"] = {
                "status": "error",
                "error": str(e)
            }
        
        # Code security patterns scan
        security_patterns = {
            "hardcoded_secrets": [
                r"password\s*=\s*['\"][^'\"]+['\"]",
                r"api_key\s*=\s*['\"][^'\"]+['\"]",
                r"secret\s*=\s*['\"][^'\"]+['\"]",
                r"token\s*=\s*['\"][^'\"]+['\"]"
            ],
            "insecure_http": [
                r"http://",
                r"fetch\s*\(\s*['\"]http://"
            ],
            "eval_usage": [
                r"eval\s*\(",
                r"new\s+Function\s*\("
            ],
            "innerHTML_usage": [
                r"innerHTML\s*=",
                r"outerHTML\s*="
            ]
        }
        
        security_issues = []
        src_files = []
        src_dir = self.project_root / "src"
        if src_dir.exists():
            for ext in ['js', 'vue', 'ts']:
                src_files.extend(src_dir.rglob(f"*.{ext}"))
        
        for file_path in src_files:
            try:
                content = file_path.read_text(encoding='utf-8')
                for pattern_name, patterns in security_patterns.items():
                    for pattern in patterns:
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        if matches:
                            security_issues.append({
                                "type": pattern_name,
                                "file": str(file_path.relative_to(self.project_root)),
                                "matches": len(matches),
                                "severity": self.get_severity_for_pattern(pattern_name)
                            })
            except:
                continue
        
        results["checks"]["code_patterns"] = {
            "status": "pass" if len(security_issues) == 0 else "fail",
            "issues": security_issues,
            "total_issues": len(security_issues)
        }
        
        return results
    
    def run_backend_security_audit(self) -> Dict[str, Any]:
        """Run backend security audit"""
        backend_dir = self.project_root / "backend"
        results = {
            "component": "backend",
            "timestamp": "2024-01-01T00:00:00Z",
            "checks": {}
        }
        
        if not backend_dir.exists():
            results["checks"]["status"] = "no_backend"
            return results
        
        # Bandit security scan
        try:
            result = subprocess.run(
                ["bandit", "-r", ".", "-f", "json"],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                bandit_report = json.loads(result.stdout)
                high_issues = [issue for issue in bandit_report.get("results", []) if issue.get("issue_severity") == "HIGH"]
                medium_issues = [issue for issue in bandit_report.get("results", []) if issue.get("issue_severity") == "MEDIUM"]
                
                results["checks"]["bandit_scan"] = {
                    "status": "pass" if len(high_issues) == 0 else "fail",
                    "high_issues": high_issues,
                    "medium_issues": medium_issues,
                    "total_high": len(high_issues),
                    "total_medium": len(medium_issues)
                }
        except Exception as e:
            results["checks"]["bandit_scan"] = {
                "status": "error",
                "error": str(e)
            }
        
        # Safety dependency check
        try:
            result = subprocess.run(
                ["safety", "check", "--json"],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                safety_report = json.loads(result.stdout)
                vulnerabilities = safety_report.get("vulnerabilities", [])
                
                results["checks"]["dependency_safety"] = {
                    "status": "pass" if len(vulnerabilities) == 0 else "fail",
                    "vulnerabilities": vulnerabilities,
                    "total_vulnerabilities": len(vulnerabilities)
                }
        except Exception as e:
            results["checks"]["dependency_safety"] = {
                "status": "error",
                "error": str(e)
            }
        
        # SQL injection patterns
        sql_patterns = [
            r"execute\s*\(\s*['\"]\s*\+.*\+",
            r"execute\s*\(\s*f['\"]",
            r"cursor\.execute\s*\(\s*['\"]\s*\%.*\%",
            r"query\s*\(\s*['\"]\s*\+.*\+"
        ]
        
        sql_issues = []
        py_files = list(backend_dir.glob("**/*.py"))
        
        for file_path in py_files:
            try:
                content = file_path.read_text(encoding='utf-8')
                for pattern in sql_patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    if matches:
                        sql_issues.append({
                            "type": "sql_injection_risk",
                            "file": str(file_path.relative_to(backend_dir)),
                            "matches": len(matches),
                            "severity": "high"
                        })
            except:
                continue
        
        results["checks"]["sql_injection_check"] = {
            "status": "pass" if len(sql_issues) == 0 else "fail",
            "issues": sql_issues,
            "total_issues": len(sql_issues)
        }
        
        return results
    
    def get_severity_for_pattern(self, pattern_name: str) -> str:
        """Get severity level for security pattern"""
        severity_map = {
            "hardcoded_secrets": "critical",
            "insecure_http": "medium",
            "eval_usage": "high",
            "innerHTML_usage": "medium"
        }
        return severity_map.get(pattern_name, "medium")
    
    def generate_security_report(self) -> Dict[str, Any]:
        """Generate comprehensive security report"""
        frontend_results = self.run_frontend_security_audit()
        backend_results = self.run_backend_security_audit()
        
        report = {
            "timestamp": "2024-01-01T00:00:00Z",
            "overall_status": "pass",
            "components": [frontend_results, backend_results],
            "summary": {
                "total_issues": 0,
                "critical_issues": 0,
                "high_issues": 0,
                "medium_issues": 0,
                "failed_checks": []
            }
        }
        
        # Calculate summary
        for component in report["components"]:
            for check_name, check_result in component.get("checks", {}).items():
                if check_result.get("status") == "fail":
                    report["summary"]["failed_checks"].append(f"{component['component']}:{check_name}")
                    report["overall_status"] = "fail"
                
                # Count issues by severity
                if "vulnerabilities" in check_result:
                    for vuln in check_result["vulnerabilities"]:
                        severity = vuln.get("severity", "medium").lower()
                        report["summary"]["total_issues"] += 1
                        if severity == "critical":
                            report["summary"]["critical_issues"] += 1
                        elif severity == "high":
                            report["summary"]["high_issues"] += 1
                        elif severity == "medium":
                            report["summary"]["medium_issues"] += 1
                
                if "issues" in check_result:
                    for issue in check_result["issues"]:
                        severity = issue.get("severity", "medium").lower()
                        report["summary"]["total_issues"] += 1
                        if severity == "critical":
                            report["summary"]["critical_issues"] += 1
                        elif severity == "high":
                            report["summary"]["high_issues"] += 1
                        elif severity == "medium":
                            report["summary"]["medium_issues"] += 1
        
        # Save report
        with open(self.security_report, 'w') as f:
            json.dump(report, f, indent=2)
        
        return report
    
    def validate_security_thresholds(self, report: Dict[str, Any]) -> bool:
        """Validate security thresholds"""
        summary = report.get("summary", {})
        
        # Fail if any critical issues
        if summary.get("critical_issues", 0) > 0:
            print(f"❌ {summary['critical_issues']} critical security issues found")
            return False
        
        # Fail if more than 5 high issues
        if summary.get("high_issues", 0) > 5:
            print(f"❌ {summary['high_issues']} high security issues found (threshold: 5)")
            return False
        
        # Fail if more than 20 medium issues
        if summary.get("medium_issues", 0) > 20:
            print(f"❌ {summary['medium_issues']} medium security issues found (threshold: 20)")
            return False
        
        print(f"✅ Security validation passed - {summary['total_issues']} total issues")
        return True

def main():
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    validator = SecurityValidator(project_root)
    
    print("🔒 Running security validation...")
    
    # Generate comprehensive security report
    report = validator.generate_security_report()
    
    # Validate against thresholds
    passed = validator.validate_security_thresholds(report)
    
    # Print summary
    summary = report.get("summary", {})
    print(f"\n📊 Security Summary:")
    print(f"   Critical: {summary.get('critical_issues', 0)}")
    print(f"   High: {summary.get('high_issues', 0)}")
    print(f"   Medium: {summary.get('medium_issues', 0)}")
    print(f"   Total: {summary.get('total_issues', 0)}")
    
    if summary.get("failed_checks"):
        print(f"\n⚠️  Failed checks: {', '.join(summary['failed_checks'])}")
    
    sys.exit(0 if passed else 1)

if __name__ == "__main__":
    main()
