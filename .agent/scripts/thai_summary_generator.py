#!/usr/bin/env python3
"""
Thai Summary Generator for VibeCity
Auto-populates Thai summary template with task information
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import re

class ThaiSummaryGenerator:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.task_history = self.project_root / ".agent" / "task_history.json"
        self.current_session = {
            "start_time": datetime.now().isoformat(),
            "files_changed": [],
            "commands_run": [],
            "metrics_collected": {},
            "validation_results": {}
        }
        
    def track_file_changes(self) -> List[str]:
        """Track files changed in current session"""
        try:
            # Get git status for changed files
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.project_root,
                capture_output=True,
                text=True
            )
            
            changed_files = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    status = line[:2]
                    file_path = line[3:]
                    if file_path and not file_path.startswith('.agent/'):
                        changed_files.append(f"{status} {file_path}")
            
            self.current_session["files_changed"] = changed_files
            return changed_files
            
        except Exception as e:
            print(f"Error tracking file changes: {e}")
            return []
    
    def track_commands_run(self) -> List[str]:
        """Track commands run in current session"""
        # This would be populated by monitoring shell history or CLI wrapper
        # For now, return placeholder
        return [
            "bun run check && bun run build",
            "python .agent/scripts/metrics_collector.py .",
            "python .agent/scripts/security_validator.py ."
        ]
    
    def collect_metrics(self) -> Dict[str, Any]:
        """Collect performance metrics for summary"""
        metrics_file = self.project_root / ".agent" / "metrics" / "performance_metrics.json"
        
        if metrics_file.exists():
            try:
                with open(metrics_file, 'r') as f:
                    metrics_data = json.load(f)
                
                if metrics_data and len(metrics_data) >= 2:
                    latest = metrics_data[-1]
                    baseline = metrics_data[-2]
                    
                    return {
                        "bundle_size_change": self.calculate_change(
                            baseline.get("frontend", {}).get("bundle_size", 0),
                            latest.get("frontend", {}).get("bundle_size", 0)
                        ),
                        "lighthouse_change": self.calculate_change(
                            baseline.get("frontend", {}).get("lighthouse", {}).get("performance", 0),
                            latest.get("frontend", {}).get("lighthouse", {}).get("performance", 0)
                        ),
                        "api_response_change": self.calculate_change(
                            baseline.get("backend", {}).get("api_response_time", 0),
                            latest.get("backend", {}).get("api_response_time", 0)
                        )
                    }
            except Exception as e:
                print(f"Error reading metrics: {e}")
        
        return {}
    
    def calculate_change(self, baseline: float, current: float) -> Dict[str, Any]:
        """Calculate change between baseline and current"""
        if baseline == 0:
            return {"current": current, "change": current, "percentage": "N/A"}
        
        change = current - baseline
        percentage = (change / baseline) * 100 if baseline != 0 else 0
        
        return {
            "baseline": baseline,
            "current": current,
            "change": change,
            "percentage": f"{percentage:+.1f}%"
        }
    
    def get_validation_results(self) -> Dict[str, Any]:
        """Get validation results from various checks"""
        results = {}
        
        # Frontend validation
        try:
            result = subprocess.run(
                ["bun", "run", "check"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=60
            )
            results["frontend_check"] = {
                "status": "pass" if result.returncode == 0 else "fail",
                "errors": result.stderr if result.returncode != 0 else None
            }
        except:
            results["frontend_check"] = {"status": "error"}
        
        # Backend validation
        backend_dir = self.project_root / "backend"
        if backend_dir.exists():
            try:
                result = subprocess.run(
                    ["pytest", "--tb=short"],
                    cwd=backend_dir,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                results["backend_tests"] = {
                    "status": "pass" if result.returncode == 0 else "fail",
                    "summary": self.parse_pytest_summary(result.stdout)
                }
            except:
                results["backend_tests"] = {"status": "error"}
        
        # Security validation
        security_report = self.project_root / ".agent" / "reports" / "security_report.json"
        if security_report.exists():
            try:
                with open(security_report, 'r') as f:
                    security_data = json.load(f)
                
                results["security"] = {
                    "status": security_data.get("overall_status", "unknown"),
                    "issues": security_data.get("summary", {}).get("total_issues", 0)
                }
            except:
                results["security"] = {"status": "error"}
        
        return results
    
    def parse_pytest_summary(self, output: str) -> str:
        """Parse pytest output for summary"""
        lines = output.split('\n')
        for line in lines:
            if '=' in line and ('passed' in line or 'failed' in line):
                return line.strip()
        return "Unknown"
    
    def infer_task_type(self, files_changed: List[str]) -> str:
        """Infer task type from files changed"""
        frontend_files = [f for f in files_changed if any(f.endswith(ext) for ext in ['.vue', '.js', '.ts', '.css'])]
        backend_files = [f for f in files_changed if f.endswith('.py')]
        config_files = [f for f in files_changed if any(x in f for x in ['package.json', 'requirements.txt', '.yml', '.yaml'])]
        
        if frontend_files and not backend_files:
            return "Frontend development"
        elif backend_files and not frontend_files:
            return "Backend development"
        elif config_files:
            return "Configuration/Infrastructure"
        elif frontend_files and backend_files:
            return "Full-stack development"
        else:
            return "General development"
    
    def generate_recommendations(self, session_data: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on session data"""
        recommendations = []
        
        # Performance recommendations
        metrics = session_data.get("metrics_collected", {})
        if metrics.get("bundle_size_change", {}).get("change", 0) > 50000:  # 50KB increase
            recommendations.append("ตรวจสอบ bundle size ที่เพิ่มขึ้น อาจต้องทำ code splitting")
        
        if metrics.get("api_response_change", {}).get("change", 0) > 50:  # 50ms increase
            recommendations.append("ตรวจสอบ API performance ที่ช้าลง อาจต้อง optimize queries")
        
        # Security recommendations
        validation = session_data.get("validation_results", {})
        if validation.get("security", {}).get("status") == "fail":
            recommendations.append("แก้ไขปัญหาความปลอดภัยก่อน deploy")
        
        # Testing recommendations
        if validation.get("backend_tests", {}).get("status") == "fail":
            recommendations.append("แก้ไข test failures ก่อน merge")
        
        # File change recommendations
        files_changed = session_data.get("files_changed", [])
        if len(files_changed) > 10:
            recommendations.append("พิจารณาแยก task ที่มีการเปลี่ยนแปลงหลายไฟล์")
        
        # Default recommendations
        if not recommendations:
            recommendations = [
                "ตรวจสอบ performance metrics ใน production",
                "ทำ code review ก่อน merge",
                "อัปเด트 documentation ถ้ามีการเปลี่ยนแปลง API"
            ]
        
        return recommendations[:3]  # Return top 3 recommendations
    
    def generate_thai_summary(self, task_description: Optional[str] = None) -> str:
        """Generate comprehensive Thai summary"""
        # Collect session data
        files_changed = self.track_file_changes()
        commands_run = self.track_commands_run()
        metrics = self.collect_metrics()
        validation = self.get_validation_results()
        
        session_data = {
            "files_changed": files_changed,
            "commands_run": commands_run,
            "metrics_collected": metrics,
            "validation_results": validation
        }
        
        # Infer task details
        task_type = self.infer_task_type(files_changed)
        if not task_description:
            task_description = task_type
        
        # Generate recommendations
        recommendations = self.generate_recommendations(session_data)
        
        # Build Thai summary
        summary_lines = [
            "## สรุปภาษาไทย",
            f"- **ทำอะไรไป:** {task_description}",
            f"- **เปลี่ยนแปลง:** {len(files_changed)} ไฟล์ ({', '.join([f.split()[-1] for f in files_changed[:3]])}{'...' if len(files_changed) > 3 else ''})",
            "- **ทดสอบ:** "
        ]
        
        # Add testing info
        test_results = []
        if validation.get("frontend_check", {}).get("status") == "pass":
            test_results.append("✅ Frontend check")
        if validation.get("backend_tests", {}).get("status") == "pass":
            test_results.append("✅ Backend tests")
        if validation.get("security", {}).get("status") == "pass":
            test_results.append("✅ Security scan")
        
        if test_results:
            summary_lines[-1] += " | ".join(test_results)
        else:
            summary_lines[-1] += "ตรวจสอบพื้นฐาน"
        
        # Add metrics summary
        if metrics:
            metrics_summary = []
            if "bundle_size_change" in metrics:
                change = metrics["bundle_size_change"]
                metrics_summary.append(f"Bundle size {change['percentage']}")
            if "lighthouse_change" in metrics:
                change = metrics["lighthouse_change"]
                metrics_summary.append(f"Lighthouse {change['percentage']}")
            
            if metrics_summary:
                summary_lines.append(f"- **Performance:** {' | '.join(metrics_summary)}")
        
        # Add recommendations
        summary_lines.append(f"- **แนะนำต่อ:** {' | '.join(recommendations)}")
        
        return "\n".join(summary_lines)
    
    def save_session_history(self, summary: str) -> None:
        """Save session history with summary"""
        session_entry = {
            "timestamp": datetime.now().isoformat(),
            "summary": summary,
            "session_data": self.current_session
        }
        
        history = []
        if self.task_history.exists():
            try:
                with open(self.task_history, 'r') as f:
                    history = json.load(f)
            except:
                history = []
        
        history.append(session_entry)
        
        # Keep only last 50 sessions
        if len(history) > 50:
            history = history[-50:]
        
        with open(self.task_history, 'w') as f:
            json.dump(history, f, indent=2)

def main():
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    task_description = sys.argv[2] if len(sys.argv) > 2 else None
    
    generator = ThaiSummaryGenerator(project_root)
    
    # Generate Thai summary
    summary = generator.generate_thai_summary(task_description)
    
    # Print summary
    print("\n" + "="*50)
    print(summary)
    print("="*50 + "\n")
    
    # Save session history
    generator.save_session_history(summary)
    
    # Optionally copy to clipboard (if xclip/clipboard available)
    try:
        subprocess.run(["pbcopy"], input=summary.encode(), text=True)
        print("📋 Thai summary copied to clipboard")
    except:
        print("💾 Thai summary saved to session history")

if __name__ == "__main__":
    main()
