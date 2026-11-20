# RoadForge and Anvilary Tools Marketing Chrome Parity Report

## Executive Summary

This report establishes visual and behavioral design parity between the RoadForge marketing website chrome (header and footer) and the authoritative Anvilary Main Website (`anvilary.tools`).

The marketing chrome now shares the same visual language:
- Full-width sticky header with edge-to-edge chrome translucency, background blur, and glowing orange border.
- Header branding scaled to 80x80px on desktop with 28px typography.
- Navigation typography and labels with glowing orange hover and active underlines.
- Fixed full-width footer with top orange glowing border.
- Parent branding in the footer featuring the official 28x28px Anvilary Tools logo and two-tone gradient "Anvilary.Tools" wordmark.
- Dynamic measurement of header and footer heights via ResizeObserver, ensuring full-viewport hero alignment and zero content clipping.
- Strict workspace isolation, ensuring the application workspace header (`AppHeader`) remains completely unaffected.

---

## 1. Reference

### 1.1 Inspected Revision
- **Repository**: `/home/alteixeira20/Projects/Anvilary-Tools/Main-Website`
- **Head Commit**: `459234ddb2c0d0a75883d5eec31dccbb8eb5e4e5`
- **Branch**: `main`

### 1.2 Reference Source Files Inspected
- `src/components/layout/SiteHeader.tsx`: Header structure, ResizeObserver dynamic height calculation, and navigation labeling.
- `src/components/layout/SiteFooter.tsx`: Compact single-row footer composition and parent brand integration.
- `src/components/ui/Brand.tsx`: Brand component with `md` (28px) and `lg` (80px) sizing options.
- `src/styles/components/header.css`: Full-width 118px header, chrome surface, blur, glow border (`::after`, `::before`), nav label underline.
- `src/styles/components/footer.css`: Fixed/sticky footer geometry, top border line, and glowing orange ambient gradient.
- `src/styles/components/brand.css`: Gradient typography rules for Anvilary (`#f5f5f2` to `#deded9`) and .Tools (`#d4773d` to `#a64a23`).
- `src/styles/tokens.css`: Color tokens, chrome translucency color-mix tokens, blur (14px), and glowing gradient definitions.
- `src/styles/responsive.css`: Breakpoint scaling for 768px (44px mark, 72px min-height) and 380px (34px mark, 60px min-height).

### 1.3 Design Tokens
The following tokens from Main-Website have been introduced into RoadForge `apps/frontend/src/styles/tokens.css`:

```css
--chrome-surface: color-mix(in oklab, var(--bg) 88%, transparent);
--chrome-surface-footer: color-mix(in oklab, var(--bg) 93%, transparent);
--chrome-blur: 14px;
--chrome-border-line: linear-gradient(
  90deg,
  transparent 0%,
  rgba(184, 88, 42, 0.25) 12%,
  rgba(184, 88, 42, 0.75) 32%,
  #b8582a 50%,
  rgba(184, 88, 42, 0.75) 68%,
  rgba(184, 88, 42, 0.25) 88%,
  transparent 100%
);
--chrome-border-glow: radial-gradient(
  50% 100% at 50% 50%,
  rgba(217, 116, 66, 0.55) 0%,
  rgba(184, 88, 42, 0.3) 45%,
  transparent 80%
);
--site-header-height: 118px;
--header-h: 118px;
--site-footer-height: 56px;
```

---

## 2. Implementation Details

### 2.1 Files Modified
1. `apps/frontend/src/styles/tokens.css`: Added shared chrome tokens, updated default header height to 118px.
2. `apps/frontend/src/styles/primitives/brand.css`: Added `.brand-lg`, `.brand-text`, `.brand-name`, and `.brand-suffix` styling with text gradients and shadows.
3. `apps/frontend/src/shared/ui/Brand.tsx`: Added support for `size="lg"` (80px mark) and `size="md"` (28px mark) while isolating custom class names.
4. `apps/frontend/src/features/marketing/components/SiteHeader.tsx`: Converted header to 100% full width, added ResizeObserver for dynamic `--site-header-height`, wrapped nav text in `.nav-label`, updated GitHub URL to canonical `https://github.com/Anvilary/RoadForge`, and used `size="lg"` brand.
5. `apps/frontend/src/features/marketing/components/HeroSection.tsx`: Updated GitHub link to canonical `https://github.com/Anvilary/RoadForge`.
6. `apps/frontend/src/shared/ui/SiteFooter.tsx`: Restructured into a fixed full-width chrome bar with top glowing orange border, dynamic `--site-footer-height` measurement, parent 28x28px Anvilary Tools logo, gradient wordmark, and compact single-row hierarchy.
7. `apps/frontend/src/styles/site.css`: Replaced legacy header and footer CSS with full-width geometry, glowing pseudo-elements, nav hover/active effects, `.home` bottom clearance, and responsive media rules.
8. `apps/frontend/src/app/help/help.css`: Added bottom clearance for the fixed footer in the help guide layout.
9. `apps/frontend/src/shared/ui/__tests__/BrandRebranding.test.tsx`: Updated footer brand assertions to verify 28x28px logo and gradient wordmark.
10. `apps/frontend/src/features/marketing/components/__tests__/AnvilaryDesignParity.test.tsx`: Created comprehensive regression test suite covering all design parity contracts.

### 2.2 Branding Decisions
- **Marketing Header**: Retains RoadForge identity. The approved logo `/brand/roadforge/logo.png` is rendered at 80x80px on desktop with the 28px wordmark "RoadForge". The typography uses the subtle vertical gradient and text shadow matching Main Website.
- **Marketing Footer**: Identifies the parent brand Anvilary Tools. Uses `/brand/anvilary-tools/logo.png` at 28x28px, followed by the gradient wordmark "Anvilary.Tools" ("Anvilary" in white gradient, ".Tools" in orange gradient) linking to `https://anvilary.tools/`.
- **Workspace Isolation**: In `AppHeader.tsx`, the brand component renders with `className="brand-mini"` and default `size="md"` (28px logo), completely avoiding `.brand-lg` and marketing styles.

### 2.3 Responsive Layout Adaptations
- **Desktop (>= 769px)**: 118px header height, 80x80px header logo, 28px wordmark. Fixed compact footer (60px to 92px height).
- **Tablet (<= 768px)**: 72px min-height, 44x44px header logo, 19px wordmark, 14px nav font size.
- **Narrow Mobile (<= 580px / <= 380px)**: 34x34px header logo, 16px wordmark. Header controls wrap cleanly into two tiers (brand and actions on top, nav centered below), preventing button clipping.
- **Clearance**: The page body dynamically offsets by `var(--site-footer-height)`, which measures the footer's actual rendered height via ResizeObserver. Even when the mobile footer wraps, the bottom page content remains completely unobscured.

---

## 3. Visual and Programmatic Evidence

### 3.1 Measured Metrics Comparison

Automated measurements across 9 viewports against the live servers:

| Viewport | Device Class | RoadForge Header | Main Website Header | RoadForge Header Logo | Main Website Header Logo | RoadForge Footer Logo | Footer Position |
|---|---|---|---|---|---|---|---|
| 1920x1080 | Large Desktop | 118.0px | 118.0px | 80x80px | 80x80px | 28x28px | fixed (bottom: 0) |
| 1440x900 | Standard Desktop | 118.0px | 118.0px | 80x80px | 80x80px | 28x28px | fixed (bottom: 0) |
| 1366x650 | Short Desktop | 118.0px | 118.0px | 80x80px | 80x80px | 28x28px | fixed (bottom: 0) |
| 1280x800 | Laptop | 118.0px | 118.0px | 80x80px | 80x80px | 28x28px | fixed (bottom: 0) |
| 1024x768 | Small Desktop | 118.0px | 118.0px | 80x80px | 80x80px | 28x28px | fixed (bottom: 0) |
| 768x1024 | Tablet Portrait | 72.0px | 72.0px | 44x44px | 44x44px | 28x28px | fixed (bottom: 0) |
| 390x844 | Modern Mobile | 159.7px | 72.0px | 44x44px | 44x44px | 28x28px | fixed (bottom: 0) |
| 375x812 | Standard Mobile | 142.1px | 60.0px | 34x34px | 34x34px | 28x28px | fixed (bottom: 0) |
| 320x700 | Narrow Mobile | 142.1px | 60.0px | 34x34px | 34x34px | 28x28px | fixed (bottom: 0) |

### 3.2 Intentional Differences
1. **Header Controls**: RoadForge provides the GitHub source pill, Create roadmap button, and saved-roadmap switcher. Main-Website contains only navigation links.
2. **Mobile Header Height**: To preserve all actions and tap targets without horizontal clipping or overflow, RoadForge allows actions to wrap into a second line on narrow mobile devices (< 580px), yielding a 142px height. Main-Website has no action buttons and remains at 60px.
3. **Hero Viewport Height**: RoadForge dynamically accounts for mobile header wrapping via `--site-header-height`, ensuring the hero fits the remaining viewport height without clipping.

### 3.3 Screenshot Artifacts
54 screenshots were captured and verified:
- RoadForge captures: `screenshots/parity/roadforge-<viewport>-top.png`, `scrolled.png`, `bottom.png`
- Main-Website captures: `screenshots/parity/main-website-<viewport>-top.png`, `scrolled.png`, `bottom.png`
- Detailed metrics file: `screenshots/parity/parity-metrics.json`

---

## 4. Functional Verification

1. **Header Navigation**:
   - Clicking `#how` scrolls smoothly to the section; the active underline indicator transitions to "How it works".
   - Clicking `#features` activates the "Features" underline indicator.
   - `/help` link navigates to the help documentation.
2. **Header Actions**:
   - "Source" pill links directly to canonical `https://github.com/Anvilary/RoadForge` in a new tab.
   - "Create roadmap" button opens the interactive roadmap creation wizard.
   - `RoadmapSwitcher` is rendered and accessible.
3. **Footer Actions**:
   - Parent brand links to `https://anvilary.tools/` with security attributes (`target="_blank" rel="noopener noreferrer"`).
   - Source link targets `https://github.com/Anvilary/RoadForge`.
   - License link targets the license anchor.
   - Problem report link maintains accessible label with the privacy warning.
4. **Workspace Isolation**:
   - Inspected `AppHeader.tsx` at `/workspace`: renders `.app-header` with `.brand-mini`, logo size remains 28x28px. No marketing styles leak into the roadmap workspace.

---

## 5. Quality Gates and Validation

The full suite of quality gates was executed:

| Check | Command | Result |
|---|---|---|
| Product Copy Gate | `node tools/check-product-copy.mjs` | PASS (26 surfaces verified) |
| Release Contract | `node tools/check-release-contract.mjs` | PASS (v0.2.0 contract) |
| Em-Dash Policy | `node tools/check-no-em-dash.mjs` | PASS (662 text files verified) |
| Architecture Imports | `node tools/check-web-import-cycles.mjs` | PASS (285 files, 769 imports) |
| Contract Limits | `node tools/check-contract-limits.mjs` | PASS (19 constants verified) |
| Documentation Links | `node tools/check-doc-links.mjs` | PASS (150 links in 65 files) |
| Issue Form Schemas | `node tools/check-issue-forms.mjs` | PASS (6 forms verified) |
| ESLint | `pnpm --dir apps/frontend lint` | PASS (0 errors) |
| TypeScript Typecheck | `pnpm --dir apps/frontend typecheck` | PASS (0 errors) |
| Unit Test Suite | `pnpm --dir apps/frontend test` | PASS (107 test files, 788 tests) |
| Hero Viewport Browser Test | `pnpm --dir apps/frontend test:hero-viewport` | PASS (metadata inset verified) |
| Playwright Accessibility Suite | `playwright test e2e/accessibility.spec.ts` | PASS (9 tests, 0 WCAG violations) |
| Next.js Production Build | `pnpm --dir apps/frontend build` | PASS (static page optimization complete) |
| Full Repository Check | `make check` | PASS |

---

## 6. Git Baseline and Summary

- **Starting Commit**: `b62c6a3` (`docs(branding): refresh approved RoadForge README banner`)
- **Target Commit**: `feat(marketing): align header and footer with Anvilary design system`
- **Working Tree**: Clean after committing.
- **Zero Push/Deploy**: Local verification only; no tags or remote operations performed.
