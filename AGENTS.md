# Antigravity Workspace Guidelines: kg-checkin

This repository adheres to the **Antigravity Cross-Platform UI/UX Redesign Standard** and the **Design System Architecture**.

---

## 1. Active Skills & Rules
- **UI/UX Redesign Skill**: Located at [`.agents/skills/ui-ux-redesign/SKILL.md`](file:///f:/kg-checkin-main/.agents/skills/ui-ux-redesign/SKILL.md)
  - Reference: [Design System Specification Template](file:///f:/kg-checkin-main/.agents/skills/ui-ux-redesign/references/design-system-template.md)
  - Reference: [QA Checklist](file:///f:/kg-checkin-main/.agents/skills/ui-ux-redesign/references/qa-checklist.md)
- **UI/UX Redesign Rules**: Located at [`.agents/rules/ui-ux-redesign.md`](file:///f:/kg-checkin-main/.agents/rules/ui-ux-redesign.md)

---

## 2. Core Operational Principles

### 2.1 Design & Usability Priority
1. Understand the real user's task.
2. Speed up task completion (reduce clicks, optimize tab flow, minimize cursor travel).
3. Prevent mistakes (validation, smart defaults, reversible actions).
4. Reduce visual clutter and cognitive overhead.
5. Maintain visual and functional consistency across all screens.
6. Deliver crisp, production-grade visual design without sacrificing performance or usability.

### 2.2 Business Logic & Codebase Integrity
- **Do NOT break or rewrite working business logic**, APIs, event handlers, Zustand stores, or Cloudflare worker/functions.
- **Do NOT rename critical DOM IDs, selectors, or test attributes** unless specifically refactoring them with full test verification.
- **Always verify dependencies and packages** in `package.json` before importing them (zero hallucination).

### 2.3 Visual & Technical Standards
- **Design System as Single Source of Truth**: Keep tokens and component styles aligned with `DESIGN.md`.
- **No Decorative Anti-Patterns**: Avoid unnecessary cards, excessive modal popups, heavy animations (>200ms), placeholder-only labels, or low-contrast text.
- **Real-World Verification**: Always test rendering, layout responsiveness (mobile, tablet, laptop, desktop), and keyboard navigation before declaring a task complete.
