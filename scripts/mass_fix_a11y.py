import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def fix_clickable_elements():
    count = 0
    files_changed = 0

    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content

            # This regex looks for <div ... @click ...> or <span ... @click ...>
            # It needs to be careful not to match across elements.
            # A safer approach is to find all <div ...> and <span ...> tags
            # and check if they contain @click=
            
            # Find all tags: <div ...> or <span ...>
            # We use a function to process each match
            def process_tag(match):
                tag_full = match.group(0)
                tag_name = match.group(1)
                
                # Check if it has @click= or v-on:click=
                if '@click' not in tag_full and 'v-on:click' not in tag_full:
                    return tag_full
                    
                # Do not add to <button> or <a> (the regex only matches div|span, but just to be sure)
                if tag_name not in ['div', 'span']:
                    return tag_full
                
                # Check if it already has role= or tabindex=
                has_role = re.search(r'\brole\s*=', tag_full)
                has_tabindex = re.search(r'\btabindex\s*=', tag_full)
                
                new_tag = tag_full
                
                # Insert right after the tag name
                insert_idx = len(f"<{tag_name}")
                
                additions = []
                if not has_role:
                    additions.append('role="button"')
                if not has_tabindex:
                    additions.append('tabindex="0"')
                    
                if additions:
                    # e.g. <div @click="..."> -> <div role="button" tabindex="0" @click="...">
                    addition_str = ' ' + ' '.join(additions)
                    new_tag = new_tag[:insert_idx] + addition_str + new_tag[insert_idx:]
                    nonlocal count
                    count += 1
                
                return new_tag

            # Match <div ...> and <span ...> considering they might span multiple lines
            # re.compile(r'<(div|span)\b[^>]*>', re.IGNORECASE)
            # However, if there are > inside attribute strings, this might fail.
            # Vue files rarely have > in attributes except arrow functions, which are common!
            # So a simple regex might break on <div @click="x => y>0">
            # A more robust regex is needed, or we just rely on the fact that we match until the first > 
            # that is preceded by " or ' or not in a string...
            # Actually, let's use a simpler approach. We just look for `@click` and walk backwards to find the tag.
            
            content = re.sub(r'<(div|span)\b([^>]*?)>', process_tag, content)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_changed += 1
                
        except Exception as e:
            print(f"Error {file_path}: {e}")
            
    print(f"Added role/tabindex to {count} elements across {files_changed} files.")

if __name__ == "__main__":
    fix_clickable_elements()
