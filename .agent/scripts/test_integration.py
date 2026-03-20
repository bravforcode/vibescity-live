#!/usr/bin/env python3
"""
Integration Tests for VibeCity Automated DevOps System
Tests all scripts work together correctly
"""

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Any
import unittest
from unittest.mock import patch, MagicMock

class TestMetricsCollector(unittest.TestCase):
    """Test metrics collection functionality"""
    
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())
        self.project_root = self.temp_dir / "test_project"
        self.project_root.mkdir()
        
        # Create mock project structure
        (self.project_root / "src").mkdir()
        (self.project_root / "backend").mkdir()
        (self.project_root / ".agent" / "metrics").mkdir(parents=True)
        
        # Import metrics collector
        sys.path.insert(0, str(self.project_root.parent / ".agent" / "scripts"))
        from metrics_collector import MetricsCollector
        self.collector = MetricsCollector(str(self.project_root))
    
    def test_metrics_file_creation(self):
        """Test metrics file is created correctly"""
        self.assertTrue(self.collector.metrics_file.parent.exists())
        self.assertEqual(self.collector.metrics_file.name, "performance_metrics.json")
    
    def test_frontend_metrics_collection(self):
        """Test frontend metrics collection with mock"""
        with patch('subprocess.run') as mock_run:
            # Mock successful build analyze
            mock_run.return_value = MagicMock(returncode=0, stdout='{"totalSize": 350000}')
            
            metrics = self.collector.collect_frontend_metrics()
            
            self.assertIn("timestamp", metrics)
            self.assertIn("frontend", metrics)
            self.assertIn("bundle_analysis", metrics["frontend"])
    
    def test_backend_metrics_collection(self):
        """Test backend metrics collection"""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout='{"avg_response_time": 150}')
            
            metrics = self.collector.collect_backend_metrics()
            
            self.assertIn("timestamp", metrics)
            self.assertIn("backend", metrics)
    
    def test_baseline_comparison(self):
        """Test baseline comparison functionality"""
        # Create baseline data
        baseline_data = [
            {
                "timestamp": "2023-12-31T00:00:00Z",
                "frontend": {
                    "lighthouse": {"performance": 0.9}
                }
            },
            {
                "timestamp": "2024-01-01T00:00:00Z",
                "frontend": {
                    "lighthouse": {"performance": 0.9}
                }
            }
        ]
        
        with open(self.collector.metrics_file, 'w') as f:
            json.dump(baseline_data, f)
        
        current_metrics = {
            "frontend": {
                "lighthouse": {"performance": 0.85}
            }
        }
        
        comparison = self.collector.compare_with_baseline(current_metrics)
        
        self.assertEqual(comparison["status"], "success")
        self.assertIn("frontend_changes", comparison)
    
    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)

class TestSecurityValidator(unittest.TestCase):
    """Test security validation functionality"""
    
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())
        self.project_root = self.temp_dir / "test_project"
        self.project_root.mkdir()
        
        # Create mock project with security issues
        src_dir = self.project_root / "src"
        src_dir.mkdir()
        
        # Create file with security issue
        test_file = src_dir / "test.js"
        test_file.write_text('const password = "secret123";', encoding="utf-8")
        
        backend_dir = self.project_root / "backend"
        backend_dir.mkdir()
        
        (self.project_root / ".agent" / "reports").mkdir(parents=True)
        
        sys.path.insert(0, str(self.project_root.parent / ".agent" / "scripts"))
        from security_validator import SecurityValidator
        self.validator = SecurityValidator(str(self.project_root))
    
    def test_frontend_security_audit(self):
        """Test frontend security pattern detection"""
        results = self.validator.run_frontend_security_audit()
        
        self.assertIn("component", results)
        self.assertEqual(results["component"], "frontend")
        self.assertIn("checks", results)
        self.assertIn("code_patterns", results["checks"])
        
        # Should detect hardcoded password
        code_patterns = results["checks"]["code_patterns"]
        self.assertEqual(code_patterns["status"], "fail")
        self.assertGreater(code_patterns["total_issues"], 0)
    
    def test_security_report_generation(self):
        """Test comprehensive security report generation"""
        report = self.validator.generate_security_report()
        
        self.assertIn("timestamp", report)
        self.assertIn("overall_status", report)
        self.assertIn("components", report)
        self.assertIn("summary", report)
    
    def test_security_threshold_validation(self):
        """Test security threshold validation"""
        # Create report with critical issues
        report = {
            "summary": {
                "critical_issues": 1,
                "high_issues": 2,
                "medium_issues": 5,
                "total_issues": 8
            }
        }
        
        result = self.validator.validate_security_thresholds(report)
        self.assertFalse(result)  # Should fail due to critical issue
        
        # Test with no critical issues
        report["summary"]["critical_issues"] = 0
        result = self.validator.validate_security_thresholds(report)
        self.assertTrue(result)
    
    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)

class TestThaiSummaryGenerator(unittest.TestCase):
    """Test Thai summary generation functionality"""
    
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())
        self.project_root = self.temp_dir / "test_project"
        self.project_root.mkdir()
        
        # Create mock git repository
        subprocess.run(["git", "init"], cwd=self.project_root, capture_output=True)
        
        (self.project_root / ".agent").mkdir()
        
        sys.path.insert(0, str(self.project_root.parent / ".agent" / "scripts"))
        from thai_summary_generator import ThaiSummaryGenerator
        self.generator = ThaiSummaryGenerator(str(self.project_root))
    
    def test_file_change_tracking(self):
        """Test file change tracking"""
        # Create and modify a file
        test_file = self.project_root / "src" / "test.vue"
        test_file.parent.mkdir()
        test_file.write_text("test content", encoding="utf-8")
        
        changes = self.generator.track_file_changes()
        self.assertIsInstance(changes, list)
    
    def test_task_type_inference(self):
        """Test task type inference from file changes"""
        # Test frontend files
        frontend_files = ["M src/App.vue", "A src/components/Test.vue"]
        task_type = self.generator.infer_task_type(frontend_files)
        self.assertEqual(task_type, "Frontend development")
        
        # Test backend files
        backend_files = ["M backend/app.py", "A backend/models.py"]
        task_type = self.generator.infer_task_type(backend_files)
        self.assertEqual(task_type, "Backend development")
        
        # Test mixed files
        mixed_files = ["M src/App.vue", "M backend/app.py"]
        task_type = self.generator.infer_task_type(mixed_files)
        self.assertEqual(task_type, "Full-stack development")
    
    def test_thai_summary_generation(self):
        """Test Thai summary generation"""
        summary = self.generator.generate_thai_summary("ทดสอบการสร้าง component")
        
        self.assertIn("## สรุปภาษาไทย", summary)
        self.assertIn("ทำอะไรไป:", summary)
        self.assertIn("เปลี่ยนแปลง:", summary)
        self.assertIn("ทดสอบ:", summary)
        self.assertIn("แนะนำต่อ:", summary)
        self.assertIn("ทดสอบการสร้าง component", summary)
    
    def test_recommendation_generation(self):
        """Test recommendation generation"""
        session_data = {
            "metrics_collected": {
                "bundle_size_change": {"change": 60000}  # 50KB increase
            },
            "validation_results": {
                "security": {"status": "fail"}
            },
            "files_changed": ["file1", "file2", "file3", "file4", "file5", "file6", "file7", "file8", "file9", "file10", "file11"]
        }
        
        recommendations = self.generator.generate_recommendations(session_data)
        
        self.assertIsInstance(recommendations, list)
        self.assertLessEqual(len(recommendations), 3)  # Should return top 3
    
    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)

class TestSystemIntegration(unittest.TestCase):
    """Test overall system integration"""
    
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())
        self.project_root = self.temp_dir / "test_project"
        self.project_root.mkdir()
        
        # Create complete project structure
        (self.project_root / "src").mkdir()
        (self.project_root / "backend").mkdir()
        (self.project_root / ".agent" / "scripts").mkdir(parents=True)
        (self.project_root / ".agent" / "metrics").mkdir(parents=True)
        (self.project_root / ".agent" / "reports").mkdir(parents=True)
        
        # Copy scripts to test project
        scripts_dir = Path(__file__).parent
        for script_file in scripts_dir.glob("*.py"):
            if script_file.name != "test_integration.py":
                target = self.project_root / ".agent" / "scripts" / script_file.name
                target.write_text(script_file.read_text(encoding="utf-8"), encoding="utf-8")
    
    def test_end_to_end_workflow(self):
        """Test complete end-to-end workflow"""
        # Mock subprocess calls to avoid actual execution
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="success")
            
            # 1. Run metrics collection
            sys.path.insert(0, str(self.project_root / ".agent" / "scripts"))
            from metrics_collector import MetricsCollector
            collector = MetricsCollector(str(self.project_root))
            
            frontend_metrics = collector.collect_frontend_metrics()
            backend_metrics = collector.collect_backend_metrics()
            
            # 2. Run security validation
            from security_validator import SecurityValidator
            validator = SecurityValidator(str(self.project_root))
            
            security_report = validator.generate_security_report()
            
            # 3. Generate Thai summary
            from thai_summary_generator import ThaiSummaryGenerator
            generator = ThaiSummaryGenerator(str(self.project_root))
            
            summary = generator.generate_thai_summary("Integration test task")
            
            # Verify all components work
            self.assertIn("frontend", frontend_metrics)
            self.assertIn("backend", backend_metrics)
            self.assertIn("overall_status", security_report)
            self.assertIn("## สรุปภาษาไทย", summary)
    
    def test_error_handling_integration(self):
        """Test error handling across all components"""
        # Test with failing subprocess
        with patch('subprocess.run') as mock_run:
            mock_run.side_effect = subprocess.CalledProcessError(1, "cmd", "error")
            
            sys.path.insert(0, str(self.project_root / ".agent" / "scripts"))
            from metrics_collector import MetricsCollector
            from security_validator import SecurityValidator
            
            collector = MetricsCollector(str(self.project_root))
            validator = SecurityValidator(str(self.project_root))
            
            # Should handle errors gracefully
            frontend_metrics = collector.collect_frontend_metrics()
            security_report = validator.generate_security_report()
            
            self.assertIn("frontend", frontend_metrics)
            self.assertIn("overall_status", security_report)
    
    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)

def run_integration_tests():
    """Run all integration tests"""
    print("🧪 Running Integration Tests for VibeCity DevOps System")
    print("=" * 60)
    
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test cases
    test_classes = [
        TestMetricsCollector,
        TestSecurityValidator, 
        TestThaiSummaryGenerator,
        TestSystemIntegration
    ]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 Integration Test Results:")
    print(f"   Tests run: {result.testsRun}")
    print(f"   Failures: {len(result.failures)}")
    print(f"   Errors: {len(result.errors)}")
    print(f"   Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%")
    
    if result.failures:
        print("\n❌ Failures:")
        for test, traceback in result.failures:
            print(f"   - {test}")
    
    if result.errors:
        print("\n🚨 Errors:")
        for test, traceback in result.errors:
            print(f"   - {test}")
    
    if result.wasSuccessful():
        print("\n✅ All integration tests passed!")
        return True
    else:
        print("\n❌ Some integration tests failed!")
        return False

if __name__ == "__main__":
    success = run_integration_tests()
    sys.exit(0 if success else 1)
