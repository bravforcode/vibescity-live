#!/usr/bin/env python3
"""
Production Dashboard Deployment Script
Deploys Performance Dashboard to production environment
"""

import json
import subprocess
import sys
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class DashboardDeployment:
    """Production deployment for Performance Dashboard"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.dashboard_dir = self.project_root / "src" / "components" / "PerformanceDashboard.vue"
        self.deploy_config = self.load_deployment_config()
        
    def load_deployment_config(self) -> Dict[str, Any]:
        """Load deployment configuration"""
        config_file = self.project_root / ".agent" / "config" / "dashboard_deployment.json"
        
        default_config = {
            "production": {
                "enabled": True,
                "build_command": "bun run build",
                "deploy_command": "vercel --prod",
                "environment": "production",
                "domain": "dashboard.vibecity.live"
            },
            "staging": {
                "enabled": True,
                "build_command": "bun run build",
                "deploy_command": "vercel",
                "environment": "staging",
                "domain": "dashboard-staging.vibecity.live"
            },
            "health_checks": {
                "enabled": True,
                "endpoint": "/api/health",
                "timeout": 30,
                "retries": 3
            },
            "rollback": {
                "enabled": True,
                "auto_rollback": True,
                "health_threshold": 0.8
            }
        }
        
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    config = json.load(f)
                return {**default_config, **config}
            except Exception as e:
                logger.warning(f"Failed to load deployment config, using defaults: {e}")
        
        return default_config
    
    def validate_dashboard_component(self) -> bool:
        """Validate dashboard component exists and is properly structured"""
        if not self.dashboard_dir.exists():
            logger.error(f"Dashboard component not found: {self.dashboard_dir}")
            return False
        
        try:
            content = self.dashboard_dir.read_text(encoding='utf-8')
            
            # Check for essential Vue component structure
            required_elements = [
                "<template>",
                "<script setup>",
                "export default",
                "PerformanceDashboard"
            ]
            
            for element in required_elements:
                if element not in content:
                    logger.error(f"Missing required element: {element}")
                    return False
            
            # Check for WebSocket connection
            if "WebSocket" not in content:
                logger.warning("WebSocket connection not found in dashboard")
            
            # Check for Chart.js usage
            if "Chart" not in content:
                logger.warning("Chart.js not found in dashboard")
            
            logger.info("Dashboard component validation passed")
            return True
            
        except Exception as e:
            logger.error(f"Failed to validate dashboard component: {e}")
            return False
    
    def build_dashboard(self, environment: str = "production") -> bool:
        """Build dashboard for deployment"""
        try:
            config = self.deploy_config[environment]
            build_command = config["build_command"]
            
            logger.info(f"Building dashboard for {environment}...")
            
            # Set environment variables
            env = os.environ.copy()
            env["NODE_ENV"] = environment
            env["VITE_DASHBOARD_ENV"] = environment
            
            # Run build command
            result = subprocess.run(
                build_command.split(),
                cwd=self.project_root,
                capture_output=True,
                text=True,
                env=env,
                timeout=300  # 5 minutes timeout
            )
            
            if result.returncode != 0:
                logger.error(f"Build failed: {result.stderr}")
                return False
            
            logger.info("Dashboard build completed successfully")
            return True
            
        except subprocess.TimeoutExpired:
            logger.error("Build timed out")
            return False
        except Exception as e:
            logger.error(f"Build failed: {e}")
            return False
    
    def deploy_to_environment(self, environment: str = "production") -> bool:
        """Deploy dashboard to specified environment"""
        try:
            config = self.deploy_config[environment]
            
            if not config.get("enabled", False):
                logger.info(f"Deployment to {environment} is disabled")
                return True
            
            deploy_command = config["deploy_command"]
            domain = config["domain"]
            
            logger.info(f"Deploying dashboard to {environment} ({domain})...")
            
            # Run deployment command
            result = subprocess.run(
                deploy_command.split(),
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=600  # 10 minutes timeout
            )
            
            if result.returncode != 0:
                logger.error(f"Deployment failed: {result.stderr}")
                return False
            
            # Extract deployment URL from output
            deployment_url = self.extract_deployment_url(result.stdout, domain)
            if deployment_url:
                logger.info(f"Dashboard deployed to: {deployment_url}")
                return True
            else:
                logger.warning("Could not extract deployment URL")
                return True  # Still consider successful if command ran
            
        except subprocess.TimeoutExpired:
            logger.error("Deployment timed out")
            return False
        except Exception as e:
            logger.error(f"Deployment failed: {e}")
            return False
    
    def extract_deployment_url(self, output: str, expected_domain: str) -> Optional[str]:
        """Extract deployment URL from command output"""
        try:
            # Look for URLs in output
            import re
            
            # Pattern to match URLs
            url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
            urls = re.findall(url_pattern, output)
            
            # Return first URL that contains expected domain
            for url in urls:
                if expected_domain in url:
                    return url
            
            # Return first URL if no domain match
            if urls:
                return urls[0]
            
            return None
            
        except Exception:
            return None
    
    def run_health_checks(self, deployment_url: str) -> bool:
        """Run health checks on deployed dashboard"""
        try:
            health_config = self.deploy_config["health_checks"]
            
            if not health_config.get("enabled", False):
                logger.info("Health checks disabled")
                return True
            
            endpoint = health_config["endpoint"]
            timeout = health_config["timeout"]
            retries = health_config["retries"]
            
            health_url = f"{deployment_url.rstrip('/')}{endpoint}"
            
            logger.info(f"Running health checks on {health_url}...")
            
            import requests
            
            for attempt in range(retries):
                try:
                    response = requests.get(health_url, timeout=timeout)
                    
                    if response.status_code == 200:
                        logger.info("Health check passed")
                        return True
                    else:
                        logger.warning(f"Health check failed (attempt {attempt + 1}): {response.status_code}")
                        
                except requests.RequestException as e:
                    logger.warning(f"Health check error (attempt {attempt + 1}): {e}")
                
                if attempt < retries - 1:
                    import time
                    time.sleep(5)  # Wait before retry
            
            logger.error("Health checks failed after all retries")
            return False
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    def setup_monitoring(self, deployment_url: str) -> bool:
        """Set up monitoring for deployed dashboard"""
        try:
            logger.info("Setting up monitoring for dashboard...")
            
            # Create monitoring configuration
            monitoring_config = {
                "dashboard_url": deployment_url,
                "deployment_time": datetime.now().isoformat(),
                "health_checks": {
                    "enabled": True,
                    "interval": 300,  # 5 minutes
                    "endpoint": "/api/health"
                },
                "alerts": {
                    "enabled": True,
                    "thresholds": {
                        "response_time": 5000,  # 5 seconds
                        "error_rate": 0.05      # 5%
                    }
                }
            }
            
            # Save monitoring config
            monitoring_file = self.project_root / ".agent" / "config" / "dashboard_monitoring.json"
            monitoring_file.parent.mkdir(exist_ok=True)
            
            with open(monitoring_file, 'w') as f:
                json.dump(monitoring_config, f, indent=2)
            
            logger.info("Monitoring configuration saved")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup monitoring: {e}")
            return False
    
    def rollback_deployment(self, environment: str = "production") -> bool:
        """Rollback deployment if needed"""
        try:
            logger.info(f"Rolling back {environment} deployment...")
            
            # Get previous deployment from Vercel
            result = subprocess.run(
                ["vercel", "list", "--limit", "2"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode != 0:
                logger.error("Failed to get deployment list")
                return False
            
            # Parse deployment list and rollback to previous
            deployments = result.stdout.strip().split('\n')
            if len(deployments) >= 2:
                previous_deployment = deployments[1].split()[0]  # Get deployment ID
                
                rollback_result = subprocess.run(
                    ["vercel", "promote", previous_deployment, "--to", environment],
                    cwd=self.project_root,
                    capture_output=True,
                    text=True,
                    timeout=300
                )
                
                if rollback_result.returncode == 0:
                    logger.info(f"Rollback to {previous_deployment} completed")
                    return True
                else:
                    logger.error(f"Rollback failed: {rollback_result.stderr}")
                    return False
            else:
                logger.error("No previous deployment found for rollback")
                return False
                
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            return False
    
    def deploy_dashboard(self, environment: str = "production", auto_rollback: bool = True) -> bool:
        """Complete dashboard deployment process"""
        logger.info(f"Starting dashboard deployment to {environment}...")
        
        # Step 1: Validate dashboard component
        if not self.validate_dashboard_component():
            logger.error("Dashboard validation failed")
            return False
        
        # Step 2: Build dashboard
        if not self.build_dashboard(environment):
            logger.error("Dashboard build failed")
            return False
        
        # Step 3: Deploy to environment
        if not self.deploy_to_environment(environment):
            logger.error("Dashboard deployment failed")
            return False
        
        # Step 4: Get deployment URL
        deployment_url = f"https://{self.deploy_config[environment]['domain']}"
        
        # Step 5: Run health checks
        health_passed = self.run_health_checks(deployment_url)
        
        if not health_passed and auto_rollback:
            logger.warning("Health checks failed, initiating rollback...")
            if self.rollback_deployment(environment):
                logger.info("Rollback completed successfully")
            else:
                logger.error("Rollback failed")
            return False
        
        # Step 6: Setup monitoring
        if not self.setup_monitoring(deployment_url):
            logger.warning("Monitoring setup failed, but deployment succeeded")
        
        logger.info(f"Dashboard deployment to {environment} completed successfully")
        logger.info(f"Dashboard URL: {deployment_url}")
        
        return True

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Deploy Performance Dashboard")
    parser.add_argument("project_root", nargs="?", default=".", help="Project root directory")
    parser.add_argument("--environment", choices=["production", "staging"], default="production", 
                       help="Deployment environment")
    parser.add_argument("--no-rollback", action="store_true", help="Disable automatic rollback")
    
    args = parser.parse_args()
    
    deployment = DashboardDeployment(args.project_root)
    
    print(f"🚀 Starting Dashboard Deployment to {args.environment}...")
    
    success = deployment.deploy_dashboard(
        environment=args.environment,
        auto_rollback=not args.no_rollback
    )
    
    if success:
        print(f"✅ Dashboard deployed successfully to {args.environment}")
        sys.exit(0)
    else:
        print(f"❌ Dashboard deployment to {args.environment} failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
