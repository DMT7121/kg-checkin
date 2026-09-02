# Design System Specification Template (`DESIGN.md`)

Use this template to establish and maintain `DESIGN.md` in the project root. It serves as the single source of truth for all UI/UX implementation decisions.

---

# [Product Name] Design System Specification

## 1. Foundations

### 1.1 Color Tokens
- **Neutrals (Surfaces, Text, Borders)**:
  - `bg-canvas`: Default background
  - `bg-surface-1`: Primary surface (cards, sidebars)
  - `bg-surface-2`: Elevated surface (modals, dropdowns, popovers)
  - `border-subtle`: 1px dividing lines, card outlines
  - `border-strong`: Active/focused inputs, emphasized borders
  - `text-primary`: Highest contrast text (headings, primary labels)
  - `text-secondary`: Supporting body text, secondary labels
  - `text-muted`: Placeholders, timestamps, hints
- **Brand & Action**:
  - `primary-default`: Main CTA color
  - `primary-hover`: Hover state (darker / brighter depending on theme)
  - `primary-active`: Active press state
  - `primary-subtle`: Subtle tint for active list items / tags
- **Semantic Feedback**:
  - `success`: Success banners, positive status badges, valid state
  - `warning`: Attention banners, warning badges, unsaved changes
  - `danger`: Destructive actions, error text, critical status
  - `info`: System announcements, informational badges

### 1.2 Typography System
- **Font Families**: Sans-serif stack (`Inter`, system-ui, -apple-system, Segoe UI, Roboto)
- **Scale**:
  - `Display / H1`: 24px - 32px (Weight: 600-700)
  - `Heading / H2`: 18px - 20px (Weight: 600)
  - `Subheading / H3`: 15px - 16px (Weight: 600)
  - `Body`: 13px - 14px (Weight: 400-500)
  - `Caption / Small`: 11px - 12px (Weight: 400-500)
  - `Code / Monospace`: 12px - 13px (Font: JetBrains Mono / Fira Code / Consolas)

### 1.3 Spacing & Rhythm
- Base 4px/8px grid system:
  - `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-6` (24px), `space-8` (32px), `space-12` (48px).
- Density Modes:
  - **Comfortable**: Row height 48px, component padding 12px-16px.
  - **Compact**: Row height 36px-40px, component padding 8px-12px.
  - **Dense**: Row height 28px-32px, component padding 4px-8px (pro data grids).

### 1.4 Elevation, Borders & Radii
- **Radii**: `radius-sm` (4px), `radius-md` (6px-8px), `radius-lg` (12px), `radius-full` (9999px for pills/badges).
- **Shadows**:
  - `elevation-1`: Subtle card border / low shadow `0 1px 3px rgba(0,0,0,0.08)`
  - `elevation-2`: Popovers, dropdown menus `0 4px 12px rgba(0,0,0,0.12)`
  - `elevation-3`: Modals, dialogs `0 12px 32px rgba(0,0,0,0.18)`

---

## 2. Component Standards

### 2.1 Buttons & Action Hierarchy
| Level | Style | When to Use | Rule |
|---|---|---|---|
| **Primary** | Solid brand color, high contrast | Primary page/modal action | Max 1 per section/view |
| **Secondary** | Subtle border/surface fill | Secondary options, Filter triggers | Multiple allowed |
| **Tertiary / Ghost**| Transparent background, text only | Minor actions, icon buttons | Toolbars, table row actions |
| **Destructive** | Danger color (solid or outline) | Delete, revoke, cancel contract | Require double-check or Undo |

### 2.2 Form Controls
- Explicit labels above or beside inputs. Never use placeholders as sole labels.
- Clear required indicators (`*` or required label).
- Inline error messages positioned immediately below invalid inputs.
- Active focus rings with distinct contrast (never remove outline without replacement).

### 2.3 Tables & Data Grids
- Sticky headers with fixed height.
- Text aligned left, numerical data aligned right, status aligned center.
- Compact row padding with hover row highlight (`bg-surface-subtle`).
- Row selection checkbox with batch action toolbar when >= 1 item selected.
- Pagination or infinite virtualization with visible total item count.

### 2.4 Overlays & Feedback
- **Modals**: Restricted to blocking decisions, critical confirmations, or focused single-task creation.
- **Drawers / Sheets**: For multi-step editing, item detail inspectors, or complex filters.
- **Toasts**: Non-intrusive feedback in screen corner (auto-dismiss 3-5s for success; persistent with retry for errors).
- **Empty States**: Friendly illustration or icon + clear title + 1 action button to create/import.
