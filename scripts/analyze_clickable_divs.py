import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def find_clickable_divs():
    count = 0
    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find <div ... @click ... > or <span ... @click ... >
            matches = re.finditer(r'<(div|span)[^>]*@click[^>]*>', content)
            file_matches = list(matches)
            if file_matches:
                print(f"{file_path.relative_to(SRC_DIR)}: {len(file_matches)} matches")
                count += len(file_matches)
                
        except Exception as e:
            print(f"Error {file_path}: {e}")
            
    print(f"Total clickable divs/spans: {count}")

if __name__ == "__main__":
    find_clickable_divs()
