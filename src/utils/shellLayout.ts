export const DESKTOP_EXPANDED_RAIL_MIN_WIDTH = 1280;

/**
 * Determines whether the Desktop Left Navigation Rail should start expanded with labels.
 * - Honors explicit user preference ('true' / 'false') if previously toggled.
 * - Defaults to expanded (true) on Laptop/Desktop viewports (>= 1280px) so all module
 *   labels are immediately scannable, while keeping Tablet (< 1280px) compact.
 */
export function resolveInitialRailExpanded(
  savedPreference: string | null | undefined,
  viewportWidth?: number,
): boolean {
  if (savedPreference === 'true') return true;
  if (savedPreference === 'false') return false;
  const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) ? viewportWidth : DESKTOP_EXPANDED_RAIL_MIN_WIDTH;
  return width >= DESKTOP_EXPANDED_RAIL_MIN_WIDTH;
}

/**
 * Safely returns a single uppercase initial character without throwing on missing/partial records.
 */
export function getSafeDisplayInitial(
  fullname?: string | null,
  fallbackName?: string | null,
): string {
  const primary = typeof fullname === 'string' ? fullname.trim() : '';
  if (primary.length > 0) return primary.charAt(0).toUpperCase();
  const secondary = typeof fallbackName === 'string' ? fallbackName.trim() : '';
  if (secondary.length > 0) return secondary.charAt(0).toUpperCase();
  return '?';
}
