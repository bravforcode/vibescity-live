import re
import traceback

try:
    with open('src/components/ui/SettingsPanel.vue', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Replace the list item container
    content = re.sub(
        r'<div\s*class="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"\s*>',
        r'<div class="flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors duration-300">',
        content
    )

    # 2. Replace the Icon Containers
    icon_pattern = r'<div class="flex items-center gap-3">\s*<([A-Z][a-zA-Z0-9]+)\s+class="w-5 h-5 text-([a-z]+)-([0-9]+)"\s*/>'
    def icon_repl(m):
        icon = m.group(1)
        color = m.group(2)
        weight = m.group(3)
        return f'''<div class="flex items-center gap-4">
                <div class="flex items-center justify-center w-10 h-10 rounded-2xl bg-{color}-500/10 border border-{color}-500/20 shadow-inner">
                  <{icon} class="w-5 h-5 text-{color}-{weight}" />
                </div>'''
    content = re.sub(icon_pattern, icon_repl, content)

    # 3. Replace toggle buttons
    btn_pattern = r"""<button\s+@click="([^"]+)"\s+:class="\s*\[\s*'w-12 h-7 rounded-full transition-colors relative',\s*([^?]+)\s*\?\s*'bg-blue-500'\s*:\s*'bg-white/20',\s*\]\s*"\s*>\s*<div\s+:class="\s*\[\s*'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm',\s*([^?]+)\s*\?\s*'left-6'\s*:\s*'left-1',\s*\]\s*"\s*>\s*</div>\s*</button>"""
    def btn_repl(m):
        click_handler = m.group(1)
        condition1 = m.group(2).strip()
        condition2 = m.group(3).strip()
        return f"""<button
                @click="{click_handler}"
                :class="[
                  'w-12 h-6 rounded-full transition-all duration-300 relative shadow-inner',
                  {condition1} ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-zinc-700'
                ]"
              >
                <div
                  :class="[
                    'w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 shadow-sm',
                    {condition2} ? 'left-[26px]' : 'left-1'
                  ]"
                ></div>
              </button>"""
    content = re.sub(btn_pattern, btn_repl, content)

    # 4. Replace the text-sm titles
    content = re.sub(
        r'<div class="text-sm font-bold text-white">',
        r'<div class="text-sm font-bold text-white tracking-wide">',
        content
    )

    # 5. Replace the text-xs subtitles
    content = re.sub(
        r'<div class="text-xs text-white/50">',
        r'<div class="text-[11px] text-zinc-400">',
        content
    )

    # 6. Apply generic glassmorphism to category headers
    category_btn_pattern = r'<button\s+@click="([^"]+)"\s+class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"\s*>'
    def cat_btn_repl(m):
        return f'''<div class="relative group">
          <div class="absolute -inset-1 bg-gradient-to-r from-fuchsia-500/10 to-transparent blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
          <button
            @click="{m.group(1)}"
            class="relative w-full flex items-center justify-between p-4 rounded-3xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-all duration-300"
          >'''
    content = re.sub(category_btn_pattern, cat_btn_repl, content)

    # 7. Close the category button wrappers cleanly
    content = content.replace(
        '''        </div>
        </div>

        <!-- 🔊 Sound -->''',
        '''        </div>
        </div>

        <!-- 🔊 Sound -->'''
    )  # just to note, buttons have </button> so we might need to add </div> after them. Wait, actually I wrapped the button in a <div class="relative group"> so it needs a closing </div>.
    # Ah, let's fix the closing </div> for category buttons.
    # Pattern: </button>\n\n          <div v-show="
    # Replace with: </button></div>\n\n          <div v-show="
    content = re.sub(r'(</button>)\s*\n(\s*)<div v-show="', r'\1\n\2</div>\n\2<div v-show="', content)

    with open('src/components/ui/SettingsPanel.vue', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SettingsPanel upgraded successfully!")
except Exception as e:
    print(f"Error: {e}")
    traceback.print_exc()
