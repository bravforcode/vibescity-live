# i18n Hardcoded String Detection

Automatic detection system for hardcoded user-facing strings that should be localized via i18n.

## Overview

The detection system scans all Vue/JS/TS files in `src/` to identify:
- **Template literals** — Text between tags: `<button>Hardcoded</button>`
- **Attributes** — Unbound text attributes: `title="unbound"`, `placeholder="unbound"`
- **Error messages** — `throw new Error("message")`
- **Alert/confirm messages** — `alert("message")`, `confirm("message")`

### What Gets Ignored (Safe)
- Vue interpolations: `{{ variable }}`, `{{ t('key') }}`
- Vue directives: `v-if`, `v-show`, etc.
- URL paths: `/path`, `https://example.com`
- Color codes: `#fff`, `#0a1b2c`
- Numbers and punctuation only
- i18n function calls: `t('key')`, `i18n('key')`

---

## Quick Start

### 1. Run Detection (Any Time)
```bash
# Show violations
npm run ci:source-i18n

# With verbose output
I18N_VERBOSE=true npm run ci:source-i18n

# Generate JSON report
I18N_JSON_OUTPUT=violations.json npm run ci:source-i18n
```

### 2. Enable Pre-Commit Hook (Recommended)
Automatically detect violations before each commit:

```bash
node scripts/setup-i18n-hook.mjs
```

This creates `.git/hooks/pre-commit` that runs on every commit. It will fail if hardcoded strings are detected.

**To bypass** (for emergency commits):
```bash
git commit --no-verify
```

**To remove**:
```bash
node scripts/setup-i18n-hook.mjs --uninstall
```

### 3. Integrated in Check Script
The i18n detector runs as part of `npm run check`:

```bash
bun run check
```

This runs:
1. Biome check/format
2. i18n hardcoded detection

---

## Fixing Violations

### Step 1: Identify
```bash
I18N_JSON_OUTPUT=violations.json npm run ci:source-i18n
cat violations.json
```

### Step 2: Wrap in i18n

**Template Text:**
```vue
<!-- ❌ Before -->
<button>Save</button>

<!-- ✅ After -->
<button>{{ t('buttons.save') }}</button>
```

**Attributes:**
```vue
<!-- ❌ Before -->
<input placeholder="Search..." />

<!-- ✅ After -->
<input :placeholder="t('inputs.search_placeholder')" />
```

**Script (Error Messages):**
```js
// ❌ Before
throw new Error("User not found");

// ✅ After
const { t } = useI18n();
throw new Error(t('errors.user_not_found'));
```

### Step 3: Add to i18n Keys

**If adding to `src/i18n.js`:**
```js
const inlineMessages = {
  en: {
    buttons: { save: "Save" },
    inputs: { search_placeholder: "Search..." },
    errors: { user_not_found: "User not found" },
  },
  th: {
    buttons: { save: "บันทึก" },
    inputs: { search_placeholder: "ค้นหา..." },
    errors: { user_not_found: "ไม่พบผู้ใช้" },
  },
};
```

**If using JSON locale files** (`src/locales/en.json`):
```json
{
  "buttons": { "save": "Save" },
  "inputs": { "search_placeholder": "Search..." },
  "errors": { "user_not_found": "User not found" }
}
```

---

## STRICT Mode

Enforce zero hardcoded strings during CI/CD:

```bash
I18N_STRICT=true I18N_HARDCODED_MAX=0 npm run ci:source-i18n
```

Exit codes:
- `0` — No violations (or within threshold)
- `1` — STRICT mode enabled and violations exceed `MAX_HARDCODED`

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `I18N_STRICT` | `false` | Enable strict mode (fail if violations) |
| `I18N_HARDCODED_MAX` | `0` | Max allowed violations (0 = none) |
| `I18N_JSON_OUTPUT` | `` | Output JSON report to this file |
| `I18N_VERBOSE` | `false` | Show detailed scanning progress |

### Examples

**Development (warn only):**
```bash
npm run ci:source-i18n
```

**Strict mode (fail if violations):**
```bash
I18N_STRICT=true I18N_HARDCODED_MAX=0 npm run ci:source-i18n
```

**With report:**
```bash
I18N_JSON_OUTPUT=report.json I18N_VERBOSE=true npm run ci:source-i18n
```

---

## How It Works

### Detection Algorithm

1. **Glob scan** — Recursively find all `.vue`, `.js`, `.ts` files
2. **Template extraction** — Extract `<template>` and `<script>` blocks
3. **Heuristic matching** — Find text that looks like user-facing strings:
   - Contains letters (Latin or Thai)
   - Not a code identifier (camelCase, snake_case)
   - Not inside `{{ }}` interpolations
   - Not a URL, color, or number
4. **Pattern detection** — Extract from:
   - Text between tags: `>text<`
   - Attributes: `title=""`, `placeholder=""`, `alt=""`, `aria-label=""`
   - Error throws: `throw new Error("...")`
   - Alerts: `alert("...")`, `confirm("...")`
5. **Report** — Show violations grouped by file + type

### Files Excluded
- `src/i18n.js` (i18n config)
- `src/locales/**` (translation files)
- `**/*.spec.js`, `**/*.test.js` (tests)
- `**/*_old.vue` (archived)

---

## Integration with CI/CD

### GitHub Actions / Fly.io Deploy

Add to `.github/workflows/deploy.yml` or `fly.toml` pre-deploy checks:

```bash
I18N_STRICT=true I18N_HARDCODED_MAX=0 npm run ci:source-i18n
```

This ensures production deploys have zero hardcoded strings.

---

## Troubleshooting

### "Too many false positives"

The detector may flag code identifiers, special strings, or context-specific text. Review the JSON report:

```bash
I18N_JSON_OUTPUT=report.json npm run ci:source-i18n
cat report.json | jq '.details[].template[0]'
```

If a violation is safe to ignore, add it to `IGNORE_PATTERNS` in `scripts/ci/check-source-i18n-hardcoded.mjs`.

### "Hook not running"

1. Verify hook was installed:
   ```bash
   cat .git/hooks/pre-commit
   ```

2. Check executable permissions (Unix):
   ```bash
   ls -la .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

3. On Windows, ensure bash is in PATH (Git Bash, WSL, or MinGit)

### "Pre-commit hook failed"

Run the detector manually to see the violations:

```bash
I18N_JSON_OUTPUT=violations.json I18N_VERBOSE=true npm run ci:source-i18n
```

Then fix the strings (see "Fixing Violations" above).

---

## Best Practices

1. **Always wrap user-facing text** in templates and scripts with `t('namespace.key')`
2. **Namespace keys hierarchically** — group by feature/section (e.g., `buttons.*`, `errors.*`, `labels.*`)
3. **Keep inline messages** in `src/i18n.js` for common UI strings
4. **Use JSON locale files** for larger translations (e.g., help text, long descriptions)
5. **Enable pre-commit hook** to catch violations early
6. **Review JSON report** before production deploy to ensure zero violations

---

## References

- [Vue i18n Documentation](https://vue-i18n.intlify.dev/)
- [i18n.js Config](../src/i18n.js)
- [Inline Messages Pattern](../src/i18n.js#L7-L124)
