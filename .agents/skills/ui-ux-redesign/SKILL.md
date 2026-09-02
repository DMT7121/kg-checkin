---
name: ui-ux-redesign
description: >-
  Expert cross-platform UI/UX redesign and design system framework. Use when auditing, designing, refactoring, or building user interfaces across Web, Desktop (Windows/macOS/Linux), Touch/POS, and Mobile applications to ensure world-class usability, performance, accessibility, and visual craft.
---

# Cross-Platform UI/UX Redesign & Design System Framework

This skill guides the end-to-end execution of professional, production-grade UI/UX redesigns across desktop, web, and touch applications. It balances world-class visual craft with strict usability engineering, performance, and business logic preservation.

---

## 1. Operating Mindset & Standards

Act with the rigor of a **Principal Product Designer, UI/UX Architect, and Frontend Design Engineer**:
- **Design for real work**: Optimize for users performing daily, repeated tasks—not static screenshots or portfolio mockups.
- **Hierarchy of Priority**:
  1. Understand the user's task correctly
  2. Enable faster task completion (fewer clicks, less cursor travel, keyboard acceleration)
  3. Prevent errors before they happen
  4. Reduce cognitive load & visual clutter
  5. Maintain immediate clarity & system status visibility
  6. Maintain strict consistency across the interface
  7. Ensure universal accessibility (a11y)
  8. Instill professional confidence through deliberate, precise visual craft
  9. Never sacrifice usability for decorative visual effects

---

## 2. Redesign Execution Workflow

Follow this systematic phase sequence. **Never begin with arbitrary CSS edits or un-audited component changes.**

```
DISCOVER & UNDERSTAND
       ↓
 COMPREHENSIVE AUDIT
       ↓
INFORMATION ARCHITECTURE & DESIGN SYSTEM (DESIGN.md)
       ↓
     APP SHELL
       ↓
STANDARDIZE SHARED COMPONENTS
       ↓
WORKFLOW-FIRST REDESIGN
       ↓
REAL-WORLD QA (BROWSER & RESOLUTION)
       ↓
USABILITY REVIEW & POLISH
       ↓
   FINAL REPORT
```

### Phase 1: Discover & Understand
Answer the 10 platform & context questions:
1. **Application Type**: SaaS, Admin Dashboard, ERP, CRM, POS, Desktop Utility, Kiosk, or Internal Tool?
2. **Target Platform**: Web, Windows, macOS, Linux, Electron, Tauri, PWA, or Touchscreen?
3. **Primary Input Device**: Mouse/Keyboard, Touchscreen, Barcode Scanner, Multi-monitor?
4. **Usage Duration**: Brief interactions or 8-hour continuous daily workflow?
5. **Audience**: Beginners, business operators, or domain expert power-users?
6. **Information Density Requirement**: Comfortable (casual), Compact (business), or Dense (data-intensive / professional)?
7. **Frequency of Workflows**: One-off tasks or high-speed repetitive operations?
8. **Platform Conventions**: Windows Fluent, macOS HIG, Web Standards, POS Touch ergonomics?
9. **Critical Performance Bounds**: Target load time, latency, animation budgets (60fps, low CPU/RAM footprint).
10. **Constraints & Boundary Conditions**: Legacy browser support, screen sizes, offline requirements.

### Phase 2: Comprehensive System Audit
Before touching code:
- **Inspect Architecture**: Identify frontend framework (React, Vue, Svelte, Vanilla), CSS architecture (CSS Modules, Tailwind, Vanilla CSS, Styled Components), router, and state management.
- **Map Business Workflows**: Identify mission-critical user paths, form submissions, API mutations, and data flows.
- **Identify Technical Anchors**:
  - Critical DOM IDs, data attributes, and test selectors.
  - Event handlers, IPC channels, WebSocket listeners, and backend API contracts.
  - Global state bindings, cache invalidation hooks, and auth flows.
- **Catalogue UI & UX Debt**: Note inconsistencies in colors, button hierarchies, form inputs, modal abuse, visual noise, slow transitions, and responsive layout breakage.

### Phase 3: Define Design System (`DESIGN.md`)
Create or update `DESIGN.md` in the project root as the single source of truth:
- **Design Tokens**: Color palettes (Neutral, Primary, Semantic, Surfaces), Typography scale, Spacing scale (4px/8px rhythm), Radius, Elevation/Shadows, Z-index.
- **Density System**: Comfortable, Compact, or Dense metrics (row heights, paddings, font sizes).
- **Component Contracts**: Button variants, input states, table layouts, dialogs, drawers, badges, toasts, and status indicators.
- Refer to [design-system-template.md](./references/design-system-template.md) for the exact specification format.

### Phase 4: App Shell Architecture
Establish a solid, learnable layout shell:
- **Persistent Shell Structure**: Title bar / Header, Global Navigation (Sidebar or Topbar), Workspace area, Context/Inspector panel (if needed), Status bar (system health, sync state, active user).
- **Global Actions**: Global search / Command Palette (`Ctrl+K` / `Cmd+K`), Quick actions, Notification center, User profile.
- **Adaptive Layout**: Responsive collapse behavior for compact/mobile viewports without breaking desktop efficiency.

### Phase 5: Standardize Core Components
Migrate shared UI atoms and molecules first before individual screens:
1. **Buttons & Actions**: Clear hierarchy (Primary, Secondary, Tertiary/Ghost, Destructive, Contextual). Exactly one primary action per view.
2. **Form Controls**: Grouped fields, explicit floating/top labels (never placeholder-only), inline validation, clear error messages, autofocus, logical tab order.
3. **Data Grids & Tables**: Sticky headers, column sorting/filtering, pagination/virtualization, selection bars, batch actions, row actions, status badges.
4. **Feedback & Status**: Inline banners, micro-toasts, progress bars, empty states with clear CTAs, skeleton loaders.
5. **Overlays**: Modals (for critical blocking decisions only), Drawers/Sheets (for detailed inspection/editing), Tooltips, Context Menus.

### Phase 6: Workflow-First Redesign
Redesign complete user journeys, not isolated pages:
- **Streamline Task Steps**: Eliminate intermediate clicks, redundant confirm dialogs, and repetitive data entry.
- **Keyboard-First Optimization**: Full Tab/Shift+Tab navigation, Enter to submit, Escape to dismiss, arrow navigation in lists/menus.
- **Error Prevention**: Smart defaults, validation before submit, confirmation only on irreversible destructive actions, reversible Undo patterns.
- **System Feedback**: Immediate visual acknowledgment for every state transition (saving, loading, success, failure).

### Phase 7: Real-World Visual & Functional QA
**Never review code alone. Inspect the actual rendered application in real environments.**
- **Web Applications**: Open browser tools, inspect element alignment, layout reflow, contrast ratios, and responsive breakpoints (`360px`, `768px`, `1024px`, `1366px`, `1920px`, `2560px`).
- **Desktop Applications**: Check window resizing, min/max bounds, multi-monitor behavior, high-DPI scaling (100%, 125%, 150%, 200%), keyboard focus rings, context menus.
- Follow the checklist in [qa-checklist.md](./references/qa-checklist.md).

### Phase 8: High-End Polish & Verification
Refine visual craft:
- Optical alignment of icons and text.
- Micro-spacing rhythm and border contrast.
- Smooth, purposeful microinteractions (100ms - 200ms transitions).
- Verify that no business logic, API calls, or event bindings have been broken or altered.

---

## 3. Platform Guidelines

### Desktop Applications (Windows / macOS / Linux / Electron / Tauri)
- **Do not build a web page in a window**: Leverage desktop density, keyboard shortcuts, split views, resizable sidebars, and right-click context menus.
- **Windows Conventions**: Fluent clarity, clear command hierarchy, compact data density, Alt shortcuts, native title bar integrations.
- **macOS Conventions**: Clean toolbar structure, sidebar navigation, native modal sheets, Cmd shortcuts.
- **Dense Data Presentation**: Keep tables, lists, and property inspectors compact so power users see essential information without excessive scrolling.

### Web Applications & SaaS
- **Fluid & Adaptive**: Fluid layouts that gracefully scale from ultra-wide 4K monitors down to mobile screens.
- **URL & History State**: Support deep linking, modal URL sync (when appropriate), browser Back/Forward reliability.
- **Network & Error Resilience**: Offline indicators, retry mechanisms, optimistic UI updates with rollback, skeleton placeholders during fetch.

### Touchscreen & POS Applications
- **Ergonomics**: Minimum 44×44px touch targets, adequate spacing between destructive buttons, high contrast for various ambient lighting conditions.
- **Zero Hover Dependence**: Every critical action must be directly visible and tappable without hover states.

---

## 4. Final Delivery Report

Upon completing a redesign scope, provide a structured report using this template:

```markdown
## 1. Completed
- List of redesigned views, components, and layout modules.

## 2. UX & Workflow Improvements
- Concrete friction points removed (e.g. reduced 5 clicks to 2, added keyboard shortcuts, inline editing).

## 3. Design System & Standardization
- Tokens, shared components, and patterns unified in `DESIGN.md`.

## 4. Platform Adaptation
- Enhancements specific to Desktop / Web / Touch environments.

## 5. Accessibility & Error Prevention
- Focus management, keyboard navigation, contrast compliance, validation rules.

## 6. QA & Visual Verification
- Resolutions tested, browser/native testing results, responsive behavior verified.

## 7. Business Logic Preserved
- Explicit confirmation of preserved APIs, data models, state handlers, and critical selectors.

## 8. Remaining Items / Recommendations
- Unresolved edge cases, future optimization opportunities.
```
