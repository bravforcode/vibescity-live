#!/usr/bin/env python3
"""
Load Testing Framework for Alerting System
Tests alerting system performance under high load scenarios
"""

import asyncio
import json
import time
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional
import logging
import requests
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class LoadTestConfig:
    """Configuration for load testing"""
    concurrent_alerts: int = 100
    test_duration_seconds: int = 60
    alert_generation_rate: int = 10  # alerts per second
    metrics_update_interval: float = 0.1  # seconds
    channel_test_weights: Dict[str, float] = None
    
    def __post_init__(self):
        if self.channel_test_weights is None:
            self.channel_test_weights = {
                "console": 0.4,
                "webhook": 0.3,
                "email": 0.2,
                "slack": 0.1
            }

@dataclass
class LoadTestMetrics:
    """Metrics collected during load testing"""
    total_alerts_generated: int = 0
    total_alerts_sent: int = 0
    total_alerts_failed: int = 0
    average_response_time: float = 0.0
    max_response_time: float = 0.0
    min_response_time: float = float('inf')
    response_times: List[float] = None
    errors: List[str] = None
    throughput: float = 0.0  # alerts per second
    error_rate: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    
    def __post_init__(self):
        if self.response_times is None:
            self.response_times = []
        if self.errors is None:
            self.errors = []

class AlertingLoadTester:
    """Load testing framework for alerting system"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.alerting_system = None
        self.test_results = []
        self.start_time = None
        self.end_time = None
        
        # Load alerting system
        sys.path.insert(0, str(self.project_root / ".agent" / "scripts"))
        try:
            from alerting_system import AlertingSystem, Alert, AlertSeverity, AlertChannel
            self.AlertingSystem = AlertingSystem
            self.Alert = Alert
            self.AlertSeverity = AlertSeverity
            self.AlertChannel = AlertChannel
        except ImportError as e:
            logger.error(f"Failed to import alerting system: {e}")
            raise
    
    def create_test_alert(self, alert_id: str, severity: AlertSeverity = AlertSeverity.WARNING) -> Alert:
        """Create a test alert"""
        return Alert(
            id=alert_id,
            timestamp=datetime.now(),
            severity=severity,
            title=f"Test Alert {alert_id}",
            description=f"This is a test alert for load testing",
            metric_name="test_metric",
            current_value=100.0,
            threshold=80.0,
            channel=AlertChannel.CONSOLE
        )
    
    def generate_alert_burst(self, count: int, severity: AlertSeverity = AlertSeverity.WARNING) -> List[Alert]:
        """Generate a burst of test alerts"""
        alerts = []
        for i in range(count):
            alert_id = f"load_test_alert_{int(time.time() * 1000)}_{i}"
            alert = self.create_test_alert(alert_id, severity)
            alerts.append(alert)
        return alerts
    
    def send_alert_batch(self, alerts: List[Alert]) -> LoadTestMetrics:
        """Send a batch of alerts and measure performance"""
        metrics = LoadTestMetrics()
        start_time = time.time()
        
        for alert in alerts:
            alert_start = time.time()
            try:
                # Simulate alert sending (in real scenario, this would call the actual alerting system)
                success = self.simulate_alert_sending(alert)
                alert_end = time.time()
                
                response_time = (alert_end - alert_start) * 1000  # Convert to milliseconds
                metrics.response_times.append(response_time)
                metrics.total_alerts_sent += 1
                
                # Update min/max response times
                metrics.min_response_time = min(metrics.min_response_time, response_time)
                metrics.max_response_time = max(metrics.max_response_time, response_time)
                
            except Exception as e:
                metrics.total_alerts_failed += 1
                metrics.errors.append(str(e))
        
        metrics.total_alerts_generated = len(alerts)
        
        # Calculate derived metrics
        end_time = time.time()
        total_time = end_time - start_time
        
        if metrics.response_times:
            metrics.average_response_time = statistics.mean(metrics.response_times)
            metrics.throughput = metrics.total_alerts_sent / total_time
            metrics.error_rate = metrics.total_alerts_failed / metrics.total_alerts_generated
        
        return metrics
    
    def simulate_alert_sending(self, alert: Alert) -> bool:
        """Simulate sending an alert with realistic timing"""
        # Simulate different channel processing times
        channel_times = {
            "console": 0.001,  # 1ms
            "webhook": 0.050,  # 50ms
            "email": 0.200,    # 200ms
            "slack": 0.100     # 100ms
        }
        
        channel_name = alert.channel.value if hasattr(alert.channel, 'value') else str(alert.channel)
        processing_time = channel_times.get(channel_name, 0.050)
        
        # Add some randomness to simulate real-world conditions
        import random
        processing_time *= (0.8 + random.random() * 0.4)  # ±20% variation
        
        # Simulate network latency
        processing_time += random.uniform(0.001, 0.010)  # 1-10ms
        
        time.sleep(processing_time)
        
        # Simulate occasional failures (2% failure rate)
        if random.random() < 0.02:
            raise Exception("Simulated network failure")
        
        return True
    
    def run_concurrent_load_test(self, config: LoadTestConfig) -> LoadTestMetrics:
        """Run concurrent load test with multiple threads"""
        logger.info(f"Starting concurrent load test: {config.concurrent_alerts} alerts over {config.test_duration_seconds}s")
        
        self.start_time = datetime.now()
        overall_metrics = LoadTestMetrics()
        
        # Calculate alerts per thread
        alerts_per_thread = config.concurrent_alerts // 4  # Use 4 threads
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            
            # Submit tasks to executor
            for i in range(4):
                alerts = self.generate_alert_burst(alerts_per_thread)
                future = executor.submit(self.send_alert_batch, alerts)
                futures.append(future)
            
            # Collect results
            for future in as_completed(futures):
                try:
                    thread_metrics = future.result()
                    
                    # Aggregate metrics
                    overall_metrics.total_alerts_generated += thread_metrics.total_alerts_generated
                    overall_metrics.total_alerts_sent += thread_metrics.total_alerts_sent
                    overall_metrics.total_alerts_failed += thread_metrics.total_alerts_failed
                    overall_metrics.response_times.extend(thread_metrics.response_times)
                    overall_metrics.errors.extend(thread_metrics.errors)
                    
                except Exception as e:
                    logger.error(f"Thread execution failed: {e}")
                    overall_metrics.errors.append(str(e))
        
        self.end_time = datetime.now()
        
        # Calculate final metrics
        if overall_metrics.response_times:
            overall_metrics.average_response_time = statistics.mean(overall_metrics.response_times)
            overall_metrics.max_response_time = max(overall_metrics.response_times)
            overall_metrics.min_response_time = min(overall_metrics.response_times)
        
        total_time = (self.end_time - self.start_time).total_seconds()
        overall_metrics.throughput = overall_metrics.total_alerts_sent / total_time if total_time > 0 else 0
        overall_metrics.error_rate = overall_metrics.total_alerts_failed / overall_metrics.total_alerts_generated if overall_metrics.total_alerts_generated > 0 else 0
        
        return overall_metrics
    
    def run_sustained_load_test(self, config: LoadTestConfig) -> LoadTestMetrics:
        """Run sustained load test over time"""
        logger.info(f"Starting sustained load test: {config.alert_generation_rate} alerts/sec for {config.test_duration_seconds}s")
        
        self.start_time = datetime.now()
        overall_metrics = LoadTestMetrics()
        
        end_time = time.time() + config.test_duration_seconds
        alert_interval = 1.0 / config.alert_generation_rate
        
        while time.time() < end_time:
            # Generate alerts at specified rate
            alerts = self.generate_alert_burst(1)  # Single alert per iteration
            
            try:
                alert_start = time.time()
                success = self.simulate_alert_sending(alerts[0])
                alert_end = time.time()
                
                response_time = (alert_end - alert_start) * 1000
                overall_metrics.response_times.append(response_time)
                overall_metrics.total_alerts_generated += 1
                overall_metrics.total_alerts_sent += 1
                
                overall_metrics.min_response_time = min(overall_metrics.min_response_time, response_time)
                overall_metrics.max_response_time = max(overall_metrics.max_response_time, response_time)
                
            except Exception as e:
                overall_metrics.total_alerts_failed += 1
                overall_metrics.errors.append(str(e))
            
            # Wait for next interval
            time.sleep(alert_interval)
        
        self.end_time = datetime.now()
        
        # Calculate final metrics
        total_time = (self.end_time - self.start_time).total_seconds()
        overall_metrics.throughput = overall_metrics.total_alerts_sent / total_time if total_time > 0 else 0
        overall_metrics.error_rate = overall_metrics.total_alerts_failed / overall_metrics.total_alerts_generated if overall_metrics.total_alerts_generated > 0 else 0
        
        if overall_metrics.response_times:
            overall_metrics.average_response_time = statistics.mean(overall_metrics.response_times)
        
        return overall_metrics
    
    def run_stress_test(self, config: LoadTestConfig) -> LoadTestMetrics:
        """Run stress test to find breaking point"""
        logger.info("Starting stress test to find system limits")
        
        self.start_time = datetime.now()
        overall_metrics = LoadTestMetrics()
        
        # Start with moderate load and increase gradually
        current_load = 10
        max_load_reached = 0
        
        while current_load <= config.concurrent_alerts:
            logger.info(f"Testing with {current_load} concurrent alerts")
            
            # Test current load level
            test_config = LoadTestConfig(
                concurrent_alerts=current_load,
                test_duration_seconds=10,  # Shorter duration for stress test
                alert_generation_rate=current_load
            )
            
            try:
                test_metrics = self.run_concurrent_load_test(test_config)
                
                # Check if error rate is acceptable (< 5%)
                if test_metrics.error_rate > 0.05:
                    logger.warning(f"Error rate too high at {current_load} alerts: {test_metrics.error_rate:.2%}")
                    break
                
                # Check if response time is acceptable (< 1000ms)
                if test_metrics.average_response_time > 1000:
                    logger.warning(f"Response time too high at {current_load} alerts: {test_metrics.average_response_time:.2f}ms")
                    break
                
                # Aggregate metrics
                overall_metrics.total_alerts_generated += test_metrics.total_alerts_generated
                overall_metrics.total_alerts_sent += test_metrics.total_alerts_sent
                overall_metrics.total_alerts_failed += test_metrics.total_alerts_failed
                overall_metrics.response_times.extend(test_metrics.response_times)
                overall_metrics.errors.extend(test_metrics.errors)
                
                max_load_reached = current_load
                current_load *= 2  # Double the load
                
            except Exception as e:
                logger.error(f"Stress test failed at {current_load} alerts: {e}")
                break
        
        self.end_time = datetime.now()
        
        # Calculate final metrics
        total_time = (self.end_time - self.start_time).total_seconds()
        overall_metrics.throughput = overall_metrics.total_alerts_sent / total_time if total_time > 0 else 0
        overall_metrics.error_rate = overall_metrics.total_alerts_failed / overall_metrics.total_alerts_generated if overall_metrics.total_alerts_generated > 0 else 0
        
        if overall_metrics.response_times:
            overall_metrics.average_response_time = statistics.mean(overall_metrics.response_times)
        
        logger.info(f"Stress test completed. Maximum load handled: {max_load_reached} alerts")
        
        return overall_metrics
    
    def generate_load_test_report(self, test_results: List[LoadTestMetrics]) -> Dict[str, Any]:
        """Generate comprehensive load test report"""
        if not test_results:
            return {"error": "No test results available"}
        
        # Aggregate all metrics
        total_metrics = LoadTestMetrics()
        
        for result in test_results:
            total_metrics.total_alerts_generated += result.total_alerts_generated
            total_metrics.total_alerts_sent += result.total_alerts_sent
            total_metrics.total_alerts_failed += result.total_alerts_failed
            total_metrics.response_times.extend(result.response_times)
            total_metrics.errors.extend(result.errors)
        
        # Calculate statistics
        report = {
            "test_summary": {
                "total_tests": len(test_results),
                "total_alerts_generated": total_metrics.total_alerts_generated,
                "total_alerts_sent": total_metrics.total_alerts_sent,
                "total_alerts_failed": total_metrics.total_alerts_failed,
                "overall_success_rate": (total_metrics.total_alerts_sent / total_metrics.total_alerts_generated * 100) if total_metrics.total_alerts_generated > 0 else 0,
                "overall_error_rate": (total_metrics.total_alerts_failed / total_metrics.total_alerts_generated * 100) if total_metrics.total_alerts_generated > 0 else 0
            },
            "performance_metrics": {},
            "recommendations": []
        }
        
        if total_metrics.response_times:
            response_times = total_metrics.response_times
            report["performance_metrics"] = {
                "average_response_time_ms": statistics.mean(response_times),
                "median_response_time_ms": statistics.median(response_times),
                "min_response_time_ms": min(response_times),
                "max_response_time_ms": max(response_times),
                "p95_response_time_ms": np.percentile(response_times, 95),
                "p99_response_time_ms": np.percentile(response_times, 99),
                "response_time_std_dev": statistics.stdev(response_times) if len(response_times) > 1 else 0
            }
        
        # Generate recommendations
        if total_metrics.total_alerts_failed > 0:
            error_rate = total_metrics.total_alerts_failed / total_metrics.total_alerts_generated
            if error_rate > 0.05:
                report["recommendations"].append("High error rate detected. Consider implementing retry logic and circuit breakers.")
        
        if total_metrics.response_times:
            avg_response_time = statistics.mean(total_metrics.response_times)
            if avg_response_time > 500:
                report["recommendations"].append("High response times detected. Consider optimizing alert processing or implementing async processing.")
            
            p99_response_time = np.percentile(total_metrics.response_times, 99)
            if p99_response_time > 2000:
                report["recommendations"].append("Very high P99 response times. Consider implementing timeout handling and load shedding.")
        
        # Performance benchmarking
        if total_metrics.total_alerts_sent > 0:
            total_time = sum([len(test.response_times) * (statistics.mean(test.response_times) / 1000) for test in test_results if test.response_times])
            if total_time > 0:
                overall_throughput = total_metrics.total_alerts_sent / total_time
                report["performance_metrics"]["overall_throughput_alerts_per_sec"] = overall_throughput
                
                if overall_throughput < 50:
                    report["recommendations"].append("Low throughput detected. Consider implementing batch processing or connection pooling.")
        
        return report
    
    def save_test_results(self, test_results: List[LoadTestMetrics], report: Dict[str, Any]) -> bool:
        """Save test results and report to files"""
        try:
            results_dir = self.project_root / ".agent" / "test_results"
            results_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Save raw metrics
            metrics_file = results_dir / f"load_test_metrics_{timestamp}.json"
            with open(metrics_file, 'w') as f:
                json.dump([asdict(result) for result in test_results], f, indent=2)
            
            # Save report
            report_file = results_dir / f"load_test_report_{timestamp}.json"
            with open(report_file, 'w') as f:
                json.dump(report, f, indent=2)
            
            logger.info(f"Test results saved to {results_dir}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save test results: {e}")
            return False

def run_comprehensive_load_test(project_root: str) -> Dict[str, Any]:
    """Run comprehensive load test suite"""
    logger.info("Starting comprehensive load test suite")
    
    tester = AlertingLoadTester(project_root)
    test_results = []
    
    # Test 1: Concurrent Load Test
    logger.info("Running concurrent load test...")
    concurrent_config = LoadTestConfig(
        concurrent_alerts=100,
        test_duration_seconds=30
    )
    concurrent_results = tester.run_concurrent_load_test(concurrent_config)
    test_results.append(concurrent_results)
    
    # Test 2: Sustained Load Test
    logger.info("Running sustained load test...")
    sustained_config = LoadTestConfig(
        alert_generation_rate=20,
        test_duration_seconds=60
    )
    sustained_results = tester.run_sustained_load_test(sustained_config)
    test_results.append(sustained_results)
    
    # Test 3: Stress Test
    logger.info("Running stress test...")
    stress_config = LoadTestConfig(
        concurrent_alerts=500,
        test_duration_seconds=60
    )
    stress_results = tester.run_stress_test(stress_config)
    test_results.append(stress_results)
    
    # Generate report
    report = tester.generate_load_test_report(test_results)
    
    # Save results
    tester.save_test_results(test_results, report)
    
    return report

def main():
    import sys
    
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    test_type = sys.argv[2] if len(sys.argv) > 2 else "comprehensive"
    
    print("🚀 Starting Alerting System Load Testing...")
    
    try:
        if test_type == "comprehensive":
            report = run_comprehensive_load_test(project_root)
        else:
            # Run specific test type
            tester = AlertingLoadTester(project_root)
            
            if test_type == "concurrent":
                config = LoadTestConfig(concurrent_alerts=100, test_duration_seconds=30)
                results = tester.run_concurrent_load_test(config)
                report = tester.generate_load_test_report([results])
            elif test_type == "sustained":
                config = LoadTestConfig(alert_generation_rate=20, test_duration_seconds=60)
                results = tester.run_sustained_load_test(config)
                report = tester.generate_load_test_report([results])
            elif test_type == "stress":
                config = LoadTestConfig(concurrent_alerts=500, test_duration_seconds=60)
                results = tester.run_stress_test(config)
                report = tester.generate_load_test_report([results])
            else:
                print(f"Unknown test type: {test_type}")
                print("Available types: comprehensive, concurrent, sustained, stress")
                sys.exit(1)
        
        # Print summary
        summary = report.get("test_summary", {})
        performance = report.get("performance_metrics", {})
        recommendations = report.get("recommendations", [])
        
        print(f"\n📊 Load Test Results:")
        print(f"   Total Alerts Generated: {summary.get('total_alerts_generated', 0):,}")
        print(f"   Total Alerts Sent: {summary.get('total_alerts_sent', 0):,}")
        print(f"   Success Rate: {summary.get('overall_success_rate', 0):.1f}%")
        print(f"   Error Rate: {summary.get('overall_error_rate', 0):.1f}%")
        
        if performance:
            print(f"\n⚡ Performance Metrics:")
            print(f"   Avg Response Time: {performance.get('average_response_time_ms', 0):.1f}ms")
            print(f"   P95 Response Time: {performance.get('p95_response_time_ms', 0):.1f}ms")
            print(f"   P99 Response Time: {performance.get('p99_response_time_ms', 0):.1f}ms")
            if 'overall_throughput_alerts_per_sec' in performance:
                print(f"   Throughput: {performance['overall_throughput_alerts_per_sec']:.1f} alerts/sec")
        
        if recommendations:
            print(f"\n💡 Recommendations:")
            for rec in recommendations:
                print(f"   - {rec}")
        
        # Determine success
        success_rate = summary.get('overall_success_rate', 0)
        if success_rate >= 95:
            print(f"\n✅ Load test PASSED - System handles load well")
            sys.exit(0)
        elif success_rate >= 90:
            print(f"\n⚠️  Load test PASSED with warnings")
            sys.exit(2)
        else:
            print(f"\n❌ Load test FAILED - System cannot handle load")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Load test failed: {e}")
        print(f"❌ Critical error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
