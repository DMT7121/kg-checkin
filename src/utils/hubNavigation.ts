import { useAppStore } from '../store/useAppStore';
import type { TabId } from '../types/navigation';

/**
 * Navigates to a target hub tab and optionally activates a specific sub-tab
 * via sessionStorage + the `kg:subtab-select` event bus.
 */
export function navigateToHubSubTab(hubId: TabId, subTab?: string): void {
  if (subTab && typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`kg_hub_subtab_${hubId}`, subTab);
    } catch {
      /* ignore storage access errors */
    }
  }

  useAppStore.getState().setCurrentTab(hubId);

  if (subTab && typeof window !== 'undefined') {
    const dispatchSubTab = () => {
      window.dispatchEvent(
        new CustomEvent('kg:subtab-select', { detail: { hub: hubId, subTab } }),
      );
    };
    dispatchSubTab();
    window.setTimeout(dispatchSubTab, 30);
  }
}
