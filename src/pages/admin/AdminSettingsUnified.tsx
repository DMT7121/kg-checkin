import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Cpu,
  Crosshair,
  Database,
  Edit2,
  ExternalLink,
  HardDrive,
  History,
  Info,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Network,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgInput,
  KgModuleHero,
  KgSelect,
} from '../../components/KgDesignSystem';
import {
  APP_CODENAME,
  APP_RELEASE_DATE,
  APP_VERSION_TAG,
  openReleaseNotesModal,
} from '../../config/releaseNotes';
import { callApi } from '../../services/api';
import { useAppStore, type AIPrompt } from '../../store/useAppStore';
import { kgLoading, kgToast } from '../../store/useFeedbackStore';
import { fetchWithRetry, normalizeGpsRadius } from '../../utils/helpers';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import { isAdminUser } from '../../utils/permissions';
import {
  ADMIN_PIN_HASH,
  checkRateLimit,
  MASTER_PIN_HASH,
  recordFailedAttempt,
  resetFailedAttempts,
  sha256,
} from '../../utils/security';

interface EdgeDbStatus {
  ok: boolean;
  engine?: string;
  d1Bound?: boolean;
  kvBound?: boolean;
  region?: string;
  tables?: {
    edge_schedules?: number;
    edge_checkin_logs?: number;
    edge_kv_cache?: number;
    edge_sync_queue_pending?: number;
  };
  timestamp?: string;
}

export interface AdminSettingsUnifiedProps {
  initialSection?: 'org' | 'gps' | 'system';
}

const DEFAULT_ROLES = [
  { id: 'admin', name: 'Quản lý (Admin)', description: 'Toàn quyền truy cập Cấu hình', isDefault: true },
  { id: 'staff', name: 'Nhân viên (Staff)', description: 'Chỉ xem và thao tác cá nhân', isDefault: false },
];

const DEFAULT_ORG_STRUCTURE = [
  { id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 },
  { id: 'official', name: 'Chính thức', salaryMultiplier: 1.0 },
];

const DEFAULT_SHIFT_CODES = [
  { id: 'standard', code: 'Ca tiêu chuẩn', description: '15:00, 16:00, 17:00, 18:00, 19:00', type: 'standard' },
  { id: 'off_admin', code: 'OFF#', description: 'Nghỉ phép (Được Admin duyệt)', type: 'admin' },
  { id: 'off_penalty', code: 'OFF!', description: 'Nghỉ không phép (Bị phạt)', type: 'penalty' },
];

export default function AdminSettingsUnified({ initialSection }: AdminSettingsUnifiedProps = {}) {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminSettingsUnifiedContent initialSection={initialSection} />;
}

function AdminSettingsUnifiedContent({ initialSection }: AdminSettingsUnifiedProps) {
  const store = useAppStore(
    useShallow((s) => ({
      currentUser: s.currentUser,
      serverOrgConfig: s.serverOrgConfig,
      serverGpsConfig: s.serverGpsConfig,
      setServerOrgConfig: s.setServerOrgConfig,
      setServerGpsConfig: s.setServerGpsConfig,
      isAdminUnlocked: s.isAdminUnlocked,
      groqKeysInput: s.groqKeysInput,
      groqKeys: s.groqKeys,
      aiPrompts: s.aiPrompts,
      logs: s.logs,
      setGroqKeysInput: s.setGroqKeysInput,
      setLoading: s.setLoading,
      setGroqKeys: s.setGroqKeys,
      setAiPrompts: s.setAiPrompts,
      setAdminUnlocked: s.setAdminUnlocked,
    })),
  );

  const {
    currentUser,
    serverOrgConfig,
    serverGpsConfig,
    isAdminUnlocked,
    groqKeysInput,
    groqKeys,
    aiPrompts,
    logs,
    setGroqKeysInput,
  } = store;

  // === Company / Org Config State ===
  const [companyName, setCompanyName] = useState("King's Grill");
  const [companyAddress, setCompanyAddress] = useState('Dĩ An, Bình Dương');
  const [roles, setRoles] = useState<any[]>(DEFAULT_ROLES);
  const [orgStructure, setOrgStructure] = useState<any[]>(DEFAULT_ORG_STRUCTURE);
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgGasOpen, setOrgGasOpen] = useState(initialSection === 'org');
  const [orgSheetMode, setOrgSheetMode] = useState<'role' | 'org' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSecondary, setDraftSecondary] = useState('');

  // === GPS / Shift Config State ===
  const [kgLat, setKgLat] = useState('10.9760826');
  const [kgLng, setKgLng] = useState('106.6646541');
  const [kgRadius, setKgRadius] = useState('25');
  const [shiftCodes, setShiftCodes] = useState<any[]>(DEFAULT_SHIFT_CODES);
  const [registrationCloseTime, setRegistrationCloseTime] = useState('17:00 Thứ Bảy');
  const [savingGps, setSavingGps] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsGasOpen, setGpsGasOpen] = useState(initialSection === 'gps');
  const [gpsBanner, setGpsBanner] = useState<{
    tone: 'success' | 'error';
    title: string;
    detail: string;
    hint?: string;
  } | null>(null);
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftDesc, setNewShiftDesc] = useState('');
  const [newShiftType, setNewShiftType] = useState<'standard' | 'admin' | 'penalty'>('standard');

  // === Edge D1 / AI / Master PIN State ===
  const [localPrompts, setLocalPrompts] = useState<AIPrompt[]>(aiPrompts || []);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [edgeStatus, setEdgeStatus] = useState<EdgeDbStatus | null>(null);
  const [edgeError, setEdgeError] = useState('');
  const [checkingEdge, setCheckingEdge] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [analyzingGroq, setAnalyzingGroq] = useState(false);
  const [groqAnalysis, setGroqAnalysis] = useState<{ text: string; updatedAt: string } | null>(null);
  const [groqPanelExpanded, setGroqPanelExpanded] = useState(true);

  useEffect(() => {
    if (serverOrgConfig) {
      setCompanyName(serverOrgConfig.name || "King's Grill");
      setCompanyAddress(serverOrgConfig.address || 'Dĩ An, Bình Dương');
      if (serverOrgConfig.roles) setRoles(serverOrgConfig.roles);
      if (serverOrgConfig.orgStructure) setOrgStructure(serverOrgConfig.orgStructure);
    }
  }, [serverOrgConfig]);

  useEffect(() => {
    if (serverGpsConfig) {
      setKgLat(serverGpsConfig.lat.toString());
      setKgLng(serverGpsConfig.lng.toString());
      setKgRadius(normalizeGpsRadius(serverGpsConfig.radius).toString());
      if ((serverGpsConfig as any).shiftCodes) setShiftCodes((serverGpsConfig as any).shiftCodes);
      if ((serverGpsConfig as any).registrationCloseTime) {
        setRegistrationCloseTime((serverGpsConfig as any).registrationCloseTime);
      }
    }
  }, [serverGpsConfig]);

  const [prevAiPrompts, setPrevAiPrompts] = useState(aiPrompts);
  if (aiPrompts !== prevAiPrompts) {
    setPrevAiPrompts(aiPrompts);
    setLocalPrompts(aiPrompts || []);
  }

  // Auto-populate groqKeysInput ONLY after Master PIN unlock so raw keys are never exposed prematurely
  useEffect(() => {
    if (isAdminUnlocked && groqKeys.length > 0 && !groqKeysInput) {
      setGroqKeysInput(groqKeys.map((k) => k.key).join('\n'));
    }
  }, [isAdminUnlocked, groqKeys, groqKeysInput, setGroqKeysInput]);

  const loadEdgeDbStatus = async () => {
    setCheckingEdge(true);
    setEdgeError('');
    try {
      const res = await callApi('GET_EDGE_DB_STATUS', {}, { background: true, cacheTtlMs: 0 });
      if (res && typeof res === 'object' && res.ok !== false) {
        setEdgeStatus(res);
      } else {
        setEdgeError(res?.message || 'Không thể kiểm tra trạng thái Edge D1 / KV.');
      }
    } catch {
      setEdgeError('Không thể kết nối đến Edge DB.');
    } finally {
      setCheckingEdge(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    callApi('GET_EDGE_DB_STATUS', {}, { background: true, cacheTtlMs: 0 })
      .then((res) => {
        if (cancelled) return;
        if (res && typeof res === 'object' && res.ok !== false) {
          setEdgeStatus(res);
          setEdgeError('');
        } else {
          setEdgeError(res?.message || 'Không thể kiểm tra trạng thái Edge D1 / KV.');
        }
      })
      .catch(() => {
        if (!cancelled) setEdgeError('Không thể kết nối đến Edge DB.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // === Handlers: Org ===
  const handleSaveOrg = async () => {
    if (!currentUser) return;
    setSavingOrg(true);
    try {
      const data = await callApi('UPDATE_ORG_CONFIG', {
        role: currentUser.role,
        name: companyName,
        address: companyAddress,
        roles,
        orgStructure,
      });
      if (!data) return;
      if (data.ok) {
        store.setServerOrgConfig({
          name: companyName,
          address: companyAddress,
          roles,
          orgStructure,
        });
        kgToast('Thông tin doanh nghiệp & tổ chức đã được cập nhật.', 'success', 'Đã lưu Tổ chức');
      } else {
        kgToast(data.message || 'Lỗi không xác định', 'error', 'Lỗi lưu cấu hình');
      }
    } finally {
      setSavingOrg(false);
    }
  };

  const handleConfirmOrgSheet = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    if (orgSheetMode === 'role') {
      setRoles([
        ...roles,
        { id: 'role_' + Date.now(), name: trimmed, description: draftSecondary.trim(), isDefault: false },
      ]);
    } else if (orgSheetMode === 'org') {
      setOrgStructure([
        ...orgStructure,
        { id: 'org_' + Date.now(), name: trimmed, salaryMultiplier: parseFloat(draftSecondary) || 1 },
      ]);
    }
    setOrgSheetMode(null);
  };

  // === Handlers: GPS ===
  const handleGetLiveLocation = () => {
    if (!navigator.geolocation) {
      const msg = 'Trình duyệt không hỗ trợ định vị GPS.';
      setGpsBanner({ tone: 'error', title: 'Lỗi định vị GPS', detail: msg });
      kgToast(msg, 'error', 'Lỗi GPS');
      return;
    }
    setIsLocating(true);
    setGpsBanner(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        const acc = Math.round(pos.coords.accuracy);
        setKgLat(lat);
        setKgLng(lng);
        setKgRadius('25');
        setGpsBanner({
          tone: 'success',
          title: 'Đã nhận diện tọa độ!',
          detail: `Vĩ độ: ${lat} · Kinh độ: ${lng} · Độ chính xác: ±${acc}m · Bán kính: 25m`,
          hint: 'Hãy nhấn nút "Lưu Cấu Hình GPS" bên dưới để áp dụng ngay!',
        });
        kgToast(`Vĩ độ ${lat}, Kinh độ ${lng} (±${acc}m). Nhấn Lưu Cấu Hình GPS để áp dụng.`, 'success');
      },
      (err) => {
        setIsLocating(false);
        const msg = `Không thể lấy vị trí hiện tại: ${err.message}. Vui lòng bật quyền Vị trí cho trình duyệt.`;
        setGpsBanner({ tone: 'error', title: 'Lỗi GPS', detail: msg });
        kgToast(msg, 'error', 'Lỗi GPS');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSaveGPS = async () => {
    if (!currentUser) return;
    setSavingGps(true);
    try {
      const data = await callApi('UPDATE_GPS_CONFIG', {
        role: currentUser.role,
        lat: kgLat,
        lng: kgLng,
        radius: kgRadius,
        shiftCodes,
        registrationCloseTime,
      });
      if (!data) return;
      if (data.ok) {
        store.setServerGpsConfig({
          lat: Number(kgLat),
          lng: Number(kgLng),
          radius: Number(kgRadius),
          shiftCodes,
          registrationCloseTime,
        } as any);
        setGpsBanner(null);
        kgToast(`Đã cập nhật vị trí gốc nhà hàng (Bán kính ${kgRadius}m)!`, 'success', 'Đã lưu GPS');
      } else {
        kgToast(data.message || 'Lỗi không xác định', 'error', 'Lỗi lưu cấu hình');
      }
    } finally {
      setSavingGps(false);
    }
  };

  const handleConfirmAddShiftCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newShiftCode.trim();
    if (!code) return;
    setShiftCodes([
      ...shiftCodes,
      { id: 'shift_' + Date.now(), code, description: newShiftDesc.trim(), type: newShiftType },
    ]);
    setIsAddShiftOpen(false);
  };

  // === Handlers: Master PIN & AI ===
  const handleUnlockPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    setPinError('');
    const rate = checkRateLimit();
    if (!rate.allowed) {
      setPinError(`Tạm khóa bảo mật: Vui lòng đợi ${rate.waitSeconds} giây trước khi thử lại mã PIN.`);
      return;
    }
    setVerifyingPin(true);
    try {
      const hashed = await sha256(trimmed);
      let unlocked = hashed === MASTER_PIN_HASH || hashed === ADMIN_PIN_HASH;
      if (!unlocked) {
        const res = await callApi('VERIFY_MASTER_PIN', { pin: trimmed }, { background: true, cacheTtlMs: 0 });
        if (res?.ok && res.data?.valid !== false) unlocked = true;
      }
      if (unlocked) {
        resetFailedAttempts();
        store.setAdminUnlocked(true);
        setPinInput('');
        setPinError('');
        kgToast('Đã mở khóa Quản lý Khoá API', 'success');
      } else {
        recordFailedAttempt();
        setPinError('Mã PIN bảo mật không chính xác.');
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  const analyzeWithGroq = async () => {
    if (logs.length === 0) {
      kgToast('Chưa có dữ liệu chấm công để phân tích.', 'info', 'Chú ý');
      return;
    }
    setAnalyzingGroq(true);
    kgLoading('Chip LPU đang tổng hợp dữ liệu với Llama 3.3...');
    const todayLogs = logs
      .slice(0, 15)
      .map((l) => `${l.fullname} - ${l.type} lúc ${l.time} - Trạng thái: ${l.status}`);
    const promptText = `Hãy xem danh sách hoạt động chấm công gần nhất và viết một tóm tắt siêu ngắn gọn (3-4 câu) để báo cáo tình hình. Danh sách: \n${todayLogs.join('\n')}`;
    const messages = [
      {
        role: 'system',
        content: 'Bạn là Trợ lý AI Quản lý nhân sự tiếng Việt. Trả lời chuyên nghiệp, súc tích, có dùng biểu tượng cảm xúc.',
      },
      { role: 'user', content: promptText },
    ];

    try {
      let aiText = '';
      const proxyRes = await callApi(
        'AI_CHAT',
        { model: 'llama-3.3-70b-versatile', messages, temperature: 0.5, max_tokens: 256 },
        { background: true, cacheTtlMs: 0 },
      );
      if (proxyRes?.ok && (proxyRes.data?.reply || proxyRes.data?.content)) {
        aiText = proxyRes.data.reply || proxyRes.data.content;
      } else {
        const selectedKey =
          groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
        const apiKey = selectedKey ? selectedKey.key : null;
        if (!apiKey) {
          kgToast('Hệ thống chưa được đồng bộ Groq API Key.', 'warning', 'Cảnh báo');
          return;
        }
        const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.5,
            max_tokens: 256,
          }),
        });
        aiText = result.choices?.[0]?.message?.content || 'Không thể lấy phân tích từ Groq lúc này.';
      }
      setGroqAnalysis({
        text: aiText,
        updatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      });
      setGroqPanelExpanded(true);
      kgToast('Đã hoàn tất phân tích nhân sự bằng Groq AI.', 'success', 'Phân tích Groq AI');
    } catch {
      kgToast('Không thể kết nối đến Groq. Kiểm tra lại hạn mức API Key.', 'error', 'Lỗi kết nối Groq');
    } finally {
      kgLoading(null);
      setAnalyzingGroq(false);
    }
  };

  const syncApiKeys = async () => {
    if (!isAdminUnlocked) {
      kgToast('Vui lòng nhập Mã PIN bảo mật trước khi chỉnh sửa API Key.', 'warning', 'Yêu cầu mở khóa');
      return;
    }
    const keyArray = groqKeysInput
      .split('\n')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keyArray.length === 0) {
      kgToast('Vui lòng nhập ít nhất 1 Key để đồng bộ', 'warning', 'Thiếu API Key');
      return;
    }
    store.setLoading(true, 'Đang đồng bộ...');
    const res = await callApi('SYNC_KEYS', { keys: keyArray });
    store.setLoading(false);
    if (!res) return;
    if (res.ok) {
      kgToast('Đã lưu trữ hệ thống Key an toàn', 'success', 'Thành công');
      const updatedKeys = keyArray.map((k, i) => ({
        key: k,
        tag: 'Key ' + (i + 1),
        status: 'Active',
      }));
      store.setGroqKeys(updatedKeys);
    } else {
      kgToast(res.message || 'Không thể đồng bộ Key lúc này', 'error', 'Lỗi');
    }
  };

  const syncAiPrompts = async () => {
    store.setLoading(true, 'Đang lưu cấu hình Prompt...');
    const res = await callApi('UPDATE_AI_PROMPTS', { prompts: localPrompts, role: 'admin' });
    store.setLoading(false);
    if (!res) return;
    if (res.ok) {
      kgToast('Đã lưu cấu hình AI Prompt', 'success', 'Thành công');
      store.setAiPrompts(localPrompts);
    } else {
      kgToast(res.message || 'Không thể lưu cấu hình Prompt lúc này', 'error', 'Lỗi');
    }
  };

  const addPrompt = () => {
    const newPrompt: AIPrompt = {
      id: Date.now().toString(),
      name: 'Prompt mới',
      content: 'Bạn là trợ lý AI chuyên nghiệp...',
      isActive: false,
    };
    setLocalPrompts([...localPrompts, newPrompt]);
    setEditingPromptId(newPrompt.id);
  };

  const updatePrompt = (id: string, field: keyof AIPrompt, value: string | boolean) => {
    setLocalPrompts(localPrompts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removePrompt = (id: string) => {
    setLocalPrompts(localPrompts.filter((p) => p.id !== id));
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="admin"
        title="Cấu Hình Hệ Thống & AI"
        description="Quản lý tập trung Thông tin Doanh nghiệp, Tọa độ GPS nhà hàng, Edge D1/KV, Khóa AI bảo vệ Master PIN và Nhật ký phiên bản."
        eyebrow="Hệ thống"
        actions={
          <button
            type="button"
            onClick={() => navigateToHubSubTab('admin_system', 'audit')}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
          >
            <ShieldCheck size={14} className="text-[var(--kg-primary-ink)]" />
            <span>Nhật ký kiểm toán</span>
          </button>
        }
      />

      {/* 1. Release Notes & Version */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-accent)]/30 p-4 sm:p-5 rounded-2xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--kg-accent)] text-white dark:text-[#0D1015] flex items-center justify-center shadow-xs flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
                  King&apos;s Grill Staff OS {APP_VERSION_TAG}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10.5px] font-mono tabular-nums font-bold text-[var(--kg-accent-ink)]">
                  Phát hành {APP_RELEASE_DATE}
                </span>
              </div>
              <p className="text-xs text-[var(--kg-text-muted)] mt-0.5">
                Kiến trúc <strong>{APP_CODENAME}</strong> • 11-Hub Super-App IA, Mobile-First Fit (360px–1920px) &amp; Edge D1 Gateway.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => openReleaseNotesModal('added')}
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
              Nâng cấp thêm
            </button>
            <button
              type="button"
              onClick={() => openReleaseNotesModal('updated')}
              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
            >
              <Wrench size={13} className="text-[var(--kg-primary-ink)]" />
              Chỉnh sửa
            </button>
            <button
              type="button"
              onClick={() => openReleaseNotesModal('history')}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-accent)] hover:brightness-95 text-white dark:text-[#0D1015] text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
            >
              <History size={13} />
              Nhật ký phiên bản
            </button>
          </div>
        </div>
      </div>

      {/* 2. Company Info + Restaurant GPS Side-by-Side on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Company Info (AdminOrg) */}
        <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)] flex items-center gap-2">
              <Building2 size={18} className="text-[var(--kg-primary-ink)]" />
              Thông tin Doanh nghiệp
            </h3>
            <button
              type="button"
              onClick={() => void handleSaveOrg()}
              disabled={savingOrg}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {savingOrg ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{savingOrg ? 'Đang lưu...' : 'Lưu Tổ chức'}</span>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="org-company-name"
                className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
              >
                Tên quán / Doanh nghiệp
              </label>
              <input
                id="org-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2 text-base sm:text-sm font-semibold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="org-company-address"
                className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
              >
                Địa chỉ
              </label>
              <input
                id="org-company-address"
                type="text"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2 text-base sm:text-sm font-semibold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
            </div>
          </div>

          {/* Expandable GAS-echo Disclosure: Roles & OrgStructure */}
          <div className="border-t border-[var(--kg-border)] pt-3">
            <button
              type="button"
              onClick={() => setOrgGasOpen((v) => !v)}
              aria-expanded={orgGasOpen}
              className="w-full min-h-[44px] sm:min-h-[36px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-xs font-bold text-[var(--kg-text)] transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Network size={14} className="text-[var(--kg-primary-ink)]" />
                <span>
                  Cấu hình mở rộng (GAS) —{' '}
                  <span className="font-mono tabular-nums text-[var(--kg-text-muted)]">
                    {roles.length} vai trò · {orgStructure.length} nhóm nhân sự
                  </span>
                </span>
              </span>
              {orgGasOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {orgGasOpen && (
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--kg-text-muted)] inline-flex items-center gap-1.5">
                      <Shield size={13} /> Phân quyền (Roles)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName('');
                        setDraftSecondary('');
                        setOrgSheetMode('role');
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Plus size={12} /> Thêm Role
                    </button>
                  </div>
                  {roles.map((r) => (
                    <div
                      key={r.id}
                      className="p-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--kg-text)] truncate">{r.name}</p>
                        <p className="text-[11px] text-[var(--kg-text-muted)] truncate">
                          {r.description}
                        </p>
                      </div>
                      {r.isDefault ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] font-bold shrink-0">
                          Mặc định
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRoles(roles.filter((x) => x.id !== r.id))}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--kg-border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--kg-text-muted)] inline-flex items-center gap-1.5">
                      <Network size={13} /> Cơ cấu tổ chức (Hệ số lương)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName('');
                        setDraftSecondary('1.0');
                        setOrgSheetMode('org');
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Plus size={12} /> Thêm loại NV
                    </button>
                  </div>
                  {orgStructure.map((org) => (
                    <div
                      key={org.id}
                      className="p-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--kg-text)] truncate">
                          {org.name}
                        </p>
                        <p className="text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums">
                          Hệ số: {org.salaryMultiplier}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOrgStructure(orgStructure.filter((x) => x.id !== org.id))
                        }
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Restaurant GPS Config (AdminShift) */}
        <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)] flex items-center gap-2">
              <MapPin size={18} className="text-[var(--kg-primary-ink)]" />
              Tọa độ GPS Nhà hàng
            </h3>
            <button
              type="button"
              onClick={handleGetLiveLocation}
              disabled={isLocating}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary-soft)] hover:opacity-90 text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/30 text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <Crosshair size={14} className={isLocating ? 'animate-spin' : ''} />
              <span>{isLocating ? 'Đang lấy GPS...' : 'Lấy GPS'}</span>
            </button>
          </div>

          {gpsBanner && (
            <div
              role="status"
              className={`rounded-xl border p-3 flex items-start justify-between gap-2 text-xs ${
                gpsBanner.tone === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {gpsBanner.tone === 'success' ? (
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 space-y-0.5">
                  <p className="font-extrabold">{gpsBanner.title}</p>
                  <p className="font-mono tabular-nums break-words">{gpsBanner.detail}</p>
                  {gpsBanner.hint && <p className="font-bold pt-0.5">{gpsBanner.hint}</p>}
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng thông báo GPS"
                onClick={() => setGpsBanner(null)}
                className="p-1 rounded-lg opacity-70 hover:opacity-100 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="kg-lat"
                className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
              >
                Vĩ độ (Lat)
              </label>
              <input
                id="kg-lat"
                type="text"
                value={kgLat}
                onChange={(e) => setKgLat(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold tabular-nums text-[var(--kg-text)]"
              />
            </div>
            <div>
              <label
                htmlFor="kg-lng"
                className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
              >
                Kinh độ (Lng)
              </label>
              <input
                id="kg-lng"
                type="text"
                value={kgLng}
                onChange={(e) => setKgLng(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold tabular-nums text-[var(--kg-text)]"
              />
            </div>
            <div>
              <label
                htmlFor="kg-radius"
                className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
              >
                Bán kính (m)
              </label>
              <input
                id="kg-radius"
                type="number"
                value={kgRadius}
                onChange={(e) => setKgRadius(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-mono font-bold tabular-nums text-[var(--kg-text)]"
              />
            </div>
          </div>

          <p className="text-[11px] text-[var(--kg-text-muted)] flex items-start gap-1.5">
            <Info size={14} className="text-[var(--kg-primary-ink)] shrink-0 mt-0.5" />
            <span>
              Đứng tại sảnh chính nhà hàng, nhấn <b>&quot;Lấy GPS&quot;</b> rồi bấm lưu để chuẩn hóa bán kính 25m.
            </span>
          </p>

          <button
            type="button"
            onClick={() => void handleSaveGPS()}
            disabled={savingGps}
            className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
          >
            {savingGps ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{savingGps ? 'Đang lưu...' : `Lưu Cấu Hình GPS (Bán kính ${kgRadius}m)`}</span>
          </button>

          {/* Expandable GAS-echo Disclosure: shiftCodes & registrationCloseTime */}
          <div className="border-t border-[var(--kg-border)] pt-3">
            <button
              type="button"
              onClick={() => setGpsGasOpen((v) => !v)}
              aria-expanded={gpsGasOpen}
              className="w-full min-h-[44px] sm:min-h-[36px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-xs font-bold text-[var(--kg-text)] transition-colors"
            >
              <span>
                Cấu hình mở rộng (GAS) —{' '}
                <span className="font-mono tabular-nums text-[var(--kg-text-muted)]">
                  {shiftCodes.length} mã ca · Đóng cổng {registrationCloseTime}
                </span>
              </span>
              {gpsGasOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {gpsGasOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="reg-close-time"
                    className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1"
                  >
                    Giờ đóng cổng đăng ký ca
                  </label>
                  <input
                    id="reg-close-time"
                    type="text"
                    value={registrationCloseTime}
                    onChange={(e) => setRegistrationCloseTime(e.target.value)}
                    className="w-full min-h-[44px] sm:min-h-[38px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-semibold text-[var(--kg-text)]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--kg-text-muted)]">
                      Danh sách mã ca (GAS echo)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewShiftCode('');
                        setNewShiftDesc('');
                        setNewShiftType('standard');
                        setIsAddShiftOpen(true);
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Plus size={12} /> Thêm mã ca
                    </button>
                  </div>
                  {shiftCodes.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold font-mono text-[var(--kg-text)] truncate">
                          {s.code}
                        </p>
                        <p className="text-[11px] text-[var(--kg-text-muted)] truncate">
                          {s.description || '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShiftCodes(shiftCodes.filter((x) => x.id !== s.id))}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0 inline-flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 3. Cloudflare Edge D1 / KV Health */}
      <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
          <h3 className="font-extrabold flex items-center text-[var(--kg-text)] text-sm sm:text-base">
            <Database size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
            Cơ sở dữ liệu Edge (Cloudflare D1 SQLite + KV + Google Sheets)
          </h3>
          <button
            type="button"
            onClick={() => void loadEdgeDbStatus()}
            disabled={checkingEdge}
            className="min-h-[44px] sm:min-h-[36px] text-xs bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-bold px-3.5 py-1.5 rounded-xl inline-flex items-center hover:bg-emerald-500/20 disabled:opacity-60"
          >
            <RefreshCw size={13} className={`mr-1.5 ${checkingEdge ? 'animate-spin' : ''}`} />
            Kiểm tra DB
          </button>
        </div>

        {edgeError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
            <span>{edgeError}</span>
            <button
              type="button"
              onClick={() => void loadEdgeDbStatus()}
              disabled={checkingEdge}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-bold"
            >
              Thử lại
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
              D1 SQLite (APAC)
            </p>
            <p className="text-sm font-black text-[var(--kg-text)] mt-1 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  edgeStatus?.d1Bound
                    ? 'bg-emerald-500 animate-pulse'
                    : edgeError
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
                }`}
              />
              {edgeStatus
                ? edgeStatus.d1Bound
                  ? 'Đang hoạt động'
                  : 'Local / Fallback'
                : edgeError
                  ? 'Chưa kết nối'
                  : 'Đang kiểm tra...'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
            <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
              Lịch ca trên Edge
            </p>
            <p className="text-base font-black font-mono tabular-nums text-[var(--kg-text)] mt-0.5">
              {edgeStatus?.tables?.edge_schedules ?? 0}{' '}
              <span className="text-xs font-sans font-semibold text-[var(--kg-text-muted)]">
                bản ghi
              </span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
            <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
              Bộ đệm SWR (D1/KV)
            </p>
            <p className="text-base font-black font-mono tabular-nums text-[var(--kg-text)] mt-0.5">
              {edgeStatus?.tables?.edge_kv_cache ?? 0}{' '}
              <span className="text-xs font-sans font-semibold text-[var(--kg-text-muted)]">
                queries
              </span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
            <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
              Hàng đợi đồng bộ Sheet
            </p>
            <p className="text-base font-black font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-0.5">
              {edgeStatus?.tables?.edge_sync_queue_pending ?? 0}{' '}
              <span className="text-xs font-sans font-semibold text-[var(--kg-text-muted)]">
                đang chờ
              </span>
            </p>
          </div>
        </div>

        <p className="text-[11px] text-[var(--kg-text-muted)] flex items-center gap-1.5">
          <HardDrive size={13} className="text-emerald-600 shrink-0" />
          <span>
            Kiến trúc <b>Write-Through + Read-Overlay</b>: Ghi tức thì vào Cloudflare D1 (&lt;15ms), tự động đồng bộ 100% về Google Sheets.
          </span>
        </p>
      </section>

      {/* 4. Groq AI Analysis + Master PIN-Gated Keys & Prompts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Keys (Master PIN Protected) */}
        <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-extrabold flex items-center text-[var(--kg-text)] text-sm sm:text-base">
              <Cpu size={18} className="mr-2 text-[var(--kg-primary-ink)]" />
              Quản lý Nguồn lực AI (Groq)
            </h3>
            {isAdminUnlocked && (
              <button
                type="button"
                onClick={() => {
                  store.setGroqKeysInput('');
                  store.setAdminUnlocked(false);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-xs text-amber-800 dark:text-amber-300 font-bold inline-flex items-center gap-1"
              >
                <Lock size={12} /> Khóa lại
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void analyzeWithGroq()}
            disabled={analyzingGroq}
            className="w-full min-h-[44px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs disabled:opacity-60"
          >
            {analyzingGroq ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            <span>{analyzingGroq ? 'Đang phân tích với Groq AI...' : 'Groq AI tóm tắt chấm công'}</span>
          </button>

          {groqAnalysis && (
            <div className="rounded-xl border border-[var(--kg-primary)]/25 bg-[var(--kg-surface-soft)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--kg-border)]">
                <button
                  type="button"
                  onClick={() => setGroqPanelExpanded((v) => !v)}
                  className="flex items-center gap-2 text-xs font-extrabold text-[var(--kg-text)] min-w-0"
                >
                  <Sparkles size={14} className="text-[var(--kg-primary-ink)] shrink-0" />
                  <span className="truncate">Phân tích Groq AI</span>
                  <span className="text-[10px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                    {groqAnalysis.updatedAt}
                  </span>
                  {groqPanelExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  type="button"
                  aria-label="Đóng kết quả Groq AI"
                  onClick={() => setGroqAnalysis(null)}
                  className="p-1 rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                >
                  <X size={14} />
                </button>
              </div>
              {groqPanelExpanded && (
                <div className="p-3.5 text-xs sm:text-sm leading-relaxed text-[var(--kg-text)] space-y-1.5 whitespace-pre-wrap">
                  {groqAnalysis.text}
                </div>
              )}
            </div>
          )}

          {!isAdminUnlocked ? (
            <form onSubmit={(e) => void handleUnlockPin(e)} className="space-y-3 pt-1">
              <p className="text-xs text-[var(--kg-text-muted)]">
                Kho khóa API được bảo vệ bằng <b>Master PIN</b>. Hiện có{' '}
                <b className="font-mono tabular-nums text-[var(--kg-text)]">{groqKeys.length}</b> khóa đã cấu hình an toàn.
              </p>
              {pinError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300"
                >
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    if (pinError) setPinError('');
                  }}
                  placeholder="Nhập Master PIN để xem / cập nhật API Keys..."
                  className="flex-1 min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-sm font-mono text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                />
                <button
                  type="submit"
                  disabled={verifyingPin || !pinInput.trim()}
                  className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {verifyingPin ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  <span>Mở khóa</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[var(--kg-text-muted)]">
                  Danh sách Groq API Keys (mỗi dòng 1 key)
                </label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--kg-primary-ink)] font-bold inline-flex items-center gap-1 hover:underline"
                >
                  Lấy Key miễn phí <ExternalLink size={11} />
                </a>
              </div>
              <textarea
                value={groqKeysInput}
                onChange={(e) => store.setGroqKeysInput(e.target.value)}
                rows={3}
                className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-mono text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                placeholder={'gsk_...\ngsk_...'}
              />
              {groqKeys.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groqKeys.map((k, i) => {
                    const rawKey = typeof k === 'string' ? k : k?.key || '';
                    const maskedKey =
                      rawKey.length > 10 ? `${rawKey.slice(0, 6)}••••${rawKey.slice(-4)}` : '••••••••';
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-md text-[10px] font-bold font-mono border border-emerald-500/25"
                      >
                        {k.tag || `Key ${i + 1}`}: {maskedKey}
                      </span>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => void syncApiKeys()}
                className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm inline-flex items-center justify-center gap-1.5"
              >
                <CloudUpload size={15} /> Lưu &amp; Đồng bộ API Keys
              </button>
            </div>
          )}
        </section>

        {/* System Prompts */}
        <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-extrabold flex items-center text-[var(--kg-text)] text-sm sm:text-base">
              <ShieldAlert size={18} className="mr-2 text-[var(--kg-accent-ink)] shrink-0" />
              Cấu hình System Prompts (AI)
            </h3>
            <button
              type="button"
              onClick={addPrompt}
              className="min-h-[44px] sm:min-h-[36px] text-xs bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/25 text-[var(--kg-accent-ink)] font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1"
            >
              <Plus size={14} /> Thêm Prompt
            </button>
          </div>

          <div className="space-y-3">
            {localPrompts.length === 0 ? (
              <div className="text-center py-6 bg-[var(--kg-surface-soft)] rounded-xl border border-dashed border-[var(--kg-border)]">
                <p className="text-xs text-[var(--kg-text-muted)] mb-2">
                  Chưa có System Prompt nào được cấu hình.
                </p>
                <button
                  type="button"
                  onClick={addPrompt}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] text-xs font-bold"
                >
                  + Tạo prompt đầu tiên
                </button>
              </div>
            ) : (
              localPrompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className={`p-3.5 rounded-xl border ${
                    prompt.isActive
                      ? 'border-[var(--kg-accent)]/40 bg-[var(--kg-accent-soft)]/40'
                      : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  {editingPromptId === prompt.id ? (
                    <div className="space-y-2.5">
                      <input
                        value={prompt.name}
                        onChange={(e) => updatePrompt(prompt.id, 'name', e.target.value)}
                        className="w-full min-h-[44px] sm:min-h-[38px] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-sm font-bold text-[var(--kg-text)]"
                        placeholder="Tên Prompt"
                      />
                      <textarea
                        value={prompt.content}
                        onChange={(e) => updatePrompt(prompt.id, 'content', e.target.value)}
                        rows={4}
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3 py-2 text-base sm:text-xs font-mono text-[var(--kg-text)]"
                        placeholder="System Context..."
                      />
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--kg-text)]">
                          <input
                            type="checkbox"
                            checked={prompt.isActive}
                            onChange={(e) => updatePrompt(prompt.id, 'isActive', e.target.checked)}
                            className="w-4 h-4 accent-[var(--kg-primary)]"
                          />
                          <span>Kích hoạt sử dụng</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditingPromptId(null)}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary)] text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Check size={14} /> Xong
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              prompt.isActive ? 'bg-emerald-500' : 'bg-[var(--kg-border-strong)]'
                            }`}
                          />
                          <h4 className="font-bold text-[var(--kg-text)] text-xs sm:text-sm truncate">
                            {prompt.name}
                          </h4>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label="Sửa prompt"
                            onClick={() => setEditingPromptId(prompt.id)}
                            className="w-9 h-9 inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-primary-ink)] rounded-lg"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Xóa prompt"
                            onClick={() => removePrompt(prompt.id)}
                            className="w-9 h-9 inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-rose-600 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--kg-text-muted)] line-clamp-2 italic">
                        &quot;{prompt.content}&quot;
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}

            <button
              type="button"
              onClick={() => void syncAiPrompts()}
              className="w-full min-h-[44px] sm:min-h-[40px] bg-[var(--kg-accent)] hover:brightness-95 text-white dark:text-[#0D1015] font-bold py-2.5 rounded-xl text-xs sm:text-sm inline-flex items-center justify-center gap-1.5"
            >
              <CloudUpload size={15} /> Lưu Cấu hình Prompts
            </button>
          </div>
        </section>
      </div>

      {/* Bottom Sheet: Add Role / Org */}
      <KgBottomSheet
        isOpen={orgSheetMode !== null}
        onClose={() => setOrgSheetMode(null)}
        title={orgSheetMode === 'role' ? 'Thêm vai trò phân quyền (Role)' : 'Thêm loại nhân sự mới'}
      >
        <form onSubmit={handleConfirmOrgSheet} className="space-y-4">
          <KgInput
            id="org-draft-name"
            label={orgSheetMode === 'role' ? 'Tên vai trò' : 'Tên loại nhân sự'}
            placeholder={orgSheetMode === 'role' ? 'VD: Trưởng ca' : 'VD: Part-time'}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            required
          />
          {orgSheetMode === 'role' ? (
            <KgInput
              id="org-draft-desc"
              label="Mô tả quyền hạn"
              placeholder="VD: Duyệt lịch và kiểm soát ca làm"
              value={draftSecondary}
              onChange={(e) => setDraftSecondary(e.target.value)}
            />
          ) : (
            <KgInput
              id="org-draft-multiplier"
              type="number"
              step="0.1"
              min="0.1"
              label="Hệ số lương"
              placeholder="VD: 1.0"
              value={draftSecondary}
              onChange={(e) => setDraftSecondary(e.target.value)}
              inputClassName="font-mono tabular-nums text-right"
              required
            />
          )}
          <div className="flex gap-2.5 pt-2">
            <KgButton type="button" variant="secondary" className="flex-1" onClick={() => setOrgSheetMode(null)}>
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1" disabled={!draftName.trim()}>
              Thêm mới
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>

      {/* Bottom Sheet: Add Shift Code */}
      <KgBottomSheet
        isOpen={isAddShiftOpen}
        onClose={() => setIsAddShiftOpen(false)}
        title="Thêm mã ca làm mới"
        subtitle="Thiết lập mã ca tiêu chuẩn, nghỉ phép Admin cấp hoặc mã phạt."
      >
        <form onSubmit={handleConfirmAddShiftCode} className="space-y-4">
          <KgInput
            id="new-shift-code"
            label="Mã ca làm"
            placeholder="VD: T7_SANG hoặc 14:30"
            value={newShiftCode}
            onChange={(e) => setNewShiftCode(e.target.value)}
            required
          />
          <KgInput
            id="new-shift-desc"
            label="Mô tả chi tiết"
            placeholder="VD: Ca tăng cường sáng Thứ Bảy"
            value={newShiftDesc}
            onChange={(e) => setNewShiftDesc(e.target.value)}
          />
          <KgSelect
            id="new-shift-type"
            label="Phân loại mã ca"
            value={newShiftType}
            onChange={(e) => setNewShiftType(e.target.value as 'standard' | 'admin' | 'penalty')}
            options={[
              { value: 'standard', label: 'Tiêu chuẩn (Nhân viên chọn được)' },
              { value: 'admin', label: 'Admin cấp (OFF#)' },
              { value: 'penalty', label: 'Phạt vi phạm (OFF!)' },
            ]}
          />
          <div className="flex gap-2.5 pt-2">
            <KgButton type="button" variant="secondary" className="flex-1" onClick={() => setIsAddShiftOpen(false)}>
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1" disabled={!newShiftCode.trim()}>
              Thêm mã ca
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>
    </div>
  );
}
