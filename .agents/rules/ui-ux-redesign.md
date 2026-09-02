# Antigravity Cross-Platform UI/UX Redesign Rules

These rules govern all user interface design, styling, component refactoring, and user experience work in this repository.

---

## 1. Core Design Hierarchy
Always prioritize design decisions in this exact order:
1. Understand the user's task correctly
2. Enable faster task completion (fewer clicks, shorter cursor travel, keyboard acceleration)
3. Prevent user errors
4. Reduce cognitive load & visual noise
5. Maintain immediate clarity & state visibility
6. Maintain system-wide consistency
7. Ensure universal accessibility (WCAG AA)
8. Instill professional confidence through deliberate craft
9. Deliver high visual quality
10. Refine aesthetics

**Absolute Rule**: Never sacrifice usability, performance, or clarity for visual effects, animations, or portfolio-style eye-candy.

---

## 2. Business Logic & Technical Integrity Protection
UI redesign must **never** break existing working application logic.

### Strictly Prohibited Changes:
- **Do NOT alter backend APIs, payloads, or endpoints** unless explicitly requested by the user.
- **Do NOT modify or break event handlers**, state management logic, business rules, or calculations.
- **Do NOT casually rename** functions, props, variables, DOM IDs, test IDs, or critical CSS selectors relied upon by scripts or tests.
- **Do NOT remove or bypass** authentication, authorization, or error handling mechanisms.

---

## 3. Zero Hallucination
- **Verify before using**: Never assume a library, CSS utility, icon, token, or component exists. Always inspect the codebase, dependencies (`package.json`), or configuration files first.
- If a skill, package, or tool is unavailable, use verified existing project capabilities and communicate clearly.

---

## 4. Design System Single Source of Truth
- All visual decisions must adhere to `DESIGN.md` in the project root.
- If `DESIGN.md` does not exist when starting a redesign, audit the current project tokens and generate `DESIGN.md` first before modifying screens.
- Avoid ad-hoc, hardcoded hex colors, random pixel margins, or arbitrary border-radii. Always use predefined tokens.

---

## 5. Platform-Appropriate UX Standards

### Desktop (Windows / macOS / Linux / Electron / Tauri)
- A desktop app is a **professional tool**, not a website in a window.
- Maximize workspace efficiency with compact/dense presentation, sticky toolbars, resizable split-views, right-click context menus, and keyboard shortcuts (`Ctrl/Cmd + Key`).
- Avoid empty whitespace padding when power users need to view large volumes of data.

### Web & SaaS
- Ensure responsive, adaptive behavior across mobile (360px+), tablet (768px+), and desktop (1366px+ - 4K).
- Maintain robust handling for loading, empty, and offline/error states.
- Respect browser navigation, URL state, and back-button behavior.

### Touch & POS
- Minimum touch target: **44×44px**.
- **Zero hover dependence**: Critical actions must be immediately visible and operable by touch.

---

## 6. Prohibited Anti-Patterns (Visual & UX Debt)
When designing or coding interfaces, strictly avoid:
- ❌ Turning every data element into a card (do not replace tables with cards merely for "modern" looks).
- ❌ Overusing modal dialogs for simple or multi-step editing (use drawers, sidebars, or inline editing instead).
- ❌ Decorative glassmorphism, aggressive neon gradients, or excessive blur effects.
- ❌ Excessive, slow, or gratuitous animations (> 200ms) that slow down daily operation.
- ❌ Using placeholder text as the only label for input fields.
- ❌ Competing primary buttons in the same view (keep exactly one primary action per context).
- ❌ Hiding critical actions behind unlabeled icons or obscure hamburger menus on desktop.
- ❌ Unconfirmed destructive actions without confirmation or an Undo pathway.

---

## 7. Form & Data Table Guidelines
- **Forms**: Clear top/side labels, logical tab order, autofocus on primary field, inline validation on blur/submit, informative error messages.
- **Tables**: Sticky headers, column sorting/filtering, batch selection bar, row actions (view, edit, delete), and explicit total record counts.

---

## 8. Keyboard-First & Accessibility Mandates
- Every workflow must be navigable via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`, Arrow keys).
- Maintain visible, high-contrast focus rings on all interactive elements.
- Ensure all text passes WCAG AA contrast standards (minimum 4.5:1 for body text).

---

## 9. Real-World QA & Definition of Done
A redesign task is only considered complete when:
1. **Real Render Inspected**: Tested and verified using real browser / application rendering tools across target resolutions (not merely reading code).
2. **Business Logic Intact**: All critical workflows, data fetching, mutations, and form submissions operate properly.
3. **No Visual Defects**: Zero clipping, overflow issues, unaligned icons, or broken responsive layouts.
4. **Final Report Provided**: Deliver the standard 8-section redesign report detailing completed work, UX improvements, tokens standardized, platform adaptations, a11y, QA results, and preserved logic.
