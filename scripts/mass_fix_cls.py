import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def fix_images():
    count = 0
    files_changed = 0

    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content

            def process_img(match):
                tag_full = match.group(0)
                
                # Check if it already has loading=
                if re.search(r'\bloading\s*=', tag_full):
                    return tag_full
                
                new_tag = tag_full
                
                # Insert right after <img
                insert_idx = len("<img")
                
                new_tag = new_tag[:insert_idx] + ' loading="lazy"' + new_tag[insert_idx:]
                nonlocal count
                count += 1
                
                return new_tag

            content = re.sub(r'<img\b([^>]*?)>', process_img, content, flags=re.IGNORECASE)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_changed += 1
                
        except Exception as e:
            print(f"Error {file_path}: {e}")
            
    print(f"Added loading='lazy' to {count} images across {files_changed} files.")

if __name__ == "__main__":
    fix_images()
