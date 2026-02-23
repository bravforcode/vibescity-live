# VibeCity UI Kit (Night Neon)

## Purpose
This document is the canonical mapping between Figma Variables and runtime CSS tokens in `src/design-system/tokens.css`.

Status:
- Code tokenization is implemented.
- Figma MCP is available, but current workflow remains spec-first until an editable target file/key is confirmed.

## Variable Naming Standard
- Figma collection: `VibeCity / Night Neon`
- Figma variable prefix: `color/*`, `space/*`, `radius/*`, `motion/*`, `shadow/*`, `font/*`
- Code variable prefix: `--vc-*`

## Figma -> CSS Mapping
| Figma Variable | CSS Variable | Notes |
|---|---|---|
| `font/display` | `--vc-font-display` | Headline/display font stack |
| `font/body` | `--vc-font-body` | Body font stack |
| `font/mono` | `--vc-font-mono` | Code/numeric UI |
| `color/bg/canvas` | `--vc-color-bg-canvas` | App shell background |
| `color/bg/base` | `--vc-color-bg-base` | Base layer background |
| `color/surface/glass` | `--vc-color-surface-glass` | Frosted overlays |
| `color/surface/elevated` | `--vc-color-surface-elevated` | Elevated cards/sheets |
| `color/border/glass` | `--vc-color-border-glass` | Glass edge/borders |
| `color/text/primary` | `--vc-color-text-primary` | Primary text |
| `color/text/secondary` | `--vc-color-text-secondary` | Secondary text |
| `color/text/muted` | `--vc-color-text-muted` | Muted labels |
| `color/brand/primary` | `--vc-color-brand-primary` | Primary CTA accent |
| `color/accent/purple` | `--vc-color-accent-purple` | Neon purple accent |
| `color/accent/pink` | `--vc-color-accent-pink` | Neon pink accent |
| `color/accent/green` | `--vc-color-accent-green` | Success/action accent |
| `color/accent/yellow` | `--vc-color-accent-yellow` | Warning/highlight accent |
| `space/2` | `--vc-space-2` | 2px |
| `space/4` | `--vc-space-4` | 4px |
| `space/8` | `--vc-space-8` | 8px |
| `space/12` | `--vc-space-12` | 12px |
| `space/16` | `--vc-space-16` | 16px |
| `space/20` | `--vc-space-20` | 20px |
| `space/24` | `--vc-space-24` | 24px |
| `space/32` | `--vc-space-32` | 32px |
| `space/40` | `--vc-space-40` | 40px |
| `space/48` | `--vc-space-48` | 48px |
| `space/64` | `--vc-space-64` | 64px |
| `radius/card` | `--vc-radius-card` | Card components |
| `radius/sheet` | `--vc-radius-sheet` | Modal/sheet components |
| `radius/pill` | `--vc-radius-pill` | Capsule buttons/chips |
| `motion/fast` | `--vc-motion-fast` | 160ms |
| `motion/base` | `--vc-motion-base` | 240ms |
| `motion/slow` | `--vc-motion-slow` | 320ms |
| `shadow/glass` | `--vc-shadow-glass` | Glass depth |
| `shadow/neon/blue` | `--vc-shadow-neon-blue` | Blue glow |
| `shadow/neon/pink` | `--vc-shadow-neon-pink` | Pink glow |

## Reference Sources
These links are visual references only, not direct copy sources:
- Neon Text Effect: https://freedesignresources.net/figma-neon-text-effect/
- Neon UI Design: https://ui4free.com/mobile-templates/figma-neon-ui-design.htm
- Neon resource tag: https://ui4free.com/tags/neon

## Guardrails
- Keep all production tokens in `tokens.css` using `--vc-*` naming.
- Figma naming must map 1:1 to this document to avoid drift.
- No hard-coded neon hex values in component styles when a token exists.
- Respect `prefers-reduced-motion`; avoid forced glow animations.

## Next Step (when edit access is available)
1. Create file `VibeCity UI Kit (Night Neon)` in Figma.
2. Create collections: `color`, `space`, `radius`, `motion`, `shadow`, `font`.
3. Apply exact variable keys listed above.
4. Map core components (Button, Card, Sheet, Header, Search) to tokenized styles.
5. Add Code Connect links for token-consuming components.
