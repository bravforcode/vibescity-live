import re
from pathlib import Path

SRC_DIR = Path("c:/vibecity.live/src")

def extract_and_fix():
    for file_path in SRC_DIR.rglob("*.vue"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content
            
            # replace confirm("text") -> confirm(t("key")) if in script setup
            # We don't have access to translation keys easily, so let's just make it confirm(i18n.global.t('auto.confirm_action'))
            # Wait, if we use i18n.global.t, we need to import i18n
            
            # Since there's only 2 confirm calls, we'll patch them explicitly if found
            if "Reveal sensitive financial amount on this screen?" in content:
                content = content.replace(
                    'confirm("Reveal sensitive financial amount on this screen?")',
                    'confirm(i18n.global.t("admin.reveal_sensitive_data", "Reveal sensitive financial amount on this screen?"))'
                )
                if 'import i18n from' not in content:
                    content = content.replace('<script setup>', '<script setup>\nimport i18n from "@/i18n.js";')

            if "This will trigger the media scraper edge function" in content:
                content = content.replace(
                    'confirm(\n\t\t\t"This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?",\n\t\t)',
                    'confirm(i18n.global.t("admin.trigger_scraper", "This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?"))'
                ).replace(
                    'confirm(\n\t\t\t"This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?"\n\t\t)',
                    'confirm(i18n.global.t("admin.trigger_scraper", "This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?"))'
                ).replace(
                    'confirm("This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?")',
                    'confirm(i18n.global.t("admin.trigger_scraper", "This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?"))'
                )

            if content != original:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                    
        except Exception as e:
            pass

    # Now for JS files throwing errors:
    for file_path in SRC_DIR.rglob("*.js"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            original = content
            
            # throw new Error("Partner API endpoint not found. Deploy backend with /api/v1/partner routes."); =>
            if "Partner API endpoint not found." in content:
                content = content.replace(
                    'throw new Error("Partner API endpoint not found. Deploy backend with /api/v1/partner routes.");',
                    'throw new Error("ERR_PARTNER_API_NOT_FOUND");'
                )
            if "Partner subscription is required before this action can be used." in content:
                content = content.replace(
                    'throw new Error("Partner subscription is required before this action can be used.");',
                    'throw new Error("ERR_PARTNER_SUBSCRIPTION_REQUIRED");'
                )
            if "Missing required env vars" in content:
                content = re.sub(
                    r'throw new Error\(`Missing required env vars: \$\{missing\}\. Check your \.env file\.(.*?)\`\);',
                    r'throw new Error(`ERR_MISSING_ENV_VARS: ${missing}`);',
                    content
                )
            if "points to localhost in production" in content:
                content = re.sub(
                    r'throw new Error\(`\$\{name\} points to localhost in production\. Configure a public endpoint\.(.*?)\`\);',
                    r'throw new Error(`ERR_LOCALHOST_IN_PROD: ${name}`);',
                    content
                )
                content = re.sub(
                    r'console\.error\(\n?\s*"VITE_SUPABASE_EDGE_URL points to localhost in production\."\n?\s*\);?',
                    r'console.error("ERR_LOCALHOST_EDGE_URL_IN_PROD");',
                    content
                )
                content = re.sub(
                    r'console\.warn\(\n?\s*"VITE_SUPABASE_EDGE_URL points to localhost in production\."\n?\s*\);?',
                    r'console.warn("ERR_LOCALHOST_EDGE_URL_IN_PROD");',
                    content
                )

            if content != original:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                    
        except Exception as e:
            pass

if __name__ == "__main__":
    extract_and_fix()
