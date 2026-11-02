# DESIGN.md — King's Grill Staff OS `v4.0.0` (Warm Hospitality Super-App)

- **Version:** `4.0.0` (`Warm Hospitality Super-App Edition`)
- **Archetype:** `editorial-atelier-ops` — Slim Architectural Rail (Desktop) + Native Super-App Floating Pill Dock (Mobile)
- **Brand Palette:**
  - **Light:** Warm Alabaster Canvas `#F4F0E8`, Porcelain Ivory Surface `#FFFDF9`, Sand Recessed `#EAE3D7`, Roasted Espresso Ink `#1A1613`, Midnight Navy Primary `#0B253C`, Terracotta Grill Ember `#C8432B` (ink `#B33620`).
  - **Dark:** Deep Obsidian `#0D1015`, Warm Basalt `#161A22`, Elevated Basalt `#1F2530`, Ivory Ink `#F7F4EE`, Cobalt Action `#2563EB` (ink `#7FB3FF`), Luminous Ember `#E05238` (ink `#FF8A73`).
- **Typography:** `Be Vietnam Pro` (full Vietnamese diacritics) + `JetBrains Mono` (`tabular-nums` right-aligned currency & hours).
- **Mobile-First Fit Guarantees (`360px–430px`):**
  1. **Zero Double-Padding:** Nested `.p-4` inside workspace/hub stages automatically collapses horizontal padding on `< 640px` so cards utilize 100% of mobile width.
  2. **Floating Pill Dock:** 5 single-word/short-phrase bottom items (`48px` touch targets, `0%` multi-line wrapping) hovering cleanly above `env(safe-area-inset-bottom)`.
  3. **AssistiveTouch Virtual Home AI (`AIAssistant`):** Free pointer drag, magnetic left/right edge snap, and auto-tuck (`60%` hidden into edge after 3s idle) so floating controls never obscure tables or forms.
  4. **In-App Release Center (`v4.0.0`):** Interactive `KgVersionBadge` + `VersionReleaseModal` detailing UI Overhaul, New Features, Mobile Fit Optimizations, Technical Fixes, and Version History.
