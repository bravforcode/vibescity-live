import sys
from pathlib import Path

from PIL import Image


def convert_images(directory, target_formats=None):
    """
    Recursively find all images in a directory and convert them to target formats.
    """
    if target_formats is None:
        target_formats = ['webp', 'avif']

    extensions = ['.jpg', '.jpeg', '.png']
    path = Path(directory)
    
    if not path.exists():
        print(f"Directory {directory} does not exist.")
        return

    print(f"Starting image conversion in {directory}...")
    
    count = 0
    for file_path in path.rglob('*'):
        if file_path.suffix.lower() in extensions:
            try:
                with Image.open(file_path) as img:
                    for fmt in target_formats:
                        target_path = file_path.with_suffix(f'.{fmt}')
                        if not target_path.exists():
                            # AVIF requires pillow-avif-plugin, fallback to webp if not available
                            try:
                                img.save(target_path, fmt.upper(), quality=80)
                                print(f"Converted: {file_path.name} -> {target_path.name}")
                                count += 1
                            except ValueError:
                                if fmt == 'avif':
                                    print(f"Skipping AVIF for {file_path.name} (pillow-avif-plugin missing)")
                                else:
                                    raise
            except Exception as e:
                print(f"Error converting {file_path}: {e}")

    print(f"Conversion complete. Total files created: {count}")

if __name__ == "__main__":
    # Default to public/images if no path provided
    target_dir = sys.argv[1] if len(sys.argv) > 1 else 'public/images'
    convert_images(target_dir)
