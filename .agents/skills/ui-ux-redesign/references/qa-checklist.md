# UI/UX & Cross-Platform QA Checklist

Use this checklist during Phase 7 of the redesign workflow before finalizing changes.

---

## 1. Visual & Layout QA

- [ ] **Optical Alignment**: Icons, text baselines, badges, and button labels are vertically and horizontally aligned.
- [ ] **No Content Clipping / Overflow**: Text and containers do not cause unwanted scrollbars or clip content.
- [ ] **Consistent Spacing**: Paddings and margins conform strictly to the 4px/8px design token rhythm.
- [ ] **Surface Hierarchy**: Layering (Canvas → Card → Dropdown → Modal) has logical contrast and shadow elevation.
- [ ] **Contrast Ratios**: Body text meets minimum WCAG AA contrast (4.5:1 for regular text, 3:1 for large text).
- [ ] **Theme Cohesion**: Dark / Light modes maintain identical functional clarity and legibility.

---

## 2. Multi-Resolution & Responsive QA

### Desktop Resolutions
- [ ] **1366 × 768** (Standard Laptop): Critical controls visible without excessive scrolling.
- [ ] **1440 × 900** (Standard Desktop / MacBook): Layout balanced, appropriate whitespace.
- [ ] **1920 × 1080** (Full HD Standard): Dense data views maintain scanability.
- [ ] **2560 × 1440 / 4K**: Content has max-width constraints where appropriate, no awkward stretching.

### Mobile & Tablet Breakpoints (for Web/PWA)
- [ ] **360px - 390px** (Mobile Portrait): Navigation transitions to drawer/bottom bar; tables become stacked or scroll horizontally with sticky indicators.
- [ ] **768px - 1024px** (Tablet / iPad): Split views collapse gracefully into master-detail or tabbed workflows.

### Desktop DPI Scaling
- [ ] **100% DPI**: Sharp text and borders.
- [ ] **125% & 150% DPI**: Layout does not break, icons stay crisp, dialogs remain within window boundaries.
- [ ] **200% DPI (Retina)**: High-resolution assets render crisply.

---

## 3. Interaction & Workflow QA

- [ ] **Primary Action Clarity**: Each view has one unambiguous primary action button.
- [ ] **Keyboard Navigation**:
  - [ ] `Tab` moves focus in logical, predictable order.
  - [ ] Visible, high-contrast focus indicator is active on all interactive elements.
  - [ ] `Enter` / `Space` activates buttons, links, and checkboxes.
  - [ ] `Escape` dismisses modals, drawers, dropdowns, and search palettes.
  - [ ] Shortcuts (`Ctrl+K`, `Ctrl+S`, etc.) work as documented.
- [ ] **System Feedback**:
  - [ ] Loading spinners / skeleton screens appear during data fetching.
  - [ ] Button disables and shows spinner while async action is processing.
  - [ ] Clear toast/alert confirms action completion.
  - [ ] Explicit error banners with actionable guidance on failure.
- [ ] **Error Prevention**:
  - [ ] Destructive actions (Delete, Drop, Revoke) require deliberate confirmation or provide an immediate Undo option.
  - [ ] Form submission is prevented if invalid; focus automatically moves to the first invalid field with inline error text.

---

## 4. Business Logic & Regression QA

- [ ] **API Contracts Intact**: Network requests send expected payload structure and receive responses properly.
- [ ] **State & Handlers Preserved**: Form states, event callbacks, filters, and local caches function correctly.
- [ ] **DOM Selectors Preserved**: Test IDs, IDs, and classes referenced in tests or business scripts remain unchanged.
- [ ] **Performance**: No laggy scrolling, memory leaks, or heavy unneeded re-renders.
