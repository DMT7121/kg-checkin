# DESIGN.md — King's Grill Staff OS `v5.0` (Toast Touch Operations)

- **Version:** `5.0` (`Toast Touch Operations — King's Grill Edition`)
- **Archetype:** `toast-touch-operations` — Deep Forest Charcoal Sidebar (`248px` expanded on Desktop `>= 1280px`, `78px` compact spine on Tablet `md–lg`) + `64px` Editorial Topbar + `58px` Solid Mobile Header + Floating Forest Pill Dock (`< md` with `#F6A36B` active tile)
- **Zero Glassmorphism & Heavy Runtime Dependencies:** Zero `backdrop-blur` anywhere in the shell/overlays (`glassmorphismAllowed: false`, solid `bg-black/60` modal scrims); `sweetalert2`, `framer-motion`, `face-api.js`, and `canvas-confetti` fully removed; all transitions strictly `<= 180ms`.

---

## 1. Color & Semantic Tokens (WCAG 2.2 AA)

All surfaces, inks, borders, and semantic states are defined in `src/index.css` and bridged into `tailwind.config.js` (`kg.*` utility namespace).

### Light Mode (`:root`, `[data-theme="light"]`, `[data-mode="light"]`)
- **Canvas & Surfaces:**
  - `--kg-bg` (`--bg`): `#F7F7F4` (Warm Paper Canvas)
  - `--kg-surface` (`--surface`): `#FFFFFF` (Crisp Card Surface)
  - `--kg-surface-soft` (`--surface-warm`): `#F4EFE7` (Warm Sand Recessed)
  - `--kg-surface-2`: `#FAFAF8` (Elevated Panel Tint)
  - `--kg-border`: `#E4E8E2`, `--kg-border-strong`: `#CCD5CE`
- **Text Ink:**
  - `--kg-text` (`--fg`): `#202A25` (Deep Forest Ink)
  - `--kg-text-muted` (`--muted`): `#55655D`
  - `--kg-text-soft` (`--meta`): `#63726B`
- **Forest Charcoal Rail & Service Board:**
  - `--kg-rail-bg`: `#202C27`, `--kg-rail-bg-alt`: `#24372C`
  - `--kg-rail-surface`: `rgba(255, 255, 255, 0.09)`, `--kg-rail-border`: `rgba(255, 255, 255, 0.14)`
  - `--kg-rail-text`: `#F6F8F4`, `--kg-rail-muted`: `#B7C8BC`
- **Brand, Action & Active Pill Tokens:**
  - `--kg-primary` (`--accent`): `#C0522A` (`--kg-primary-fg`: `#FFFFFF`, hover `#A64420`)
  - `--kg-primary-ink`: `#A64420`, `--kg-primary-soft`: `#FFF1E8`
  - `--kg-accent` (`--brand-coral`): `#F29055` (`--kg-accent-fg`: `#241C17`)
  - `--kg-accent-ink`: `#A64420`, `--kg-accent-soft`: `#FFF3E8`
  - `--kg-nav-active`: `#202C27`, `--kg-nav-active-fg`: `#FFFFFF`
- **Semantic Status Tokens:**
  - `--kg-success`: `#1E7550`, `--kg-success-soft`: `#E8F6ED`
  - `--kg-warning`: `#9A6018`, `--kg-warning-soft`: `#FFF4E4`
  - `--kg-danger`: `#B93F36`, `--kg-danger-soft`: `#FFF0ED`
  - `--kg-info`: `#1E6091`, `--kg-info-soft`: `#EDF6FD`

### Dark Mode (`.dark`, `[data-theme="dark"]`, `[data-mode="dark"]`)
- **Canvas & Surfaces:**
  - `--kg-bg` (`--bg`): `#121B17` (Deep Forest Basalt)
  - `--kg-surface` (`--surface`): `#1B2821` (Pine Surface)
  - `--kg-surface-soft` (`--surface-warm`): `#24322A` (Recessed Pine)
  - `--kg-surface-2`: `#202E27` (Elevated Pine)
  - `--kg-border`: `#334539`, `--kg-border-strong`: `#53695B`
- **Text Ink:**
  - `--kg-text` (`--fg`): `#F4F7F0`
  - `--kg-text-muted` (`--muted`): `#B2C5B7`
  - `--kg-text-soft` (`--meta`): `#98AE9E`
- **Forest Rail & Service Board:**
  - `--kg-rail-bg`: `#101B15`, `--kg-rail-bg-alt`: `#1C2E24`
  - `--kg-rail-text`: `#F4F7F2`, `--kg-rail-muted`: `#ACBDAD`
- **Brand, Action & Active Pill Tokens (WCAG AA Contrast):**
  - `--kg-primary` (`--accent`): `#F59B62` (`--kg-primary-fg`: `#23170F`, hover `#FFAE7A`)
  - `--kg-primary-ink`: `#FFB27F`, `--kg-primary-soft`: `#463024`
  - `--kg-accent` (`--brand-coral`): `#F59B62` (`--kg-accent-fg`: `#23170F`)
  - `--kg-accent-ink`: `#FFC29A`, `--kg-accent-soft`: `#463024`
  - `--kg-nav-active`: `#F59B62`, `--kg-nav-active-fg`: `#23170F`
- **Semantic Status Tokens:**
  - `--kg-success`: `#7EDBA8`, `--kg-success-soft`: `#1A3B2B`
  - `--kg-warning`: `#FFD285`, `--kg-warning-soft`: `#423620`
  - `--kg-danger`: `#FF968E`, `--kg-danger-soft`: `#462927` → Solid danger buttons/badges use dark ink `#23170F`.
  - `--kg-info`: `#7AC4FF`, `--kg-info-soft`: `#1B3548`

---

## 2. Typography & Shared Touch Primitives

- **Sans:** `Be Vietnam Pro` (`400;500;600;700;800`, full Vietnamese diacritics)
- **Mono:** `JetBrains Mono` (`500;600;700`)
- **Numeric Precision:** Always apply `font-mono tabular-nums` (right-aligned in tables/slips) to VND currencies, shift hours, dates, counters, and King Coins balances.
- **Shared Toast Touch Classes (`src/index.css` `@layer components`):**
  - `.kg-service-board` & `.kg-board-mini` — Deep forest hero command panel (`#24372C` / `#1C2E24`) with concentric ring geometry and mini status cards.
  - `.kg-touch-tile` — Tactile 1-tap launcher card (`min-height: 98px`, `15px` radius, soft terracotta hover highlight).
  - `.kg-filter-pill` & `.kg-filter-pill--active` — Filter/sub-tab pills (`--kg-nav-active` / `--kg-nav-active-fg` active fill).
  - `.kg-shift-chip`, `.kg-shift-chip--active`, `.kg-shift-chip--off` — 1-tap schedule shift chips (`44px` touch target, red OFF highlight).

---

## 3. Motion & Reduced Motion
- **Fast transitions:** `--motion-fast: 140ms`
- **Base transitions:** `--motion-base: 180ms` (strict cap: UI transitions `<= 180ms`)
- **Easing:** `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`
- **Accessibility:** `@media (prefers-reduced-motion: reduce)` zeroes `--motion-fast` and `--motion-base` and clamps animations/transitions.

---

## 4. Touch Targets, Keyboard Accessibility & Mobile-First Fit (`360px–430px`)
1. **44×44px Mobile Touch Targets:** Interactive buttons, icon buttons, modal close buttons, tabs, shift chips, and checklist controls enforce `min-h-[44px]` / `min-w-[44px]` on mobile (`< 640px`), while allowing compact desktop sizing (`sm:min-h-[36px]`, `sm:min-h-[40px]`, `sm:w-9 sm:h-9`) to preserve desktop density.
2. **iOS Input Anti-Zoom:** `input`, `select`, and `textarea` enforce `font-size: 16px` below `768px`.
3. **Keyboard Accessibility:** Clickable `KgCard` surfaces expose `role="button"`, `tabIndex={0}`, `Enter`/`Space` activation, and `--kg-focus-ring`. All dialogs/bottom sheets expose `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-label`, focus trapping, and `Escape` dismissal.
4. **Zero Double-Padding & Zero Backdrop Blur:** Nested `.p-4` inside workspace/hub stages collapses horizontal padding on `< 640px`; all headers, floating docks, sheets, and overlays remain crisp solid/opaque surfaces without `backdrop-blur`.
5. **Floating Pill Dock:** 5-slot mobile bottom dock (`4 primary tabs + Tất cả`) hovering cleanly above `env(safe-area-inset-bottom)` with warm peach active tile (`#F6A36B` / `#241C17`).

---

## 5. Z-Index Ladder & Global Modal Priority Queue

| Layer | Z-Index | Component / Role |
| :--- | :--- | :--- |
| Sticky Sub-Tabs & Bulk Bars | `z-20` – `z-30` | `ModuleHub` sticky sub-tabs (`md:top-[64px]`), `HrList` sticky bulk bar, Checklist sticky sync bar |
| Shell Navigation | `z-40` – `z-60` | Desktop Forest Rail (`248px`/`78px`), Mobile Header (`58px`), Mobile Floating Pill Dock |
| Bottom Sheets, Command Palette & Floating AI | `z-[10050]` – `z-[10055]` | `KgBottomSheet`, `KgConfirmSheet`, `KgActionSheet`, `KgFeatureTip`, `KgCommandPalette`, `AIAssistant`, Lightbox |
| Startup Modal — Priority 1 | `z-[10060]` | `NewbieGuideModal` (`newbie_guide`) |
| Startup Modal — Priority 2 | `z-[10070]` | `VersionReleaseModal` (`version_release`) |
| Kiosk & Operational Full-Screen Modals | `z-[10075]` | `AdminStaffFacePickerModal`, `MissedCheckInModal` |
| Startup Modal — Priority 3 | `z-[10080]` | `MandatoryScheduleModal` (`mandatory_schedule` — blocking until submitted) |
| Blocking Loading Overlay & Global Feedback | `z-[10200]` – `z-[10210]` | `KgLoadingOverlay` / `LoadingScreen` / `KgFeedbackHost` |
| Startup Modal — Priority 4 | `z-[10300]` | `ZaloWarning` (`zalo` — highest priority in-app browser gate) |

- **Responsive Table Breakpoint Rule (`>= lg` / `1024px`):** Dense data tables switch to full-width card lists below `1024px` (`< lg`) with zero horizontal body overflow.
- **Modal Queue (`src/utils/modalQueue.ts`):** Coordinates startup/system modals (`zalo > mandatory_schedule > version_release > newbie_guide`) so only one system gate renders at a time.
