export const APP_VERSION = '5.0';
export const APP_VERSION_TAG = 'v5.0';
export const APP_CODENAME = 'Unified Staff OS 5.0';
export const APP_RELEASE_DATE = '19/11/2026';
export const SEEN_VERSION_STORAGE_KEY = 'kg_seen_release_v5_0';
export const RELEASE_NOTES_EVENT = 'kg:open-release-notes';
export const RELEASE_SEEN_UPDATED_EVENT = 'kg:release-seen-updated';

export type ReleaseChangeCategory = 'added' | 'redesigned' | 'updated';

export function getHasUnreadReleaseNotes(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SEEN_VERSION_STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function openReleaseNotesModal(
  initialFilter: 'all' | ReleaseChangeCategory | 'history' = 'all'
): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(RELEASE_NOTES_EVENT, {
        detail: { filter: initialFilter },
      })
    );
  }
}
