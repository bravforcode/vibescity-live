#!/usr/bin/env python3
"""
SEO Checker - Search Engine Optimization Audit
Checks HTML/JSX/TSX pages for SEO best practices.

PURPOSE:
    - Verify meta tags, titles, descriptions
    - Check Open Graph tags for social sharing
    - Validate heading hierarchy
    - Check image accessibility (alt attributes)

WHAT IT CHECKS:
    - HTML files (actual web pages)
    - JSX/TSX files (React page components)
    - Only files that are likely PUBLIC pages

Usage:
    python seo_checker.py <project_path>
"""
import sys
import json
import re
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except:
    pass


# Directories to skip
SKIP_DIRS = {
    'node_modules', '.next', 'dist', 'build', '.git', '.github',
    '__pycache__', '.vscode', '.idea', 'coverage', 'test', 'tests',
    '__tests__', 'spec', 'docs', 'documentation', 'examples',
    '.venv', 'venv', '.vercel', '.vercel_python_packages',
    '.agent', '.agents', 'backend', 'scripts', 'supabase'
}

# Files to skip (not pages)
SKIP_PATTERNS = [
    'config', 'setup', 'util', 'helper', 'hook', 'context', 'store',
    'service', 'api', 'lib', 'constant', 'type', 'interface', 'mock',
    '.test.', '.spec.', '_test.', '_spec.'
]

AUXILIARY_HTML_FILES = {'offline.html', 'readme.html'}


def is_page_file(file_path: Path) -> bool:
    """Check if this file is likely a public-facing page."""
    name = file_path.name.lower()
    stem = file_path.stem.lower()
    
    # Skip utility/config files
    if any(skip in name for skip in SKIP_PATTERNS):
        return False
    
    # Check path - pages in specific directories are likely pages
    parts = [p.lower() for p in file_path.parts]
    page_dirs = ['pages', 'app', 'routes', 'views', 'screens']
    
    if any(d in parts for d in page_dirs):
        return True
    
    # Filename indicators for pages
    page_names = ['page', 'index', 'home', 'about', 'contact', 'blog', 
                  'post', 'article', 'product', 'landing', 'layout']
    
    if any(p in stem for p in page_names):
        return True
    
    # HTML files are usually pages
    if file_path.suffix.lower() in ['.html', '.htm']:
        return True
    
    return False


def find_pages(project_path: Path) -> list:
    """Find page files to check."""
    patterns = ['**/*.html', '**/*.htm', '**/*.jsx', '**/*.tsx', '**/*.vue']
    candidate_roots = [
        project_path / 'src',
        project_path / 'public',
        project_path / 'pages',
        project_path / 'app',
        project_path / 'routes',
        project_path / 'views',
    ]

    files: list[Path] = []
    seen: set[Path] = set()

    root_index = project_path / 'index.html'
    if root_index.exists():
        files.append(root_index)
        seen.add(root_index.resolve())

    for root in candidate_roots:
        if not root.exists():
            continue
        for pattern in patterns:
            for f in root.glob(pattern):
                if any(skip in f.parts for skip in SKIP_DIRS):
                    continue
                if f.name.lower() in AUXILIARY_HTML_FILES:
                    continue
                if not is_page_file(f):
                    continue
                resolved = f.resolve()
                if resolved in seen:
                    continue
                files.append(f)
                seen.add(resolved)

    return files[:50]  # Limit to 50 files


def check_page(file_path: Path) -> dict:
    """Check a single page for SEO issues."""
    issues = []
    
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception as e:
        return {"file": str(file_path.name), "issues": [f"Error: {e}"]}
    
    content_lower = content.lower()
    suffix = file_path.suffix.lower()
    has_head_api = (
        bool(re.search(r"\busehead\s*\(", content, re.I))
        or bool(re.search(r"\bdefinepagemeta\s*\(", content, re.I))
        or "export const metadata" in content_lower
        or bool(re.search(r"<head[\s>]", content_lower))
    )
    has_noindex_robots = bool(
        re.search(r'robots["\']\s*,?\s*content\s*:\s*["\']noindex', content, re.I)
        or re.search(r'name=["\']robots["\'][^>]*content=["\']noindex', content, re.I)
    )
    requires_head_metadata = suffix in {".html", ".htm"} or has_head_api
    if has_noindex_robots:
        requires_head_metadata = False
    
    # 1. Title tag
    has_title = (
        "<title" in content_lower
        or "title=" in content
        or bool(re.search(r"\btitle\s*:", content))
    )
    if not has_title and requires_head_metadata:
        issues.append("Missing <title> tag")
    
    # 2. Meta description
    has_description = (
        'name="description"' in content_lower
        or "name='description'" in content_lower
        or bool(re.search(r"name\s*:\s*['\"]description['\"]", content, re.I))
    )
    if not has_description and requires_head_metadata:
        issues.append("Missing meta description")
    
    # 3. Open Graph tags
    has_og = "og:" in content_lower or bool(
        re.search(r"property\s*:\s*['\"]og:", content, re.I)
    )
    if not has_og and requires_head_metadata:
        issues.append("Missing Open Graph tags")
    
    # 4. Heading hierarchy - multiple H1s
    h1_matches = re.findall(r'<h1[^>]*>', content, re.I)
    if len(h1_matches) > 1:
        issues.append(f"Multiple H1 tags ({len(h1_matches)})")
    
    # 5. Images without alt
    img_pattern = r'<img[^>]+>'
    imgs = re.findall(img_pattern, content, re.I)
    for img in imgs:
        if 'alt=' not in img.lower():
            issues.append("Image missing alt attribute")
            break
        if 'alt=""' in img or "alt=''" in img:
            issues.append("Image has empty alt attribute")
            break
    
    # 6. Check for canonical link (nice to have)
    # has_canonical = 'rel="canonical"' in content.lower()
    
    return {
        "file": str(file_path.name),
        "issues": issues
    }


def main():
    project_path = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    
    print(f"\n{'='*60}")
    print("  SEO CHECKER - Search Engine Optimization Audit")
    print(f"{'='*60}")
    print(f"Project: {project_path}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-"*60)
    
    # Find pages
    pages = find_pages(project_path)
    
    if not pages:
        print("\n[!] No page files found.")
        print("    Looking for: HTML, JSX, TSX in pages/app/routes directories")
        output = {"script": "seo_checker", "files_checked": 0, "passed": True}
        print("\n" + json.dumps(output, indent=2))
        sys.exit(0)
    
    print(f"Found {len(pages)} page files to analyze\n")
    
    # Check each page
    all_issues = []
    for f in pages:
        result = check_page(f)
        if result["issues"]:
            all_issues.append(result)
    
    # Summary
    print("=" * 60)
    print("SEO ANALYSIS RESULTS")
    print("=" * 60)
    
    if all_issues:
        # Group by issue type
        issue_counts = {}
        for item in all_issues:
            for issue in item["issues"]:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1
        
        print("\nIssue Summary:")
        for issue, count in sorted(issue_counts.items(), key=lambda x: -x[1]):
            print(f"  [{count}] {issue}")
        
        print(f"\nAffected files ({len(all_issues)}):")
        for item in all_issues[:5]:
            print(f"  - {item['file']}")
        if len(all_issues) > 5:
            print(f"  ... and {len(all_issues) - 5} more")
    else:
        print("\n[OK] No SEO issues found!")
    
    total_issues = sum(len(item["issues"]) for item in all_issues)
    passed = total_issues == 0
    
    output = {
        "script": "seo_checker",
        "project": str(project_path),
        "files_checked": len(pages),
        "files_with_issues": len(all_issues),
        "issues_found": total_issues,
        "passed": passed
    }
    
    print("\n" + json.dumps(output, indent=2))
    
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
