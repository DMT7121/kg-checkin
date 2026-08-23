import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { 
  ClipboardCheck, CheckCircle2, Circle, Clock, CheckSquare, 
  Save, FileText, CheckSquare2, PenTool, RefreshCw, Users, AlertCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';

// Configuration keys
const AREA_CODES = ['A', 'B', 'C', 'D&E'] as const;
type AreaCode = typeof AREA_CODES[number];

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
  const store = useAppStore();
  const { currentUser } = store;
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [workDate, setWorkDate] = useState(() => {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  });

  const [checklist, setChecklist] = useState<ChecklistGroup[]>([]);
  const [states, setStates] = useState<Record<string, SavedAreaState>>({});
  const [selectedArea, setSelectedArea] = useState<AreaCode | null>(null);
  const [activePhase, setActivePhase] = useState<string>('ALL');
  const [saveMode, setSaveMode] = useState<'single' | 'batch'>('batch');
  
  // Local changes buffer (pending sync)
  const [pending, setPending] = useState<Record<string, Partial<SavedItemState>>>({});
  const [pendingSupply, setPendingSupply] = useState<Record<string, any> | null>(null);
  const [pendingSignatures, setPendingSignatures] = useState<SavedAreaState['signatures'] | null>(null);

  // Participant search input
  const [participantInput, setParticipantInput] = useState('');

  // Fetch checklist structure and states from server
  const fetchChecklists = async (date: string) => {
    setLoading(true);
    try {
      const res = await callApi('GET_OPS_CHECKLIST_INIT', { dateStr: date });
      if (res?.ok && res.data) {
        setChecklist(res.data.checklist || []);
        setStates(res.data.states || {});
        
        // Restore selected area from session or first area
        const savedSession = localStorage.getItem('kg_ops_checklist_session_v7');
        if (savedSession) {
          try {
            const sessionData = JSON.parse(savedSession);
            if (sessionData.area && AREA_CODES.includes(sessionData.area)) {
              setSelectedArea(sessionData.area);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Lỗi', 'Không thể kết nối server để nạp dữ liệu checklist.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecklists(workDate);
    setPending({});
    setPendingSupply(null);
    setPendingSignatures(null);
  }, [workDate]);

  // Save/Restore session name
  const sessionName = currentUser?.fullname || '';

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
      signatures: rawState.signatures || {}
    };
  }, [states, selectedArea]);

  // Flat list of checklist items
  const flatItems = useMemo(() => {
    return checklist.flatMap(group => group.items.map(item => ({ ...item, group })));
  }, [checklist]);

  // Helpers to compute merged item states
  const getMergedItemState = (item: ChecklistItem): SavedItemState => {
    const saved = areaData.items[item.id] || { checked: false, note: '', subchecks: {} };
    const p = pending[item.id] || {};
    
    const subchecks = {
      ...(saved.subchecks || {}),
      ...(p.subchecks || {})
    };
    
    const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
    const checked = hasSubtasks 
      ? item.subitems.every(sub => !!subchecks[sub.id]) 
      : (p.checked !== undefined ? p.checked : !!saved.checked);

    return {
      checked,
      note: p.note !== undefined ? p.note : (saved.note || ''),
      subchecks,
      by: p.by || saved.by || '',
      at: p.at || saved.at || ''
    };
  };

  const isItemCompleteForArea = (area: AreaCode, item: ChecklistItem): boolean => {
    const raw = states[area]?.items?.[item.id] || { checked: false, subchecks: {} };
    const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
    if (hasSubtasks) {
      return item.subitems.every(sub => !!raw.subchecks?.[sub.id]);
    }
    return !!raw.checked;
  };

  // Handle joining checklist area
  const handleJoinArea = (area: AreaCode) => {
    if (Object.keys(pending).length || pendingSupply || pendingSignatures) {
      Swal.fire({
        title: 'Có thay đổi chưa lưu',
        text: 'Bạn có thay đổi chưa đồng bộ. Bạn vẫn muốn chuyển khu vực chứ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Chuyển và bỏ qua thay đổi',
        cancelButtonText: 'Hủy'
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
    setPendingSupply(null);
    setPendingSignatures(null);
    
    // Save to local storage session
    localStorage.setItem('kg_ops_checklist_session_v7', JSON.stringify({ name: sessionName, area }));

    // Add current user to participants list if not already present
    const rawState = states[area] || { participants: [], items: {}, supply: {}, signatures: {} };
    const participants = [...(rawState.participants || [])];
    const key = currentUser?.username || 'user';
    
    if (!participants.some(p => p.key === key)) {
      participants.push({
        key,
        name: currentUser?.fullname || 'Nhân viên',
        joinedAt: new Date().toISOString()
      });
      // Save joined participant in state locally
      setStates(prev => ({
        ...prev,
        [area]: {
          ...rawState,
          participants
        }
      }));
      // Auto trigger sync to server in single save mode
      if (saveMode === 'single') {
        syncToServer(area, participants, rawState.items, rawState.supply, rawState.signatures);
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

    if (!participants.some(p => p.name.toLowerCase() === newName.toLowerCase())) {
      participants.push({
        key,
        name: newName,
        joinedAt: new Date().toISOString()
      });
      setStates(prev => ({
        ...prev,
        [selectedArea]: {
          ...rawState,
          participants
        }
      }));
      setParticipantInput('');
      
      if (saveMode === 'single') {
        syncToServer(selectedArea, participants, rawState.items, rawState.supply, rawState.signatures);
      } else {
        // Trigger save buffer
        setPending(p => ({ ...p, _participants_trigger: {} }));
      }
    }
  };

  // Remove participant
  const handleRemoveParticipant = (key: string) => {
    if (!selectedArea) return;
    const rawState = states[selectedArea] || { participants: [], items: {}, supply: {}, signatures: {} };
    const participants = (rawState.participants || []).filter(p => p.key !== key);
    
    setStates(prev => ({
      ...prev,
      [selectedArea]: {
        ...rawState,
        participants
      }
    }));
    
    if (saveMode === 'single') {
      syncToServer(selectedArea, participants, rawState.items, rawState.supply, rawState.signatures);
    } else {
      setPending(p => ({ ...p, _participants_trigger: {} }));
    }
  };

  // Toggle main checklist item
  const handleToggleItem = async (item: ChecklistItem, checked: boolean) => {
    if (!selectedArea) return;
    
    const hasSubtasks = Array.isArray(item.subitems) && item.subitems.length > 0;
    const subchecks: Record<string, boolean> = {};
    if (hasSubtasks) {
      item.subitems.forEach(sub => {
        subchecks[sub.id] = checked;
      });
    }

    const stateUpdate: Partial<SavedItemState> = {
      checked,
      subchecks,
      by: sessionName,
      at: new Date().toISOString()
    };

    if (saveMode === 'single') {
      const detail = hasSubtasks ? ' và các việc con?' : '?';
      Swal.fire({
        title: `Đánh dấu hoàn thành?`,
        text: `Đánh dấu hoàn thành Hạng mục ${item.no}${detail}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Đồng ý',
        cancelButtonText: 'Hủy'
      }).then(async (result) => {
        if (result.isConfirmed) {
          const updatedItems = {
            ...areaData.items,
            [item.id]: {
              ...(areaData.items[item.id] || {}),
              ...stateUpdate
            } as SavedItemState
          };
          await syncToServer(selectedArea, areaData.participants, updatedItems, areaData.supply, areaData.signatures);
        }
      });
    } else {
      setPending(prev => ({
        ...prev,
        [item.id]: stateUpdate
      }));
    }
  };

  // Toggle subtask
  const handleToggleSubtask = async (item: ChecklistItem, subId: string, checked: boolean) => {
    if (!selectedArea) return;

    const currentItemState = getMergedItemState(item);
    const subchecks = {
      ...(currentItemState.subchecks || {}),
      [subId]: checked
    };
    
    const allChecked = item.subitems.every(sub => !!subchecks[sub.id]);

    const stateUpdate: Partial<SavedItemState> = {
      checked: allChecked,
      subchecks,
      by: sessionName,
      at: new Date().toISOString()
    };

    if (saveMode === 'single') {
      const updatedItems = {
        ...areaData.items,
        [item.id]: {
          ...(areaData.items[item.id] || {}),
          ...stateUpdate
        } as SavedItemState
      };
      await syncToServer(selectedArea, areaData.participants, updatedItems, areaData.supply, areaData.signatures);
    } else {
      setPending(prev => ({
        ...prev,
        [item.id]: stateUpdate
      }));
    }
  };

  // Handle Note Save
  const handleSaveNote = async (itemId: string, noteText: string) => {
    if (!selectedArea) return;
    
    const item = flatItems.find(x => x.id === itemId);
    if (!item) return;

    const currentItemState = getMergedItemState(item);
    const stateUpdate: Partial<SavedItemState> = {
      ...currentItemState,
      note: noteText,
      by: sessionName,
      at: new Date().toISOString()
    };

    if (saveMode === 'single') {
      const updatedItems = {
        ...areaData.items,
        [itemId]: {
          ...(areaData.items[itemId] || {}),
          ...stateUpdate
        } as SavedItemState
      };
      await syncToServer(selectedArea, areaData.participants, updatedItems, areaData.supply, areaData.signatures);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Ghi chú trực tuyến thành công!', showConfirmButton: false, timer: 1500 });
    } else {
      setPending(prev => ({
        ...prev,
        [itemId]: stateUpdate
      }));
      Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Ghi chú lưu tạm. Bấm đồng bộ nhé!', showConfirmButton: false, timer: 1500 });
    }
  };

  // Handle Supplies Change
  const handleSupplyChange = (key: string, checked: boolean) => {
    const currentSupply = pendingSupply || areaData.supply || {};
    setPendingSupply({
      ...currentSupply,
      [key]: checked,
      by: sessionName,
      savedAt: new Date().toISOString()
    });
  };

  const handleSaveSupply = async () => {
    if (!selectedArea || !pendingSupply) return;
    
    if (saveMode === 'single') {
      await syncToServer(selectedArea, areaData.participants, areaData.items, pendingSupply, areaData.signatures);
      setPendingSupply(null);
    } else {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã ghi nhận đề xuất vật tư tạm thời!', showConfirmButton: false, timer: 1500 });
    }
  };

  // Handle Signatures Change
  const handleSignatureChange = (key: 'receive' | 'handover' | 'manager', val: string) => {
    const currentSigs = pendingSignatures || areaData.signatures || {};
    setPendingSignatures({
      ...currentSigs,
      [key]: val
    });
  };

  const handleSaveSignatures = async () => {
    if (!selectedArea || !pendingSignatures) return;
    
    if (saveMode === 'single') {
      await syncToServer(selectedArea, areaData.participants, areaData.items, areaData.supply, pendingSignatures);
      setPendingSignatures(null);
    } else {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã ghi nhận chữ ký tạm thời!', showConfirmButton: false, timer: 1500 });
    }
  };

  // Sync state to Google Sheets
  const syncToServer = async (
    area: AreaCode,
    participants: SavedAreaState['participants'],
    items: SavedAreaState['items'],
    supply: SavedAreaState['supply'],
    signatures: SavedAreaState['signatures']
  ) => {
    setIsSaving(true);
    store.setLoading(true, 'Đang gửi dữ liệu lên Google Sheets...');
    
    try {
      const res = await callApi('SAVE_OPS_CHECKLIST_STATE', {
        dateStr: workDate,
        area,
        participants,
        items,
        supply,
        signatures
      });

      if (res?.ok) {
        // Update states locally
        setStates(prev => ({
          ...prev,
          [area]: {
            participants,
            items,
            supply,
            signatures
          }
        }));
        
        // Reset pending buffers
        setPending({});
        setPendingSupply(null);
        setPendingSignatures(null);
        
        Swal.fire({ icon: 'success', title: 'Đồng bộ Google Sheets thành công!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        throw new Error(res?.message || 'API error');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Lỗi đồng bộ', 'Không thể gửi dữ liệu lên Google Sheets. Tiến độ đã được lưu tạm trên thiết bị.', 'error');
      
      // Update local states regardless so it is saved locally
      setStates(prev => ({
        ...prev,
        [area]: {
          participants,
          items,
          supply,
          signatures
        }
      }));
    } finally {
      setIsSaving(false);
      store.setLoading(false);
    }
  };

  const handleSyncAllPending = async () => {
    if (!selectedArea) return;
    
    // Merge pending item updates to areaData items
    const finalItems = { ...areaData.items };
    Object.entries(pending).forEach(([id, update]) => {
      if (id.startsWith('_')) return; // skip internal indicators
      finalItems[id] = {
        ...(finalItems[id] || {}),
        ...update
      } as SavedItemState;
    });

    const finalSupply = pendingSupply || areaData.supply;
    const finalSignatures = pendingSignatures || areaData.signatures;

    await syncToServer(selectedArea, areaData.participants, finalItems, finalSupply, finalSignatures);
  };

  // Group filter logic
  const isGroupVisible = (group: ChecklistGroup) => {
    return activePhase === 'ALL' || group.phase === activePhase || group.shift === activePhase;
  };

  // Compute metrics for progress bar
  const activeMetrics = useMemo(() => {
    const activeItems = flatItems.filter(item => isGroupVisible(item.group));
    const total = activeItems.length;
    const done = activeItems.filter(item => getMergedItemState(item).checked).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    
    const subTotal = activeItems.reduce((s, i) => s + (i.subitems?.length || 0), 0);
    const subDone = activeItems.reduce((s, item) => {
      const state = getMergedItemState(item);
      const doneCount = (item.subitems || []).filter(sub => !!state.subchecks?.[sub.id]).length;
      return s + doneCount;
    }, 0);

    return { done, total, subDone, subTotal, pct };
  }, [flatItems, pending, areaData, activePhase]);

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
    <div className="p-4 space-y-6 max-w-7xl mx-auto pb-24">
      <KgModuleHero
        moduleId="checklist"
        title="Checklist Vận Hành Theo Khu Vực"
        description="Đồng bộ trực tuyến theo thời gian thực cho 4 khu vực. Hỗ trợ việc con và đề xuất vật tư."
        eyebrow="Vận hành"
      />

      {/* Date & Mode selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="soft3d-card p-4 flex flex-col justify-center">
          <label className="block text-xs font-bold text-gray-500 mb-1">Ngày làm việc</label>
          <input 
            type="date" 
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full bg-white dark:bg-[#0E273C] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-gray-800 dark:text-white"
          />
        </div>

        <div className="soft3d-card p-4 md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full">
            <span className="block text-xs font-bold text-gray-500 mb-2">Chế độ lưu trữ</span>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button 
                onClick={() => { setSaveMode('batch'); setPending({}); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${saveMode === 'batch' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' : 'bg-gray-50 text-gray-600 border-transparent dark:bg-gray-800 dark:text-gray-300'}`}
              >
                Lưu hàng loạt (Khuyên dùng)
              </button>
              <button 
                onClick={() => { setSaveMode('single'); setPending({}); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${saveMode === 'single' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' : 'bg-gray-50 text-gray-600 border-transparent dark:bg-gray-800 dark:text-gray-300'}`}
              >
                Lưu trực tiếp tức thì
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Area Completeness Board */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {AREA_CODES.map(area => {
          const doneCount = flatItems.filter(item => isItemCompleteForArea(area, item)).length;
          const totalCount = flatItems.length;
          const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
          const isSelected = selectedArea === area;
          const participants = states[area]?.participants || [];

          return (
            <div 
              key={area}
              onClick={() => handleJoinArea(area)}
              className={`p-4 rounded-3xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/10' 
                  : 'border-transparent soft3d-card hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-extrabold text-base text-gray-800 dark:text-white">Khu {area}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100/50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">{pct}%</span>
              </div>
              <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] font-bold text-gray-500 mb-3">
                {participants.length} nhân viên · {doneCount}/{totalCount} mục
              </div>
              
              {/* Participant mini list */}
              <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-dashed border-gray-200 dark:border-gray-800">
                {participants.length > 0 ? (
                  participants.map(p => (
                    <span key={p.key} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                      👤 {p.name.split(' ').pop()}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] italic text-gray-400">Chưa có ai</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Panel Layout */}
      {!selectedArea ? (
        <div className="text-center py-16 soft3d-card max-w-lg mx-auto">
          <AlertCircle size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3 animate-bounce" />
          <h3 className="font-extrabold text-lg text-gray-800 dark:text-white">Bắt đầu thực hiện Checklist</h3>
          <p className="text-sm text-gray-500 mt-2">
            Vui lòng chọn một khu vực trực (Khu A, B, C, hoặc D&E) ở trên để bắt đầu tham gia và ghi nhận kết quả công việc.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Checklist & Steps */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header & Tabs */}
            <div className="soft3d-card p-4 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-4 border-b border-[var(--kg-border)] pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-gray-800 dark:text-white">Checklist chi tiết Khu {selectedArea}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ngày {workDate.split('-').reverse().join('/')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-xs font-bold text-gray-500">Hoàn thành</span>
                    <span className="text-sm font-black text-emerald-600">{activeMetrics.pct}% ({activeMetrics.done}/{activeMetrics.total})</span>
                  </div>
                  <div className="h-10 w-1 bg-gray-200 dark:bg-gray-800 rounded-full" />
                  <div className="text-right">
                    <span className="block text-xs font-bold text-gray-500">Việc con</span>
                    <span className="text-sm font-black text-blue-600">{activeMetrics.subDone}/{activeMetrics.subTotal}</span>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
                {tabs.map(t => (
                  <button 
                    key={t.key} 
                    onClick={() => setActivePhase(t.key)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                      activePhase === t.key 
                        ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' 
                        : 'bg-gray-50 text-gray-600 border-transparent dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist Items list */}
            {loading ? (
              <div className="flex justify-center p-12"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>
            ) : flatItems.filter(item => isGroupVisible(item.group)).length === 0 ? (
              <div className="text-center py-12 soft3d-card">
                <CheckSquare size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Không có hạng mục nào cho bộ lọc này.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {checklist.filter(isGroupVisible).map(group => (
                  <div key={`${group.phase}-${group.shift}-${group.section}`} className="space-y-3">
                    
                    {/* Header Group */}
                    <div className="flex items-center space-x-2 pt-2">
                      <span className="text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-2 py-0.5 rounded-full">{group.phase}</span>
                      <span className="text-[10px] font-black uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-2 py-0.5 rounded-full">{group.shift}</span>
                      <span className="text-xs font-extrabold text-gray-500">{group.section}</span>
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
                          className={`p-4 rounded-3xl border transition-all soft3d-card ${
                            itemState.checked 
                              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/5 dark:bg-emerald-950/5' 
                              : 'border-transparent'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start space-x-3 min-w-0">
                              <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-500 flex items-center justify-center mt-0.5">
                                {item.no}
                              </span>
                              <div className="min-w-0">
                                <h4 className={`text-sm font-bold truncate ${itemState.checked ? 'text-emerald-700 dark:text-emerald-400 line-through opacity-85' : 'text-gray-800 dark:text-white'}`}>
                                  {item.title}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{item.text}</p>
                              </div>
                            </div>
                            
                            {/* Checkbox button */}
                            <button
                              onClick={() => handleToggleItem(item, !itemState.checked)}
                              className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                itemState.checked 
                                  ? 'bg-emerald-500 border-emerald-500 text-white' 
                                  : 'border-gray-300 text-transparent hover:border-blue-500'
                              }`}
                            >
                              <CheckCircle2 size={18} />
                            </button>
                          </div>

                          {/* Subtasks block */}
                          {hasSubtasks && (
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800">
                              <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-100 dark:border-gray-800 pb-1.5">
                                <span>Danh sách việc con</span>
                                <span className="text-blue-600">{subDone}/{subTotal} hoàn thành</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {item.subitems.map(sub => {
                                  const isSubChecked = !!itemState.subchecks?.[sub.id];
                                  return (
                                    <label key={sub.id} className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                                      <input 
                                        type="checkbox" 
                                        checked={isSubChecked}
                                        onChange={(e) => handleToggleSubtask(item, sub.id, e.target.checked)}
                                        className="h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-800"
                                      />
                                      <span className={isSubChecked ? 'line-through opacity-75' : ''}>{sub.text}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Note / Edit section */}
                          <div className="mt-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3 flex-wrap gap-2 text-[10px] font-bold text-gray-400">
                            <div className="flex items-center space-x-2">
                              {itemState.checked ? (
                                <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/55 px-2 py-0.5 rounded-full">
                                  ✓ Xong {itemState.by ? `bởi ${itemState.by.split(' ').pop()}` : ''} {itemState.at ? `lúc ${itemState.at.substring(11, 16)}` : ''}
                                </span>
                              ) : (
                                <span>Chưa hoàn thành</span>
                              )}
                              {hasPending && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Lưu tạm</span>}
                            </div>
                            
                            {/* Inline Note text input */}
                            <div className="w-full flex items-center space-x-2 mt-2">
                              <textarea
                                defaultValue={itemState.note || ''}
                                onBlur={(e) => handleSaveNote(item.id, e.target.value)}
                                placeholder="Ghi chú kết quả công việc/hỏng hóc nếu có..."
                                className="w-full bg-white dark:bg-[#0E273C] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 placeholder-gray-400 resize-none min-h-[36px]"
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
          <div className="space-y-6">

            {/* Participants manager */}
            <div className="soft3d-card p-5">
              <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center mb-4">
                <Users size={16} className="mr-2 text-blue-500" />
                <span>Nhân viên trực Khu {selectedArea}</span>
              </h3>
              
              {/* Teammates List */}
              <div className="space-y-2 mb-4 max-h-[180px] overflow-y-auto pr-1">
                {areaData.participants.length > 0 ? (
                  areaData.participants.map(p => (
                    <div key={p.key} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200">
                      <span>👤 {p.name}</span>
                      <button 
                        onClick={() => handleRemoveParticipant(p.key)}
                        className="text-red-500 hover:text-red-700 hover:scale-105 active:scale-95 transition-all text-[10px]"
                      >
                        Bỏ
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-2">Chưa có nhân viên nào tham gia</p>
                )}
              </div>

              {/* Add Teammates Input */}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  placeholder="Thêm tên nhân viên trực..."
                  className="w-full bg-white dark:bg-[#0E273C] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 placeholder-gray-400"
                />
                <button 
                  onClick={handleAddParticipant}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center"
                >
                  Thêm
                </button>
              </div>
            </div>

            {/* Operational guidelines */}
            <div className="soft3d-card p-5 space-y-4">
              <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center">
                <FileText size={16} className="mr-2 text-orange-500" />
                <span>Ghi chú vận hành</span>
              </h3>
              <div className="space-y-3 text-xs text-gray-500 dark:text-gray-400 font-medium">
                <div>
                  <strong className="text-gray-700 dark:text-gray-200 block mb-0.5">Đầu ca (15h & 17h):</strong>
                  Vệ sinh khu vực trực, lau bàn ghế, setup đầy đủ chén đũa. Đọc thông tin bàn đặt trước và các món ngừng bán.
                </div>
                <div>
                  <strong className="text-gray-700 dark:text-gray-200 block mb-0.5">Cuối ca (Hạ ca & Kết ca):</strong>
                  Hỗ trợ ca sau thu gọn đồ. Ca sau cùng vệ sinh menu, xô đá, quạt trang trí, đổ rác, tắt hết nguồn điện/thiết bị chiếu sáng và dọn dẹp nhà vệ sinh.
                </div>
              </div>
            </div>

            {/* Supplies Proposal */}
            <div className="soft3d-card p-5 space-y-4">
              <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center">
                <CheckSquare2 size={16} className="mr-2 text-emerald-500" />
                <span>Đề xuất cấp vật tư</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
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
                    <label key={s.k} className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={(e) => handleSupplyChange(s.k, e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-800"
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
                  placeholder="Ghi chú số lượng cần cấp..."
                  className="w-full bg-white dark:bg-[#0E273C] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 placeholder-gray-400 min-h-[60px]"
                />
                
                <div className="flex justify-between items-center text-[10px] text-gray-400">
                  <span>
                    {areaData.supply?.savedAt 
                      ? `Lưu: ${areaData.supply.by?.split(' ').pop()} lúc ${areaData.supply.savedAt.substring(11, 16)}`
                      : 'Lưu đề xuất sau cùng của ca'}
                  </span>
                  
                  {pendingSupply && (
                    <button 
                      onClick={handleSaveSupply}
                      className="bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 px-3 py-1 rounded-xl font-bold transition-all text-[10px]"
                    >
                      Lưu đề xuất
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Handover Signatures */}
            <div className="soft3d-card p-5 space-y-4">
              <h3 className="font-extrabold text-sm text-gray-800 dark:text-white flex items-center">
                <PenTool size={16} className="mr-2 text-purple-500" />
                <span>Bàn giao & Xác nhận</span>
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
                      <label className="block font-bold text-gray-500 mb-1">{sig.l}</label>
                      <input 
                        type="text" 
                        value={val}
                        onChange={(e) => handleSignatureChange(sig.k as any, e.target.value)}
                        placeholder="Ký tên / Ghi họ tên..."
                        className="w-full bg-white dark:bg-[#0E273C] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:border-blue-500 placeholder-gray-400"
                      />
                    </div>
                  );
                })}

                {pendingSignatures && (
                  <button 
                    onClick={handleSaveSignatures}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl text-xs transition-all flex items-center justify-center"
                  >
                    Lưu xác nhận bàn giao
                  </button>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Floating Sync bar for Batch mode */}
      {saveMode === 'batch' && selectedArea && hasPendingChanges && (
        <div className="fixed bottom-4 left-4 right-4 md:left-64 md:right-4 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-blue-200 dark:border-blue-800 p-4 rounded-2xl flex items-center justify-between shadow-lg animate-slide-up">
          <div className="flex items-center space-x-2">
            <span className="flex w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
              Có các thay đổi chưa được đồng bộ lên Google Sheets.
            </span>
          </div>
          <button 
            onClick={handleSyncAllPending}
            disabled={isSaving}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition-transform active:scale-95 shadow-md flex items-center space-x-1.5"
          >
            <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} />
            <span>Đồng bộ ngay</span>
          </button>
        </div>
      )}
    </div>
  );
}
