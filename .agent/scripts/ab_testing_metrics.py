#!/usr/bin/env python3
"""
A/B Testing Support for Metrics Collection
Enables comparison of performance metrics between different versions/configurations
"""

import json
import sqlite3
import statistics
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import numpy as np
from scipy import stats

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TestStatus(Enum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"

class TestType(Enum):
    PERFORMANCE = "performance"
    USER_EXPERIENCE = "user_experience"
    BUSINESS_METRICS = "business_metrics"
    SYSTEM_STABILITY = "system_stability"

@dataclass
class ABTestConfig:
    """Configuration for A/B test"""
    test_id: str
    name: str
    description: str
    test_type: TestType
    variant_a_name: str
    variant_b_name: str
    traffic_split: float = 0.5  # 50/50 split by default
    sample_size: int = 1000
    confidence_level: float = 0.95
    minimum_detectable_effect: float = 0.05  # 5% minimum effect
    duration_days: int = 7
    success_metrics: List[str] = None
    
    def __post_init__(self):
        if self.success_metrics is None:
            self.success_metrics = ["performance_score", "error_rate", "user_satisfaction"]

@dataclass
class TestVariant:
    """A/B test variant data"""
    variant_id: str
    test_id: str
    variant_name: str
    is_control: bool
    sample_size: int
    metrics: Dict[str, List[float]]
    start_time: datetime
    end_time: Optional[datetime] = None

@dataclass
class TestResult:
    """A/B test result analysis"""
    test_id: str
    variant_a_results: Dict[str, Any]
    variant_b_results: Dict[str, Any]
    statistical_significance: Dict[str, bool]
    confidence_intervals: Dict[str, Tuple[float, float]]
    effect_sizes: Dict[str, float]
    recommendation: str
    completed_at: datetime

class ABTestingMetrics:
    """A/B testing system for metrics collection"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.db_path = self.project_root / ".agent" / "ab_testing" / "ab_tests.db"
        self.db_path.parent.mkdir(exist_ok=True)
        
        self.init_database()
        
        # Default metrics to track
        self.default_metrics = [
            "response_time",
            "throughput",
            "error_rate",
            "user_satisfaction",
            "conversion_rate",
            "bounce_rate",
            "page_load_time",
            "api_success_rate"
        ]
    
    def init_database(self) -> None:
        """Initialize A/B testing database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Tests table
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS ab_tests (
                        test_id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        test_type TEXT NOT NULL,
                        variant_a_name TEXT NOT NULL,
                        variant_b_name TEXT NOT NULL,
                        traffic_split REAL NOT NULL,
                        sample_size INTEGER NOT NULL,
                        confidence_level REAL NOT NULL,
                        minimum_detectable_effect REAL NOT NULL,
                        duration_days INTEGER NOT NULL,
                        success_metrics TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        started_at TEXT,
                        completed_at TEXT,
                        results TEXT
                    )
                ''')
                
                # Variants table
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS test_variants (
                        variant_id TEXT PRIMARY KEY,
                        test_id TEXT NOT NULL,
                        variant_name TEXT NOT NULL,
                        is_control BOOLEAN NOT NULL,
                        sample_size INTEGER NOT NULL,
                        metrics TEXT NOT NULL,
                        start_time TEXT NOT NULL,
                        end_time TEXT,
                        FOREIGN KEY (test_id) REFERENCES ab_tests (test_id)
                    )
                ''')
                
                # Metrics table
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS variant_metrics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        variant_id TEXT NOT NULL,
                        metric_name TEXT NOT NULL,
                        value REAL NOT NULL,
                        timestamp TEXT NOT NULL,
                        FOREIGN KEY (variant_id) REFERENCES test_variants (variant_id)
                    )
                ''')
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize A/B testing database: {e}")
            raise
    
    def create_test(self, config: ABTestConfig) -> bool:
        """Create new A/B test"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Insert test
                conn.execute('''
                    INSERT INTO ab_tests 
                    (test_id, name, description, test_type, variant_a_name, variant_b_name,
                     traffic_split, sample_size, confidence_level, minimum_detectable_effect,
                     duration_days, success_metrics, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    config.test_id,
                    config.name,
                    config.description,
                    config.test_type.value,
                    config.variant_a_name,
                    config.variant_b_name,
                    config.traffic_split,
                    config.sample_size,
                    config.confidence_level,
                    config.minimum_detectable_effect,
                    config.duration_days,
                    json.dumps(config.success_metrics),
                    TestStatus.PLANNED.value,
                    datetime.now().isoformat()
                ))
                
                # Create variants
                variant_a_id = f"{config.test_id}_A"
                variant_b_id = f"{config.test_id}_B"
                
                for variant_id, variant_name, is_control in [
                    (variant_a_id, config.variant_a_name, True),
                    (variant_b_id, config.variant_b_name, False)
                ]:
                    conn.execute('''
                        INSERT INTO test_variants
                        (variant_id, test_id, variant_name, is_control, sample_size, metrics, start_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        variant_id,
                        config.test_id,
                        variant_name,
                        is_control,
                        0,  # Will be updated as data comes in
                        json.dumps({}),
                        datetime.now().isoformat()
                    ))
                
                conn.commit()
                logger.info(f"Created A/B test: {config.test_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to create A/B test: {e}")
            return False
    
    def start_test(self, test_id: str) -> bool:
        """Start A/B test"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Update test status
                conn.execute('''
                    UPDATE ab_tests 
                    SET status = ?, started_at = ?
                    WHERE test_id = ?
                ''', (TestStatus.RUNNING.value, datetime.now().isoformat(), test_id))
                
                conn.commit()
                logger.info(f"Started A/B test: {test_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to start A/B test: {e}")
            return False
    
    def record_metric(self, test_id: str, variant_name: str, metric_name: str, value: float) -> bool:
        """Record metric value for a variant"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get variant ID
                cursor = conn.execute('''
                    SELECT variant_id FROM test_variants 
                    WHERE test_id = ? AND variant_name = ?
                ''', (test_id, variant_name))
                
                variant_result = cursor.fetchone()
                if not variant_result:
                    logger.error(f"Variant not found: {test_id} - {variant_name}")
                    return False
                
                variant_id = variant_result[0]
                
                # Insert metric
                conn.execute('''
                    INSERT INTO variant_metrics
                    (variant_id, metric_name, value, timestamp)
                    VALUES (?, ?, ?, ?)
                ''', (variant_id, metric_name, value, datetime.now().isoformat()))
                
                # Update variant metrics summary
                self.update_variant_metrics(variant_id)
                
                conn.commit()
                return True
                
        except Exception as e:
            logger.error(f"Failed to record metric: {e}")
            return False
    
    def update_variant_metrics(self, variant_id: str) -> None:
        """Update variant metrics summary"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get all metrics for variant
                cursor = conn.execute('''
                    SELECT metric_name, value FROM variant_metrics 
                    WHERE variant_id = ?
                ''', (variant_id,))
                
                metrics_data = cursor.fetchall()
                
                # Calculate summary statistics
                metrics_summary = {}
                for metric_name, values in self.group_metrics_by_name(metrics_data):
                    if values:
                        metrics_summary[metric_name] = {
                            "mean": statistics.mean(values),
                            "median": statistics.median(values),
                            "std": statistics.stdev(values) if len(values) > 1 else 0,
                            "min": min(values),
                            "max": max(values),
                            "count": len(values)
                        }
                
                # Update variant
                conn.execute('''
                    UPDATE test_variants
                    SET metrics = ?, sample_size = ?
                    WHERE variant_id = ?
                ''', (json.dumps(metrics_summary), len(metrics_data), variant_id))
                
        except Exception as e:
            logger.error(f"Failed to update variant metrics: {e}")
    
    def group_metrics_by_name(self, metrics_data: List[Tuple[str, float]]) -> Dict[str, List[float]]:
        """Group metrics by name"""
        grouped = {}
        for metric_name, value in metrics_data:
            if metric_name not in grouped:
                grouped[metric_name] = []
            grouped[metric_name].append(value)
        return grouped
    
    def analyze_test_results(self, test_id: str) -> Optional[TestResult]:
        """Analyze A/B test results"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get test info
                cursor = conn.execute('''
                    SELECT success_metrics, confidence_level FROM ab_tests 
                    WHERE test_id = ?
                ''', (test_id,))
                
                test_info = cursor.fetchone()
                if not test_info:
                    logger.error(f"Test not found: {test_id}")
                    return None
                
                success_metrics, confidence_level = test_info
                success_metrics = json.loads(success_metrics)
                
                # Get variant data
                cursor = conn.execute('''
                    SELECT variant_id, variant_name, is_control, metrics FROM test_variants 
                    WHERE test_id = ?
                ''', (test_id,))
                
                variants = cursor.fetchall()
                if len(variants) != 2:
                    logger.error(f"Expected 2 variants, found {len(variants)}")
                    return None
                
                # Parse variant data
                variant_data = {}
                for variant_id, variant_name, is_control, metrics_json in variants:
                    metrics = json.loads(metrics_json)
                    variant_data[variant_name] = {
                        "variant_id": variant_id,
                        "is_control": is_control,
                        "metrics": metrics
                    }
                
                # Get control and treatment variants
                control_variant = None
                treatment_variant = None
                
                for variant_name, data in variant_data.items():
                    if data["is_control"]:
                        control_variant = data
                    else:
                        treatment_variant = data
                
                if not control_variant or not treatment_variant:
                    logger.error("Could not identify control and treatment variants")
                    return None
                
                # Perform statistical analysis
                statistical_significance = {}
                confidence_intervals = {}
                effect_sizes = {}
                
                for metric_name in success_metrics:
                    if metric_name in control_variant["metrics"] and metric_name in treatment_variant["metrics"]:
                        control_data = control_variant["metrics"][metric_name]
                        treatment_data = treatment_variant["metrics"][metric_name]
                        
                        # Extract values (need to get raw data from metrics table)
                        control_values = self.get_metric_values(control_variant["variant_id"], metric_name)
                        treatment_values = self.get_metric_values(treatment_variant["variant_id"], metric_name)
                        
                        if len(control_values) > 1 and len(treatment_values) > 1:
                            # Perform t-test
                            t_stat, p_value = stats.ttest_ind(control_values, treatment_values)
                            
                            # Calculate effect size (Cohen's d)
                            pooled_std = np.sqrt(((len(control_values) - 1) * np.var(control_values, ddof=1) + 
                                                 (len(treatment_values) - 1) * np.var(treatment_values, ddof=1)) / 
                                                (len(control_values) + len(treatment_values) - 2))
                            
                            if pooled_std > 0:
                                effect_size = (np.mean(treatment_values) - np.mean(control_values)) / pooled_std
                            else:
                                effect_size = 0
                            
                            # Calculate confidence interval
                            se = pooled_std * np.sqrt(1/len(control_values) + 1/len(treatment_values))
                            mean_diff = np.mean(treatment_values) - np.mean(control_values)
                            t_critical = stats.t.ppf((1 + confidence_level) / 2, len(control_values) + len(treatment_values) - 2)
                            ci_lower = mean_diff - t_critical * se
                            ci_upper = mean_diff + t_critical * se
                            
                            statistical_significance[metric_name] = p_value < (1 - confidence_level)
                            confidence_intervals[metric_name] = (ci_lower, ci_upper)
                            effect_sizes[metric_name] = effect_size
                
                # Generate recommendation
                recommendation = self.generate_recommendation(
                    statistical_significance, effect_sizes, success_metrics
                )
                
                # Create result
                result = TestResult(
                    test_id=test_id,
                    variant_a_results=control_variant["metrics"],
                    variant_b_results=treatment_variant["metrics"],
                    statistical_significance=statistical_significance,
                    confidence_intervals=confidence_intervals,
                    effect_sizes=effect_sizes,
                    recommendation=recommendation,
                    completed_at=datetime.now()
                )
                
                # Save results
                self.save_test_results(test_id, result)
                
                return result
                
        except Exception as e:
            logger.error(f"Failed to analyze test results: {e}")
            return None
    
    def get_metric_values(self, variant_id: str, metric_name: str) -> List[float]:
        """Get all metric values for a variant"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('''
                    SELECT value FROM variant_metrics 
                    WHERE variant_id = ? AND metric_name = ?
                ''', (variant_id, metric_name))
                
                return [row[0] for row in cursor.fetchall()]
                
        except Exception as e:
            logger.error(f"Failed to get metric values: {e}")
            return []
    
    def generate_recommendation(self, significance: Dict[str, bool], effect_sizes: Dict[str, bool], 
                              success_metrics: List[str]) -> str:
        """Generate recommendation based on test results"""
        significant_metrics = [metric for metric in success_metrics if significance.get(metric, False)]
        
        if not significant_metrics:
            return "No statistically significant differences detected. Consider running the test longer or with a larger sample size."
        
        positive_effects = []
        negative_effects = []
        
        for metric in significant_metrics:
            effect_size = effect_sizes.get(metric, 0)
            if metric in ["error_rate", "bounce_rate", "response_time"]:
                # Lower is better for these metrics
                if effect_size < 0:
                    positive_effects.append(metric)
                else:
                    negative_effects.append(metric)
            else:
                # Higher is better for these metrics
                if effect_size > 0:
                    positive_effects.append(metric)
                else:
                    negative_effects.append(metric)
        
        if positive_effects and not negative_effects:
            return f"Strong recommendation to implement variant B. Positive effects observed in: {', '.join(positive_effects)}"
        elif negative_effects and not positive_effects:
            return f"Do not implement variant B. Negative effects observed in: {', '.join(negative_effects)}"
        elif positive_effects and negative_effects:
            return f"Mixed results. Consider trade-offs: Positive effects in {', '.join(positive_effects)} vs negative effects in {', '.join(negative_effects)}"
        else:
            return "Results are inconclusive. Consider additional testing or analysis."
    
    def save_test_results(self, test_id: str, result: TestResult) -> bool:
        """Save test results to database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Update test with results
                conn.execute('''
                    UPDATE ab_tests 
                    SET status = ?, completed_at = ?, results = ?
                    WHERE test_id = ?
                ''', (
                    TestStatus.COMPLETED.value,
                    result.completed_at.isoformat(),
                    json.dumps(asdict(result)),
                    test_id
                ))
                
                conn.commit()
                return True
                
        except Exception as e:
            logger.error(f"Failed to save test results: {e}")
            return False
    
    def get_test_summary(self, test_id: str) -> Optional[Dict[str, Any]]:
        """Get summary of A/B test"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get test info
                cursor = conn.execute('''
                    SELECT * FROM ab_tests WHERE test_id = ?
                ''', (test_id,))
                
                test_data = cursor.fetchone()
                if not test_data:
                    return None
                
                columns = [desc[0] for desc in cursor.description]
                test_info = dict(zip(columns, test_data))
                
                # Get variant info
                cursor = conn.execute('''
                    SELECT variant_name, is_control, sample_size, metrics FROM test_variants 
                    WHERE test_id = ?
                ''', (test_id,))
                
                variants = []
                for variant_name, is_control, sample_size, metrics_json in cursor.fetchall():
                    metrics = json.loads(metrics_json)
                    variants.append({
                        "name": variant_name,
                        "is_control": is_control,
                        "sample_size": sample_size,
                        "metrics": metrics
                    })
                
                return {
                    "test_info": test_info,
                    "variants": variants
                }
                
        except Exception as e:
            logger.error(f"Failed to get test summary: {e}")
            return None
    
    def list_tests(self, status: Optional[TestStatus] = None) -> List[Dict[str, Any]]:
        """List all A/B tests"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                query = "SELECT * FROM ab_tests"
                params = []
                
                if status:
                    query += " WHERE status = ?"
                    params.append(status.value)
                
                query += " ORDER BY created_at DESC"
                
                cursor = conn.execute(query, params)
                columns = [desc[0] for desc in cursor.description]
                
                tests = []
                for row in cursor.fetchall():
                    test = dict(zip(columns, row))
                    tests.append(test)
                
                return tests
                
        except Exception as e:
            logger.error(f"Failed to list tests: {e}")
            return []

def main():
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description="A/B Testing Metrics System")
    parser.add_argument("project_root", nargs="?", default=".", help="Project root directory")
    parser.add_argument("action", choices=["create", "start", "record", "analyze", "list", "summary"], 
                       help="Action to perform")
    parser.add_argument("--test-id", help="Test ID")
    parser.add_argument("--name", help="Test name")
    parser.add_argument("--description", default="", help="Test description")
    parser.add_argument("--type", choices=["performance", "user_experience", "business_metrics", "system_stability"], 
                       default="performance", help="Test type")
    parser.add_argument("--variant-a", default="Control", help="Variant A name")
    parser.add_argument("--variant-b", default="Treatment", help="Variant B name")
    parser.add_argument("--sample-size", type=int, default=1000, help="Sample size")
    parser.add_argument("--duration", type=int, default=7, help="Duration in days")
    parser.add_argument("--variant", help="Variant name for recording metrics")
    parser.add_argument("--metric", help="Metric name")
    parser.add_argument("--value", type=float, help="Metric value")
    
    args = parser.parse_args()
    
    ab_testing = ABTestingMetrics(args.project_root)
    
    print("🧪 A/B Testing Metrics System")
    print("=" * 50)
    
    try:
        if args.action == "create":
            if not args.name:
                print("❌ Test name required")
                sys.exit(1)
            
            test_id = f"test_{int(datetime.now().timestamp())}"
            
            config = ABTestConfig(
                test_id=test_id,
                name=args.name,
                description=args.description,
                test_type=TestType(args.type),
                variant_a_name=args.variant_a,
                variant_b_name=args.variant_b,
                sample_size=args.sample_size,
                duration_days=args.duration
            )
            
            if ab_testing.create_test(config):
                print(f"✅ A/B test created successfully")
                print(f"   Test ID: {test_id}")
                print(f"   Name: {args.name}")
                print(f"   Type: {args.type}")
                print(f"   Variants: {args.variant_a} vs {args.variant_b}")
            else:
                print("❌ Failed to create A/B test")
                sys.exit(1)
                
        elif args.action == "start":
            if not args.test_id:
                print("❌ Test ID required")
                sys.exit(1)
            
            if ab_testing.start_test(args.test_id):
                print(f"✅ A/B test started: {args.test_id}")
            else:
                print("❌ Failed to start A/B test")
                sys.exit(1)
                
        elif args.action == "record":
            if not args.test_id or not args.variant or not args.metric or args.value is None:
                print("❌ Test ID, variant, metric name, and value required")
                sys.exit(1)
            
            if ab_testing.record_metric(args.test_id, args.variant, args.metric, args.value):
                print(f"✅ Metric recorded: {args.metric} = {args.value} for {args.variant}")
            else:
                print("❌ Failed to record metric")
                sys.exit(1)
                
        elif args.action == "analyze":
            if not args.test_id:
                print("❌ Test ID required")
                sys.exit(1)
            
            result = ab_testing.analyze_test_results(args.test_id)
            
            if result:
                print(f"✅ Analysis completed for test: {args.test_id}")
                print(f"   Recommendation: {result.recommendation}")
                print(f"   Statistical Significance: {result.statistical_significance}")
                print(f"   Effect Sizes: {result.effect_sizes}")
            else:
                print("❌ Failed to analyze test results")
                sys.exit(1)
                
        elif args.action == "list":
            tests = ab_testing.list_tests()
            
            if tests:
                print(f"📋 A/B Tests ({len(tests)}):")
                for test in tests:
                    print(f"   {test['test_id']} - {test['name']} ({test['status']})")
                    print(f"      Created: {test['created_at']}")
                    print(f"      Type: {test['test_type']}")
            else:
                print("📋 No A/B tests found")
                
        elif args.action == "summary":
            if not args.test_id:
                print("❌ Test ID required")
                sys.exit(1)
            
            summary = ab_testing.get_test_summary(args.test_id)
            
            if summary:
                test_info = summary["test_info"]
                variants = summary["variants"]
                
                print(f"📊 Test Summary: {test_info['name']}")
                print(f"   Status: {test_info['status']}")
                print(f"   Type: {test_info['test_type']}")
                print(f"   Created: {test_info['created_at']}")
                
                print("   Variants:")
                for variant in variants:
                    control_marker = " (Control)" if variant["is_control"] else ""
                    print(f"     {variant['name']}{control_marker}")
                    print(f"       Sample Size: {variant['sample_size']}")
                    print(f"       Metrics: {len(variant['metrics'])} tracked")
            else:
                print("❌ Test not found")
                sys.exit(1)
                
    except Exception as e:
        logger.error(f"Command failed: {e}")
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
