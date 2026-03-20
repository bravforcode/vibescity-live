import os
import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def fix_transition_all(content):
    # Replace `transition-all` with simply `transition` (which covers colors/opacity/shadow)
    # Be careful not to replace instances that are part of another word.
    return re.sub(r'\btransition-all\b', 'transition', content)

def fix_outline_none(content):
    # If the file contains `outline-none` but NOT `focus-visible:ring-`, we want to add focus visible styles.
    # However, some places might already have focus-visible:ring. A safer approach:
    # First replace `focus-visible:outline-none` to `TEMPORARY_OUTLINE_NONE`
    content = content.replace('focus-visible:outline-none', 'TEMPORARY_OUTLINE_NONE')
    
    # Now replace standalone `outline-none`
    content = re.sub(r'\boutline-none\b', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50', content)
    
    # Restore the temporary ones
    content = content.replace('TEMPORARY_OUTLINE_NONE', 'focus-visible:outline-none')
    
    return content

def process_files():
    total_files_modified = 0
    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            original_content = content
            
            content = fix_transition_all(content)
            content = fix_outline_none(content)
            
            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Fixed: {file_path.relative_to(SRC_DIR)}")
                total_files_modified += 1
        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    print(f"\nTotal files modified: {total_files_modified}")

if __name__ == "__main__":
    process_files()
