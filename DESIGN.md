# DESIGN.md — King's Grill Staff OS `v5.0` (Unified Staff OS 5.0)

- **Version:** `5.0` (`Unified Staff OS 5.0 — 11-Hub Consolidated Edition`)
- **Archetype:** `editorial-atelier-ops` — Slim Architectural Rail (Desktop) + Compact Icon+Micro-Label Rail (Tablet `md–lg`) + Native Super-App Floating Pill Dock (Mobile `< md`)
- **Zero Legacy Heavy Runtime Dependencies:** `sweetalert2`, `framer-motion`, `face-api.js`, and `canvas-confetti` fully removed; all dialogs, toasts, and transitions use native `--kg-*` CSS (`<= 200ms`) + `useFeedbackStore` (`kgToast`, `kgConfirm`, `kgLoading`) + `KgBottomSheet`.

---

## 1. Color & Semantic Tokens (WCAG 2.2 AA)

All surfaces, inks, borders, and semantic states are defined in `src/index.css` and bridged into `tailwind.config.js` (`kg.*` utility namespace).

### Light Mode (`:root`, `[data-theme="light"]`)
- **Canvas & Surfaces:**
  - `--kg-bg`: `#f4f0e8` (Warm Alabaster Canvas)
  - `--kg-surface`: `#fffdf9` (Porcelain Ivory Surface)
  - `--kg-surface-soft`: `#eae3d7` (Sand Recessed)
  - `--kg-border`: `#ddd4c5`, `--kg-border-strong`: `#c4b8a5`
- **Text Ink:**
  - `--kg-text`: `#1a1613` (Roasted Espresso Ink)
  - `--kg-text-muted`: `#5c5349`
  - `--kg-text-soft`: `#6e6459`
- **Brand & Action Tokens:**
  - `--kg-primary`: `#0b253c` (Midnight Navy — white ink `#ffffff`, hover `#123656`)
  - `--kg-primary-ink`: `#0b253c` (≥ 14.9:1 on surface)
  - `--kg-primary-soft`: `rgba(11, 37, 60, 0.09)`
  - `--kg-accent`: `#c8432b` (Terracotta Grill Ember — white ink `#ffffff`)
  - `--kg-accent-ink`: `#b33620`
  - `--kg-accent-soft`: `#fdede8`
- **Semantic Status Tokens:**
  - `--kg-success`: `#15803d`, `--kg-success-soft`: `#ecfdf3`
  - `--kg-warning`: `#b45309`, `--kg-warning-soft`: `#fef7e6`
  - `--kg-danger`: `#dc2626`, `--kg-danger-soft`: `#fef1f1`
  - `--kg-info`: `#0369a1`, `--kg-info-soft`: `#edf7fe`
- **Focus Ring:**
  - `--focus-ring`: `0 0 0 2px var(--kg-surface), 0 0 0 4px var(--kg-primary-ink)`
  - `--kg-focus-ring`: `0 0 0 2px var(--kg-surface), 0 0 0 4px var(--kg-primary-ink)`

### Dark Mode (`.dark`, `[data-theme="dark"]`)
- **Canvas & Surfaces:**
  - `--kg-bg`: `#0d1015` (Deep Obsidian)
  - `--kg-surface`: `#161a22` (Warm Basalt)
  - `--kg-surface-soft`: `#1f2530` (Elevated Basalt)
  - `--kg-border`: `rgba(245, 240, 232, 0.12)`, `--kg-border-strong`: `rgba(245, 240, 232, 0.22)`
- **Text Ink:**
  - `--kg-text`: `#f7f4ee` (Ivory Ink)
  - `--kg-text-muted`: `#b5afa6`
  - `--kg-text-soft`: `#969087`
- **Brand & Ink Tokens (Dark Contrast Bridge):**
  - `--kg-primary`: `#2563eb` (Cobalt Action — white ink `#ffffff`)
  - `--kg-primary-ink`: `#7fb3ff` (≥ 8.4:1 on `#161a22`)
  - `--kg-primary-soft`: `rgba(59, 130, 246, 0.16)`
  - `--kg-accent`: `#e05238` (Luminous Ember — dark ink `#0d1015` on solid accent badges/buttons)
  - `--kg-accent-ink`: `#ff8a73` (≥ 7.2:1 on `#161a22`)
  - `--kg-accent-soft`: `rgba(224, 82, 56, 0.16)`
- **Semantic Status & Solid-Fill Ink Rules in `.dark`:**
  - `--kg-success`: `#34d399`, `--kg-success-soft`: `rgba(52, 211, 153, 0.14)`
  - `--kg-warning`: `#fbbf24`, `--kg-warning-soft`: `rgba(251, 191, 36, 0.14)` → Solid warning buttons/badges MUST use dark ink `#1a1613` (`dark:text-[#1A1613]`, ≥ 11.4:1 contrast).
  - `--kg-danger`: `#f87171`, `--kg-danger-soft`: `rgba(248, 113, 113, 0.14)` → Solid danger buttons/badges MUST use dark ink `#0d1015` (`dark:text-[#0D1015]`, ≥ 7.5:1 contrast).
  - `--kg-accent` solid badges/buttons MUST use dark ink `#0d1015` (`dark:text-[#0D1015]`, ≥ 5.3:1 contrast) or soft pill (`bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)]`).
  - `--kg-info`: `#38bdf8`, `--kg-info-soft`: `rgba(56, 189, 248, 0.14)`

---

## 2. Typography & Numeric Alignment
- **Sans:** `Be Vietnam Pro` (full Vietnamese diacritics)
- **Mono:** `JetBrains Mono`
- **Numeric Precision:** Always apply `font-mono tabular-nums` to currencies, shift hours, dates, counters, progress ratios, and King Coins balances.

---

## 3. Motion & Reduced Motion
- **Fast transitions:** `--motion-fast: 140ms`
- **Base transitions:** `--motion-base: 180ms` (strict cap: UI transitions `<= 200ms`)
- **Easing:** `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`
- **Accessibility:** `@media (prefers-reduced-motion: reduce)` zeroes `--motion-fast` and `--motion-base` and clamps animations/transitions.

---

## 4. Touch Targets, Keyboard Accessibility & Mobile-First Fit (`360px–430px`)
1. **44×44px Mobile Touch Targets:** Interactive buttons, icon buttons, modal close buttons, tabs, and checklist controls enforce `min-h-[44px]` / `min-w-[44px]` on mobile (`< 640px`), while allowing compact desktop sizing (`sm:min-h-[36px]`, `sm:min-h-[42px]`, `sm:w-9 sm:h-9`) to preserve desktop table/form density.
2. **Keyboard Accessibility:**
   - Clickable `KgCard` surfaces expose `role="button"`, `tabIndex={0}`, `Enter`/`Space` activation, and visible focus ring.
   - All dialogs/bottom sheets expose `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-label`, initial focus + `Tab`/`Shift+Tab` focus trap, focus restoration on close, and `Escape` dismissal (except mandatory blocking gates).
3. **Zero Double-Padding:** Nested `.p-4` inside workspace/hub stages collapses horizontal padding on `< 640px` so cards utilize 100% of mobile width.
4. **Floating Pill Dock:** Bottom items (`48px` touch targets, `0%` multi-line wrapping) hovering cleanly above `env(safe-area-inset-bottom)`.
5. **AssistiveTouch Virtual Home AI (`AIAssistant`):** Free pointer drag, magnetic edge snap, and auto-tuck so floating controls never obscure tables or forms.

---

## 5. Z-Index Ladder & Global Modal Priority Queue

| Layer | Z-Index | Component / Role |
| :--- | :--- | :--- |
| Sticky Sub-Tabs & Bulk Bars | `z-20` – `z-30` | `ModuleHub` sticky sub-tabs (`md:top-[60px]`), `HrList` sticky bulk bar (`md:top-[124px]`), Checklist sticky sync bar |
| Shell Navigation | `z-40` – `z-60` | Desktop Architectural Rail, Tablet Compact Rail, Mobile Floating Pill Dock (`h-dvh`) |
| Bottom Sheets, Command Palette & Floating AI | `z-[10050]` – `z-[10055]` | `KgBottomSheet`, `KgConfirmSheet`, `KgActionSheet`, `KgFeatureTip`, `KgCommandPalette`, `AIAssistant`, Lightbox |
| Startup Modal — Priority 1 | `z-[10060]` | `NewbieGuideModal` (`newbie_guide`) |
| Startup Modal — Priority 2 | `z-[10070]` | `VersionReleaseModal` (`version_release`) |
| Kiosk & Operational Full-Screen Modals | `z-[10075]` | `AdminStaffFacePickerModal`, `MissedCheckInModal` |
| Startup Modal — Priority 3 | `z-[10080]` | `MandatoryScheduleModal` (`mandatory_schedule` — blocking until submitted) |
| Blocking Loading Overlay & Global Feedback | `z-[10200]` | `KgLoadingOverlay` / `LoadingScreen` / `KgGlobalFeedback` |
| Startup Modal — Priority 4 | `z-[10300]` | `ZaloWarning` (`zalo` — highest priority in-app browser gate) |

- **Responsive Table Breakpoint Rule (`>= lg` / `1024px`):** Dense data tables (`HrDesktopTable`, `AdminChecklistConfig`, `AdminAuditLog`, `PayrollManagerView`, `Handover`) switch to full-width card lists below `1024px` (`< lg`) so iPad Portrait (`768px–1023px`) and Mobile (`360px–430px`) have zero horizontal overflow.
- **Modal Queue (`src/utils/modalQueue.ts`):** Coordinates startup/system modals via pub/sub (`useModalQueue`) so only the highest-priority active modal (`zalo > mandatory_schedule > version_release > newbie_guide`) renders at any moment—preventing simultaneous modal stacking.
