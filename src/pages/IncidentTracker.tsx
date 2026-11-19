import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { kgToast, type FeedbackTone } from '../store/useFeedbackStore';
import { formatVnd as formatVndBase } from '../utils/formatCurrency';
import { fileToBase64, uploadImageToDrive } from '../utils/helpers';
import { isWorkEligible } from '../utils/employment';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import {
  KgButton,
  KgEmptyState,
  KgInput,
  KgModuleHero,
  KgSkeleton,
} from '../components/KgDesignSystem';
import {
  INCIDENT_STATUS_STEPS,
  normalizeIncidentStatus,
  type IncidentRecord,
  type IncidentSeverity,
} from '../utils/operationsReconciliation';

const LOCAL_INCIDENTS_CACHE_KEY = 'kg_incidents_cache_v2';

const INCIDENT_AREAS = ['Khu A', 'Khu B', 'Khu C', 'Khu D&E', 'Bếp & Kho', 'Toàn quán'] as const;

const INCIDENT_CATEGORIES = [
  'Thiết bị hỏng',
  'Khách phàn nàn',
  'Thiếu nguyên liệu',
  'An toàn / Vệ sinh',
  'Khác',
] as const;

const SEVERITY_OPTIONS: { id: IncidentSeverity; label: string; activeClass: string }[] = [
  {
    id: 'normal',
    label: 'Bình thường',
    activeClass: 'border-[var(--kg-primary)] bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]',
  },
  {
    id: 'high',
    label: 'Quan trọng',
    activeClass: 'border-[var(--kg-warning)] bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]',
  },
  {
    id: 'urgent',
    label: 'Khẩn cấp',
    activeClass: 'border-[var(--kg-danger)] bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]',
  },
];

const formatVnd = (amount: number | undefined | null) => formatVndBase(Number(amount) || 0);

function readLocalIncidents(): IncidentRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_INCIDENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalIncidents(list: IncidentRecord[]) {
  try {
    localStorage.setItem(LOCAL_INCIDENTS_CACHE_KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

export default function IncidentTracker() {
  const currentUser = useAppStore((state) => state.currentUser);
  const shiftName = useAppStore((state) => state.shiftName);
  const setUpdating = useAppStore((state) => state.setUpdating);

  const [incidentArea, setIncidentArea] = useState<string>('Khu A');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('normal');
  const [incidentCategory, setIncidentCategory] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentPhotoPreview, setIncidentPhotoPreview] = useState<string>('');
  const [incidentPhotoUrl, setIncidentPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [incidentFormError, setIncidentFormError] = useState('');
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);

  const [incidents, setIncidents] = useState<IncidentRecord[]>(() => readLocalIncidents());
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED' | 'URGENT'>('ALL');
  const [incidentSearch, setIncidentSearch] = useState('');
  const [showAllIncidents, setShowAllIncidents] = useState(false);

  const pushToast = useCallback((message: string, tone: FeedbackTone) => {
    kgToast(message, tone);
  }, []);

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    setIncidentError('');
    try {
      const res = await callApi(
        'GET_INCIDENTS',
        { username: currentUser?.username, role: currentUser?.role },
        { background: true, cacheTtlMs: 4000 },
      );
      if (res?.ok && Array.isArray(res.data?.incidents)) {
        const serverList: IncidentRecord[] = res.data.incidents.map((inc: IncidentRecord) => ({
          ...inc,
          status: normalizeIncidentStatus(inc.status),
        }));
        const cached = readLocalIncidents();
        const merged = serverList.length > 0 ? serverList : cached;
        setIncidents(merged);
        if (serverList.length > 0) {
          writeLocalIncidents(serverList);
        }
      } else if (!res?.ok) {
        setIncidentError(res?.message || 'Không thể tải danh sách sự cố.');
      }
    } catch {
      setIncidentError('Lỗi kết nối máy chủ. Đang hiển thị dữ liệu lưu cục bộ.');
    } finally {
      setLoadingIncidents(false);
    }
  }, [currentUser?.role, currentUser?.username]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const handleIncidentPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const base64 = await fileToBase64(file);
      setIncidentPhotoPreview(base64);
      const uploadedUrl = await uploadImageToDrive(
        base64,
        `incident_${currentUser?.username || 'staff'}_${Date.now()}.webp`,
      );
      if (uploadedUrl) {
        setIncidentPhotoUrl(uploadedUrl);
      }
    } catch {
      pushToast('Không thể xử lý ảnh chụp sự cố. Bạn vẫn có thể gửi báo cáo chữ.', 'warning');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const submitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setIncidentFormError('');
    if (!incidentCategory) {
      setIncidentFormError('Vui lòng chọn phân loại sự cố.');
      return;
    }
    if (!incidentDesc.trim()) {
      setIncidentFormError('Vui lòng mô tả chi tiết sự cố.');
      return;
    }

    setUpdating(true);
    setIsSubmittingIncident(true);
    try {
      const res = await callApi('SUBMIT_INCIDENT', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: shiftName,
        area: incidentArea,
        severity: incidentSeverity,
        category: incidentCategory,
        description: incidentDesc.trim(),
        photoUrl: incidentPhotoUrl,
      });

      if (res?.ok) {
        const now = new Date();
        const vnDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const optimisticIncident: IncidentRecord = {
          id: res.data?.id || `INC_LOCAL_${Date.now()}`,
          date: res.data?.date || vnDate,
          shift: shiftName,
          area: incidentArea,
          severity: incidentSeverity,
          username: currentUser?.username || '',
          fullname: currentUser?.fullname || currentUser?.username || '',
          category: incidentCategory,
          description: incidentDesc.trim(),
          photoUrl: incidentPhotoUrl || undefined,
          status: 'Open',
          timestamp: now.toISOString(),
        };
        const updatedList = [optimisticIncident, ...incidents];
        setIncidents(updatedList);
        writeLocalIncidents(updatedList);

        pushToast('Đã gửi báo cáo sự cố vào hàng đợi xử lý của Quản lý.', 'success');
        setIncidentCategory('');
        setIncidentDesc('');
        setIncidentSeverity('normal');
        setIncidentPhotoPreview('');
        setIncidentPhotoUrl('');
        void loadIncidents();
      } else {
        setIncidentFormError(res?.message || 'Không thể gửi báo cáo sự cố.');
      }
    } catch {
      setIncidentFormError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setUpdating(false);
      setIsSubmittingIncident(false);
    }
  };

  const openIncidentCount = useMemo(
    () => incidents.filter((inc) => inc.status === 'Open' || inc.status === 'Investigating').length,
    [incidents],
  );

  const urgentIncidentCount = useMemo(
    () => incidents.filter((inc) => inc.severity === 'urgent').length,
    [incidents],
  );

  const resolvedIncidentCount = useMemo(
    () => incidents.filter((inc) => inc.status === 'Resolved' || inc.status === 'CostRecorded').length,
    [incidents],
  );

  const filteredIncidents = useMemo(() => {
    const q = incidentSearch.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (incidentFilter === 'ACTIVE' && inc.status !== 'Open' && inc.status !== 'Investigating') {
        return false;
      }
      if (incidentFilter === 'RESOLVED' && inc.status !== 'Resolved' && inc.status !== 'CostRecorded') {
        return false;
      }
      if (incidentFilter === 'URGENT' && inc.severity !== 'urgent') {
        return false;
      }
      if (q) {
        const text = `${inc.area || ''} ${inc.category || ''} ${inc.description || ''} ${inc.fullname || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, incidentFilter, incidentSearch]);

  const displayedIncidents = showAllIncidents ? filteredIncidents : filteredIncidents.slice(0, 15);

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="báo cáo và theo dõi sự cố ca trực" />;
  }

  return (
    <div className="flex flex-col space-y-4 pb-24 md:pb-12 animate-fade-in">
      <KgModuleHero
        moduleId="incidents"
        title="Báo Cáo & Theo Dõi Sự Cố Ca"
        description="Ghi nhận nhanh thiết bị hỏng, phàn nàn khách hoặc sự cố an toàn cho toàn bộ nhân sự sảnh, bếp và bar."
        eyebrow="Vận hành F&B"
        features={[`Đang mở: ${openIncidentCount}`, 'Theo dõi 4 bước']}
        tipTitle="Quy chuẩn Báo cáo & Xử lý Sự cố 4 bước"
        tips={[
          'Mọi nhân sự (Phục vụ, Bar, Bếp, Thu ngân) đều có thể báo sự cố ngay trong 2 chạm mà không cần chờ cuối ca.',
          'Chọn mức "Khẩn cấp" cho sự cố ảnh hưởng trực tiếp tới an toàn, điện/gas, tủ đông hoặc trải nghiệm khách.',
          'Đính kèm ảnh hiện trường giúp Quản lý và kỹ thuật chẩn đoán nhanh hơn.',
          'Theo dõi trực tiếp 4 trạng thái: Mới báo -> Đang xử lý -> Đã khắc phục -> Đã chốt chi phí.',
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Report Incident Form */}
        <section className="lg:col-span-5 bg-[var(--kg-surface)] border border-[var(--kg-danger)]/25 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[var(--kg-border)]">
            <div className="w-10 h-10 rounded-xl bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">
                Báo cáo sự cố vận hành
              </h3>
              <p className="text-xs text-[var(--kg-danger)] font-medium">
                Ghi nhận vị trí, mức độ khẩn cấp &amp; gửi thẳng Quản lý
              </p>
            </div>
          </div>

          <form onSubmit={submitIncident} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <fieldset>
                <legend
                  id="incident-area-label"
                  className="block text-xs font-black text-[var(--kg-text)] mb-1.5"
                >
                  Khu vực xảy ra sự cố
                </legend>
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-labelledby="incident-area-label">
                  {INCIDENT_AREAS.map((area) => (
                    <button
                      type="button"
                      key={area}
                      onClick={() => setIncidentArea(area)}
                      aria-pressed={incidentArea === area}
                      className={`min-h-[44px] sm:min-h-[38px] py-2 px-2 rounded-lg border text-[11px] font-bold transition-all touch-manipulation ${
                        incidentArea === area
                          ? 'border-[var(--kg-primary)] bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]'
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend
                  id="incident-severity-label"
                  className="block text-xs font-black text-[var(--kg-text)] mb-1.5"
                >
                  Mức độ ưu tiên
                </legend>
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-labelledby="incident-severity-label">
                  {SEVERITY_OPTIONS.map((sev) => (
                    <button
                      type="button"
                      key={sev.id}
                      onClick={() => setIncidentSeverity(sev.id)}
                      aria-pressed={incidentSeverity === sev.id}
                      className={`min-h-[44px] sm:min-h-[38px] py-2 px-2 rounded-lg border text-[11px] font-bold transition-all touch-manipulation ${
                        incidentSeverity === sev.id
                          ? sev.activeClass
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                      }`}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <fieldset>
              <legend
                id="incident-category-label"
                className="block text-xs font-black text-[var(--kg-text)] mb-1.5"
              >
                Phân loại sự cố <span className="text-[var(--kg-danger)]">*</span>
              </legend>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2"
                role="group"
                aria-labelledby="incident-category-label"
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => {
                      setIncidentCategory(cat);
                      if (incidentFormError) setIncidentFormError('');
                    }}
                    aria-pressed={incidentCategory === cat}
                    className={`min-h-[44px] sm:min-h-[40px] p-2.5 rounded-xl border text-center transition-all text-xs font-black active:scale-95 touch-manipulation ${
                      incidentCategory === cat
                        ? 'border-[var(--kg-danger)] bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] shadow-xs'
                        : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="incident-desc"
                className="block text-xs font-semibold text-[var(--kg-text)] mb-1.5"
              >
                Mô tả chi tiết <span className="text-[var(--kg-danger)]">*</span>
              </label>
              <textarea
                id="incident-desc"
                value={incidentDesc}
                onChange={(e) => {
                  setIncidentDesc(e.target.value);
                  if (incidentFormError) setIncidentFormError('');
                }}
                placeholder="Mô tả cụ thể sự cố (VD: Tủ đông số 2 Khu C báo lỗi E2, máy in bill thu ngân kẹt dao cắt...)"
                rows={3}
                className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 focus:outline-none focus:border-[var(--kg-danger)] focus:ring-2 focus:ring-[var(--kg-danger)]/15 text-[var(--kg-text)] text-xs sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] cursor-pointer hover:border-[var(--kg-primary)] transition-colors min-h-[44px] touch-manipulation">
                <Camera size={15} className="text-[var(--kg-primary)]" />
                <span>
                  {uploadingPhoto
                    ? 'Đang nén & tải ảnh...'
                    : incidentPhotoPreview
                      ? 'Đổi ảnh hiện trường'
                      : 'Đính kèm ảnh hiện trường (tùy chọn)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleIncidentPhotoSelect}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>

              {incidentPhotoPreview && (
                <div className="relative inline-flex items-center gap-2 p-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
                  <img src={incidentPhotoPreview} alt="Ảnh sự cố" className="w-12 h-12 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setIncidentPhotoPreview('');
                      setIncidentPhotoUrl('');
                    }}
                    aria-label="Xóa ảnh đính kèm"
                    className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-full bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] hover:brightness-95 flex items-center justify-center touch-manipulation"
                    title="Xóa ảnh"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {incidentFormError && (
              <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
                {incidentFormError}
              </p>
            )}

            <KgButton
              type="submit"
              variant="danger"
              size="lg"
              loading={isSubmittingIncident}
              disabled={uploadingPhoto}
              icon={ShieldAlert}
              className="w-full uppercase tracking-wider text-xs sm:text-sm"
            >
              Gửi báo cáo sự cố ngay
            </KgButton>
          </form>
        </section>

        {/* Live 4-Step Incident Status Tracker */}
        <section className="lg:col-span-7 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
            <div className="flex items-center gap-2">
              <Wrench size={17} className="text-[var(--kg-warning)]" />
              <h4 className="font-black text-sm text-[var(--kg-text)]">
                Tiến độ xử lý sự cố (4 bước)
                <span className="ml-1.5 font-mono tabular-nums text-xs text-[var(--kg-text-muted)]">
                  ({filteredIncidents.length})
                </span>
              </h4>
            </div>
            <button
              type="button"
              onClick={loadIncidents}
              disabled={loadingIncidents}
              aria-label="Làm mới danh sách sự cố"
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center touch-manipulation"
            >
              <RefreshCw size={14} className={loadingIncidents ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-2.5">
            <KgInput
              aria-label="Tìm sự cố theo khu vực, phân loại hoặc mô tả"
              placeholder="Tìm theo khu vực, nội dung hoặc người báo..."
              value={incidentSearch}
              onChange={(e) => setIncidentSearch(e.target.value)}
              icon={Search}
              rightAdornment={
                incidentSearch ? (
                  <button
                    type="button"
                    onClick={() => setIncidentSearch('')}
                    aria-label="Xóa tìm kiếm sự cố"
                    className="w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] touch-manipulation"
                  >
                    <X size={15} />
                  </button>
                ) : null
              }
            />
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: `Tất cả (${incidents.length})` },
                  { id: 'ACTIVE', label: `Đang xử lý (${openIncidentCount})` },
                  { id: 'URGENT', label: `Khẩn cấp (${urgentIncidentCount})` },
                  { id: 'RESOLVED', label: `Đã xử lý (${resolvedIncidentCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIncidentFilter(tab.id)}
                  className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
                    incidentFilter === tab.id
                      ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                      : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {incidentError && (
            <div className="p-2.5 rounded-xl border border-[var(--kg-warning)]/30 bg-[var(--kg-warning-soft)] text-xs text-[var(--kg-warning)] flex items-center justify-between gap-2">
              <span>{incidentError}</span>
              <KgButton size="sm" variant="secondary" onClick={loadIncidents}>
                Thử lại
              </KgButton>
            </div>
          )}

          {loadingIncidents && incidents.length === 0 ? (
            <div className="space-y-3">
              <KgSkeleton className="h-28 w-full" />
              <KgSkeleton className="h-28 w-full" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <KgEmptyState
              icon={Wrench}
              title={incidents.length === 0 ? 'Chưa có sự cố nào được ghi nhận' : 'Không có sự cố phù hợp bộ lọc'}
              description={
                incidents.length === 0
                  ? 'Quán đang vận hành ổn định. Báo cáo mới sẽ xuất hiện ngay tại đây.'
                  : 'Thử đổi trạng thái lọc hoặc xóa từ khóa tìm kiếm.'
              }
            />
          ) : (
            <div className="space-y-3">
              {displayedIncidents.map((inc) => {
                const statusObj =
                  INCIDENT_STATUS_STEPS.find((s) => s.id === inc.status) || INCIDENT_STATUS_STEPS[0];
                const currentStepIdx = INCIDENT_STATUS_STEPS.findIndex((s) => s.id === statusObj.id);

                return (
                  <article
                    key={inc.id}
                    className="p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)]">
                          {inc.area || 'Toàn quán'}
                        </span>
                        <span className="text-xs font-black text-[var(--kg-text)]">{inc.category}</span>
                        {inc.severity === 'urgent' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-[var(--kg-danger)] text-white">
                            KHẨN CẤP
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusObj.badgeClass}`}
                      >
                        {statusObj.shortLabel}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--kg-text)] leading-relaxed">{inc.description}</p>

                    {inc.photoUrl && (
                      <a
                        href={inc.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline"
                      >
                        <Camera size={12} /> Xem ảnh hiện trường
                      </a>
                    )}

                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {INCIDENT_STATUS_STEPS.map((step, sIdx) => {
                        const active = sIdx <= currentStepIdx;
                        return (
                          <div key={step.id} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full ${active ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-border)]'}`}
                            />
                            <span
                              className={`block text-[10px] truncate ${
                                active ? 'font-bold text-[var(--kg-text)]' : 'text-[var(--kg-text-muted)]'
                              }`}
                            >
                              {step.shortLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--kg-text-muted)]">
                      <span>
                        Báo bởi <b className="text-[var(--kg-text)]">{inc.fullname || inc.username}</b> •{' '}
                        <span className="font-mono tabular-nums">{inc.date}</span>
                      </span>
                      {inc.assignedTo && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--kg-text)]">
                          <UserCheck size={12} className="text-[var(--kg-success)]" /> Phụ trách: {inc.assignedTo}
                        </span>
                      )}
                    </div>

                    {(inc.resolutionNote || (inc.repairCost && inc.repairCost > 0)) && (
                      <div className="pt-2 border-t border-[var(--kg-border)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        {inc.resolutionNote && (
                          <span className="text-[var(--kg-success)]">
                            <b>Phản hồi xử lý:</b> {inc.resolutionNote}
                          </span>
                        )}
                        {typeof inc.repairCost === 'number' && inc.repairCost > 0 && (
                          <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                            Chi phí: {formatVnd(inc.repairCost)}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {filteredIncidents.length > 15 && (
                <div className="pt-1 text-center">
                  <KgButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllIncidents((v) => !v)}
                  >
                    {showAllIncidents
                      ? 'Thu gọn (chỉ hiện 15 mới nhất)'
                      : `Xem tất cả ${filteredIncidents.length} sự cố`}
                  </KgButton>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
