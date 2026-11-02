export type ReconcileStatus = 'Pending' | 'Matched' | 'Disputed' | 'ManagerConfirmed';

export type IncidentStatus = 'Open' | 'Investigating' | 'Resolved' | 'CostRecorded';

export type IncidentSeverity = 'normal' | 'high' | 'urgent';

export interface HandoverLedgerRecord {
  id: string;
  date: string;
  shift: string;
  username: string;
  fullname?: string;
  cashAmount: string;
  openingCash?: number;
  posCashRevenue?: number;
  cashExpense?: number;
  expectedCash?: number;
  closingCash?: number;
  discrepancy?: number;
  reconcileStatus?: ReconcileStatus;
  note: string;
  timestamp: string;
  ackBy?: string;
  ackAt?: string;
  ackStatus?: 'Accepted' | 'Disputed' | '';
  ackNote?: string;
  countedCash?: number;
  managerBy?: string;
  managerAt?: string;
  managerNote?: string;
}

export interface IncidentRecord {
  id: string;
  date: string;
  shift?: string;
  area?: string;
  severity?: IncidentSeverity;
  username: string;
  fullname?: string;
  category: string;
  description: string;
  photoUrl?: string;
  status: IncidentStatus;
  assignedTo?: string;
  resolutionNote?: string;
  repairCost?: number;
  updatedBy?: string;
  updatedAt?: string;
  timestamp: string;
}

export interface ChecklistParticipant {
  key: string;
  name: string;
  joinedAt: string;
}

export interface ChecklistSavedItemState {
  checked: boolean;
  note: string;
  subchecks: Record<string, boolean>;
  by?: string;
  at?: string;
}

export interface ChecklistSavedAreaState {
  participants: ChecklistParticipant[];
  items: Record<string, ChecklistSavedItemState>;
  supply: Record<string, any>;
  signatures: { receive?: string; handover?: string; manager?: string };
  savedAt?: string;
}

export interface ChecklistAreaPatch {
  participants?: ChecklistParticipant[];
  removedParticipantKeys?: string[];
  items?: Record<string, Partial<ChecklistSavedItemState>>;
  deltaItems?: Record<string, Partial<ChecklistSavedItemState>>;
  supply?: Record<string, any>;
  signatures?: { receive?: string; handover?: string; manager?: string };
  deltaSignatures?: Partial<{ receive: string; handover: string; manager: string }>;
}

export function parseVndAmount(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw) : 0;
  }
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  const isNegative = trimmed.startsWith('-');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = parseInt(digits, 10);
  if (!Number.isFinite(parsed)) return 0;
  return isNegative ? -Math.round(parsed) : Math.round(parsed);
}

export function formatVndInput(raw: string | number): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return '';
  return Math.round(num).toLocaleString('vi-VN');
}

export function formatVndCurrency(amount: number | string | null | undefined): string {
  const val = parseVndAmount(amount);
  return `${val.toLocaleString('vi-VN')} đ`;
}

export function formatSignedVnd(amount: number): string {
  const rounded = Math.round(Number(amount) || 0);
  if (rounded > 0) return `+${rounded.toLocaleString('vi-VN')} đ`;
  if (rounded < 0) return `-${Math.abs(rounded).toLocaleString('vi-VN')} đ`;
  return '0 đ';
}

export interface CashReconciliationInput {
  openingCash: string | number | null | undefined;
  posCashRevenue: string | number | null | undefined;
  cashExpense: string | number | null | undefined;
  closingCash: string | number | null | undefined;
  previousClosingCash?: string | number | null;
}

export interface CashReconciliationResult {
  openingCash: number;
  posCashRevenue: number;
  cashExpense: number;
  expectedCash: number;
  closingCash: number;
  discrepancy: number;
  openingMismatch: number;
  status: 'Matched' | 'Shortage' | 'Surplus';
  requiresExplanation: boolean;
}

export function calculateCashReconciliation(input: CashReconciliationInput): CashReconciliationResult {
  const openingCash = Math.max(0, parseVndAmount(input.openingCash));
  const posCashRevenue = Math.max(0, parseVndAmount(input.posCashRevenue));
  const cashExpense = Math.max(0, parseVndAmount(input.cashExpense));
  const closingCash = Math.max(0, parseVndAmount(input.closingCash));

  const expectedCash = Math.round(openingCash + posCashRevenue - cashExpense);
  const discrepancy = Math.round(closingCash - expectedCash);

  const hasPrevious =
    input.previousClosingCash !== undefined &&
    input.previousClosingCash !== null &&
    String(input.previousClosingCash).trim() !== '';
  const prevClosing = hasPrevious ? Math.max(0, parseVndAmount(input.previousClosingCash)) : openingCash;
  const openingMismatch = hasPrevious ? Math.round(openingCash - prevClosing) : 0;

  const status: 'Matched' | 'Shortage' | 'Surplus' =
    discrepancy === 0 ? 'Matched' : discrepancy < 0 ? 'Shortage' : 'Surplus';

  const requiresExplanation = discrepancy !== 0 || openingMismatch !== 0 || cashExpense > 0;

  return {
    openingCash,
    posCashRevenue,
    cashExpense,
    expectedCash,
    closingCash,
    discrepancy,
    openingMismatch,
    status,
    requiresExplanation,
  };
}

export function normalizeIncidentStatus(raw?: string | null): IncidentStatus {
  const clean = String(raw || '').trim();
  if (clean === 'Investigating') return 'Investigating';
  if (clean === 'Resolved') return 'Resolved';
  if (clean === 'CostRecorded') return 'CostRecorded';
  return 'Open';
}

export const INCIDENT_STATUS_STEPS: {
  id: IncidentStatus;
  label: string;
  shortLabel: string;
  badgeClass: string;
}[] = [
  {
    id: 'Open',
    label: '1. Mới báo sự cố',
    shortLabel: 'Mới báo',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
  {
    id: 'Investigating',
    label: '2. Đang kiểm tra / xử lý',
    shortLabel: 'Đang xử lý',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    id: 'Resolved',
    label: '3. Đã khắc phục xong',
    shortLabel: 'Đã khắc phục',
    badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'CostRecorded',
    label: '4. Đã chốt chi phí',
    shortLabel: 'Đã chốt chi phí',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
];

function parseIsoMs(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function mergeSingleItemState(
  existing: ChecklistSavedItemState | undefined,
  incoming: Partial<ChecklistSavedItemState>,
  isExplicitDelta: boolean
): ChecklistSavedItemState {
  if (!existing) {
    return {
      checked: Boolean(incoming.checked),
      note: String(incoming.note ?? ''),
      subchecks: { ...(incoming.subchecks || {}) },
      by: incoming.by || '',
      at: incoming.at || new Date().toISOString(),
    };
  }

  const existingMs = parseIsoMs(existing.at);
  const incomingMs = parseIsoMs(incoming.at);
  const incomingIsNewerOrEqual = isExplicitDelta || incomingMs >= existingMs;

  // Merge subchecks: for explicit delta, apply incoming subcheck keys onto existing subchecks so
  // two staff ticking different subtasks of the same parent item preserve both!
  const mergedSubchecks: Record<string, boolean> = {
    ...(existing.subchecks || {}),
  };
  if (incoming.subchecks) {
    for (const [subKey, subVal] of Object.entries(incoming.subchecks)) {
      if (incomingIsNewerOrEqual || mergedSubchecks[subKey] === undefined) {
        mergedSubchecks[subKey] = Boolean(subVal);
      }
    }
  }

  return {
    checked: incomingIsNewerOrEqual && incoming.checked !== undefined ? Boolean(incoming.checked) : existing.checked,
    note:
      incomingIsNewerOrEqual && incoming.note !== undefined && (incoming.note !== '' || isExplicitDelta)
        ? String(incoming.note)
        : existing.note || '',
    subchecks: mergedSubchecks,
    by: (incomingIsNewerOrEqual && incoming.by) || existing.by || '',
    at: incomingMs >= existingMs ? incoming.at || existing.at : existing.at,
  };
}

/**
 * Merges checklist area state from multiple concurrent staff members without clobbering
 * teammates' checked items, notes, subtasks, participants, supply proposals, or signatures.
 */
export function mergeChecklistAreaState(
  existingRaw: Partial<ChecklistSavedAreaState> | null | undefined,
  patch: ChecklistAreaPatch
): ChecklistSavedAreaState {
  const existing: ChecklistSavedAreaState = {
    participants: Array.isArray(existingRaw?.participants) ? [...existingRaw!.participants] : [],
    items: existingRaw?.items && typeof existingRaw.items === 'object' ? { ...existingRaw.items } : {},
    supply: existingRaw?.supply && typeof existingRaw.supply === 'object' ? { ...existingRaw.supply } : {},
    signatures:
      existingRaw?.signatures && typeof existingRaw.signatures === 'object' ? { ...existingRaw.signatures } : {},
  };

  // 1. Merge participants (union by key and case-insensitive name, minus explicit removals)
  const removedKeys = new Set(patch.removedParticipantKeys || []);
  const participantMap = new Map<string, ChecklistParticipant>();
  const seenNames = new Set<string>();

  for (const p of existing.participants) {
    if (!p || removedKeys.has(p.key)) continue;
    participantMap.set(p.key, p);
    if (p.name) seenNames.add(p.name.trim().toLowerCase());
  }

  if (Array.isArray(patch.participants)) {
    for (const p of patch.participants) {
      if (!p || removedKeys.has(p.key)) continue;
      const normName = String(p.name || '').trim().toLowerCase();
      if (!participantMap.has(p.key) && (!normName || !seenNames.has(normName))) {
        participantMap.set(p.key, p);
        if (normName) seenNames.add(normName);
      }
    }
  }

  // 2. Merge items: prefer explicit deltaItems when provided; otherwise timestamp-merge incoming items
  //    without ever deleting keys that already exist in `existing.items`.
  const mergedItems: Record<string, ChecklistSavedItemState> = { ...existing.items };
  if (patch.deltaItems && typeof patch.deltaItems === 'object') {
    for (const [itemId, itemUpdate] of Object.entries(patch.deltaItems)) {
      if (!itemUpdate || itemId.startsWith('_')) continue;
      mergedItems[itemId] = mergeSingleItemState(mergedItems[itemId], itemUpdate, true);
    }
  } else if (patch.items && typeof patch.items === 'object') {
    for (const [itemId, itemUpdate] of Object.entries(patch.items)) {
      if (!itemUpdate || itemId.startsWith('_')) continue;
      mergedItems[itemId] = mergeSingleItemState(mergedItems[itemId], itemUpdate, false);
    }
  }

  // 3. Merge supply proposals
  const mergedSupply: Record<string, any> = { ...existing.supply };
  if (patch.supply && typeof patch.supply === 'object') {
    for (const [k, v] of Object.entries(patch.supply)) {
      if (k === 'note') {
        if (typeof v === 'string' && v.trim() !== '') {
          mergedSupply.note = v;
        } else if (!mergedSupply.note && typeof v === 'string') {
          mergedSupply.note = v;
        }
      } else if (v !== undefined) {
        mergedSupply[k] = v;
      }
    }
  }

  // 4. Merge signatures without wiping non-empty signatures unless explicitly patched in deltaSignatures
  const mergedSignatures: ChecklistSavedAreaState['signatures'] = { ...existing.signatures };
  if (patch.deltaSignatures && typeof patch.deltaSignatures === 'object') {
    for (const key of ['receive', 'handover', 'manager'] as const) {
      if (patch.deltaSignatures[key] !== undefined) {
        mergedSignatures[key] = patch.deltaSignatures[key];
      }
    }
  } else if (patch.signatures && typeof patch.signatures === 'object') {
    for (const key of ['receive', 'handover', 'manager'] as const) {
      const val = patch.signatures[key];
      if (typeof val === 'string' && val.trim() !== '') {
        mergedSignatures[key] = val;
      }
    }
  }

  return {
    participants: Array.from(participantMap.values()),
    items: mergedItems,
    supply: mergedSupply,
    signatures: mergedSignatures,
    savedAt: new Date().toISOString(),
  };
}
