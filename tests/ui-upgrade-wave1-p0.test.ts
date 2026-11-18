import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const localStore = new MemoryStorage();
const sessionStore = new MemoryStorage();
const dispatchedEvents: Array<{ type: string; detail: any }> = [];

let currentHref = 'http://127.0.0.1:4173/';

(globalThis as any).localStorage = localStore;
(globalThis as any).sessionStorage = sessionStore;
(globalThis as any).CustomEvent = class CustomEvent<T = any> {
  type: string;
  detail: T;
  constructor(type: string, init?: { detail?: T }) {
    this.type = type;
    this.detail = init?.detail as T;
  }
};
(globalThis as any).window = {
  localStorage: localStore,
  sessionStorage: sessionStore,
  innerWidth: 1440,
  get location() {
    const parsed = new URL(currentHref);
    return {
      get href() {
        return currentHref;
      },
      get search() {
        return parsed.search;
      },
    };
  },
  history: {
    pushState(_state: any, _title: string, url?: string | URL | null) {
      if (url) currentHref = String(url);
    },
    replaceState(_state: any, _title: string, url?: string | URL | null) {
      if (url) currentHref = String(url);
    },
  },
  dispatchEvent(ev: any) {
    dispatchedEvents.push({ type: ev.type, detail: ev.detail });
    return true;
  },
};

let vite: ViteDevServer;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
});

after(async () => {
  if (vite) await vite.close();
});

describe('Wave 1 (P0) UI/UX Upgrade Regression Suite', () => {
  test('[P0-1] SweetAlert2 toast container never applies full-height dark blur backdrop', () => {
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Unconditional .swal2-container { backdrop-filter: blur(...) !important } must not exist
    const unconditionalMatch = css.match(/(^|\n)\s*\.swal2-container\s*\{[^}]*backdrop-filter\s*:\s*blur/i);
    assert.equal(
      unconditionalMatch,
      null,
      'Expected .swal2-container blur backdrop to exclude .swal2-backdrop-hidden / toast containers',
    );
    assert.match(css, /\.swal2-backdrop-hidden/);
    assert.match(css, /\.swal2-toast/);
  });

  test('[P0-2] setCurrentTab preserves ?sub=... on initial load / reload and syncs sessionStorage', async () => {
    localStore.clear();
    sessionStore.clear();
    dispatchedEvents.length = 0;

    const { useAppStore } = await vite.ssrLoadModule('/src/store/useAppStore.ts');

    // Case 1: Fresh reload on /?tab=attendance&sub=timesheet
    currentHref = 'http://127.0.0.1:4173/?tab=attendance&sub=timesheet';
    useAppStore.getState().setCurrentTab('attendance');

    assert.equal(useAppStore.getState().currentTab, 'attendance');
    assert.equal(new URL(currentHref).searchParams.get('tab'), 'attendance');
    assert.equal(new URL(currentHref).searchParams.get('sub'), 'timesheet');
    assert.equal(sessionStore.getItem('kg_hub_subtab_attendance'), 'timesheet');

    // Case 2: Explicit alias overrides URL subtab cleanly
    useAppStore.getState().setCurrentTab('payroll');
    assert.equal(useAppStore.getState().currentTab, 'attendance');
    assert.equal(new URL(currentHref).searchParams.get('sub'), 'payroll');
    assert.equal(sessionStore.getItem('kg_hub_subtab_attendance'), 'payroll');

    // Case 3: Switching to a different hub without saved subtab does NOT leak previous hub's subtab
    useAppStore.getState().setCurrentTab('workforce');
    assert.equal(useAppStore.getState().currentTab, 'workforce');
    assert.equal(new URL(currentHref).searchParams.get('tab'), 'workforce');
    assert.equal(new URL(currentHref).searchParams.get('sub'), null);
  });

  test('[P0-3] resolveInitialRailExpanded expands by default on Desktop >= 1280px and stays compact on Tablet', async () => {
    const { resolveInitialRailExpanded } = await vite.ssrLoadModule('/src/utils/shellLayout.ts');

    assert.equal(resolveInitialRailExpanded(null, 1440), true);
    assert.equal(resolveInitialRailExpanded(null, 1280), true);
    assert.equal(resolveInitialRailExpanded(null, 1024), false);
    assert.equal(resolveInitialRailExpanded(null, 768), false);
    assert.equal(resolveInitialRailExpanded('false', 1440), false);
    assert.equal(resolveInitialRailExpanded('true', 900), true);
  });

  test('[P0-4] normalizeOperationsConfig and getSafeDisplayInitial prevent TypeError crashes on partial payloads', async () => {
    const { normalizeOperationsConfig } = await vite.ssrLoadModule('/src/types/operations.ts');
    const { getSafeDisplayInitial } = await vite.ssrLoadModule('/src/utils/shellLayout.ts');

    const fromEmptyObj = normalizeOperationsConfig({} as any);
    assert.deepEqual(fromEmptyObj.teams, []);
    assert.deepEqual(fromEmptyObj.zones, []);
    assert.deepEqual(fromEmptyObj.tasks, []);
    assert.deepEqual(fromEmptyObj.assignments, []);
    assert.deepEqual(fromEmptyObj.evaluations, []);

    const fromPartial = normalizeOperationsConfig({
      teams: [{ id: 't1', name: 'A', color: '#000', description: '', leaderUsername: 'u1' } as any],
      assignments: [{ id: 'a1' } as any],
    });
    assert.deepEqual(fromPartial.teams[0].memberUsernames, []);
    assert.equal(fromPartial.assignments[0].date, '');

    assert.equal(getSafeDisplayInitial(undefined, 'nv02'), 'N');
    assert.equal(getSafeDisplayInitial('', ''), '?');
    assert.equal(getSafeDisplayInitial('Lê Hoàng Nam'), 'L');
  });
});
