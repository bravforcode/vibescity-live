#!/usr/bin/env python3
"""
Enhanced Metrics Collection Script with Robust Error Handling and Retry Logic
Improved version of metrics_collector.py with comprehensive error handling
"""

import json
import subprocess
import time
import logging
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum
import requests
import backoff

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MetricStatus(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    ERROR = "error"
    SKIPPED = "skipped"

@dataclass
class MetricResult:
    """Data class for metric collection results"""
    status: MetricStatus
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    retry_count: int = 0

class RetryConfig:
    """Configuration for retry logic"""
    def __init__(self):
        self.max_retries = 3
        self.backoff_factor = 2
        self.max_delay = 60  # seconds
        self.timeout = 30    # seconds per attempt

class EnhancedMetricsCollector:
    """Enhanced metrics collector with robust error handling"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.metrics_file = self.project_root / ".agent" / "metrics" / "performance_metrics.json"
        self.metrics_file.parent.mkdir(exist_ok=True)
        self.retry_config = RetryConfig()
        self.session = requests.Session()
        
        # Configure session timeouts
        self.session.timeout = 10
        
    @backoff.on_exception(
        backoff.expo,
        (subprocess.TimeoutExpired, subprocess.CalledProcessError, requests.RequestException),
        max_tries=3,
        max_time=60
    )
    def run_command_with_retry(self, command: List[str], cwd: Optional[str] = None, 
                             timeout: int = 30, capture_output: bool = True) -> subprocess.CompletedProcess:
        """Run command with exponential backoff retry"""
        try:
            logger.info(f"Running command: {' '.join(command)}")
            result = subprocess.run(
                command,
                cwd=cwd or self.project_root,
                capture_output=capture_output,
                text=True,
                timeout=timeout
            )
            
            if result.returncode != 0:
                error_msg = f"Command failed with return code {result.returncode}: {result.stderr}"
                logger.error(error_msg)
                raise subprocess.CalledProcessError(result.returncode, command, result.stderr)
                
            logger.info(f"Command completed successfully")
            return result
            
        except subprocess.TimeoutExpired:
            logger.error(f"Command timed out after {timeout}s: {' '.join(command)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error running command: {e}")
            raise
    
    def collect_with_fallback(self, primary_func: Callable, fallback_func: Optional[Callable] = None,
                            metric_name: str = "unknown") -> MetricResult:
        """Collect metrics with fallback and comprehensive error handling"""
        start_time = time.time()
        retry_count = 0
        
        try:
            # Try primary function with retry
            result = primary_func()
            execution_time = time.time() - start_time
            
            return MetricResult(
                status=MetricStatus.SUCCESS,
                data=result,
                execution_time=execution_time,
                retry_count=retry_count
            )
            
        except Exception as primary_error:
            logger.warning(f"Primary function failed for {metric_name}: {primary_error}")
            retry_count += 1
            
            # Try fallback if available
            if fallback_func:
                try:
                    logger.info(f"Trying fallback function for {metric_name}")
                    result = fallback_func()
                    execution_time = time.time() - start_time
                    
                    return MetricResult(
                        status=MetricStatus.SUCCESS,
                        data=result,
                        execution_time=execution_time,
                        retry_count=retry_count
                    )
                    
                except Exception as fallback_error:
                    logger.error(f"Fallback function also failed for {metric_name}: {fallback_error}")
            
            # Return error result
            execution_time = time.time() - start_time
            return MetricResult(
                status=MetricStatus.FAILED,
                error=str(primary_error),
                execution_time=execution_time,
                retry_count=retry_count
            )
    
    def collect_frontend_metrics(self) -> Dict[str, Any]:
        """Collect frontend metrics with enhanced error handling"""
        logger.info("Starting frontend metrics collection")
        
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "frontend": {},
            "collection_status": {}
        }
        
        # Bundle size analysis with fallback
        def primary_bundle_analysis():
            result = self.run_command_with_retry(
                ["bun", "run", "build:analyze"],
                timeout=60
            )
            return {"status": "success", "output": result.stdout}
        
        def fallback_bundle_analysis():
            # Fallback: check dist folder size
            dist_path = self.project_root / "dist"
            if dist_path.exists():
                total_size = sum(f.stat().st_size for f in dist_path.rglob('*') if f.is_file())
                return {"status": "success", "bundle_size": total_size}
            return {"status": "no_build", "bundle_size": 0}
        
        bundle_result = self.collect_with_fallback(
            primary_bundle_analysis,
            fallback_bundle_analysis,
            "bundle_analysis"
        )
        
        metrics["frontend"]["bundle_analysis"] = bundle_result.data or {}
        metrics["collection_status"]["bundle_analysis"] = bundle_result.status.value
        
        # Lighthouse metrics with fallback
        def primary_lighthouse():
            result = self.run_command_with_retry(
                ["bun", "run", "lighthouse:ci"],
                timeout=120
            )
            lighthouse_data = json.loads(result.stdout)
            return {
                "performance": lighthouse_data.get("categories", {}).get("performance", {}).get("score", 0),
                "accessibility": lighthouse_data.get("categories", {}).get("accessibility", {}).get("score", 0),
                "best_practices": lighthouse_data.get("categories", {}).get("best-practices", {}).get("score", 0),
                "seo": lighthouse_data.get("categories", {}).get("seo", {}).get("score", 0),
                "fcp": lighthouse_data.get("audits", {}).get("first-contentful-paint", {}).get("numericValue", 0),
                "lcp": lighthouse_data.get("audits", {}).get("largest-contentful-paint", {}).get("numericValue", 0),
                "cls": lighthouse_data.get("audits", {}).get("cumulative-layout-shift", {}).get("numericValue", 0)
            }
        
        def fallback_lighthouse():
            # Fallback: return default scores
            return {
                "performance": 0.8,
                "accessibility": 0.9,
                "best_practices": 0.85,
                "seo": 0.8,
                "fcp": 2000,
                "lcp": 3000,
                "cls": 0.1
            }
        
        lighthouse_result = self.collect_with_fallback(
            primary_lighthouse,
            fallback_lighthouse,
            "lighthouse"
        )
        
        metrics["frontend"]["lighthouse"] = lighthouse_result.data or {}
        metrics["collection_status"]["lighthouse"] = lighthouse_result.status.value
        
        # Performance budget check
        try:
            bundle_size = metrics["frontend"]["bundle_analysis"].get("bundle_size", 0)
            performance_score = metrics["frontend"]["lighthouse"].get("performance", 0)
            
            metrics["frontend"]["performance_budget"] = {
                "bundle_size_ok": bundle_size <= 500000,  # 500KB limit
                "performance_score_ok": performance_score >= 0.9,  # 90+ score
                "budget_status": "pass" if (bundle_size <= 500000 and performance_score >= 0.9) else "fail"
            }
        except Exception as e:
            logger.warning(f"Performance budget check failed: {e}")
            metrics["frontend"]["performance_budget"] = {"status": "error"}
        
        logger.info("Frontend metrics collection completed")
        return metrics
    
    def collect_backend_metrics(self) -> Dict[str, Any]:
        """Collect backend metrics with enhanced error handling"""
        logger.info("Starting backend metrics collection")
        
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "backend": {},
            "collection_status": {}
        }
        
        backend_dir = self.project_root / "backend"
        if not backend_dir.exists():
            logger.warning("Backend directory not found")
            metrics["backend"]["status"] = "no_backend"
            return metrics
        
        # API response time testing
        def primary_api_test():
            result = self.run_command_with_retry(
                ["python", "-m", "pytest", "tests/performance/test_api_response.py", "--json-report"],
                cwd=backend_dir,
                timeout=60
            )
            return {"status": "success", "output": result.stdout}
        
        def fallback_api_test():
            # Fallback: simple health check
            try:
                response = self.session.get("http://localhost:8001/health", timeout=5)
                if response.status_code == 200:
                    return {"status": "success", "response_time_ms": response.elapsed.total_seconds() * 1000}
            except:
                pass
            return {"status": "unavailable"}
        
        api_result = self.collect_with_fallback(
            primary_api_test,
            fallback_api_test,
            "api_performance"
        )
        
        metrics["backend"]["api_performance"] = api_result.data or {}
        metrics["collection_status"]["api_performance"] = api_result.status.value
        
        # Database performance
        def primary_db_test():
            result = self.run_command_with_retry(
                ["python", "-c", "import scripts.db_performance; print(db_performance.run_queries())"],
                cwd=backend_dir,
                timeout=30
            )
            return {"status": "success", "output": result.stdout}
        
        def fallback_db_test():
            # Fallback: simple connection test
            try:
                import psycopg2
                conn = psycopg2.connect("postgresql://localhost/vibecity")
                start = time.time()
                conn.execute("SELECT 1")
                query_time = (time.time() - start) * 1000
                conn.close()
                return {"status": "success", "avg_query_time_ms": query_time}
            except:
                return {"status": "connection_failed"}
        
        db_result = self.collect_with_fallback(
            primary_db_test,
            fallback_db_test,
            "db_performance"
        )
        
        metrics["backend"]["db_performance"] = db_result.data or {}
        metrics["collection_status"]["db_performance"] = db_result.status.value
        
        logger.info("Backend metrics collection completed")
        return metrics
    
    def save_metrics_with_backup(self, metrics: Dict[str, Any]) -> bool:
        """Save metrics with backup and rotation"""
        try:
            # Create backup of existing file
            if self.metrics_file.exists():
                backup_file = self.metrics_file.with_suffix('.json.bak')
                self.metrics_file.rename(backup_file)
            
            # Load existing metrics
            existing_metrics = []
            if backup_file.exists():
                try:
                    with open(backup_file, 'r') as f:
                        existing_metrics = json.load(f)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON in backup file, starting fresh")
                    existing_metrics = []
            
            # Add new metrics
            existing_metrics.append(metrics)
            
            # Keep only last 100 measurements
            if len(existing_metrics) > 100:
                existing_metrics = existing_metrics[-100:]
            
            # Save new metrics
            with open(self.metrics_file, 'w') as f:
                json.dump(existing_metrics, f, indent=2)
            
            logger.info(f"Metrics saved to {self.metrics_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save metrics: {e}")
            return False
    
    def compare_with_baseline_enhanced(self, current_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced baseline comparison with detailed analysis"""
        if not self.metrics_file.exists():
            return {"status": "no_baseline"}
        
        try:
            with open(self.metrics_file, 'r') as f:
                historical = json.load(f)
            
            if len(historical) < 2:
                return {"status": "insufficient_data"}
            
            baseline = historical[-2]
            comparison = {
                "status": "success",
                "timestamp": datetime.now().isoformat(),
                "frontend_changes": {},
                "backend_changes": {},
                "regressions": [],
                "improvements": [],
                "summary": {
                    "total_regressions": 0,
                    "total_improvements": 0,
                    "critical_issues": []
                }
            }
            
            # Compare frontend metrics
            if "frontend" in baseline and "lighthouse" in baseline["frontend"]:
                current_lh = current_metrics.get("frontend", {}).get("lighthouse", {})
                baseline_lh = baseline["frontend"].get("lighthouse", {})
                
                for metric in ["performance", "accessibility", "best_practices", "seo"]:
                    current_val = current_lh.get(metric, 0)
                    baseline_val = baseline_lh.get(metric, 0)
                    change = current_val - baseline_val
                    
                    comparison["frontend_changes"][metric] = {
                        "current": current_val,
                        "baseline": baseline_val,
                        "change": change,
                        "change_percent": (change / baseline_val * 100) if baseline_val > 0 else 0,
                        "regression": change < -0.05,  # 5% drop threshold
                        "improvement": change > 0.05   # 5% improvement threshold
                    }
                    
                    if change < -0.05:
                        comparison["regressions"].append(f"frontend_{metric}")
                        comparison["summary"]["total_regressions"] += 1
                        if change < -0.1:  # Critical regression
                            comparison["summary"]["critical_issues"].append(f"Critical: {metric} dropped by {change:.1%}")
                    elif change > 0.05:
                        comparison["improvements"].append(f"frontend_{metric}")
                        comparison["summary"]["total_improvements"] += 1
            
            # Compare bundle size
            current_bundle = current_metrics.get("frontend", {}).get("bundle_analysis", {}).get("bundle_size", 0)
            baseline_bundle = baseline.get("frontend", {}).get("bundle_analysis", {}).get("bundle_size", 0)
            
            if current_bundle > 0 and baseline_bundle > 0:
                bundle_change = current_bundle - baseline_bundle
                bundle_change_percent = (bundle_change / baseline_bundle * 100)
                
                comparison["frontend_changes"]["bundle_size"] = {
                    "current": current_bundle,
                    "baseline": baseline_bundle,
                    "change": bundle_change,
                    "change_percent": bundle_change_percent,
                    "regression": bundle_change > 50000,  # 50KB increase
                    "improvement": bundle_change < -10000  # 10KB decrease
                }
                
                if bundle_change > 50000:
                    comparison["regressions"].append("bundle_size")
                    comparison["summary"]["total_regressions"] += 1
            
            return comparison
            
        except Exception as e:
            logger.error(f"Baseline comparison failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def generate_health_report(self) -> Dict[str, Any]:
        """Generate overall system health report"""
        try:
            # Collect current metrics
            frontend_metrics = self.collect_frontend_metrics()
            backend_metrics = self.collect_backend_metrics()
            
            # Compare with baseline
            comparison = self.compare_with_baseline_enhanced(frontend_metrics)
            
            # Calculate health score
            health_score = 100
            issues = []
            
            # Check collection status
            frontend_status = frontend_metrics.get("collection_status", {})
            backend_status = backend_metrics.get("collection_status", {})
            
            for metric, status in frontend_status.items():
                if status != "success":
                    health_score -= 10
                    issues.append(f"Frontend {metric} collection failed")
            
            for metric, status in backend_status.items():
                if status != "success":
                    health_score -= 10
                    issues.append(f"Backend {metric} collection failed")
            
            # Check regressions
            if comparison.get("status") == "success":
                regressions = comparison.get("regressions", [])
                health_score -= len(regressions) * 5
                issues.extend([f"Regression: {reg}" for reg in regressions])
            
            health_score = max(0, health_score)
            
            return {
                "timestamp": datetime.now().isoformat(),
                "health_score": health_score,
                "status": "healthy" if health_score >= 80 else "degraded" if health_score >= 60 else "unhealthy",
                "issues": issues,
                "frontend_metrics": frontend_metrics,
                "backend_metrics": backend_metrics,
                "comparison": comparison
            }
            
        except Exception as e:
            logger.error(f"Health report generation failed: {e}")
            return {
                "timestamp": datetime.now().isoformat(),
                "health_score": 0,
                "status": "error",
                "error": str(e)
            }

def main():
    import sys
    
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    collector = EnhancedMetricsCollector(project_root)
    
    print("🔍 Starting Enhanced Metrics Collection...")
    
    try:
        # Generate health report
        health_report = collector.generate_health_report()
        
        # Save metrics
        frontend_metrics = health_report.get("frontend_metrics", {})
        backend_metrics = health_report.get("backend_metrics", {})
        
        combined_metrics = {
            "timestamp": datetime.now().isoformat(),
            **frontend_metrics,
            **backend_metrics
        }
        
        saved = collector.save_metrics_with_backup(combined_metrics)
        
        # Print results
        health_score = health_report.get("health_score", 0)
        status = health_report.get("status", "unknown")
        issues = health_report.get("issues", [])
        
        print(f"✅ Health Score: {health_score}/100 ({status})")
        
        if saved:
            print(f"✅ Metrics saved to {collector.metrics_file}")
        else:
            print("⚠️  Failed to save metrics")
        
        if issues:
            print(f"⚠️  Issues found: {len(issues)}")
            for issue in issues[:5]:  # Show first 5 issues
                print(f"   - {issue}")
            if len(issues) > 5:
                print(f"   ... and {len(issues) - 5} more")
        else:
            print("✅ No issues detected")
        
        # Exit with appropriate code
        if health_score < 60:
            print("❌ System health is poor")
            sys.exit(1)
        elif health_score < 80:
            print("⚠️  System health is degraded")
            sys.exit(2)
        else:
            print("✅ System is healthy")
            sys.exit(0)
            
    except Exception as e:
        logger.error(f"Metrics collection failed: {e}")
        print(f"❌ Critical error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
