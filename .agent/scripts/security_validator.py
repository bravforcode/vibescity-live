import os
import subprocess
import sys

def run_sast():
    print("🚀 [Enterprise Security] Starting SAST Scan...")
    
    # 1. Bandit for Python
    print("\n--- Running Bandit (Python Security) ---")
    try:
        subprocess.run(["bandit", "-r", "backend/app", "-ll"], check=True)
        print("✅ Bandit: No critical security issues found.")
    except subprocess.CalledProcessError:
        print("❌ Bandit: Security issues detected. Please review the output above.")
    except FileNotFoundError:
        print("⚠️ Bandit not installed. Skipping...")

    # 2. Semgrep for General Codebase
    print("\n--- Running Semgrep (General Security) ---")
    try:
        subprocess.run(["semgrep", "scan", "--config=auto", "backend", "src"], check=True)
        print("✅ Semgrep: Scan completed.")
    except subprocess.CalledProcessError:
        print("❌ Semgrep: Scan failed or found issues.")
    except FileNotFoundError:
        print("⚠️ Semgrep not installed. Skipping...")

    # 3. NPM Audit for Frontend
    print("\n--- Running NPM Audit (Frontend Dependencies) ---")
    try:
        subprocess.run(["npm", "audit", "--audit-level=high"], check=True)
        print("✅ NPM Audit: No high-risk vulnerabilities.")
    except subprocess.CalledProcessError:
        print("❌ NPM Audit: Vulnerabilities found.")

if __name__ == "__main__":
    run_sast()
