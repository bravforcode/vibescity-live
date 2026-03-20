# Contributing to VibeCity

## Welcome!

Thank you for considering contributing to VibeCity! This document provides guidelines for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/your-username/vibecity.git
cd vibecity
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Create Branch

```bash
git checkout -b feature/your-feature-name
```

## Development Workflow

### 1. Make Changes

Follow the existing code style and patterns.

### 2. Write Tests

All new features must include tests:

```javascript
// tests/unit/yourFeature.spec.js
import { describe, it, expect } from 'vitest';
import { yourFeature } from '@/utils/yourFeature';

describe('yourFeature', () => {
  it('should work correctly', () => {
    expect(yourFeature()).toBe(expected);
  });
});
```

### 3. Run Tests

```bash
bun test
```

### 4. Run Validation

```bash
python .agent/scripts/checklist.py .
```

All checks must pass:
- ✅ Security Scan
- ✅ Lint Check
- ✅ Schema Validation
- ✅ Test Runner
- ✅ UX Audit
- ✅ SEO Check

### 5. Format Code

```bash
bun run check
```

### 6. Build

```bash
bun run build
```

## Commit Guidelines

### Commit Message Format

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

**Examples:**

```
feat(performance): add FPS monitoring

Implement real-time FPS tracking with configurable thresholds
and automatic performance mode adjustment.

Closes #123
```

```
fix(analytics): correct event tracking

Fix issue where custom properties were not being sent
to analytics providers.

Fixes #456
```

## Pull Request Process

### 1. Update Documentation

- Update relevant docs in `docs/`
- Add entry to `CHANGELOG.md`
- Update API reference if needed

### 2. Create Pull Request

- Clear title and description
- Reference related issues
- Include screenshots if UI changes
- List breaking changes if any

### 3. Code Review

- Address review comments
- Keep PR focused and small
- Rebase if needed

### 4. Merge

Once approved and all checks pass, PR will be merged.

## Project Structure

```
vibecity/
├── src/
│   ├── components/      # Vue components
│   ├── composables/     # Vue composables
│   ├── utils/          # Utility functions
│   ├── plugins/        # Vue plugins
│   ├── stores/         # Pinia stores
│   └── styles/         # CSS/SCSS
├── tests/
│   ├── unit/           # Unit tests
│   └── e2e/            # E2E tests
├── docs/               # Documentation
└── scripts/            # Build scripts
```

## Coding Standards

### JavaScript/Vue

- Use ES6+ features
- Follow Vue 3 Composition API
- Use TypeScript types where beneficial
- Keep functions small and focused
- Write self-documenting code

### CSS

- Use Tailwind CSS utilities
- Follow BEM for custom CSS
- Mobile-first approach
- Respect `prefers-reduced-motion`

### Testing

- Write tests for all new features
- Aim for high coverage
- Test edge cases
- Use descriptive test names

## Documentation

- Update docs for new features
- Include code examples
- Keep docs in sync with code
- Write in clear, simple language

## Questions?

- Check existing documentation
- Search closed issues
- Ask in discussions
- Contact maintainers

## License

By contributing, you agree that your contributions will be licensed under the project's license.

