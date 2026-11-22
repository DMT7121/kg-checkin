import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore, type User } from '../store/useAppStore';
import { kgAlert, kgConfirm, kgToast } from '../store/useFeedbackStore';
import { callApi } from '../services/api';
import { getPreviewShiftClass } from '../utils/helpers';
import { navigateToHubSubTab } from '../utils/hubNavigation';
import {
  Check,
  ChevronDown,
  Circle,
  ClipboardCheck,
  CheckSquare,
  CheckSquare2,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react';
import { KgButton, KgFeatureTip, KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';
import { mergeChecklistAreaState } from '../utils/operationsReconciliation';
import {
  emptyOperationsConfig,
  normalizeOperationsConfig,
  todayIso,
  type OperationAssignment,
  type OperationTask,
  type OperationTaskLog,
  type OperationsConfig,
} from '../types/operations';

// Configuration keys
const AREA_CODES = ['A', 'B', 'C', 'D&E'] as const;
type AreaCode = (typeof AREA_CODES)[number];

const AREA_STATION_LABELS: Record<AreaCode, string> = {
  A: 'Sảnh trước & Bàn ăn',
  B: 'Quầy Bar & Thu ngân',
  C: 'Bếp & Kho thực phẩm',
  'D&E': 'Sảnh sau & Khu WC',
};

interface Subtask {
  id: string;
  text: string;
}

interface ChecklistItem {
  no: number;
  id: string;
  title: string;
  text: string;
  subitems: Subtask[];
  groupKey: string;
}

interface ChecklistGroup {
  phase: string;
  shift: string;
  section: string;
  items: ChecklistItem[];
}

interface SavedItemState {
  checked: boolean;
  note: string;
  subchecks: Record<string, boolean>;
  by?: string;
  at?: string;
}

interface SavedAreaState {
  participants: { key: string; name: string; joinedAt: string }[];
  items: Record<string, SavedItemState>;
  supply: Record<string, any>;
  signatures: { receive?: string; handover?: string; manager?: string };
}

interface ChecklistDraftAreaPayload {
  pending: Record<string, Partial<SavedItemState>>;
  removedParticipantKeys: string[];
  pendingSupply: Record<string, any> | null;
  pendingSignatures: SavedAreaState['signatures'] | null;
  updatedAt: string;
}

const getChecklistDraftStorageKey = (
  username: string | undefined,
  dateStr: string,
  shiftName: string,
) => `kg_ops_checklist_draft_${username || 'anon'}_${dateStr}_${shiftName || 'default'}`;

const readChecklistDrafts = (key: string): Record<string, ChecklistDraftAreaPayload> => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const clearAreaChecklistDraft = (key: string, area: AreaCode) => {
  try {
    const map = readChecklistDrafts(key);
    if (!map[area]) return;
    delete map[area];
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch {
    // ignore storage errors
  }
};

const VN_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
});

function formatChecklistVnTime(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const formatted = VN_TIME_FORMATTER.format(parsed);
    return formatted.startsWith('24:') ? `00:${formatted.slice(3)}` : formatted;
  }
  const match = String(value).match(/\b(\d{2}:\d{2})\b/);
  return match ? match[1] : String(value);
}

function matchZoneToAreaCode(zoneName?: string): AreaCode | null {
  if (!zoneName) return null;
  const norm = zoneName.trim().toLowerCase();
  if (/d\s*&?\s*e|\bd\b.*\be\b|sảnh sau|wc/.test(norm)) return 'D&E';
  if (/khu\s*a\b|^a\b|sảnh trước/.test(norm)) return 'A';
  if (/khu\s*b\b|^b\b|bar|thu ngân/.test(norm)) return 'B';
  if (/khu\s*c\b|^c\b|bếp|kho/.test(norm)) return 'C';
  return null;
}

export default function Checklist() {
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const shiftName = useAppStore((s) => s.shiftName);
  const setGlobalLoading = useAppStore((s) => s.setLoading);
  const setTodayChecklistDone = useAppStore((s) => s.setTodayChecklistDone);

  const [loading, setLoading] = useState(true);
  const [refreshingTeammates, setRefreshingTeammates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workDate, setWorkDate] = useState(() => todayIso());

  const [checklist, setChecklist] = useState<ChecklistGroup[]>([]);
  const [states, setStates] = useState<Record<string, SavedAreaState>>({});
  const [selectedArea, setSelectedArea] = useState<AreaCode | null>(() => {
    try {
      const savedSession = localStorage.getItem('kg_ops_checklist_session_v7');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        if (sessionData.area && AREA_CODES.includes(sessionData.area)) {
          return sessionData.area as AreaCode;
        }
      }
    } catch {
      // Ignore invalid localStorage session
    }
    return null;
  });
  const [activePhase, setActivePhase] = useState<string>('ALL');

  // Merged Operations state ("Nhóm trực & Khu phân công hôm nay" + optional extra dispatch tasks)
  const [opsConfig, setOpsConfig] = useState<OperationsConfig>(emptyOperationsConfig);
  const [opsTaskLogs, setOpsTaskLogs] = useState<OperationTaskLog[]>([]);
  const [opsTeamMembers, setOpsTeamMembers] = useState<User[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [updatingOpsTaskId, setUpdatingOpsTaskId] = useState('');
  const [showExtraOpsTasks, setShowExtraOpsTasks] = useState(false);
  const autoSelectedZoneRef = useRef(false);

  // Offline / fallback pending buffer (persisted per username + date + shift)
  const [pending, setPending] = useState<Record<string, Partial<SavedItemState>>>({});
  const [removedParticipantKeys, setRemovedParticipantKeys] = useState<string[]>([]);
  const [pendingSupply, setPendingSupply] = useState<Record<string, any> | null>(null);
  const [pendingSignatures, setPendingSignatures] = useState<SavedAreaState['signatures'] | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Participant search input
  const [participantInput, setParticipantInput] = useState('');

  const draftStorageKey = getChecklistDraftStorageKey(
    currentUser?.username,
    workDate,
    shiftName,
  );
  const hydratedDraftIdRef = useRef<string | null>(null);

  // Hydrate persisted pending draft for (username + date + shift + area)
  useEffect(() => {
    if (!selectedArea) {
      hydratedDraftIdRef.current = null;
      return;
    }
    const targetDraftId = `${draftStorageKey}::${selectedArea}`;
    const drafts = readChecklistDrafts(draftStorageKey);
    const savedDraft = drafts[selectedArea];
    if (savedDraft) {
      setPending(savedDraft.pending || {});
      setRemovedParticipantKeys(savedDraft.removedParticipantKeys || []);
      setPendingSupply(savedDraft.pendingSupply ?? null);
      setPendingSignatures(savedDraft.pendingSignatures ?? null);
    } else {
      setPending({});
      setRemovedParticipantKeys([]);
      setPendingSupply(null);
      setPendingSignatures(null);
    }
    setNoteDrafts({});
    hydratedDraftIdRef.current = targetDraftId;
  }, [draftStorageKey, selectedArea]);

  // Persist pending offline/fallback draft to localStorage whenever buffered changes update
  useEffect(() => {
    if (!selectedArea) return;
    const targetDraftId = `${draftStorageKey}::${selectedArea}`;
    if (hydratedDraftIdRef.current !== targetDraftId) return;

    const hasDraft =
      Object.keys(pending).length > 0 ||
      removedParticipantKeys.length > 0 ||
      pendingSupply !== null ||
      pendingSignatures !== null;

    if (!hasDraft) {
      clearAreaChecklistDraft(draftStorageKey, selectedArea);
      return;
    }

    try {
      const map = readChecklistDrafts(draftStorageKey);
      map[selectedArea] = {
        pending,
        removedParticipantKeys,
        pendingSupply,
        pendingSignatures,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(map));
    } catch {
      // ignore storage quota errors
    }
  }, [
    draftStorageKey,
    selectedArea,
    pending,
    removedParticipantKeys,
    pendingSupply,
    pendingSignatures,
  ]);

  // Load Operations assignment & team context (merged from Operations.tsx, preserves employmentProfile refresh)
  const loadOperationsContext = useCallback(async () => {
    const user = useAppStore.getState().currentUser;
    if (!user) return;
    setOpsLoading(true);
    try {
      const res = await callApi(
        'GET_OPERATIONS_CONFIG',
        {
          role: user.role,
          username: user.username,
          forceRefresh: true,
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 35000 },
      );
      if (res?.ok) {
        if (res.data?.employmentProfile) {
          const refreshedUser = { ...user, ...res.data.employmentProfile };
          setCurrentUser(refreshedUser);
          try {
            localStorage.setItem('kg_user', JSON.stringify(refreshedUser));
          } catch {
            // ignore storage errors
          }
        }
        const normalizedConfig = normalizeOperationsConfig(res.data?.config);
        setOpsConfig(normalizedConfig);
        setOpsTaskLogs(Array.isArray(res.data?.taskLogs) ? res.data.taskLogs : []);
        setOpsTeamMembers(Array.isArray(res.data?.members) ? res.data.members : []);
      }
    } catch {
      // Non-blocking: checklist still works even if dispatch banner fails to load
    } finally {
      setOpsLoading(false);
    }
  }, [setCurrentUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOperationsContext();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOperationsContext]);

  // Load checklist structure & saved area states
  useEffect(() => {
    let isCancelled = false;
    const loadInitialChecklist = async () => {
      setLoading(true);
      try {
        const res = await callApi('GET_OPS_CHECKLIST_INIT', { dateStr: workDate });
        if (!isCancelled && res?.ok && res.data) {
          setChecklist(res.data.checklist || []);
          setStates(res.data.states || {});
        }
      } catch (err) {
        if (!isCancelled) {
          console.error(err);
          kgToast('Không thể kết nối server để nạp dữ liệu checklist.', 'error', 'Lỗi');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    void loadInitialChecklist();
    return () => {
      isCancelled = true;
    };
  }, [workDate]);

  // Derived Operations context for today / workDate
  const directoryUsers = users.length ? users : opsTeamMembers;
  const myTeam = useMemo(
    () =>
      opsConfig.teams.find(
        (team) =>
          currentUser &&
          (team.leaderUsername === currentUser.username ||
            team.memberUsernames.includes(currentUser.username)),
      ),
    [opsConfig.teams, currentUser],
  );

  const dateAssignments = useMemo(
    () =>
      opsConfig.assignments.filter((assignment) => assignment.date === workDate),
    [opsConfig.assignments, workDate],
  );

  const myTodayAssignment = useMemo<OperationAssignment | null>(() => {
    if (!dateAssignments.length) return null;
    if (myTeam) {
      const teamMatch = dateAssignments.find((a) => a.teamId === myTeam.id);
      if (teamMatch) return teamMatch;
    }
    if (currentUser?.username) {
      const shiftMatch = dateAssignments.find(
        (a) => a.memberShifts && a.memberShifts[currentUser.username] && a.memberShifts[currentUser.username] !== 'OFF',
      );
      if (shiftMatch) return shiftMatch;
    }
    return dateAssignments[0] || null;
  }, [dateAssignments, myTeam, currentUser?.username]);

  const assignedZone = useMemo(
    () =>
      myTodayAssignment
        ? opsConfig.zones.find((z) => z.id === myTodayAssignment.zoneId) || null
        : null,
    [opsConfig.zones, myTodayAssignment],
  );

  const assignedAreaCode = useMemo(
    () => matchZoneToAreaCode(assignedZone?.name),
    [assignedZone?.name],
  );

  // Auto-preselect user's assigned zone A/B/C/D&E when no area is chosen yet
  useEffect(() => {
    if (autoSelectedZoneRef.current || selectedArea || !assignedAreaCode) return;
    autoSelectedZoneRef.current = true;
    setSelectedArea(assignedAreaCode);
    try {
      const name = currentUser?.fullname || currentUser?.username || '';
      localStorage.setItem('kg_ops_checklist_session_v7', JSON.stringify({ name, area: assignedAreaCode }));
    } catch {
      // ignore storage errors
    }
  }, [assignedAreaCode, selectedArea, currentUser?.fullname, currentUser?.username]);

  // Relevant dispatch assignment & extra operation tasks for the currently selected area (or assigned zone)
  const activeOpsAssignment = useMemo<OperationAssignment | null>(() => {
    if (!dateAssignments.length) return null;
    if (selectedArea) {
      const areaMatch = dateAssignments.find((a) => {
        const z = opsConfig.zones.find((zone) => zone.id === a.zoneId);
        return matchZoneToAreaCode(z?.name) === selectedArea;
      });
      if (areaMatch) return areaMatch;
    }
    return myTodayAssignment;
  }, [dateAssignments, opsConfig.zones, selectedArea, myTodayAssignment]);

  const activeOpsTasks = useMemo<OperationTask[]>(() => {
    if (!activeOpsAssignment) return [];
    return opsConfig.tasks.filter((task) => task.zoneId === activeOpsAssignment.zoneId);
  }, [opsConfig.tasks, activeOpsAssignment]);

  const activeOpsCompletedIds = useMemo(() => {
    if (!activeOpsAssignment || !currentUser) return new Set<string>();
    return new Set(
      opsTaskLogs
        .filter((log) => log.assignmentId === activeOpsAssignment.id && log.username === currentUser.username)
        .map((log) => log.taskId),
    );
  }, [opsTaskLogs, activeOpsAssignment, currentUser]);

  const toggleOperationTask = async (
    assignment: OperationAssignment,
    taskId: string,
    completed: boolean,
  ) => {
    if (!currentUser) return;
    setUpdatingOpsTaskId(`${assignment.id}_${taskId}`);
    try {
      const res = await callApi('TOGGLE_OPERATION_TASK', {
        role: currentUser.role,
        username: currentUser.username,
        fullname: currentUser.fullname,
        assignmentId: assignment.id,
        taskId,
        date: assignment.date,
        completed,
      });
      if (!res?.ok) {
        kgToast(res?.message || 'Chưa cập nhật được đầu việc điều phối. Vui lòng thử lại.', 'error');
        return;
      }
      if (completed) {
        setOpsTaskLogs((current) => [
          ...current.filter(
            (log) =>
              !(
                log.assignmentId === assignment.id &&
                log.taskId === taskId &&
                log.username === currentUser.username
              ),
          ),
          {
            id: `${assignment.id}_${taskId}_${currentUser.username}`,
            date: assignment.date,
            assignmentId: assignment.id,
            taskId,
            username: currentUser.username,
            fullname: currentUser.fullname,
            completedAt: res.data?.completedAt || 'Vừa xong',
            status: 'Completed',
            note: '',
          },
        ]);
      } else {
        setOpsTaskLogs((current) =>
          current.filter(
            (log) =>
              !(
                log.assignmentId === assignment.id &&
                log.taskId === taskId &&
                log.username === currentUser.username
              ),
          ),
        );
      }
    } catch {
      kgToast('Lỗi kết nối khi cập nhật trạng thái nhiệm vụ.', 'error');
    } finally {
      setUpdatingOpsTaskId('');
    }
  };

  // Pull latest teammates' progress without wiping local unsaved pending ticks
  const refreshTeammatesProgress = useCallback(async () => {
    setRefreshingTeammates(true);
    try {
      const res = await callApi(
        'GET_OPS_CHECKLIST_INIT',
        { dateStr: workDate, forceRefresh: true },
        { background: true, cacheTtlMs: 0 },
      );
      if (res?.ok && res.data?.states) {
        setStates((prev) => {
          const next = { ...prev };
          for (const area of AREA_CODES) {
            if (res.data.states[area]) {
              next[area] = mergeChecklistAreaState(res.data.states[area], {
                participants: prev[area]?.participants || [],
              });
            }
          }
          return next;
        });
      }
      void loadOperationsContext();
    } catch {
      // Silent background refresh
    } finally {
      setRefreshingTeammates(false);
    }
  }, [workDate, loadOperationsContext]);

  const sessionName = currentUser?.fullname || currentUser?.username || '';

  // Get active area data (merged with pending values)
  const areaData = useMemo<SavedAreaState>(() => {
    if (!selectedArea) {
      return { participants: [], items: {}, supply: {}, signatures: {} };
    }
    const rawState = states[selectedArea] || { participants: [], items: {}, supply: {}, signatures: {} };
    return {
      participants: rawState.participants || [],
      items: rawState.items || {},
      supply: rawState.supply || {},
      signatures: rawState.signatures || {},
    };
  }, [states, selectedArea]);

  const flatItems = useMemo(() => {
    return checklist.flatMap((group) => group.items.map((item) => ({ ...item, group })));
  }, [checklist]);

  const getMergedItemState = useCallback(
    (item: ChecklistItem): SavedItemState => {
      const saved = areaData.items[item.id] || { checked: false, note: '', subchecks: {} };
      const p = pending[item.id] || {};

      const subchecks = {
        ...(saved.subchecks || {}),
        ...(p.subchecks || {}),
      };

      const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
      const checked = hasSubtasks
        ? item.subitems.every((sub) => !!subchecks[sub.id])
        : p.checked !== undefined
          ? p.checked
          : !!saved.checked;

      return {
        checked,
        note: p.note !== undefined ? p.note : saved.note || '',
        subchecks,
        by: p.by || saved.by || '',
        at: p.at || saved.at || '',
      };
    },
    [areaData.items, pending],
  );

  const savedDraftsMap = useMemo(() => {
    void pending;
    void removedParticipantKeys;
    void pendingSupply;
    void pendingSignatures;
    void selectedArea;
    return readChecklistDrafts(draftStorageKey);
  }, [draftStorageKey, selectedArea, pending, removedParticipantKeys, pendingSupply, pendingSignatures]);

  const getAreaPendingItems = useCallback(
    (area: AreaCode): Record<string, Partial<SavedItemState>> => {
      if (area === selectedArea) return pending;
      return savedDraftsMap[area]?.pending || {};
    },
    [selectedArea, pending, savedDraftsMap],
  );

  const isItemCompleteForArea = useCallback(
    (area: AreaCode, item: ChecklistItem): boolean => {
      const saved = states[area]?.items?.[item.id] || { checked: false, subchecks: {} };
      const areaPending = getAreaPendingItems(area)[item.id] || {};
      const mergedSubchecks = {
        ...(saved.subchecks || {}),
        ...(areaPending.subchecks || {}),
      };
      const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
      if (hasSubtasks) {
        return item.subitems.every((sub) => !!mergedSubchecks[sub.id]);
      }
      return areaPending.checked !== undefined ? !!areaPending.checked : !!saved.checked;
    },
    [states, getAreaPendingItems],
  );

  // Sync state to Google Sheets with concurrent-safe delta merging
  const syncToServer = async (
    area: AreaCode,
    participants: SavedAreaState['participants'],
    items: SavedAreaState['items'],
    supply: SavedAreaState['supply'],
    signatures: SavedAreaState['signatures'],
    deltaItems: Record<string, Partial<SavedItemState>> = {},
    removedKeys: string[] = [],
    deltaSignatures?: Partial<SavedAreaState['signatures']>,
    silentSuccess = false,
  ): Promise<boolean> => {
    setIsSaving(true);
    if (!silentSuccess) {
      setGlobalLoading(true, 'Đang đồng bộ tiến độ Checklist an toàn...');
    }

    try {
      let latestRemoteAreaState: SavedAreaState | undefined = states[area];
      try {
        const freshRes = await callApi(
          'GET_OPS_CHECKLIST_INIT',
          { dateStr: workDate, forceRefresh: true },
          { background: true, cacheTtlMs: 0 },
        );
        if (freshRes?.ok && freshRes.data?.states?.[area]) {
          latestRemoteAreaState = freshRes.data.states[area];
        }
      } catch {
        // Proceed with cached base if pre-read times out
      }

      const preMerged = mergeChecklistAreaState(latestRemoteAreaState, {
        participants,
        removedParticipantKeys: removedKeys,
        items,
        deltaItems: Object.keys(deltaItems).length > 0 ? deltaItems : undefined,
        supply,
        signatures,
        deltaSignatures,
      });

      const res = await callApi(
        'SAVE_OPS_CHECKLIST_STATE',
        {
          dateStr: workDate,
          area,
          username: currentUser?.username,
          fullname: currentUser?.fullname,
          participants: preMerged.participants,
          removedParticipantKeys: removedKeys,
          items: preMerged.items,
          deltaItems,
          supply: preMerged.supply,
          signatures: preMerged.signatures,
          deltaSignatures,
        },
        { background: silentSuccess },
      );

      if (res?.ok) {
        const serverMerged: SavedAreaState = res.data?.state
          ? mergeChecklistAreaState(preMerged, res.data.state)
          : preMerged;

        if (Object.values(serverMerged.items).some((it) => it?.checked)) {
          setTodayChecklistDone(true);
        }

        setStates((prev) => ({
          ...prev,
          [area]: serverMerged,
        }));

        if (!silentSuccess) {
          setPending({});
          setRemovedParticipantKeys([]);
          setPendingSupply(null);
          setPendingSignatures(null);
          setNoteDrafts({});
          clearAreaChecklistDraft(draftStorageKey, area);
          kgToast('Đã đồng bộ & gộp tiến độ cùng đồng đội!', 'success', undefined, 2600);
        }
        return true;
      }
      throw new Error(res?.message || 'API error');
    } catch (err) {
      console.error(err);
      if (!silentSuccess) {
        void kgAlert(
          'Lỗi đồng bộ',
          'Không thể gửi dữ liệu lên máy chủ. Tiến độ đã được lưu nháp trên thiết bị để bạn bấm Đồng bộ lại.',
          'error',
        );
      }
      return false;
    } finally {
      setIsSaving(false);
      if (!silentSuccess) {
        setGlobalLoading(false);
      }
    }
  };

  // Atomic single-item patch (default mode) with offline/draft fallback into `pending`
  const syncSingleItemDelta = async (
    area: AreaCode,
    itemId: string,
    stateUpdate: Partial<SavedItemState>,
  ) => {
    // Apply optimistically to local area state right away for crisp instant UX
    setStates((prev) => {
      const base = prev[area] || { participants: [], items: {}, supply: {}, signatures: {} };
      return {
        ...prev,
        [area]: mergeChecklistAreaState(base, {
          participants: areaData.participants,
          deltaItems: { [itemId]: stateUpdate },
        }),
      };
    });

    // If offline right now, persist immediately in draft buffer for later sync
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPending((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...stateUpdate },
      }));
      kgToast('Đang mất mạng — đã lưu nháp trên máy để đồng bộ sau.', 'warning', undefined, 2400);
      return;
    }

    setIsSaving(true);
    try {
      const patchRes = await callApi(
        'PATCH_OPS_CHECKLIST_ITEM',
        {
          dateStr: workDate,
          area,
          username: currentUser?.username,
          fullname: currentUser?.fullname,
          participants: areaData.participants,
          itemId,
          checked: stateUpdate.checked,
          note: stateUpdate.note,
          subchecks: stateUpdate.subchecks,
          by: stateUpdate.by || sessionName,
          at: stateUpdate.at || new Date().toISOString(),
        },
        { background: true },
      );

      if (patchRes?.ok) {
        if (stateUpdate.checked) setTodayChecklistDone(true);
        setStates((prev) => {
          const base = prev[area] || { participants: [], items: {}, supply: {}, signatures: {} };
          const nextAreaState = patchRes.data?.state
            ? mergeChecklistAreaState(base, patchRes.data.state)
            : mergeChecklistAreaState(base, {
                participants: areaData.participants,
                deltaItems: { [itemId]: stateUpdate },
              });
          return { ...prev, [area]: nextAreaState };
        });
        setPending((prev) => {
          if (!(itemId in prev)) return prev;
          const copy = { ...prev };
          delete copy[itemId];
          return copy;
        });
        return;
      }

      // Fallback to concurrent-safe SAVE_OPS_CHECKLIST_STATE if PATCH endpoint unavailable
      const fallbackMerged = mergeChecklistAreaState(states[area], {
        participants: areaData.participants,
        deltaItems: { [itemId]: stateUpdate },
      });
      const fallbackOk = await syncToServer(
        area,
        fallbackMerged.participants,
        fallbackMerged.items,
        fallbackMerged.supply,
        fallbackMerged.signatures,
        { [itemId]: stateUpdate },
        [],
        undefined,
        true,
      );
      if (!fallbackOk) {
        setPending((prev) => ({
          ...prev,
          [itemId]: { ...(prev[itemId] || {}), ...stateUpdate },
        }));
        kgToast('Kết nối yếu — đã lưu tạm mục này trên thiết bị.', 'warning', undefined, 2400);
      }
    } catch {
      setPending((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), ...stateUpdate },
      }));
      kgToast('Chưa gửi được — đã lưu nháp trên thiết bị để đồng bộ sau.', 'warning', undefined, 2400);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle joining checklist area
  const handleJoinArea = async (area: AreaCode) => {
    if (selectedArea === area) return;
    if (Object.keys(pending).length || pendingSupply || pendingSignatures) {
      const confirmed = await kgConfirm({
        title: 'Có thay đổi chưa đồng bộ',
        message: 'Bạn có thay đổi lưu nháp chưa đồng bộ lên máy chủ. Bạn vẫn muốn chuyển khu vực chứ?',
        confirmLabel: 'Chuyển và bỏ qua nháp',
        cancelLabel: 'Hủy',
        tone: 'warning',
      });
      if (confirmed) {
        performJoinArea(area);
      }
    } else {
      performJoinArea(area);
    }
  };

  const performJoinArea = (area: AreaCode) => {
    if (selectedArea) {
      clearAreaChecklistDraft(draftStorageKey, selectedArea);
    }
    setSelectedArea(area);
    setPending({});
    setRemovedParticipantKeys([]);
    setPendingSupply(null);
    setPendingSignatures(null);
    setNoteDrafts({});

    try {
      localStorage.setItem('kg_ops_checklist_session_v7', JSON.stringify({ name: sessionName, area }));
    } catch {
      // ignore storage errors
    }

    const rawState = states[area] || { participants: [], items: {}, supply: {}, signatures: {} };
    const participants = [...(rawState.participants || [])];
    const key = currentUser?.username || 'user';

    if (!participants.some((p) => p.key === key)) {
      participants.push({
        key,
        name: currentUser?.fullname || 'Nhân viên',
        joinedAt: new Date().toISOString(),
      });
      setStates((prev) => ({
        ...prev,
        [area]: {
          ...rawState,
          participants,
        },
      }));
      void syncToServer(area, participants, rawState.items, rawState.supply, rawState.signatures, {}, [], undefined, true);
    }
  };

  const handleAddParticipant = async () => {
    if (!selectedArea || !participantInput.trim()) return;

    const rawState = states[selectedArea] || { participants: [], items: {}, supply: {}, signatures: {} };
    const participants = [...(rawState.participants || [])];
    const newName = participantInput.trim();
    const key = 'custom_' + Date.now();

    if (!participants.some((p) => p.name.toLowerCase() === newName.toLowerCase())) {
      participants.push({
        key,
        name: newName,
        joinedAt: new Date().toISOString(),
      });
      setStates((prev) => ({
        ...prev,
        [selectedArea]: {
          ...rawState,
          participants,
        },
      }));
      setParticipantInput('');

      const ok = await syncToServer(
        selectedArea,
        participants,
        rawState.items,
        rawState.supply,
        rawState.signatures,
        {},
        [],
        undefined,
        true,
      );
      if (!ok) {
        setPending((p) => ({ ...p, _participants_trigger: {} }));
      }
    }
  };

  const eligibleDirectoryUsers = useMemo(() => {
    const teamSet = new Set(myTeam?.memberUsernames || []);
    return directoryUsers
      .filter((u) => isWorkEligible(u))
      .sort((a, b) => {
        const aInTeam = teamSet.has(a.username) ? 0 : 1;
        const bInTeam = teamSet.has(b.username) ? 0 : 1;
        if (aInTeam !== bInTeam) return aInTeam - bInTeam;
        return (a.fullname || a.username).localeCompare(b.fullname || b.username, 'vi');
      });
  }, [directoryUsers, myTeam]);

  const handleToggleDirectoryParticipant = async (user: User) => {
    if (!selectedArea) return;
    const displayName = (user.fullname || user.username).trim();
    const rawState = states[selectedArea] || { participants: [], items: {}, supply: {}, signatures: {} };
    const currentParticipants = rawState.participants || [];
    const existing = currentParticipants.find(
      (p) => p.key === user.username || p.name.trim().toLowerCase() === displayName.toLowerCase(),
    );
    if (existing) {
      await handleRemoveParticipant(existing.key);
      return;
    }

    const participants = [
      ...currentParticipants,
      {
        key: user.username,
        name: displayName,
        joinedAt: new Date().toISOString(),
      },
    ];
    setStates((prev) => ({
      ...prev,
      [selectedArea]: {
        ...rawState,
        participants,
      },
    }));

    const ok = await syncToServer(
      selectedArea,
      participants,
      rawState.items,
      rawState.supply,
      rawState.signatures,
      {},
      [],
      undefined,
      true,
    );
    if (!ok) {
      setPending((p) => ({ ...p, _participants_trigger: {} }));
    }
  };

  const handleRemoveParticipant = async (key: string) => {
    if (!selectedArea) return;
    const rawState = states[selectedArea] || { participants: [], items: {}, supply: {}, signatures: {} };
    const participants = (rawState.participants || []).filter((p) => p.key !== key);
    const nextRemoved = Array.from(new Set([...removedParticipantKeys, key]));

    setStates((prev) => ({
      ...prev,
      [selectedArea]: {
        ...rawState,
        participants,
      },
    }));

    const ok = await syncToServer(
      selectedArea,
      participants,
      rawState.items,
      rawState.supply,
      rawState.signatures,
      {},
      nextRemoved,
      undefined,
      true,
    );
    if (ok) {
      setRemovedParticipantKeys([]);
    } else {
      setRemovedParticipantKeys(nextRemoved);
      setPending((p) => ({ ...p, _participants_trigger: {} }));
    }
  };

  const handleToggleItem = async (item: ChecklistItem, checked: boolean) => {
    if (!selectedArea) return;

    const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
    const subchecks: Record<string, boolean> = {};
    if (hasSubtasks) {
      item.subitems.forEach((sub) => {
        subchecks[sub.id] = checked;
      });
    }

    const stateUpdate: Partial<SavedItemState> = {
      checked,
      subchecks,
      by: sessionName,
      at: new Date().toISOString(),
    };

    await syncSingleItemDelta(selectedArea, item.id, stateUpdate);
  };

  const handleToggleSubtask = async (item: ChecklistItem, subId: string, checked: boolean) => {
    if (!selectedArea) return;

    const currentItemState = getMergedItemState(item);
    const mergedSubchecks = {
      ...(currentItemState.subchecks || {}),
      [subId]: checked,
    };

    const allChecked = item.subitems.every((sub) => !!mergedSubchecks[sub.id]);

    const stateUpdate: Partial<SavedItemState> = {
      checked: allChecked,
      subchecks: { ...(pending[item.id]?.subchecks || {}), [subId]: checked },
      by: sessionName,
      at: new Date().toISOString(),
    };

    await syncSingleItemDelta(selectedArea, item.id, stateUpdate);
  };

  const handleSaveNote = async (itemId: string, noteText: string) => {
    if (!selectedArea) return;

    const item = flatItems.find((x) => x.id === itemId);
    if (!item) return;

    const currentItemState = getMergedItemState(item);
    if ((currentItemState.note || '') === noteText) return;

    const stateUpdate: Partial<SavedItemState> = {
      checked: currentItemState.checked,
      note: noteText,
      by: sessionName,
      at: new Date().toISOString(),
    };

    await syncSingleItemDelta(selectedArea, itemId, stateUpdate);
    kgToast('Đã lưu ghi chú!', 'success', undefined, 1800);
  };

  const handleSupplyChange = (key: string, value: any) => {
    const currentSupply = pendingSupply || areaData.supply || {};
    setPendingSupply({
      ...currentSupply,
      [key]: value,
      by: sessionName,
      savedAt: new Date().toISOString(),
    });
  };

  const handleSaveSupply = async () => {
    if (!selectedArea || !pendingSupply) return;

    const ok = await syncToServer(
      selectedArea,
      areaData.participants,
      areaData.items,
      pendingSupply,
      areaData.signatures,
      {},
    );
    if (ok) {
      setPendingSupply(null);
    }
  };

  const handleSyncAllPending = async () => {
    if (!selectedArea) return;

    const cleanDeltaItems: Record<string, Partial<SavedItemState>> = {};
    Object.entries(pending).forEach(([id, update]) => {
      if (id.startsWith('_')) return;
      cleanDeltaItems[id] = update;
    });

    const localMerged = mergeChecklistAreaState(areaData, {
      participants: areaData.participants,
      removedParticipantKeys,
      deltaItems: cleanDeltaItems,
      supply: pendingSupply || areaData.supply,
      signatures: pendingSignatures || areaData.signatures,
      deltaSignatures: pendingSignatures || undefined,
    });

    await syncToServer(
      selectedArea,
      localMerged.participants,
      localMerged.items,
      localMerged.supply,
      localMerged.signatures,
      cleanDeltaItems,
      removedParticipantKeys,
      pendingSignatures || undefined,
    );
  };

  const isGroupVisible = useCallback(
    (group: ChecklistGroup) => {
      return activePhase === 'ALL' || group.phase === activePhase || group.shift === activePhase;
    },
    [activePhase],
  );

  const activeMetrics = useMemo(() => {
    const activeItems = flatItems.filter((item) => isGroupVisible(item.group));
    const total = activeItems.length;
    const done = activeItems.filter((item) => getMergedItemState(item).checked).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const subTotal = activeItems.reduce((s, i) => s + (i.subitems?.length || 0), 0);
    const subDone = activeItems.reduce((s, item) => {
      const state = getMergedItemState(item);
      const doneCount = (item.subitems || []).filter((sub) => !!state.subchecks?.[sub.id]).length;
      return s + doneCount;
    }, 0);

    return { done, total, subDone, subTotal, pct };
  }, [flatItems, getMergedItemState, isGroupVisible]);

  const tabs = [
    { key: 'ALL', label: 'Tất cả' },
    { key: 'CHECKLIST ĐẦU CA', label: 'Đầu ca' },
    { key: 'CHECKLIST CUỐI CA', label: 'Cuối ca' },
    { key: 'CA 15H: SETUP BÀN', label: 'Ca 15h' },
    { key: 'CA 17H: RÀ SOÁT & HOÀN THIỆN', label: 'Ca 17h' },
    { key: 'XUỐNG CA LẦN 1', label: 'Xuống ca 1' },
    { key: 'XUỐNG CA SAU CÙNG', label: 'Xuống ca cuối' },
  ];

  const hasPendingChanges =
    Object.keys(pending).length > 0 ||
    removedParticipantKeys.length > 0 ||
    pendingSupply !== null ||
    pendingSignatures !== null;

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="thực hiện checklist công việc" />;
  }

  const donutRadius = 40;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutOffset = donutCircumference * (1 - activeMetrics.pct / 100);

  return (
    <div className="p-4 space-y-4 sm:space-y-5 max-w-7xl mx-auto pb-28">
      <KgModuleHero
        moduleId="checklist"
        title="Checklist vận hành"
        description="Chạm vào công việc để cập nhật nhanh · Có 4 khu trong ca, tự đồng bộ & lưu nháp ngoại tuyến."
        eyebrow="Vận hành ca • Phân khu"
        features={['Lưu tự động tức thì', 'Nháp ngoại tuyến']}
        tipTitle="Tiêu chuẩn & Ghi chú Vận hành"
        tips={[
          'Đầu ca (15h & 17h): Vệ sinh khu vực trực, lau bàn ghế, setup đầy đủ chén đũa. Đọc thông tin bàn đặt trước và các món ngừng bán.',
          'Cuối ca (Hạ ca & Kết ca): Hỗ trợ ca sau thu gọn đồ. Ca sau cùng vệ sinh menu, xô đá, quạt trang trí, đổ rác, tắt điện/thiết bị và dọn nhà vệ sinh.',
          'Khu A (Sảnh & Bàn ăn) · Khu B (Quầy Bar & Thu ngân) · Khu C (Bếp & Kho) · Khu D&E (Sảnh sau & WC).',
          'Chạm vào từng đầu mục để lưu ngay lên máy chủ; nếu mất mạng sẽ tự lưu nháp trên máy để đồng bộ lại.',
        ]}
        actions={
          <KgButton
            type="button"
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={refreshingTeammates}
            onClick={() => void refreshTeammatesProgress()}
          >
            Làm mới
          </KgButton>
        }
      />

      {/* Merged Operations Banner: Nhóm trực & Khu phân công hôm nay + Compact Date Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-8 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col justify-between gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                style={{ backgroundColor: myTeam?.color || 'var(--kg-primary)' }}
              >
                <UsersRound size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)] truncate">
                  Nhóm trực &amp; Khu phân công hôm nay
                </h2>
                <p className="text-[11px] text-[var(--kg-text-muted)] truncate">
                  {opsLoading
                    ? 'Đang tải phân công đội ngũ...'
                    : myTeam
                      ? `${myTeam.name}${assignedZone ? ` · ${assignedZone.name}` : ''}${myTodayAssignment?.shift ? ` · ${myTodayAssignment.shift}` : ''}`
                      : assignedZone
                        ? `${assignedZone.name}${myTodayAssignment?.shift ? ` · ${myTodayAssignment.shift}` : ''}`
                        : 'Chưa có lịch phân khu riêng — chọn khu vực của bạn bên dưới'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {assignedAreaCode && selectedArea !== assignedAreaCode && (
                <button
                  type="button"
                  onClick={() => handleJoinArea(assignedAreaCode)}
                  className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/20 text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-95 touch-manipulation"
                >
                  <MapPin size={13} />
                  <span>Về Khu {assignedAreaCode}</span>
                </button>
              )}
              {currentUser?.role === 'admin' && (
                <KgButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Sparkles}
                  onClick={() => navigateToHubSubTab('admin_ops', 'dispatch')}
                >
                  Điều phối
                </KgButton>
              )}
            </div>
          </div>

          {myTeam && myTeam.memberUsernames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--kg-border)]/70">
              {myTeam.memberUsernames.map((username) => {
                const employee = directoryUsers.find((u) => u.username === username);
                const isLeader = myTeam.leaderUsername === username;
                const isMe = currentUser?.username === username;
                return (
                  <span
                    key={username}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                      isLeader
                        ? 'border-[var(--kg-warning)]/35 bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                        : isMe
                          ? 'border-[var(--kg-primary)]/35 bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]'
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-[var(--kg-text)]'
                    }`}
                  >
                    <span>{employee?.fullname || username}</span>
                    {isLeader && <span className="text-[9px] uppercase opacity-90">· Trưởng nhóm</span>}
                  </span>
                );
              })}
            </div>
          )}

          {myTodayAssignment?.note && (
            <p className="rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 px-3 py-1.5 text-[11px] font-semibold text-[var(--kg-warning)]">
              Lưu ý điều phối: {myTodayAssignment.note}
            </p>
          )}
        </div>

        {/* Compact Date Picker */}
        <div className="lg:col-span-4 bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3.5 py-3 sm:p-4 rounded-2xl shadow-xs flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="checklist-work-date"
              className="text-[11px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider"
            >
              Ngày làm việc
            </label>
            <span className="text-[10px] font-bold text-[var(--kg-success)] bg-[var(--kg-success-soft)] px-2 py-0.5 rounded-full">
              {isSaving ? 'Đang lưu...' : 'Tự động lưu'}
            </span>
          </div>
          <input
            id="checklist-work-date"
            type="date"
            value={workDate}
            onChange={(e) => {
              hydratedDraftIdRef.current = null;
              setWorkDate(e.target.value);
              setPending({});
              setRemovedParticipantKeys([]);
              setPendingSupply(null);
              setPendingSignatures(null);
              setNoteDrafts({});
            }}
            className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] font-bold min-h-[44px]"
          />
        </div>
      </div>

      {/* 4 Compact Zone Cards (Khu A / B / C / D&E) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {AREA_CODES.map((area) => {
          const doneCount = flatItems.filter((item) => isItemCompleteForArea(area, item)).length;
          const totalCount = flatItems.length;
          const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
          const isSelected = selectedArea === area;
          const isAssigned = assignedAreaCode === area;
          const rawParticipants = states[area]?.participants || [];
          const removedSet = new Set(
            area === selectedArea
              ? removedParticipantKeys
              : savedDraftsMap[area]?.removedParticipantKeys || [],
          );
          const participants = rawParticipants.filter((p) => !removedSet.has(p.key));

          return (
            <button
              type="button"
              key={area}
              onClick={() => handleJoinArea(area)}
              aria-pressed={isSelected}
              className={`p-3.5 sm:p-4 rounded-2xl text-left transition-all cursor-pointer select-none flex flex-col justify-between min-w-0 touch-manipulation ${
                isSelected
                  ? 'border-2 border-[var(--kg-primary)] bg-[var(--kg-primary-soft)]/45 shadow-sm'
                  : 'border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-primary)]/45 shadow-xs'
              }`}
            >
              <div className="w-full min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-extrabold text-sm sm:text-base text-[var(--kg-text)] truncate">
                    Khu {area}
                  </span>
                  {isAssigned && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-[var(--kg-info-soft)] text-[var(--kg-info)] shrink-0">
                      Của bạn
                    </span>
                  )}
                </div>
                <span className="block text-[11px] font-medium text-[var(--kg-text-muted)] truncate">
                  {AREA_STATION_LABELS[area]}
                </span>
              </div>

              <div className="w-full mt-3 space-y-2">
                <div className="h-2 w-full bg-[var(--kg-surface-soft)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      pct === 100 ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-primary)]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-[var(--kg-text-muted)]">
                  <span className="font-mono tabular-nums">
                    {doneCount}/{totalCount} việc · {pct}%
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Users size={11} /> {participants.length}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expandable Extra Dispatch Tasks — rendered ONLY when config.tasks.length > 0 for active zone */}
      {activeOpsAssignment && activeOpsTasks.length > 0 && (
        <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowExtraOpsTasks((v) => !v)}
            aria-expanded={showExtraOpsTasks}
            className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[var(--kg-surface-2)] transition-colors touch-manipulation"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-[var(--kg-info-soft)] text-[var(--kg-info)] flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} />
              </span>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)] truncate">
                  Đầu việc điều phối bổ sung
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                  Đã hoàn thành {activeOpsCompletedIds.size}/{activeOpsTasks.length} đầu việc được giao thêm
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-[var(--kg-text-muted)] transition-transform flex-shrink-0 ${showExtraOpsTasks ? 'rotate-180' : ''}`}
            />
          </button>

          {showExtraOpsTasks && (
            <div className="border-t border-[var(--kg-border)] p-4 space-y-2">
              {activeOpsTasks.map((task) => {
                const completed = activeOpsCompletedIds.has(task.id);
                const updating = updatingOpsTaskId === `${activeOpsAssignment.id}_${task.id}`;
                return (
                  <button
                    type="button"
                    key={task.id}
                    onClick={() => toggleOperationTask(activeOpsAssignment, task.id, !completed)}
                    disabled={updating}
                    className={`flex w-full min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition touch-manipulation ${
                      completed
                        ? 'border-[var(--kg-success)]/35 bg-[var(--kg-success-soft)]'
                        : 'border-[var(--kg-border)] bg-[var(--kg-surface-2)] hover:border-[var(--kg-primary)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${
                        completed
                          ? 'bg-[var(--kg-success)] text-white dark:text-[#101B15]'
                          : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                      }`}
                    >
                      {updating ? (
                        <LoaderCircle size={15} className="animate-spin" />
                      ) : completed ? (
                        <Check size={16} />
                      ) : (
                        <Circle size={15} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-xs sm:text-sm font-extrabold ${
                          completed ? 'text-[var(--kg-success)]' : 'text-[var(--kg-text)]'
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.description && (
                        <span className="mt-0.5 block text-xs leading-5 text-[var(--kg-text-muted)]">
                          {task.description}
                        </span>
                      )}
                      {task.frequency && (
                        <span className="mt-1 inline-block text-[10px] font-bold uppercase text-[var(--kg-text-muted)] bg-[var(--kg-surface)] border border-[var(--kg-border)] px-1.5 py-0.5 rounded">
                          {task.frequency}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Main Panel Layout: 2-Column Toast Touch Split */}
      {!selectedArea ? (
        <div className="text-center py-12 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-card max-w-lg mx-auto px-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck size={24} />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-[var(--kg-text)]">
            Bắt đầu thực hiện Checklist
          </h3>
          <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] mt-1.5 leading-relaxed">
            Chọn một khu vực trực (Khu A, B, C, hoặc D&amp;E) ở trên để bắt đầu ghi nhận kết quả công việc.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Column (8 cols): Checklist Rows & Phase Filter Pills */}
          <div className="lg:col-span-8 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[var(--kg-border)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
                    Đầu việc · Khu {selectedArea}
                  </h3>
                  <span className="text-xs font-medium text-[var(--kg-text-muted)]">
                    {AREA_STATION_LABELS[selectedArea]}
                  </span>
                  <KgFeatureTip
                    title="Ghi chú vận hành theo ca"
                    tips={[
                      'Đầu ca (15h & 17h): Vệ sinh khu vực trực, lau bàn ghế, setup đầy đủ chén đũa. Đọc thông tin bàn đặt trước và các món ngừng bán.',
                      'Cuối ca (Hạ ca & Kết ca): Hỗ trợ ca sau thu gọn đồ. Ca sau cùng vệ sinh menu, xô đá, quạt trang trí, đổ rác, tắt hết nguồn điện/thiết bị chiếu sáng và dọn dẹp nhà vệ sinh.',
                    ]}
                    variant="badge"
                    triggerText="Quy chuẩn"
                  />
                </div>
                <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5">
                  Ngày {workDate.split('-').reverse().join('/')}
                  {activeMetrics.subTotal > 0 && ` · Việc con ${activeMetrics.subDone}/${activeMetrics.subTotal}`}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={refreshTeammatesProgress}
                  disabled={refreshingTeammates}
                  className="min-h-[44px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-xs font-bold text-[var(--kg-text)] hover:border-[var(--kg-primary)] transition-colors whitespace-nowrap touch-manipulation"
                  title="Cập nhật các mục đồng đội vừa tick mà không mất thay đổi của bạn"
                >
                  <RefreshCw
                    size={13}
                    className={refreshingTeammates ? 'animate-spin text-[var(--kg-primary-ink)]' : ''}
                  />
                  <span>Đồng đội</span>
                </button>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-extrabold ${
                    activeMetrics.pct === 100
                      ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                      : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                  }`}
                >
                  {activeMetrics.pct}% hoàn thành
                </span>
              </div>
            </div>

            {/* Phase Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {tabs.map((t) => {
                const isActive = activePhase === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActivePhase(t.key)}
                    className={`kg-filter-pill shrink-0 ${isActive ? 'kg-filter-pill--active' : ''}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Checklist Items List */}
            {loading ? (
              <div className="flex justify-center p-12">
                <RefreshCw className="animate-spin text-[var(--kg-primary-ink)]" size={28} />
              </div>
            ) : flatItems.filter((item) => isGroupVisible(item.group)).length === 0 ? (
              <div className="text-center py-12 bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-2xl">
                <CheckSquare size={40} className="mx-auto text-[var(--kg-text-soft)] mb-3" />
                <p className="text-[var(--kg-text-muted)] text-xs sm:text-sm font-medium">
                  Không có hạng mục nào cho bộ lọc này.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {checklist.filter(isGroupVisible).map((group) => (
                  <div key={`${group.phase}-${group.shift}-${group.section}`} className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] font-bold uppercase bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/15 px-2.5 py-0.5 rounded-full">
                        {group.phase}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full shadow-2xs ${getPreviewShiftClass(group.shift)}`}
                      >
                        {group.shift}
                      </span>
                      <span className="text-xs font-semibold text-[var(--kg-text-muted)]">{group.section}</span>
                    </div>

                    {group.items.map((item) => {
                      const itemState = getMergedItemState(item);
                      const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
                      const hasPending = Object.prototype.hasOwnProperty.call(pending, item.id);
                      const subDone = (item.subitems || []).filter((sub) => !!itemState.subchecks?.[sub.id]).length;
                      const subTotal = item.subitems?.length || 0;
                      const vnDoneTime = formatChecklistVnTime(itemState.at);

                      return (
                        <div
                          key={item.id}
                          className={`rounded-2xl border transition-colors overflow-hidden ${
                            itemState.checked
                              ? 'border-[var(--kg-success)]/35 bg-[var(--kg-success-soft)]'
                              : 'border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-border-strong)]'
                          }`}
                        >
                          {/* Large Full-Row Touchable Checklist Button */}
                          <button
                            type="button"
                            aria-pressed={itemState.checked}
                            aria-label={`${itemState.checked ? 'Bỏ hoàn thành' : 'Hoàn thành'}: ${item.title}`}
                            onClick={() => handleToggleItem(item, !itemState.checked)}
                            className="w-full min-h-[72px] p-3.5 sm:p-4 flex items-start sm:items-center gap-3 text-left transition-colors active:scale-[0.995] touch-manipulation"
                          >
                            <span
                              aria-hidden="true"
                              className={`flex-shrink-0 w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-colors ${
                                itemState.checked
                                  ? 'bg-[var(--kg-success)] border-[var(--kg-success)] text-white dark:text-[#101B15]'
                                  : 'border-[var(--kg-border-strong)] bg-[var(--kg-surface)] text-[var(--kg-text-soft)]/50'
                              }`}
                            >
                              <Check size={20} strokeWidth={2.5} />
                            </span>

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="font-mono tabular-nums text-[11px] font-bold text-[var(--kg-text-muted)]">
                                  #{item.no}
                                </span>
                                <h4 className="text-sm font-bold text-[var(--kg-text)] break-words">
                                  {item.title}
                                </h4>
                              </div>
                              {item.text && (
                                <p className="text-xs text-[var(--kg-text-muted)] whitespace-pre-wrap break-words leading-relaxed">
                                  {item.text}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-semibold">
                                {itemState.checked ? (
                                  <span className="text-[var(--kg-success)] font-mono tabular-nums">
                                    Hoàn thành · Chạm để bỏ chọn
                                    {itemState.by ? ` · ${itemState.by.split(' ').pop()}` : ''}
                                    {vnDoneTime ? ` lúc ${vnDoneTime}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-[var(--kg-text-muted)]">
                                    Cần thực hiện · Chạm để đánh dấu
                                  </span>
                                )}
                                {hasPending && (
                                  <span className="bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] px-2 py-0.5 rounded-full text-[10px]">
                                    Lưu nháp ngoại tuyến
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                                itemState.checked
                                  ? 'bg-[var(--kg-surface)]/80 text-[var(--kg-success)] border border-[var(--kg-success)]/25'
                                  : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25'
                              }`}
                            >
                              {itemState.checked ? 'Xong' : 'Chờ'}
                            </span>
                          </button>

                          {/* Subtasks & Per-item Note (separate from row toggle button) */}
                          <div
                            className={`px-3.5 sm:px-4 pb-3.5 space-y-2.5 ${
                              hasSubtasks ? 'pt-2.5 border-t border-[var(--kg-border)]/70' : 'pt-0'
                            }`}
                          >
                            {hasSubtasks && (
                              <div className="p-3 bg-[var(--kg-surface)]/90 rounded-xl border border-[var(--kg-border)]">
                                <div className="flex justify-between items-center text-[10px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-2 border-b border-[var(--kg-border)] pb-1.5">
                                  <span>Danh sách việc con</span>
                                  <span className="font-mono tabular-nums text-[var(--kg-primary-ink)]">
                                    {subDone}/{subTotal} hoàn thành
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {item.subitems.map((sub) => {
                                    const isSubChecked = !!itemState.subchecks?.[sub.id];
                                    return (
                                      <label
                                        key={sub.id}
                                        className="flex items-center space-x-2.5 text-xs text-[var(--kg-text)] cursor-pointer select-none min-h-[44px] sm:min-h-[34px] px-2 py-1 rounded-lg hover:bg-[var(--kg-surface-soft)] transition-colors touch-manipulation"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSubChecked}
                                          onChange={(e) => handleToggleSubtask(item, sub.id, e.target.checked)}
                                          className="h-5 w-5 sm:h-4.5 sm:w-4.5 rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary)]/20 bg-[var(--kg-surface)]"
                                        />
                                        <span className={isSubChecked ? 'line-through text-[var(--kg-text-muted)]' : ''}>
                                          {sub.text}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <textarea
                              value={
                                noteDrafts[item.id] !== undefined
                                  ? noteDrafts[item.id]
                                  : itemState.note || ''
                              }
                              onChange={(e) => {
                                const nextNote = e.target.value;
                                setNoteDrafts((prev) => ({ ...prev, [item.id]: nextNote }));
                              }}
                              onBlur={(e) => {
                                const nextNote = e.target.value;
                                setNoteDrafts((prev) => {
                                  if (!(item.id in prev)) return prev;
                                  const copy = { ...prev };
                                  delete copy[item.id];
                                  return copy;
                                });
                                void handleSaveNote(item.id, nextNote);
                              }}
                              aria-label={`Ghi chú cho ${item.title}`}
                              placeholder="Ghi chú kết quả công việc/hỏng hóc nếu có..."
                              className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] resize-none min-h-[44px] sm:min-h-[38px]"
                              rows={1}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Donut Progress Ring + Ghi chú ca / Vật tư + Nhân viên trực */}
          <div className="lg:col-span-4 space-y-4">
            {/* Circular Donut Progress Ring Card */}
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
              <h3 className="font-extrabold text-sm text-[var(--kg-text)]">
                Tổng tiến độ khu vực
              </h3>
              <div className="flex items-center gap-4">
                <div className="relative w-[96px] h-[96px] shrink-0 flex items-center justify-center">
                  <svg
                    className="w-[96px] h-[96px] -rotate-90"
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke="var(--kg-surface-soft)"
                      strokeWidth="11"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r={donutRadius}
                      fill="none"
                      stroke={activeMetrics.pct === 100 ? 'var(--kg-success)' : 'var(--kg-primary)'}
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeDasharray={donutCircumference}
                      strokeDashoffset={donutOffset}
                      className="transition-all duration-200"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono tabular-nums font-black text-xl text-[var(--kg-text)]">
                    {activeMetrics.pct}%
                  </span>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <p className="text-base font-extrabold text-[var(--kg-text)]">
                    Khu {selectedArea}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-[var(--kg-text-muted)]">
                    {activeMetrics.done}/{activeMetrics.total} công việc hoàn thành
                  </p>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                      activeMetrics.pct === 100
                        ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                        : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                    }`}
                  >
                    {activeMetrics.pct === 100 ? 'Sẵn sàng bàn giao' : 'Đang thực hiện'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ghi chú ca & Đề xuất cấp vật tư */}
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-4 sm:p-5 space-y-3.5">
              <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
                <CheckSquare2 size={16} className="text-[var(--kg-success)] shrink-0" />
                <span>Ghi chú ca &amp; Vật tư</span>
              </h3>

              <div className="grid grid-cols-2 gap-1.5 text-xs font-medium text-[var(--kg-text)]">
                {[
                  { k: 'du_dung', l: 'Đủ dùng' },
                  { k: 'khan_giay', l: 'Khăn giấy' },
                  { k: 'ong_hut', l: 'Ống hút' },
                  { k: 'diem', l: 'Diêm' },
                  { k: 'tam', l: 'Tăm' },
                  { k: 'xien_tre', l: 'Xiên tre' },
                  { k: 'bao_tay', l: 'Bao tay' },
                  { k: 'bao_rac', l: 'Bao rác' },
                ].map((s) => {
                  const isChecked = pendingSupply ? !!pendingSupply[s.k] : !!areaData.supply?.[s.k];

                  return (
                    <label
                      key={s.k}
                      className="flex items-center space-x-2 cursor-pointer min-h-[44px] sm:min-h-[32px] px-1.5 rounded-lg hover:bg-[var(--kg-surface-2)] touch-manipulation"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleSupplyChange(s.k, e.target.checked)}
                        className="h-5 w-5 sm:h-4.5 sm:w-4.5 rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary)]/20 bg-[var(--kg-surface)]"
                      />
                      <span>{s.l}</span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="checklist-shift-supply-note"
                  className="block text-xs font-semibold text-[var(--kg-text-muted)]"
                >
                  Ghi chú cho đồng đội
                </label>
                <textarea
                  id="checklist-shift-supply-note"
                  value={pendingSupply ? pendingSupply.note || '' : areaData.supply?.note || ''}
                  onChange={(e) => handleSupplyChange('note', e.target.value)}
                  placeholder="Vật tư, bàn ghế, thiết bị cần lưu ý..."
                  className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] min-h-[76px]"
                />

                <div className="flex justify-between items-center gap-2 text-[11px] text-[var(--kg-text-muted)]">
                  <span className="font-mono tabular-nums">
                    {areaData.supply?.savedAt
                      ? `Lưu: ${areaData.supply.by?.split(' ').pop() || ''} lúc ${formatChecklistVnTime(areaData.supply.savedAt)}`
                      : 'Lưu đề xuất sau cùng của ca'}
                  </span>

                  {pendingSupply && (
                    <button
                      type="button"
                      onClick={() => void handleSaveSupply()}
                      className="min-h-[44px] sm:min-h-[36px] bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/25 px-3.5 py-1.5 rounded-xl font-bold transition-colors text-xs whitespace-nowrap shrink-0 touch-manipulation hover:brightness-95"
                    >
                      Lưu ghi chú ca
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Shift Teammates Picker (Tappable directory pills + custom text input) */}
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
                  <Users size={16} className="text-[var(--kg-primary-ink)] shrink-0" />
                  <span>Nhân viên trực Khu {selectedArea}</span>
                </h3>
                <span className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text-muted)]">
                  {areaData.participants.length}
                </span>
              </div>

              {eligibleDirectoryUsers.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-[var(--kg-text-muted)]">
                    Chạm nhanh đồng đội trong ca:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[144px] overflow-y-auto pr-0.5">
                    {eligibleDirectoryUsers.map((emp) => {
                      const empName = (emp.fullname || emp.username).trim();
                      const isJoined = areaData.participants.some(
                        (p) =>
                          p.key === emp.username ||
                          p.name.trim().toLowerCase() === empName.toLowerCase(),
                      );
                      return (
                        <button
                          key={emp.username}
                          type="button"
                          onClick={() => void handleToggleDirectoryParticipant(emp)}
                          aria-pressed={isJoined}
                          className={`min-h-[44px] sm:min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1 transition-colors touch-manipulation ${
                            isJoined
                              ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/35'
                              : 'bg-[var(--kg-surface-2)] text-[var(--kg-text)] border-[var(--kg-border)] hover:border-[var(--kg-primary)]'
                          }`}
                        >
                          {isJoined && <Check size={12} className="shrink-0" />}
                          <span className="truncate max-w-[140px]">{empName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {areaData.participants.length > 0 ? (
                  areaData.participants.map((p) => (
                    <div
                      key={p.key}
                      className="flex justify-between items-center bg-[var(--kg-surface-2)] px-2.5 py-2 rounded-xl border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text)]"
                    >
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Users size={13} className="text-[var(--kg-text-muted)] shrink-0" /> {p.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveParticipant(p.key)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-0 inline-flex items-center justify-center text-[var(--kg-danger)] hover:bg-[var(--kg-danger-soft)] rounded-lg active:scale-95 transition-all text-xs font-semibold px-2.5 shrink-0 touch-manipulation"
                      >
                        Bỏ
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--kg-text-muted)] text-center py-2">
                    Chưa có nhân viên nào tham gia
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddParticipant();
                    }
                  }}
                  aria-label="Thêm tên nhân viên trực"
                  placeholder="Nhập tên nhân viên khác..."
                  className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] min-h-[44px] sm:min-h-[40px]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddParticipant()}
                  className="bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-semibold px-4 py-2 rounded-xl text-xs flex items-center justify-center min-h-[44px] sm:min-h-[40px] flex-shrink-0 touch-manipulation"
                >
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Sync bar whenever unsaved offline/fallback local changes exist */}
      {selectedArea && hasPendingChanges && (
        <div className="sticky bottom-20 md:bottom-4 z-30 bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] p-3.5 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 shadow-elevated animate-slide-up">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <span className="flex w-2.5 h-2.5 bg-[var(--kg-accent)] rounded-full animate-ping flex-shrink-0" />
            <span className="text-xs font-bold text-[var(--kg-text)] truncate">
              Có thay đổi lưu nháp chưa đồng bộ lên máy chủ
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleSyncAllPending()}
            disabled={isSaving}
            className="w-full sm:w-auto bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-bold px-4 sm:px-5 py-2.5 rounded-xl text-xs transition-colors active:scale-95 shadow-xs flex items-center justify-center space-x-1.5 flex-shrink-0 min-h-[44px] sm:min-h-[40px] whitespace-nowrap touch-manipulation"
          >
            <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} />
            <span>Đồng bộ ngay</span>
          </button>
        </div>
      )}
    </div>
  );
}
