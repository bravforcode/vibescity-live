const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../src/components/dashboard/OwnerDashboard.vue');
let content = fs.readFileSync(targetFile, 'utf8');

const replacements = [
  ['rgba(245 158 11 / 0.55)', 'rgba(139, 92, 246, 0.4)'],
  ['rgba(20 184 166 / 0.4)', 'rgba(59, 130, 246, 0.4)'],
  ['rgba(244 63 94 / 0.25)', 'rgba(99, 102, 241, 0.3)'],
  ['rgba(245 158 11 / 0.06)', 'rgba(139, 92, 246, 0.06)'],
  ['rgba(20 184 166 / 0.06)', 'rgba(59, 130, 246, 0.06)'],
  ['rgba(251 191 36 / 0.85)', 'rgba(167, 139, 250, 0.85)'],
  ['rgba(251 191 36 / 0.8)', 'rgba(167, 139, 250, 0.8)'],
  ['rgba(251 191 36 / 0.45)', 'rgba(139, 92, 246, 0.45)'],
  ['rgba(245 158 11 / 0.15)', 'rgba(139, 92, 246, 0.15)'],
  ['linear-gradient(90deg, #8b5cf6, #14b8a6)', 'linear-gradient(90deg, #8b5cf6, #3b82f6)'],
  ['rgba(251 191 36 / 0.6)', 'rgba(139, 92, 246, 0.6)'],
  ['rgba(245 158 11 / 0.12)', 'rgba(139, 92, 246, 0.12)'],
  ['rgba(245 158 11 / 0.3)', 'rgba(139, 92, 246, 0.3)'],
  ['linear-gradient(90deg, #8b5cf6, #6366f1)', 'linear-gradient(90deg, #8b5cf6, #3b82f6)'],
  ['rgba(251 191 36 / 0.5)', 'rgba(139, 92, 246, 0.5)'],
  ['<button class="od-chip od-chip--exit" @click="safeExit">Exit</button>', '<button class="od-btn od-btn--exit" @click="safeExit">Exit Dashboard</button>'],
  ['.od-chip--exit {\n  border-color: rgba(255 255 255 / 0.1);\n  color: rgba(255 255 255 / 0.45);\n}', '.od-btn--exit {\n  border-color: rgba(239, 68, 68, 0.4);\n  background: rgba(239, 68, 68, 0.12);\n  color: #fca5a5;\n  min-height: 44px;\n  padding: 0 16px;\n  border-radius: 10px;\n  border-width: 1px;\n  border-style: solid;\n  font-weight: 900;\n  margin-left: auto;\n  cursor: pointer;\n  transition: all 0.2s;\n}\n.od-btn--exit:hover {\n  background: rgba(239, 68, 68, 0.2);\n  color: #fef2f2;\n}'],
];

for (const [search, replace] of replacements) {
  content = content.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
}

// Add a specific fix if .od-chip--exit replacement didn't work exactly
if (!content.includes('.od-btn--exit')) {
    content = content.replace(/\.od-chip--exit[\s\S]*?\}/, '.od-btn--exit {\n  border-color: rgba(239, 68, 68, 0.4);\n  background: rgba(239, 68, 68, 0.12);\n  color: #fca5a5;\n  min-height: 44px;\n  padding: 0 16px;\n  border-radius: 10px;\n  border-width: 1px;\n  border-style: solid;\n  font-weight: 900;\n  margin-left: auto;\n  cursor: pointer;\n  transition: all 0.2s;\n}\n.od-btn--exit:hover {\n  background: rgba(239, 68, 68, 0.2);\n  color: #fef2f2;\n}');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Update Complete');
