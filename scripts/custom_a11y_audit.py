import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def audit_a11y():
    issues = {
        "button_missing_aria": [],
        "img_missing_alt": [],
        "input_missing_id": []
    }

    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Find <button> ... </button>
            # Roughly check if they have text or aria-label
            buttons = re.finditer(r'<button\b([^>]*)>(.*?)</button>', content, re.DOTALL | re.IGNORECASE)
            for m in buttons:
                attrs = m.group(1)
                inner = m.group(2).strip()
                
                has_aria = 'aria-label' in attrs
                # If inner is just an SVG, icon, or empty, it needs aria-label
                is_icon_only = inner == '' or re.fullmatch(r'<(svg|i|span)\b[^>]*>.*?</\1>', inner, re.DOTALL | re.IGNORECASE)
                
                if is_icon_only and not has_aria:
                    # Also check if maybe there's an aria-labelledby or title
                    if 'aria-labelledby' not in attrs and 'title' not in attrs:
                        issues["button_missing_aria"].append(f"{file_path.relative_to(SRC_DIR)}: {m.group(0)[:50]}")

            # Find <img>
            imgs = re.finditer(r'<img\b([^>]*)>', content, re.IGNORECASE)
            for m in imgs:
                attrs = m.group(1)
                if 'alt=' not in attrs and ':alt=' not in attrs:
                    issues["img_missing_alt"].append(f"{file_path.relative_to(SRC_DIR)}: {m.group(0)[:50]}")
                    
            # Find <input>
            inputs = re.finditer(r'<input\b([^>]*)>', content, re.IGNORECASE)
            for m in inputs:
                attrs = m.group(1)
                # Ignore hidden inputs or submits
                if 'type="hidden"' in attrs or 'type="submit"' in attrs:
                    continue
                if 'id=' not in attrs and ':id=' not in attrs and 'aria-label' not in attrs:
                    issues["input_missing_id"].append(f"{file_path.relative_to(SRC_DIR)}: {m.group(0)[:50]}")

        except Exception as e:
            pass
            
    for k, v in issues.items():
        print(f"\n--- {k.upper()} ({len(v)} occurrences) ---")
        for i in v[:10]: # Print top 10
            print(f"  {i}")

if __name__ == "__main__":
    audit_a11y()
