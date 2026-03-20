import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def fix_deep_a11y():
    files_changed = 0

    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content

            # Fix <img> missing alt
            def process_img(match):
                tag_full = match.group(0)
                if 'alt=' not in tag_full and ':alt=' not in tag_full:
                    # Insert right after <img
                    insert_idx = len("<img")
                    return tag_full[:insert_idx] + ' alt=""' + tag_full[insert_idx:]
                return tag_full
            
            content = re.sub(r'<img\b([^>]*)>', process_img, content, flags=re.IGNORECASE)

            # Fix <button> missing aria-label when icon-only
            def process_btn(match):
                tag_full = match.group(0)
                attrs = match.group(1)
                inner = match.group(2).strip()
                
                has_aria = 'aria-label' in attrs or 'aria-labelledby' in attrs or 'title' in attrs
                is_icon_only = inner == '' or re.fullmatch(r'<(svg|i|span)\b[^>]*>.*?</\1>', inner, re.DOTALL | re.IGNORECASE)
                
                if is_icon_only and not has_aria:
                    insert_idx = len("<button")
                    return tag_full[:insert_idx] + ' aria-label="Action"' + tag_full[insert_idx:]
                return tag_full

            content = re.sub(r'<button\b([^>]*)>(.*?)</button>', process_btn, content, flags=re.DOTALL | re.IGNORECASE)

            # Fix <input> missing id/aria-label
            def process_input(match):
                tag_full = match.group(0)
                attrs = match.group(1)
                
                if 'type="hidden"' in attrs or 'type="submit"' in attrs:
                    return tag_full
                    
                if 'id=' not in attrs and ':id=' not in attrs and 'aria-label=' not in attrs and ':aria-label=' not in attrs:
                    # Try to extract v-model
                    vmodel_match = re.search(r'v-model(?:.[a-z]+)?="([^"]+)"', attrs)
                    label_name = "Input field"
                    if vmodel_match:
                        # Extract last part of v-model for better labeling
                        model_name = vmodel_match.group(1).split('.')[-1]
                        label_name = f"Input {model_name}"
                        
                    insert_idx = len("<input")
                    return tag_full[:insert_idx] + f' aria-label="{label_name}"' + tag_full[insert_idx:]
                return tag_full

            content = re.sub(r'<input\b([^>]*)>', process_input, content, flags=re.IGNORECASE)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_changed += 1
                
        except Exception as e:
            pass
            
    print(f"Patched deep accessibility issues across {files_changed} files.")

if __name__ == "__main__":
    fix_deep_a11y()
