#!/usr/bin/env python3
"""
Automated Metrics Collection Script for VibeCity
Tracks frontend/backend performance metrics before/after changes
"""

import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any

class MetricsCollector:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.metrics_file = self.project_root / ".agent" / "metrics" / "performance_metrics.json"
        self.metrics_file.parent.mkdir(exist_ok=True)

    def collect_frontend_metrics(self) -> Dict[str, Any]:
        """Collect frontend performance metrics"""
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "frontend": {}
        }

        # Bundle size analysis
        try:
            result = subprocess.run(
                ["bun", "run", "build:analyze"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=60
            )
            metrics["frontend"]["bundle_analysis"] = {
                "status": "success" if result.returncode == 0 else "failed",
                "output": result.stdout
            }
        except subprocess.TimeoutExpired:
            metrics["frontend"]["bundle_analysis"] = {"status": "timeout"}
        except Exception as e:
            metrics["frontend"]["bundle_analysis"] = {"status": "error", "error": str(e)}

        # Lighthouse metrics
        try:
            result = subprocess.run(
                ["bun", "run", "lighthouse:ci"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                # Parse Lighthouse JSON output
                lighthouse_data = json.loads(result.stdout)
                metrics["frontend"]["lighthouse"] = {
                    "performance": lighthouse_data.get("categories", {}).get("performance", {}).get("score", 0),
                    "accessibility": lighthouse_data.get("categories", {}).get("accessibility", {}).get("score", 0),
                    "best_practices": lighthouse_data.get("categories", {}).get("best-practices", {}).get("score", 0),
                    "seo": lighthouse_data.get("categories", {}).get("seo", {}).get("score", 0),
                    "fcp": lighthouse_data.get("audits", {}).get("first-contentful-paint", {}).get("numericValue", 0),
                    "lcp": lighthouse_data.get("audits", {}).get("largest-contentful-paint", {}).get("numericValue", 0),
                    "cls": lighthouse_data.get("audits", {}).get("cumulative-layout-shift", {}).get("numericValue", 0)
                }
        except Exception as e:
            metrics["frontend"]["lighthouse"] = {"status": "error", "error": str(e)}

        return metrics

    def collect_backend_metrics(self) -> Dict[str, Any]:
        """Collect backend performance metrics"""
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "backend": {}
        }

        backend_dir = self.project_root / "backend"
        if not backend_dir.exists():
            metrics["backend"]["status"] = "no_backend"
            return metrics

        # API response time tests
        try:
            result = subprocess.run(
                ["python", "-m", "pytest", "tests/performance/test_api_response.py", "--json-report"],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=60
            )
            metrics["backend"]["api_performance"] = {
                "status": "success" if result.returncode == 0 else "failed",
                "output": result.stdout
            }
        except Exception as e:
            metrics["backend"]["api_performance"] = {"status": "error", "error": str(e)}

        # Database query performance
        try:
            result = subprocess.run(
                ["python", "-c", "import scripts.db_performance; print(db_performance.run_queries())"],
                cwd=backend_dir,
                capture_output=True,
                text=True,
                timeout=30
            )
            metrics["backend"]["db_performance"] = {
                "status": "success" if result.returncode == 0 else "failed",
                "output": result.stdout
            }
        except Exception as e:
            metrics["backend"]["db_performance"] = {"status": "error", "error": str(e)}

        return metrics

    def save_metrics(self, metrics: Dict[str, Any]) -> None:
        """Save metrics to JSON file"""
        existing_metrics = []
        if self.metrics_file.exists():
            try:
                with open(self.metrics_file, 'r') as f:
                    existing_metrics = json.load(f)
            except:
                existing_metrics = []

        existing_metrics.append(metrics)

        # Keep only last 100 measurements
        if len(existing_metrics) > 100:
            existing_metrics = existing_metrics[-100:]

        with open(self.metrics_file, 'w') as f:
            json.dump(existing_metrics, f, indent=2)

    def compare_with_baseline(self, current_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """Compare current metrics with baseline (previous measurement)"""
        if not self.metrics_file.exists():
            return {"status": "no_baseline"}

        try:
            with open(self.metrics_file, 'r') as f:
                historical = json.load(f)

            if len(historical) < 2:
                return {"status": "insufficient_data"}

            baseline = historical[-2]  # Previous measurement
            comparison = {
                "status": "success",
                "frontend_changes": {},
                "backend_changes": {},
                "regressions": []
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
                        "regression": change < -0.05  # 5% drop threshold
                    }

                    if change < -0.05:
                        comparison["regressions"].append(f"frontend_{metric}")

            return comparison

        except Exception as e:
            return {"status": "error", "error": str(e)}

def main():
    import sys

    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    collector = MetricsCollector(project_root)

    print("🔍 Collecting performance metrics...")

    # Collect metrics
    frontend_metrics = collector.collect_frontend_metrics()
    backend_metrics = collector.collect_backend_metrics()

    combined_metrics = {
        "timestamp": datetime.now().isoformat(),
        **frontend_metrics,
        **backend_metrics
    }

    # Save metrics
    collector.save_metrics(combined_metrics)

    # Compare with baseline
    comparison = collector.compare_with_baseline(combined_metrics)

    print(f"✅ Metrics collected and saved to {collector.metrics_file}")

    if comparison.get("status") == "success":
        regressions = comparison.get("regressions", [])
        if regressions:
            print(f"⚠️  Performance regressions detected: {', '.join(regressions)}")
            sys.exit(1)
        else:
            print("✅ No performance regressions detected")
    else:
        print(f"ℹ️  Baseline comparison: {comparison.get('status')}")

if __name__ == "__main__":
    main()
