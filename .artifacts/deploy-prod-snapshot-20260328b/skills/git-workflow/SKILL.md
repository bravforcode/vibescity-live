---
name: git-workflow
description: >
  Expert Git workflow skill covering branching strategies, conventional commits, PR/MR
  templates, code review practices, git hooks, changelog generation, and release automation.
  ALWAYS use this skill when the user asks about: git workflow, branching strategy, commit
  messages, PR templates, code review, merge/rebase strategy, release process, versioning,
  CHANGELOG, git hooks, or "how to structure git for X". Also triggers for: "write a commit
  message for Y", "PR template", "branching strategy for my team", "how to do releases",
  "semantic versioning", "git best practices", "squash vs merge", "rebase vs merge",
  "set up husky/lint-staged", or "automate changelog". Delivers concrete configs, templates,
  and runbooks — not vague advice. Adapts recommendations to team size and project type.
---

# Git Workflow Skill

## Branching Strategy Selection

| Team Size | Recommended Strategy |
|-----------|---------------------|
| Solo / 1–3 devs | Trunk-based (main + feature branches) |
| 4–10 devs | GitHub Flow (main + feature/PR review) |
| 10+ devs, multiple releases | GitFlow (main + develop + release + hotfix) |
| Microservices / CD | Trunk-based with feature flags |

---

## GitHub Flow (Recommended for most teams)

```
main ─────────────────────────────────────────► production
      │                       │
      └─ feature/user-auth ───┘  (PR → merge)
      └─ fix/login-redirect ──┘  (PR → merge)
      └─ chore/update-deps ───┘  (PR → merge)
```

**Rules:**
- `main` is always deployable
- Every change comes through a PR
- Branch names: `type/short-description`
- Squash merge to keep main history clean

### Branch Naming Convention
```bash
feature/add-oauth-login
fix/user-registration-error
chore/update-node-20
refactor/auth-service
docs/api-authentication
perf/optimize-user-query
test/payment-integration
```

---

## Conventional Commits

**Format:** `type(scope): short description`

```bash
# Types
feat:     # new feature → triggers MINOR version bump
fix:      # bug fix → triggers PATCH version bump
feat!:    # breaking change → triggers MAJOR version bump
chore:    # maintenance (deps update, config, tooling)
docs:     # documentation only
refactor: # code change, no new feature or fix
perf:     # performance improvement
test:     # adding/fixing tests
ci:       # CI/CD changes
style:    # formatting (no logic change)
revert:   # reverts a previous commit

# Examples
git commit -m "feat(auth): add Google OAuth login"
git commit -m "fix(api): return 404 when user not found instead of 500"
git commit -m "feat!: require email verification before login

BREAKING CHANGE: Users without verified email can no longer login.
Affected: all authentication flows.
Migration: run scripts/verify-existing-users.ts"
git commit -m "chore(deps): update prisma to 5.10.0"
git commit -m "perf(db): add index on orders.user_id for 10x query speedup"
git commit -m "test(payment): add integration tests for Stripe webhook"
```

---

## PR Template

```markdown
<!-- .github/pull_request_template.md -->
## Summary
<!-- What does this PR do? 1-3 sentences. -->

Closes #<!-- issue number -->

## Type of Change
- [ ] 🆕 New feature
- [ ] 🐛 Bug fix  
- [ ] 💥 Breaking change
- [ ] 🔨 Refactoring (no functional change)
- [ ] 📚 Documentation
- [ ] 🔧 Chore (deps, config, tooling)

## How to Test
<!-- Step-by-step instructions for reviewer to verify -->
1. 
2. 
3. 

## Checklist
- [ ] Tests added/updated for new behavior
- [ ] Documentation updated (if applicable)
- [ ] No console.log / debug code left
- [ ] No hardcoded secrets or sensitive data
- [ ] Breaking changes documented in description
- [ ] Self-review done before requesting review

## Screenshots / Demo
<!-- For UI changes: before/after screenshots or screen recording -->

## Notes for Reviewer
<!-- Anything specific to look at, potential concerns, or context -->
```

---

## Code Review Guidelines

### For the Author
```markdown
PR Size Rules:
- < 200 lines: ideal, quick review
- 200–500 lines: acceptable, split if possible  
- > 500 lines: split into smaller PRs

Before requesting review:
1. Self-review in GitHub diff view (different context from IDE)
2. All CI checks passing
3. Added review comments on tricky code yourself
4. PR description explains WHY, not just WHAT
```

### For the Reviewer
```markdown
# Review Comment Templates

# Blocking issue
**🚫 Blocking:** This will cause [specific problem] because [reason].
Suggested fix: [concrete solution]

# Non-blocking suggestion
**💡 Suggestion (non-blocking):** Consider using X instead of Y here —
it's slightly more readable. Up to you.

# Question (not necessarily wrong)
**❓ Question:** I want to understand the reasoning here — is this intentional?

# Praise
**✅ Nice!** Good catch on the edge case here.

# Nitpick (style, take or leave)
**nit:** Extra space here.

Response SLA: 24h for first review, 4h for re-review
```

---

## Git Hooks with Husky + lint-staged

```bash
# Setup
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml}": [
      "prettier --write"
    ],
    "*.{ts,tsx,js}": [
      "vitest related --run"    // run tests related to changed files
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
npx lint-staged

# .husky/commit-msg
#!/bin/sh
npx --no -- commitlint --edit $1

# .husky/pre-push
#!/bin/sh
npm run typecheck && npm test -- --run
```

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor', 
      'perf', 'test', 'chore', 'ci', 'revert'
    ]],
    'subject-max-length': [2, 'always', 72],
    'subject-case': [2, 'always', 'lower-case'],
    'body-max-line-length': [2, 'always', 100],
  },
}
```

---

## Versioning & Release Automation

```bash
# release-please (Google) — fully automated releases from conventional commits
# .github/workflows/release.yml
```

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          release-type: node
          # Automatically:
          # - Creates release PR with updated CHANGELOG.md
          # - Bumps version in package.json
          # - Creates GitHub release on merge
          # - Adds git tag

  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Manual Semantic Release
```bash
# Using standard-version (simpler, local)
npm install --save-dev standard-version

# package.json
{
  "scripts": {
    "release": "standard-version",
    "release:minor": "standard-version --release-as minor",
    "release:major": "standard-version --release-as major",
    "release:patch": "standard-version --release-as patch"
  }
}

# Run release (updates CHANGELOG.md, package.json version, creates tag)
npm run release
git push --follow-tags origin main
```

---

## Useful Git Aliases

```bash
# Add to ~/.gitconfig
[alias]
  # Pretty log
  lg = log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit
  
  # Show changed files
  changed = diff --name-only HEAD~1

  # Undo last commit (keep changes staged)
  undo = reset --soft HEAD~1

  # Stash with a message
  save = stash push -m

  # Delete merged branches
  cleanup = !git branch --merged | grep -v 'main\|master\|develop' | xargs git branch -d

  # Interactive rebase last N commits
  fixup = "!f() { git rebase -i HEAD~$1; }; f"

  # Find commit by message
  find = log --all --grep

  # Show who changed a line
  who = blame -w -C -C -C
```

---

## .gitignore Additions for DevOps Projects

```gitignore
# Terraform
*.tfstate
*.tfstate.backup
.terraform/
*.tfvars
!*.tfvars.example
.terraform.lock.hcl   # commit this one — pins provider versions

# k8s secrets
*-secret.yml
*-secrets.yml

# Local env files
.env
.env.local
.env.*.local
!.env.example

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Credentials
*.pem
*.key
*.p12
*.crt
!certs/README.md
kubeconfig
```
