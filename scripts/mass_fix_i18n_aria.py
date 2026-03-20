import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def fix_i18n_aria():
    files_changed = 0

    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content
            
            # Replace aria-label="Input xxx" with :aria-label="$t('a11y.input_field')"
            # or something similar.
            def process_aria(match):
                attr = match.group(1)
                val = match.group(2)
                
                # Check if it starts with "Input "
                if val.startswith("Input "):
                    # change to :aria-label="$t('a11y.input', 'Input')"
                    # Actually standard i18n is $t('...')
                    return ':aria-label="$t(\'a11y.input_field\')"'
                
                if val == "Action":
                    return ':aria-label="$t(\'a11y.action\')"'
                    
                return match.group(0)

            # Match aria-label="xxx"
            content = re.sub(r'(aria-label)="([^"]+)"', process_aria, content)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_changed += 1
                
        except Exception as e:
            pass
            
    print(f"Patched ARIA i18n issues across {files_changed} files.")

if __name__ == "__main__":
    fix_i18n_aria()
