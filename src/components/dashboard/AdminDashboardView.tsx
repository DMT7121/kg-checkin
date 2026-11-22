import {
  Clock,
  ShieldAlert,
  UtensilsCrossed,
  ClipboardCheck,
  Repeat,
  BellRing,
  CalendarClock,
  Banknote,
  Users,
  CalendarRange,
  CheckCircle2,
  UserCheck,
  AlertCircle,
  Activity,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { SoldOutItem, User } from '../../store/useAppStore';
import {
  ResponsiveShift,
  getPreviewShiftClass,
  getVietnamDateParts,
} from '../../utils/helpers';
import { KgCard, KgMetricCard, KgAlertCard } from '../KgDesignSystem';
import { APP_CODENAME } from '../../config/appVersion';
import type { TabId } from '../../types/navigation';

export interface AdminDashboardViewProps {
  currentUser: User | null;
  scheduledToday: { fullname: string; shift: string }[];
  notArrived: { fullname: string; shift: string }[];
  lateArrived: { fullname: string; shift: string }[];
  todayChecklistDone: boolean;
  todayHandoverDone: boolean;
  soldOutItems: SoldOutItem[];
  pendingMissedClaimsCount: number;
  cashAuditDisputesCount: number;
  openIncidentsCount: number;
  payrollDisputesCount: number;
  pendingSwapsCount: number;
  pendingLeavesCount: number;
  pendingAdvancesCount: number;
  pendingFeedbackCount: number;
  totalAdminQueueCount: number;
  onTabChange: (tab: TabId) => void;
  onNavigateHubSubTab: (hub: TabId, subTab: string) => void;
  onOpenAdminMissedModal: () => void;
}

export default function AdminDashboardView({
  currentUser,
  scheduledToday,
  notArrived,
  lateArrived,
  todayChecklistDone,
  todayHandoverDone,
  soldOutItems,
  pendingMissedClaimsCount,
  cashAuditDisputesCount,
  openIncidentsCount,
  payrollDisputesCount,
  pendingSwapsCount,
  pendingLeavesCount,
  pendingAdvancesCount,
  pendingFeedbackCount,
  totalAdminQueueCount,
  onTabChange,
  onNavigateHubSubTab,
  onOpenAdminMissedModal,
}: AdminDashboardViewProps) {
  const vnNow = getVietnamDateParts();
  const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const todayLabel = `${dayNames[vnNow.dayOfWeek]}, ${String(vnNow.day).padStart(2, '0')}/${String(vnNow.month).padStart(2, '0')}/${vnNow.year}`;
  const hasPendingApprovals = totalAdminQueueCount > 0;
  const arrivedCount = Math.max(0, scheduledToday.length - notArrived.length);
  const arrivedPct =
    scheduledToday.length > 0 ? Math.round((arrivedCount / scheduledToday.length) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Executive Shift Command Service Board (.kg-service-board) */}
      <section className="kg-service-board rounded-[22px] bg-[#24372C] text-[#FCFFF9] p-5 sm:p-6 shadow-hero border border-white/10 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 w-80 h-80 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 w-52 h-52 rounded-full border border-white/10"
        />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(240px,0.75fr)] gap-5 items-center">
          {/* Left Command Summary & Hero CTAs */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#F29055] text-[#241C17] flex items-center justify-center font-extrabold text-base flex-shrink-0">
                {currentUser?.fullname?.charAt(0) || 'Q'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#CFE3D4]">
                    <span className="w-2 h-2 rounded-full bg-[#72D89C] animate-pulse" />
                    CA TRỰC ĐANG DIỄN RA
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-[#C3D1C5]">
                    • {todayLabel}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white break-words xl:truncate mt-0.5 leading-tight">
                  Xin chào, {currentUser?.fullname || 'Ban Quản Lý'}
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-[13px] text-[#C3D1C5] leading-relaxed max-w-xl">
              Ưu tiên việc khẩn, theo dõi đội hình trực ca và phê duyệt yêu cầu nhân sự ngay tại quầy • {APP_CODENAME}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onNavigateHubSubTab('admin_ops', 'inbox')}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#F9A36C] hover:bg-[#FFAE7A] text-[#241C17] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs transition-colors active:scale-[0.98] touch-manipulation whitespace-nowrap"
              >
                <ShieldCheck size={17} className="flex-shrink-0" />
                <span>
                  {hasPendingApprovals
                    ? `Xử lý ${totalAdminQueueCount} yêu cầu →`
                    : 'Mở hộp duyệt →'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onTabChange('checklist')}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.98] touch-manipulation whitespace-nowrap"
              >
                <ClipboardCheck size={16} className="flex-shrink-0" />
                <span>Checklist ca</span>
              </button>
            </div>
          </div>

          {/* Right Mini Telemetry Cards (.kg-board-mini) */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5">
            <div className="kg-board-mini rounded-xl bg-white/10 border border-white/15 px-3.5 py-3 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9D5C9]">
                  Trạng thái phục vụ
                </span>
                <b className="block text-xs sm:text-sm font-extrabold text-white mt-0.5 truncate">
                  Ca vận hành • Đang hoạt động
                </b>
              </div>
              <Activity size={20} className="text-[#F5AA7C] hidden sm:block shrink-0" />
            </div>

            <div className="kg-board-mini rounded-xl bg-white/10 border border-white/15 px-3.5 py-3 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9D5C9]">
                  Nhân sự đã vào ca
                </span>
                <b className="block text-sm sm:text-base font-extrabold font-mono tabular-nums text-white mt-0.5">
                  {arrivedCount}{' '}
                  <span className="text-xs font-semibold text-[#C9D5C9]">
                    / {scheduledToday.length} người
                  </span>
                </b>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-mono tabular-nums font-bold text-[#7EDBA8] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#72D89C]" />
                {arrivedPct}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Top Bento KPI Row (2x2 mobile, 4-col desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KgMetricCard
          title="Nhân viên có ca"
          value={scheduledToday.length}
          icon={Users}
          variant="info"
        />
        <KgMetricCard
          title="Đã vào ca"
          value={arrivedCount}
          icon={UserCheck}
          variant="success"
        />
        <KgMetricCard
          title="Vắng / Chưa đến"
          value={notArrived.length}
          icon={AlertCircle}
          variant="error"
          className={
            notArrived.length > 0 ? 'border-[var(--kg-danger)]/35 bg-[var(--kg-danger-soft)]/30' : ''
          }
        />
        <KgMetricCard
          title="Đi trễ"
          value={lateArrived.length}
          icon={ShieldAlert}
          variant="warning"
          className={
            lateArrived.length > 0
              ? 'border-[var(--kg-warning)]/35 bg-[var(--kg-warning-soft)]/30'
              : ''
          }
        />
      </div>

      {/* Asymmetric Bento Grid: Approval Queue FIRST on Mobile/Tablet (< lg) right below KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Left Column on Desktop (8 cols): Operational alerts, checklists, sold-out */}
        <div className="lg:col-span-8 space-y-4">
          {(notArrived.length > 0 || lateArrived.length > 0) && (
            <KgCard className="p-4 sm:p-5">
              <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight mb-3.5 border-b border-[var(--kg-border)] pb-2 flex items-center">
                <ShieldAlert size={16} className="text-[var(--kg-warning)] mr-2 flex-shrink-0" />
                Cảnh báo vận hành hôm nay
              </h3>
              <div className="space-y-3">
                {lateArrived.length > 0 && (
                  <KgAlertCard variant="warning" title="Nhân viên đi trễ" icon={Clock}>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {lateArrived.map((emp, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-semibold bg-[var(--kg-surface)] border border-[var(--kg-warning)]/30 px-2 py-0.5 rounded-lg text-[var(--kg-text)]"
                        >
                          {emp.fullname}
                        </span>
                      ))}
                    </div>
                  </KgAlertCard>
                )}
                {notArrived.length > 0 && (
                  <KgAlertCard variant="error" title="Chưa thấy chấm công vào ca" icon={AlertCircle}>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {notArrived.map((emp, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-semibold bg-[var(--kg-surface)] border border-[var(--kg-danger)]/30 px-2 py-0.5 rounded-lg text-[var(--kg-text)] inline-flex items-center gap-1.5"
                        >
                          <span>{emp.fullname}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-bold ${getPreviewShiftClass(emp.shift)}`}
                          >
                            <ResponsiveShift shift={emp.shift} />
                          </span>
                        </span>
                      ))}
                    </div>
                  </KgAlertCard>
                )}
              </div>
            </KgCard>
          )}

          {/* Checklist & Handover compliance today */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            <KgCard className="p-4 text-left hover:shadow-card transition-all flex flex-col justify-between min-h-[146px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      todayChecklistDone
                        ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                        : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                    }`}
                  >
                    <ClipboardCheck size={16} />
                  </div>
                  <span className="text-xs font-bold text-[var(--kg-text-muted)]">
                    Checklist Vận Hành
                  </span>
                </div>
              </div>
              <div>
                <p className="text-lg font-extrabold text-[var(--kg-text)] leading-tight">
                  {todayChecklistDone ? 'Tất cả đã nộp' : 'Đang chờ nộp'}
                </p>
                <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-1">
                  Hạng mục việc làm ca sáng &amp; tối
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('checklist')}
                className="w-fit px-2.5 -ml-2.5 rounded-lg text-xs font-bold text-[var(--kg-primary-ink)] hover:bg-[var(--kg-primary-soft)] hover:underline mt-2 text-left min-h-[44px] sm:min-h-[36px] inline-flex items-center transition-colors touch-manipulation"
              >
                Quản lý checklist →
              </button>
            </KgCard>

            <KgCard className="p-4 text-left hover:shadow-card transition-all flex flex-col justify-between min-h-[146px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      todayHandoverDone
                        ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                        : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                    }`}
                  >
                    <Repeat size={16} />
                  </div>
                  <span className="text-xs font-bold text-[var(--kg-text-muted)]">
                    Sổ Bàn Giao Ca
                  </span>
                </div>
              </div>
              <div>
                <p className="text-lg font-extrabold text-[var(--kg-text)] leading-tight">
                  {todayHandoverDone ? 'Đã ghi nhận' : 'Chưa ghi bàn giao'}
                </p>
                <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-1">
                  Sổ tay theo dõi quỹ &amp; sự cố ca làm việc
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('handover')}
                className="w-fit px-2.5 -ml-2.5 rounded-lg text-xs font-bold text-[var(--kg-primary-ink)] hover:bg-[var(--kg-primary-soft)] hover:underline mt-2 text-left min-h-[44px] sm:min-h-[36px] inline-flex items-center transition-colors touch-manipulation"
              >
                Xem sổ bàn giao →
              </button>
            </KgCard>
          </div>

          {/* Sold out items report */}
          <KgCard className="p-4">
            <div className="flex items-center justify-between mb-2.5 border-b border-[var(--kg-border)] pb-2">
              <div className="flex items-center space-x-2">
                <UtensilsCrossed size={16} className="text-[var(--kg-warning)]" />
                <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight">
                  Món hết hôm nay
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('soldout')}
                className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] sm:min-h-[36px] px-2 inline-flex items-center touch-manipulation"
              >
                Xem thực đơn →
              </button>
            </div>
            {soldOutItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {soldOutItems.map((item) => (
                  <div
                    key={item.id}
                    className="max-w-full bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                  >
                    <span className="font-bold text-[var(--kg-warning)] break-words">
                      {item.itemName}
                    </span>
                    <span className="text-[11px] text-[var(--kg-text-muted)] font-medium">
                      ({item.reportedBy} lúc{' '}
                      <span className="font-mono tabular-nums">{item.reportedAt}</span>)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--kg-text-muted)] py-2">
                Chưa báo món hết nào hôm nay
              </p>
            )}
          </KgCard>
        </div>

        {/* Right Column (Desktop) / FIRST on Mobile & Tablet (< lg): Approval Queue & Quick Touch Tiles */}
        <div className="order-first lg:order-none lg:col-span-4 space-y-4">
          {hasPendingApprovals ? (
            <KgCard className="p-4 border-[var(--kg-danger)]/25">
              <div className="flex items-center justify-between gap-2 mb-3 border-b border-[var(--kg-border)] pb-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <BellRing size={16} className="text-[var(--kg-danger)] animate-pulse flex-shrink-0" />
                  <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight truncate">
                    Cần duyệt &amp; xử lý
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[var(--kg-danger)] text-white dark:text-[#23170F] text-[11px] font-mono tabular-nums font-extrabold flex-shrink-0">
                  {totalAdminQueueCount}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {pendingMissedClaimsCount > 0 && (
                  <button
                    type="button"
                    onClick={onOpenAdminMissedModal}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Bổ sung công (
                      <span className="font-mono tabular-nums">{pendingMissedClaimsCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Duyệt →</span>
                  </button>
                )}
                {cashAuditDisputesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'dispatch')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Đối soát lệch quỹ (
                      <span className="font-mono tabular-nums">{cashAuditDisputesCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Kiểm tra →</span>
                  </button>
                )}
                {openIncidentsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'dispatch')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Sự cố đang mở (
                      <span className="font-mono tabular-nums">{openIncidentsCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Xử lý →</span>
                  </button>
                )}
                {payrollDisputesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_people_pay', 'payroll')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Khiếu nại / ĐC lương (
                      <span className="font-mono tabular-nums">{payrollDisputesCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Xem →</span>
                  </button>
                )}
                {pendingSwapsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'inbox')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/20 text-[var(--kg-success)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Đổi ca (<span className="font-mono tabular-nums">{pendingSwapsCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Chi tiết →</span>
                  </button>
                )}
                {pendingLeavesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'inbox')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Yêu cầu xin nghỉ (
                      <span className="font-mono tabular-nums">{pendingLeavesCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Chi tiết →</span>
                  </button>
                )}
                {pendingAdvancesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_people_pay', 'payroll')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Ứng lương (
                      <span className="font-mono tabular-nums">{pendingAdvancesCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Chi tiết →</span>
                  </button>
                )}
                {pendingFeedbackCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onTabChange('feedback')}
                    className="flex items-center justify-between gap-2 text-left p-3 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/20 text-[var(--kg-info)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px] sm:min-h-[40px] touch-manipulation"
                  >
                    <span className="min-w-0 truncate">
                      Góp ý chưa trả lời (
                      <span className="font-mono tabular-nums">{pendingFeedbackCount}</span>)
                    </span>
                    <span className="whitespace-nowrap flex-shrink-0">Trả lời →</span>
                  </button>
                )}
              </div>
            </KgCard>
          ) : (
            <KgCard className="p-4 text-center py-5 border-dashed">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-[var(--kg-success)] opacity-85" />
              <p className="text-xs font-extrabold text-[var(--kg-text)]">
                Không có yêu cầu chờ duyệt
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                Tất cả công, ca, quỹ, sự cố và lương đã được xử lý gọn gàng
              </p>
            </KgCard>
          )}

          {/* Admin Quick Touch Tiles (.kg-touch-tile) */}
          <KgCard className="p-4">
            <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight mb-3">
              Điều hướng nhanh quản lý
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  label: 'Phân ca',
                  sub: 'Xếp lịch tuần',
                  icon: CalendarRange,
                  tab: 'admin_ops' as TabId,
                  subTab: 'schedule',
                  color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)]',
                },
                {
                  label: 'Bảng công',
                  sub: 'Theo dõi công',
                  icon: CalendarClock,
                  tab: 'timesheet' as TabId,
                  color: 'text-[var(--kg-warning)] bg-[var(--kg-warning-soft)]',
                },
                {
                  label: 'Bảng lương',
                  sub: 'Chốt & đối soát',
                  icon: Banknote,
                  tab: 'admin_people_pay' as TabId,
                  subTab: 'payroll',
                  color: 'text-[var(--kg-success)] bg-[var(--kg-success-soft)]',
                },
                {
                  label: 'Nhân sự',
                  sub: 'Hồ sơ & Face ID',
                  icon: Users,
                  tab: 'admin_people_pay' as TabId,
                  subTab: 'employees',
                  color: 'text-[var(--kg-info)] bg-[var(--kg-info-soft)]',
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.subTab) {
                      onNavigateHubSubTab(item.tab, item.subTab);
                    } else {
                      onTabChange(item.tab);
                    }
                  }}
                  className="kg-touch-tile min-w-0 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-primary)] hover:bg-[var(--kg-primary-soft)] p-3 text-left flex flex-col justify-between gap-2.5 min-h-[92px] active:scale-[0.985] transition-colors touch-manipulation"
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}
                    >
                      <item.icon size={17} />
                    </div>
                    <ArrowRight size={13} className="text-[var(--kg-text-soft)] shrink-0" />
                  </div>
                  <div className="min-w-0 w-full">
                    <span className="block text-xs font-extrabold text-[var(--kg-text)] truncate">
                      {item.label}
                    </span>
                    <span className="block text-[10px] text-[var(--kg-text-muted)] truncate mt-0.5">
                      {item.sub}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </KgCard>
        </div>
      </div>
    </div>
  );
}
