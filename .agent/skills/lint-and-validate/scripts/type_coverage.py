#!/usr/bin/env python3
"""
Type Coverage Checker - Measures TypeScript/Python type coverage.
Identifies untyped functions, any usage, and type safety issues.
"""
import sys
import re
import subprocess
from pathlib import Path

# Fix Windows console encoding for Unicode output
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass  # Python < 3.7


SKIP_DIRS = {
    ".git",
    ".github",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".venv",
    ".vercel",
    ".vercel_python_packages",
    ".artifacts",
    ".agent",
    ".agents",
    ".localappdata",
    ".planning",
    ".trunk",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "reports",
    "storybook-static",
    "tmp",
    "venv",
}
TS_SOURCE_ROOTS = ("src",)
PY_SOURCE_ROOTS = ("api", "backend")


def iter_source_files(project_path: Path, suffixes: tuple[str, ...], roots: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()

    for root_name in roots:
        root_path = project_path / root_name
        if not root_path.exists():
            continue
        for file_path in root_path.rglob("*"):
            if file_path.suffix not in suffixes:
                continue
            if any(part in SKIP_DIRS for part in file_path.parts):
                continue
            if file_path in seen:
                continue
            seen.add(file_path)
            files.append(file_path)

    return files


def run_local_tsc(project_path: Path) -> bool | None:
    local_tsc = project_path / "node_modules" / "typescript" / "lib" / "tsc.js"
    if not local_tsc.exists():
        return None

    try:
        proc = subprocess.run(
            ["node", str(local_tsc), "--noEmit"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        return proc.returncode == 0
    except Exception:
        return None

def check_typescript_coverage(project_path: Path) -> dict:
    """Check TypeScript type coverage."""
    issues = []
    passed = []
    stats = {'any_count': 0, 'untyped_functions': 0, 'total_functions': 0}
    
    ts_files = iter_source_files(project_path, (".ts", ".tsx"), TS_SOURCE_ROOTS)
    ts_files = [f for f in ts_files if ".d.ts" not in str(f)]
    
    if not ts_files:
        return {'type': 'typescript', 'files': 0, 'passed': [], 'issues': ["[!] No TypeScript files found"], 'stats': stats}
    
    for file_path in ts_files[:30]:  # Limit
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Count 'any' usage
            any_matches = re.findall(r':\s*any\b', content)
            stats['any_count'] += len(any_matches)
            
            # Find functions without return types
            # function name(params) { - no return type
            untyped = re.findall(r'function\s+\w+\s*\([^)]*\)\s*{', content)
            # Arrow functions without types: const fn = (x) => or (x) =>
            untyped += re.findall(r'=\s*\([^:)]*\)\s*=>', content)
            stats['untyped_functions'] += len(untyped)
            
            # Count typed functions
            typed = re.findall(r'function\s+\w+\s*\([^)]*\)\s*:\s*\w+', content)
            typed += re.findall(r':\s*\([^)]*\)\s*=>\s*\w+', content)
            stats['total_functions'] += len(typed) + len(untyped)
            
        except Exception:
            continue
    
    # Analyze results
    if stats['any_count'] == 0:
        passed.append("[OK] No 'any' types found")
    elif stats['any_count'] <= 5:
        issues.append(f"[!] {stats['any_count']} 'any' types found (acceptable)")
    else:
        issues.append(f"[X] {stats['any_count']} 'any' types found (too many)")
    
    tsc_passed = run_local_tsc(project_path)
    if tsc_passed:
        passed.append("[OK] TypeScript compiler passed (--noEmit)")

    if stats['total_functions'] > 0:
        typed_ratio = (stats['total_functions'] - stats['untyped_functions']) / stats['total_functions'] * 100
        if typed_ratio >= 80 or tsc_passed:
            passed.append(f"[OK] Type coverage: {typed_ratio:.0f}%")
        elif typed_ratio >= 50:
            issues.append(f"[!] Type coverage: {typed_ratio:.0f}% (improve)")
        else:
            issues.append(f"[X] Type coverage: {typed_ratio:.0f}% (too low)")
    
    passed.append(f"[OK] Analyzed {len(ts_files)} TypeScript files")
    
    return {'type': 'typescript', 'files': len(ts_files), 'passed': passed, 'issues': issues, 'stats': stats}

def check_python_coverage(project_path: Path) -> dict:
    """Check Python type hints coverage."""
    issues = []
    passed = []
    stats = {'untyped_functions': 0, 'typed_functions': 0, 'any_count': 0}
    
    py_files = iter_source_files(project_path, (".py",), PY_SOURCE_ROOTS)

    if not py_files:
        return {'type': 'python', 'files': 0, 'passed': [], 'issues': ["[!] No Python files found"], 'stats': stats}
    
    for file_path in py_files[:30]:  # Limit
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Count Any usage
            any_matches = re.findall(r':\s*Any\b', content)
            stats['any_count'] += len(any_matches)
            
            # Find functions with type hints
            typed_funcs = re.findall(r'def\s+\w+\s*\([^)]*:[^)]+\)', content)
            typed_funcs += re.findall(r'def\s+\w+\s*\([^)]*\)\s*->', content)
            stats['typed_functions'] += len(typed_funcs)
            
            # Find functions without type hints
            all_funcs = re.findall(r'def\s+\w+\s*\(', content)
            stats['untyped_functions'] += len(all_funcs) - len(typed_funcs)
            
        except Exception:
            continue
    
    total = stats['typed_functions'] + stats['untyped_functions']
    
    if total > 0:
        typed_ratio = stats['typed_functions'] / total * 100
        if typed_ratio >= 70:
            passed.append(f"[OK] Type hints coverage: {typed_ratio:.0f}%")
        elif typed_ratio >= 40:
            issues.append(f"[!] Type hints coverage: {typed_ratio:.0f}%")
        else:
            issues.append(f"[X] Type hints coverage: {typed_ratio:.0f}% (add type hints)")
    
    if stats['any_count'] == 0:
        passed.append("[OK] No 'Any' types found")
    elif stats['any_count'] <= 3:
        issues.append(f"[!] {stats['any_count']} 'Any' types found")
    else:
        issues.append(f"[X] {stats['any_count']} 'Any' types found")
    
    passed.append(f"[OK] Analyzed {len(py_files)} Python files")
    
    return {'type': 'python', 'files': len(py_files), 'passed': passed, 'issues': issues, 'stats': stats}

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    project_path = Path(target)
    
    print("\n" + "=" * 60)
    print("  TYPE COVERAGE CHECKER")
    print("=" * 60 + "\n")
    
    results = []
    
    # Check TypeScript
    ts_result = check_typescript_coverage(project_path)
    if ts_result['files'] > 0:
        results.append(ts_result)
    
    # Check Python
    py_result = check_python_coverage(project_path)
    if py_result['files'] > 0:
        results.append(py_result)
    
    if not results:
        print("[!] No TypeScript or Python files found.")
        sys.exit(0)
    
    # Print results
    critical_issues = 0
    for result in results:
        print(f"\n[{result['type'].upper()}]")
        print("-" * 40)
        for item in result['passed']:
            print(f"  {item}")
        for item in result['issues']:
            print(f"  {item}")
            if item.startswith("[X]"):
                critical_issues += 1
    
    print("\n" + "=" * 60)
    if critical_issues == 0:
        print("[OK] TYPE COVERAGE: ACCEPTABLE")
        sys.exit(0)
    else:
        print(f"[X] TYPE COVERAGE: {critical_issues} critical issues")
        sys.exit(1)

if __name__ == "__main__":
    main()
