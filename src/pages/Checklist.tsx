import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { getPreviewShiftClass } from '../utils/helpers';
import Swal from 'sweetalert2';
import {
  ClipboardCheck,
  CheckCircle2,
  CheckSquare,
  FileText,
  CheckSquare2,
  PenTool,
  RefreshCw,
  Users,
} from 'lucide-react';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';
import { mergeChecklistAreaState } from '../utils/operationsReconciliation';

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

export default function Checklist() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setGlobalLoading = useAppStore((s) => s.setLoading);
  const setTodayChecklistDone = useAppStore((s) => s.setTodayChecklistDone);
  const store = { setLoading: setGlobalLoading };

  const [loading, setLoading] = useState(true);
  const [refreshingTeammates, setRefreshingTeammates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workDate, setWorkDate] = useState(() => {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  });

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
  const [saveMode, setSaveMode] = useState<'single' | 'batch'>('batch');

  // Local changes buffer (pending delta sync — never overwrites teammates' ticks)
  const [pending, setPending] = useState<Record<string, Partial<SavedItemState>>>({});
  const [removedParticipantKeys, setRemovedParticipantKeys] = useState<string[]>([]);
  const [pendingSupply, setPendingSupply] = useState<Record<string, any> | null>(null);
  const [pendingSignatures, setPendingSignatures] = useState<SavedAreaState['signatures'] | null>(null);

  // Participant search input
  const [participantInput, setParticipantInput] = useState('');

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
          Swal.fire('Lỗi', 'Không thể kết nối server để nạp dữ liệu checklist.', 'error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    loadInitialChecklist();
    return () => {
      isCancelled = true;
    };
  }, [workDate]);

  // Pull latest teammates' progress without wiping local unsaved pending ticks
  const refreshTeammatesProgress = useCallback(async () => {
    setRefreshingTeammates(true);
    try {
      const res = await callApi(
        'GET_OPS_CHECKLIST_INIT',
        { dateStr: workDate, forceRefresh: true },
        { background: true, cacheTtlMs: 0 }
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
    } catch {
      // Silent background refresh
    } finally {
      setRefreshingTeammates(false);
    }
  }, [workDate]);

  // Save/Restore session name
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

  // Flat list of checklist items
  const flatItems = useMemo(() => {
    return checklist.flatMap((group) => group.items.map((item) => ({ ...item, group })));
  }, [checklist]);

  // Helpers to compute merged item states
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
    [areaData.items, pending]
  );

  const isItemCompleteForArea = (area: AreaCode, item: ChecklistItem): boolean => {
    const raw = states[area]?.items?.[item.id] || { checked: false, subchecks: {} };
    const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
    if (hasSubtasks) {
      return item.subitems.every((sub) => !!raw.subchecks?.[sub.id]);
    }
    return !!raw.checked;
  };

  // Atomic single-item patch with automatic fallback to concurrent-safe SAVE_OPS_CHECKLIST_STATE
  const syncSingleItemDelta = async (
    area: AreaCode,
    itemId: string,
    stateUpdate: Partial<SavedItemState>
  ) => {
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
        { background: true }
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
        return;
      }

      // Fallback when local dev connects directly to legacy GAS before clasp push
      const fallbackMerged = mergeChecklistAreaState(states[area], {
        participants: areaData.participants,
        deltaItems: { [itemId]: stateUpdate },
      });
      await syncToServer(
        area,
        fallbackMerged.participants,
        fallbackMerged.items,
        fallbackMerged.supply,
        fallbackMerged.signatures,
        { [itemId]: stateUpdate }
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle joining checklist area
  const handleJoinArea = (area: AreaCode) => {
    if (selectedArea === area) return;
    if (Object.keys(pending).length || pendingSupply || pendingSignatures) {
      Swal.fire({
        title: 'Có thay đổi chưa lưu',
        text: 'Bạn có thay đổi chưa đồng bộ. Bạn vẫn muốn chuyển khu vực chứ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Chuyển và bỏ qua thay đổi',
        cancelButtonText: 'Hủy',
      }).then((result) => {
        if (result.isConfirmed) {
          performJoinArea(area);
        }
      });
    } else {
      performJoinArea(area);
    }
  };

  const performJoinArea = (area: AreaCode) => {
    setSelectedArea(area);
    setPending({});
    setRemovedParticipantKeys([]);
    setPendingSupply(null);
    setPendingSignatures(null);

    localStorage.setItem('kg_ops_checklist_session_v7', JSON.stringify({ name: sessionName, area }));

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
      if (saveMode === 'single') {
        syncToServer(area, participants, rawState.items, rawState.supply, rawState.signatures, {});
      }
    }
  };

  // Add other participant teammate
  const handleAddParticipant = () => {
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

      if (saveMode === 'single') {
        syncToServer(selectedArea, participants, rawState.items, rawState.supply, rawState.signatures, {});
      } else {
        setPending((p) => ({ ...p, _participants_trigger: {} }));
      }
    }
  };

  // Remove participant
  const handleRemoveParticipant = (key: string) => {
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

    if (saveMode === 'single') {
      syncToServer(
        selectedArea,
        participants,
        rawState.items,
        rawState.supply,
        rawState.signatures,
        {},
        nextRemoved
      );
      setRemovedParticipantKeys([]);
    } else {
      setRemovedParticipantKeys(nextRemoved);
      setPending((p) => ({ ...p, _participants_trigger: {} }));
    }
  };

  // Toggle main checklist item
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

    if (saveMode === 'single') {
      await syncSingleItemDelta(selectedArea, item.id, stateUpdate);
    } else {
      setPending((prev) => ({
        ...prev,
        [item.id]: {
          ...(prev[item.id] || {}),
          ...stateUpdate,
        },
      }));
    }
  };

  // Toggle subtask (preserves teammates' ticks on sibling subtasks)
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
      // Send only the changed subtask in delta so concurrent teammates' subtasks are never overwritten
      subchecks: { ...(pending[item.id]?.subchecks || {}), [subId]: checked },
      by: sessionName,
      at: new Date().toISOString(),
    };

    if (saveMode === 'single') {
      await syncSingleItemDelta(selectedArea, item.id, stateUpdate);
    } else {
      setPending((prev) => ({
        ...prev,
        [item.id]: {
          ...(prev[item.id] || {}),
          ...stateUpdate,
        },
      }));
    }
  };

  // Handle Note Save
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

    if (saveMode === 'single') {
      await syncSingleItemDelta(selectedArea, itemId, stateUpdate);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Đã lưu ghi chú trực tuyến!',
        showConfirmButton: false,
        timer: 1500,
      });
    } else {
      setPending((prev) => ({
        ...prev,
        [itemId]: {
          ...(prev[itemId] || {}),
          ...stateUpdate,
        },
      }));
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Đã lưu tạm ghi chú. Bấm Đồng bộ ngay để gửi lên Sheet!',
        showConfirmButton: false,
        timer: 1500,
      });
    }
  };

  // Handle Supplies Change
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

    if (saveMode === 'single') {
      await syncToServer(
        selectedArea,
        areaData.participants,
        areaData.items,
        pendingSupply,
        areaData.signatures,
        {}
      );
      setPendingSupply(null);
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Đã ghi nhận đề xuất vật tư tạm thời!',
        showConfirmButton: false,
        timer: 1500,
      });
    }
  };

  // Handle Signatures Change
  const handleSignatureChange = (key: 'receive' | 'handover' | 'manager', val: string) => {
    const currentSigs = pendingSignatures || areaData.signatures || {};
    setPendingSignatures({
      ...currentSigs,
      [key]: val,
    });
  };

  const handleSaveSignatures = async () => {
    if (!selectedArea || !pendingSignatures) return;

    if (saveMode === 'single') {
      await syncToServer(
        selectedArea,
        areaData.participants,
        areaData.items,
        areaData.supply,
        pendingSignatures,
        {},
        [],
        pendingSignatures
      );
      setPendingSignatures(null);
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Đã ghi nhận chữ ký tạm thời!',
        showConfirmButton: false,
        timer: 1500,
      });
    }
  };

  // Sync state to Google Sheets with concurrent-safe delta merging
  const syncToServer = async (
    area: AreaCode,
    participants: SavedAreaState['participants'],
    items: SavedAreaState['items'],
    supply: SavedAreaState['supply'],
    signatures: SavedAreaState['signatures'],
    deltaItems: Record<string, Partial<SavedItemState>> = {},
    removedKeys: string[] = [],
    deltaSignatures?: Partial<SavedAreaState['signatures']>
  ) => {
    setIsSaving(true);
    store.setLoading(true, 'Đang đồng bộ tiến độ Checklist an toàn...');

    try {
      // Pull freshest teammate state right before saving so even legacy GAS never loses concurrent ticks
      let latestRemoteAreaState: SavedAreaState | undefined = states[area];
      try {
        const freshRes = await callApi(
          'GET_OPS_CHECKLIST_INIT',
          { dateStr: workDate, forceRefresh: true },
          { background: true, cacheTtlMs: 0 }
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

      const res = await callApi('SAVE_OPS_CHECKLIST_STATE', {
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
      });

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

        setPending({});
        setRemovedParticipantKeys([]);
        setPendingSupply(null);
        setPendingSignatures(null);

        Swal.fire({
          icon: 'success',
          title: 'Đã đồng bộ & gộp tiến độ cùng đồng đội!',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2600,
        });
      } else {
        throw new Error(res?.message || 'API error');
      }
    } catch (err) {
      console.error(err);
      Swal.fire(
        'Lỗi đồng bộ',
        'Không thể gửi dữ liệu lên Google Sheets. Tiến độ vẫn được giữ nguyên trên màn hình để bấm gửi lại.',
        'error'
      );
    } finally {
      setIsSaving(false);
      store.setLoading(false);
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
      pendingSignatures || undefined
    );
  };

  // Group filter logic
  const isGroupVisible = useCallback(
    (group: ChecklistGroup) => {
      return activePhase === 'ALL' || group.phase === activePhase || group.shift === activePhase;
    },
    [activePhase]
  );

  // Compute metrics for progress bar
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

  // Tab definitions
  const tabs = [
    { key: 'ALL', label: 'Tất cả' },
    { key: 'CHECKLIST ĐẦU CA', label: 'Đầu ca' },
    { key: 'CHECKLIST CUỐI CA', label: 'Cuối ca' },
    { key: 'CA 15H: SETUP BÀN', label: 'Ca 15h' },
    { key: 'CA 17H: RÀ SOÁT & HOÀN THIỆN', label: 'Ca 17h' },
    { key: 'XUỐNG CA LẦN 1', label: 'Xuống ca 1' },
    { key: 'XUỐNG CA SAU CÙNG', label: 'Xuống ca cuối' }
  ];

  const hasPendingChanges = Object.keys(pending).length > 0 || pendingSupply !== null || pendingSignatures !== null;

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="thực hiện checklist công việc" />;
  }

  return (
    <div className="p-4 space-y-6 max-w-7xl mx-auto pb-28">
      <KgModuleHero
        moduleId="checklist"
        title="Checklist Vận Hành Theo Khu Vực"
        description="Đồng bộ trực tuyến theo thời gian thực cho 4 khu vực. Hỗ trợ việc con và đề xuất vật tư."
        eyebrow="Vận hành"
        tipTitle="Tiêu chuẩn Kiểm tra Checklist Vận hành"
        tips={[
          "Khu vực A (Sảnh & Bàn ăn): Vệ sinh bàn ghế, lau sàn, kiểm tra lọ gia vị và menu.",
          "Khu vực B (Quầy Bar & Thu ngân): Chuẩn bị ly tách, nguyên liệu pha chế, máy POS và hoá đơn.",
          "Khu vực C (Bếp & Kho): Kiểm tra nhiệt độ tủ đông/mát, vệ sinh bề mặt chế biến, an toàn thực phẩm.",
          "Khu vực D & E (Vệ sinh & Cơ sở vật chất): Kiểm tra nhà vệ sinh, hệ thống ánh sáng, điều hòa và âm thanh.",
          "Chạm vào từng đầu mục để đánh dấu hoàn tất. Dữ liệu sẽ tự động đồng bộ lên máy chủ."
        ]}
      />

      {/* Date & Mode selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 rounded-2xl shadow-xs flex flex-col justify-center">
          <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider">Ngày làm việc</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => {
              setWorkDate(e.target.value);
              setPending({});
              setRemovedParticipantKeys([]);
              setPendingSupply(null);
              setPendingSignatures(null);
            }}
            className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] font-bold min-h-[44px]"
          />
        </div>

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 rounded-2xl shadow-xs md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full">
            <span className="block text-xs font-black text-[var(--kg-text-muted)] mb-2 uppercase tracking-wider">
              Chế độ lưu trữ (Chống ghi đè đồng thời)
            </span>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button
                type="button"
                onClick={() => setSaveMode('batch')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all ${saveMode === 'batch' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'}`}
              >
                Lưu hàng loạt (Khuyên dùng)
              </button>
              <button
                type="button"
                onClick={() => setSaveMode('single')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all ${saveMode === 'single' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'}`}
              >
                Lưu trực tiếp tức thì
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Area Completeness Board */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {AREA_CODES.map((area) => {
          const doneCount = flatItems.filter((item) => isItemCompleteForArea(area, item)).length;
          const totalCount = flatItems.length;
          const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
          const isSelected = selectedArea === area;
          const participants = states[area]?.participants || [];

          return (
            <div
              key={area}
              onClick={() => handleJoinArea(area)}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between shadow-xs ${
                isSelected
                  ? 'border-[var(--kg-accent)] bg-[var(--kg-surface)] shadow-md ring-2 ring-[var(--kg-accent)]/20'
                  : 'border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-accent)]/40'
              }`}
            >
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-base text-[var(--kg-text)]">Khu {area}</span>
                  <span className="text-xs font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] text-[var(--kg-primary)] border border-[var(--kg-border)]">
                    {pct}%
                  </span>
                </div>
                <span className="block text-[11px] font-medium text-[var(--kg-text-muted)] mt-0.5 truncate">
                  {AREA_STATION_LABELS[area]}
                </span>
              </div>
              <div className="h-2 w-full bg-[var(--kg-surface-soft)] rounded-full overflow-hidden mb-3 border border-[var(--kg-border)]/50">
                <div
                  className="h-full bg-[var(--kg-accent)] rounded-full transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[11px] font-semibold text-[var(--kg-text-muted)] mb-3">
                <span className="font-mono tabular-nums">{participants.length}</span> nhân viên ·{' '}
                <span className="font-mono tabular-nums">
                  {doneCount}/{totalCount}
                </span>{' '}
                mục
              </div>

              {/* Participant mini list */}
              <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-dashed border-[var(--kg-border)]">
                {participants.length > 0 ? (
                  participants.map((p) => (
                    <span
                      key={p.key}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] px-2 py-0.5 rounded-full"
                    >
                      <Users size={10} className="text-[var(--kg-text-muted)]" />{' '}
                      {p.name.split(' ').pop()}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-[var(--kg-text-muted)]">Chưa có ai</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Panel Layout */}
      {!selectedArea ? (
        <div className="text-center py-14 soft3d-card max-w-lg mx-auto px-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck size={24} />
          </div>
          <h3 className="font-bold text-base sm:text-lg text-[var(--kg-text)]">
            Bắt đầu thực hiện Checklist
          </h3>
          <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] mt-1.5 leading-relaxed">
            Vui lòng chọn một khu vực trực (Khu A, B, C, hoặc D&amp;E) ở trên để bắt đầu tham gia và ghi nhận kết quả công việc.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Checklist & Steps */}
          <div className="lg:col-span-2 space-y-5">
            {/* Header & Tabs */}
            <div className="soft3d-card p-4 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-4 border-b border-[var(--kg-border)] pb-3">
                <div>
                  <h3 className="font-bold text-base text-[var(--kg-text)]">
                    Khu {selectedArea} · {AREA_STATION_LABELS[selectedArea]}
                  </h3>
                  <p className="text-xs font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5">
                    Ngày {workDate.split('-').reverse().join('/')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={refreshTeammatesProgress}
                    disabled={refreshingTeammates}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] hover:border-[var(--kg-primary)] transition-colors"
                    title="Cập nhật các mục đồng đội vừa tick mà không mất thay đổi của bạn"
                  >
                    <RefreshCw
                      size={13}
                      className={refreshingTeammates ? 'animate-spin text-[var(--kg-primary)]' : ''}
                    />
                    <span className="hidden sm:inline">Đồng đội</span>
                  </button>
                  <div className="text-right">
                    <span className="block text-[11px] font-semibold text-[var(--kg-text-muted)]">
                      Hoàn thành
                    </span>
                    <span className="text-sm font-bold font-mono tabular-nums text-[var(--kg-success)]">
                      {activeMetrics.pct}% ({activeMetrics.done}/{activeMetrics.total})
                    </span>
                  </div>
                  <div className="h-9 w-px bg-[var(--kg-border)]" />
                  <div className="text-right">
                    <span className="block text-[11px] font-semibold text-[var(--kg-text-muted)]">
                      Việc con
                    </span>
                    <span className="text-sm font-bold font-mono tabular-nums text-[var(--kg-primary)]">
                      {activeMetrics.subDone}/{activeMetrics.subTotal}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {tabs.map(t => (
                  <button 
                    key={t.key}
                    type="button"
                    onClick={() => setActivePhase(t.key)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border min-h-[34px] ${
                      activePhase === t.key 
                        ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)] shadow-xs' 
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist Items list */}
            {loading ? (
              <div className="flex justify-center p-12"><RefreshCw className="animate-spin text-[var(--kg-primary)]" size={28} /></div>
            ) : flatItems.filter(item => isGroupVisible(item.group)).length === 0 ? (
              <div className="text-center py-12 soft3d-card">
                <CheckSquare size={40} className="mx-auto text-[var(--kg-text-soft)] mb-3" />
                <p className="text-[var(--kg-text-muted)] text-xs sm:text-sm font-medium">Không có hạng mục nào cho bộ lọc này.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {checklist.filter(isGroupVisible).map(group => (
                  <div key={`${group.phase}-${group.shift}-${group.section}`} className="space-y-3">
                    
                    {/* Header Group */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-[10px] font-bold uppercase bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/15 px-2.5 py-0.5 rounded-full">{group.phase}</span>
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full shadow-2xs ${getPreviewShiftClass(group.shift)}`}>{group.shift}</span>
                      <span className="text-xs font-semibold text-[var(--kg-text-muted)]">{group.section}</span>
                    </div>

                    {group.items.map(item => {
                      const itemState = getMergedItemState(item);
                      const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
                      const hasPending = Object.prototype.hasOwnProperty.call(pending, item.id);
                      const subDone = (item.subitems || []).filter(sub => !!itemState.subchecks?.[sub.id]).length;
                      const subTotal = item.subitems?.length || 0;

                      return (
                        <div 
                          key={item.id}
                          className={`p-4 rounded-2xl border transition-colors soft3d-card ${
                            itemState.checked 
                              ? 'border-[var(--kg-success)]/35 bg-[var(--kg-success-soft)]/30' 
                              : 'border-[var(--kg-border)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start space-x-3 min-w-0">
                              <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-mono tabular-nums font-bold text-[var(--kg-text-muted)] flex items-center justify-center mt-0.5">
                                {item.no}
                              </span>
                              <div className="min-w-0">
                                <h4 className={`text-sm font-bold ${itemState.checked ? 'text-[var(--kg-success)] line-through opacity-85' : 'text-[var(--kg-text)]'}`}>
                                  {item.title}
                                </h4>
                                <p className="text-xs text-[var(--kg-text-muted)] mt-1 whitespace-pre-wrap leading-relaxed">{item.text}</p>
                              </div>
                            </div>
                            
                            {/* Checkbox button */}
                            <button
                              type="button"
                              aria-label={`Đánh dấu hạng mục ${item.title}`}
                              onClick={() => handleToggleItem(item, !itemState.checked)}
                              className={`flex-shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-colors ${
                                itemState.checked 
                                  ? 'bg-[var(--kg-success)] border-[var(--kg-success)] text-white' 
                                  : 'border-[var(--kg-border-strong)] bg-[var(--kg-surface-soft)] text-transparent hover:border-[var(--kg-primary)]'
                              }`}
                            >
                              <CheckCircle2 size={18} />
                            </button>
                          </div>

                          {/* Subtasks block */}
                          {hasSubtasks && (
                            <div className="mt-3.5 p-3 bg-[var(--kg-surface-soft)] rounded-xl border border-[var(--kg-border)]">
                              <div className="flex justify-between items-center text-[10px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-2 border-b border-[var(--kg-border)] pb-1.5">
                                <span>Danh sách việc con</span>
                                <span className="font-mono tabular-nums text-[var(--kg-primary)]">{subDone}/{subTotal} hoàn thành</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {item.subitems.map(sub => {
                                  const isSubChecked = !!itemState.subchecks?.[sub.id];
                                  return (
                                    <label key={sub.id} className="flex items-center space-x-2 text-xs text-[var(--kg-text)] cursor-pointer select-none min-h-[32px]">
                                      <input 
                                        type="checkbox" 
                                        checked={isSubChecked}
                                        onChange={(e) => handleToggleSubtask(item, sub.id, e.target.checked)}
                                        className="h-4.5 w-4.5 rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary)]/20 bg-[var(--kg-surface)]"
                                      />
                                      <span className={isSubChecked ? 'line-through text-[var(--kg-text-muted)]' : ''}>{sub.text}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Note / Edit section */}
                          <div className="mt-3 flex items-center justify-between border-t border-[var(--kg-border)] pt-3 flex-wrap gap-2 text-[10px] font-semibold text-[var(--kg-text-muted)]">
                            <div className="flex items-center space-x-2">
                              {itemState.checked ? (
                                <span className="text-[var(--kg-success)] bg-[var(--kg-success-soft)] px-2 py-0.5 rounded-full">
                                  ✓ Xong {itemState.by ? `bởi ${itemState.by.split(' ').pop()}` : ''} {itemState.at ? `lúc ${itemState.at.substring(11, 16)}` : ''}
                                </span>
                              ) : (
                                <span>Chưa hoàn thành</span>
                              )}
                              {hasPending && <span className="bg-[var(--kg-warning-soft)] text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">Lưu tạm</span>}
                            </div>
                            
                            {/* Inline Note text input */}
                            <div className="w-full flex items-center space-x-2 mt-1">
                              <textarea
                                defaultValue={itemState.note || ''}
                                onBlur={(e) => handleSaveNote(item.id, e.target.value)}
                                aria-label={`Ghi chú cho ${item.title}`}
                                placeholder="Ghi chú kết quả công việc/hỏng hóc nếu có..."
                                className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3 py-1.5 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] resize-none min-h-[38px]"
                                rows={1}
                              />
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Sidebar (Participants, Supplies, Signatures) */}
          <div className="space-y-5">

            {/* Participants manager */}
            <div className="soft3d-card p-5">
              <h3 className="font-bold text-sm text-[var(--kg-text)] flex items-center mb-3.5">
                <Users size={16} className="mr-2 text-[var(--kg-primary)]" />
                <span>Nhân viên trực Khu {selectedArea}</span>
              </h3>
              
              {/* Teammates List */}
              <div className="space-y-2 mb-4 max-h-[180px] overflow-y-auto pr-1">
                {areaData.participants.length > 0 ? (
                  areaData.participants.map(p => (
                    <div key={p.key} className="flex justify-between items-center bg-[var(--kg-surface-soft)] p-2.5 rounded-xl border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text)]">
                      <span className="inline-flex items-center gap-1.5 truncate"><Users size={13} className="text-[var(--kg-text-muted)] shrink-0" /> {p.name}</span>
                      <button 
                        type="button"
                        onClick={() => handleRemoveParticipant(p.key)}
                        className="text-[var(--kg-danger)] hover:underline active:scale-95 transition-all text-[11px] font-semibold px-1.5"
                      >
                        Bỏ
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--kg-text-muted)] text-center py-2">Chưa có nhân viên nào tham gia</p>
                )}
              </div>

              {/* Add Teammates Input */}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  aria-label="Thêm tên nhân viên trực"
                  placeholder="Thêm tên nhân viên trực..."
                  className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] min-h-[40px]"
                />
                <button 
                  type="button"
                  onClick={handleAddParticipant}
                  className="bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center min-h-[40px]"
                >
                  Thêm
                </button>
              </div>
            </div>

            {/* Operational guidelines */}
            <div className="soft3d-card p-5 space-y-3.5">
              <h3 className="font-bold text-sm text-[var(--kg-text)] flex items-center">
                <FileText size={16} className="mr-2 text-[var(--kg-warning)]" />
                <span>Ghi chú vận hành</span>
              </h3>
              <div className="space-y-3 text-xs text-[var(--kg-text-muted)] font-medium leading-relaxed">
                <div>
                  <strong className="text-[var(--kg-text)] block mb-0.5">Đầu ca (15h &amp; 17h):</strong>
                  Vệ sinh khu vực trực, lau bàn ghế, setup đầy đủ chén đũa. Đọc thông tin bàn đặt trước và các món ngừng bán.
                </div>
                <div>
                  <strong className="text-[var(--kg-text)] block mb-0.5">Cuối ca (Hạ ca &amp; Kết ca):</strong>
                  Hỗ trợ ca sau thu gọn đồ. Ca sau cùng vệ sinh menu, xô đá, quạt trang trí, đổ rác, tắt hết nguồn điện/thiết bị chiếu sáng và dọn dẹp nhà vệ sinh.
                </div>
              </div>
            </div>

            {/* Supplies Proposal */}
            <div className="soft3d-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-[var(--kg-text)] flex items-center">
                <CheckSquare2 size={16} className="mr-2 text-[var(--kg-success)]" />
                <span>Đề xuất cấp vật tư</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-[var(--kg-text)]">
                {[
                  { k: 'du_dung', l: 'Đủ dùng' },
                  { k: 'khan_giay', l: 'Khăn giấy' },
                  { k: 'ong_hut', l: 'Ống hút' },
                  { k: 'diem', l: 'Diêm' },
                  { k: 'tam', l: 'Tăm' },
                  { k: 'xien_tre', l: 'Xiên tre' },
                  { k: 'bao_tay', l: 'Bao tay' },
                  { k: 'bao_rac', l: 'Bao rác' }
                ].map(s => {
                  const isChecked = pendingSupply 
                    ? !!pendingSupply[s.k] 
                    : !!areaData.supply?.[s.k];

                  return (
                    <label key={s.k} className="flex items-center space-x-2 cursor-pointer min-h-[30px]">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={(e) => handleSupplyChange(s.k, e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary)]/20 bg-[var(--kg-surface)]"
                      />
                      <span>{s.l}</span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-2">
                <textarea 
                  value={pendingSupply ? (pendingSupply.note || '') : (areaData.supply?.note || '')}
                  onChange={(e) => handleSupplyChange('note', e.target.value)}
                  aria-label="Ghi chú số lượng vật tư cần cấp"
                  placeholder="Ghi chú số lượng cần cấp..."
                  className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] min-h-[60px]"
                />
                
                <div className="flex justify-between items-center text-[10px] text-[var(--kg-text-muted)]">
                  <span>
                    {areaData.supply?.savedAt 
                      ? `Lưu: ${areaData.supply.by?.split(' ').pop()} lúc ${areaData.supply.savedAt.substring(11, 16)}`
                      : 'Lưu đề xuất sau cùng của ca'}
                  </span>
                  
                  {pendingSupply && (
                    <button 
                      type="button"
                      onClick={handleSaveSupply}
                      className="bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25 px-3 py-1 rounded-xl font-bold transition-colors text-[10px]"
                    >
                      Lưu đề xuất
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Handover Signatures */}
            <div className="soft3d-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-[var(--kg-text)] flex items-center">
                <PenTool size={16} className="mr-2 text-[var(--kg-accent)]" />
                <span>Bàn giao &amp; Xác nhận</span>
              </h3>
              
              <div className="space-y-3 text-xs">
                {[
                  { k: 'receive', l: 'Phụ trách nhận ca' },
                  { k: 'handover', l: 'Phụ trách giao ca' },
                  { k: 'manager', l: 'Quản lý xác nhận' }
                ].map(sig => {
                  const val = pendingSignatures 
                    ? (pendingSignatures[sig.k as keyof SavedAreaState['signatures']] || '') 
                    : (areaData.signatures?.[sig.k as keyof SavedAreaState['signatures']] || '');

                  return (
                    <div key={sig.k}>
                      <label htmlFor={`sig-${sig.k}`} className="block font-semibold text-[var(--kg-text-muted)] mb-1">{sig.l}</label>
                      <input 
                        id={`sig-${sig.k}`}
                        type="text" 
                        value={val}
                        onChange={(e) => handleSignatureChange(sig.k as any, e.target.value)}
                        placeholder="Ký tên / Ghi họ tên..."
                        className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] placeholder-[var(--kg-text-soft)] min-h-[40px]"
                      />
                    </div>
                  );
                })}

                {pendingSignatures && (
                  <button 
                    type="button"
                    onClick={handleSaveSignatures}
                    className="w-full bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center min-h-[40px]"
                  >
                    Lưu xác nhận bàn giao
                  </button>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Sticky Sync bar whenever unsaved local changes exist */}
      {selectedArea && hasPendingChanges && (
        <div className="sticky bottom-20 md:bottom-4 z-30 bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] p-3.5 sm:p-4 rounded-2xl flex items-center justify-between shadow-elevated animate-slide-up">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <span className="flex w-2.5 h-2.5 bg-[var(--kg-accent)] rounded-full animate-ping flex-shrink-0" />
            <span className="text-xs font-bold text-[var(--kg-text)] truncate">
              Có thay đổi chưa đồng bộ lên Google Sheets
            </span>
          </div>
          <button 
            type="button"
            onClick={handleSyncAllPending}
            disabled={isSaving}
            className="bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold px-4 sm:px-5 py-2.5 rounded-xl text-xs transition-colors active:scale-95 shadow-xs flex items-center space-x-1.5 flex-shrink-0 min-h-[40px]"
          >
            <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} />
            <span>Đồng bộ ngay</span>
          </button>
        </div>
      )}
    </div>
  );
}
