# King's Grill Staff OS — Design System Specification (`DESIGN.md`)

This document is the **Single Source of Truth** for the visual architecture, tokens, components, and UX patterns across all modules of the King's Grill Staff OS (`kg-checkin`) WebApp.

---

## 1. Design Philosophy & Operating Values

1. **Operations-First & High Efficiency**: Designed for restaurant staff and managers performing fast-paced, daily operational tasks under varying lighting conditions (kitchen, counter, back-office).
2. **Instant Clarity & Zero Clutter**: Essential statuses (Ca làm việc, Chấm công, Giờ công, Lương, Checklist hoàn thành) are prominent with high visual hierarchy.
3. **Adaptive Across Form Factors**:
   - **Mobile (Zalo / Safari / Chrome)**: Touch target $\ge 44\text{px}$, bottom navigation, swipe-friendly cards, 1-tap quick actions.
   - **Desktop & POS**: High information density (compact tables, sticky headers, split views, keyboard shortcuts).
4. **Resilient Feedback & Error Prevention**: Clear inline validation, instant visual state updates, unmissable notifications, and confirmation for irreversible actions.

---

## 2. Foundations & Design Tokens

### 2.1 Color Tokens

| Token | Light Mode Value | Dark Mode Value | Usage & Meaning |
|---|---|---|---|
| `--kg-bg` | `#F8F3EA` (Warm Canvas) | `#061B2B` (Deep Navy) | Main canvas background |
| `--kg-surface` | `#FFFFFF` | `#0E273C` | Primary cards, panels, sidebars |
| `--kg-surface-soft`| `#FBF7F0` | `#122F48` | Secondary nested panels, table headers |
| `--kg-primary` | `#062B49` (Navy Brand) | `#0B3A5F` | Main brand color, primary buttons |
| `--kg-primary-hover` | `#0B3A5F` | `#104C7B` | Primary button hover / active state |
| `--kg-accent` | `#E85D4A` (Coral Red) | `#E85D4A` | Accent indicators, check-in radar ping |
| `--kg-accent-soft` | `#FFF0ED` | `rgba(232, 93, 74, 0.15)` | Coral badges, accent highlights |
| `--kg-success` | `#4F8A5B` (Forest Green)| `#5F9D6B` | Valid check-in, approved shift, on-time |
| `--kg-success-soft`| `#EEF7F0` | `rgba(95, 157, 107, 0.15)` | Success badges, verified tags |
| `--kg-warning` | `#D8A23A` (Warm Amber) | `#E2B24C` | Pending approval, late check-in, note |
| `--kg-warning-soft`| `#FFF7E4` | `rgba(226, 178, 76, 0.15)` | Warning badges, pending tags |
| `--kg-danger` | `#C94335` (Crimson) | `#D8584B` | Missed check-in, rejected, error, delete |
| `--kg-danger-soft` | `#FFF0EE` | `rgba(216, 88, 75, 0.15)` | Error banners, critical alerts |
| `--kg-border` | `#E8DED1` | `#1E3F57` | Subtle 1px borders, card dividers |
| `--kg-text` | `#172033` (Deep Ink) | `#F1F5F9` (Slate 100) | Primary headings, main content |
| `--kg-text-muted` | `#6F7785` | `#A0ABC0` | Supporting text, timestamps, labels |
| `--kg-text-soft` | `#9AA1AA` | `#718096` | De-emphasized metadata, hints |

### 2.2 Typography Scale
- **Font Stack**: `'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Monospace Stack**: `'JetBrains Mono', 'Fira Code', Consolas, monospace` (For times, salary numbers, OTP codes)
- **Hierarchy**:
  - `Display / Hero`: `24px - 28px` (Weight: 800-900)
  - `Section Title`: `18px - 20px` (Weight: 700-800)
  - `Card Header / H3`: `15px - 16px` (Weight: 700)
  - `Body / Standard`: `13px - 14px` (Weight: 500-600)
  - `Caption / Metadata`: `11px - 12px` (Weight: 600-700)
  - `Badge / Pill`: `10px - 11px` (Weight: 700-800, Uppercase tracking)

### 2.3 Spacing, Radius & Elevation
- **Spacing Grid**: Base 4px / 8px system (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`).
- **Border Radius**:
  - `--radius-sm`: `6px` (Small chips, status dots)
  - `--radius-md`: `10px` (Buttons, inputs, dropdown items)
  - `--radius-lg`: `16px` (Standard cards, panels, table containers)
  - `--radius-xl`: `24px` (Hero cards, modal dialogs)
  - `--radius-full`: `9999px` (Pills, user avatars, floating action triggers)
- **Shadows & Elevation**:
  - `elevation-card`: `0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)`
  - `elevation-card-hover`: `0 6px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.03)`
  - `elevation-dropdown`: `0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)`
  - `elevation-modal`: `0 20px 35px -10px rgba(0, 0, 0, 0.25)`

---

## 3. Component Standards & Contracts

### 3.1 Button Hierarchy
- **Primary Button (`variant="primary"`)**: High-contrast navy brand background, bold label, max 1 per view.
- **Secondary Button (`variant="secondary"`)**: Surface background with subtle border, for cancel or alternate choices.
- **Danger Button (`variant="danger"`)**: Red background or red border, reserved for destructive or rejection actions.
- **Warning Button (`variant="warning"`)**: Amber tone for caution or pending submission.
- **Ghost Button (`variant="ghost"`)**: Text only, subtle hover background, for icon buttons or tertiary utilities.

### 3.2 Form Controls & Inputs
- Explicit label above input with required asterisk `*`.
- Height $\ge 42\text{px}$ for comfortable touch and desktop click.
- High-contrast focus ring with `--kg-primary` or `--kg-accent`.
- Inline error messages positioned immediately below input in `--kg-danger` text.

### 3.3 Data Grids & Tables
- Sticky headers on scroll with `--kg-surface-soft` background.
- Clean 1px dividing lines with `--kg-border`.
- Row hover highlight for rapid visual scanning.
- Numerical values (hours, amount, salary) aligned right with monospace numbers.
- Status badges centered with distinct semantic background and border.

### 3.4 Status Badges (`KgStatusBadge`)
- **Success (`success`)**: `bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30`
- **Warning (`warning`)**: `bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30`
- **Danger (`danger`)**: `bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/30`
- **Info / Neutral (`info` / `neutral`)**: `bg-blue-50/70 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300`

---

## 4. Platform-Specific Layout Patterns

### Desktop Layout ($> 768\text{px}$)
- Persistent Sidebar with user info, live shift indicator, navigation categories (Cá nhân, Vận hành, Quản trị), theme toggle, and logout.
- Main content container bounded to max-width `1280px` (`max-w-7xl`) with generous padding and centered alignment.

### Mobile & Tablet Layout ($\le 768\text{px}$)
- Compact sticky topbar with brand logo, user badge, theme toggle, and notification bell.
- Bottom navigation bar with 5 high-frequency tabs (Hôm nay, Chấm công, Lịch, Thi đua, Thêm...).
- Action Sheet drawer for full access to all secondary modules and utilities.
