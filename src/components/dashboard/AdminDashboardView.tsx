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

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Executive Shift Command Hero (clean, no duplicate release notes card) */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[var(--kg-rail-bg)] border border-[var(--kg-rail-border)] p-4 sm:p-6 text-[var(--kg-rail-text)] shadow-hero">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-[var(--kg-accent)]/20"
        />
        <div className="relative z-10 flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[var(--kg-accent)] border border-white/20 flex items-center justify-center font-extrabold text-lg text-white shadow-xs flex-shrink-0">
            {currentUser?.fullname?.charAt(0) || 'Q'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--kg-rail-surface)] border border-[var(--kg-rail-border)] text-[11px] font-extrabold uppercase tracking-wider text-amber-200">
                Trung tâm điều hành ca trực
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[var(--kg-rail-muted)]">
                {todayLabel}
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white truncate mt-1">
              Xin chào, {currentUser?.fullname || 'Ban Quản Lý'}
            </h2>
            <p className="text-xs text-[var(--kg-rail-muted)] mt-0.5 truncate">
              {APP_CODENAME} • Giám sát nhân sự, đối soát công lương &amp; phê duyệt thời gian thực
            </p>
          </div>
        </div>
      </div>

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
          value={scheduledToday.length - notArrived.length}
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
              <h3 className="text-sm font-bold text-[var(--kg-text)] uppercase tracking-wider mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center">
                <ShieldAlert size={16} className="text-[var(--kg-warning)] mr-2 flex-shrink-0" />
                Cảnh báo vận hành hôm nay
              </h3>
              <div className="space-y-3.5">
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
                className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline mt-2 text-left min-h-[44px] sm:min-h-[40px] inline-flex items-center"
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
                className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline mt-2 text-left min-h-[44px] sm:min-h-[40px] inline-flex items-center"
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
                <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">
                  Món hết hôm nay
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('soldout')}
                className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] sm:min-h-[40px] px-2 inline-flex items-center"
              >
                Xem thực đơn
              </button>
            </div>
            {soldOutItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {soldOutItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 rounded-xl px-3 py-1.5 flex items-center space-x-2 text-xs"
                  >
                    <span className="font-bold text-amber-800 dark:text-amber-300">
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

        {/* Right Column (Desktop) / FIRST on Mobile & Tablet (< lg): Approval Queue & Quick Admin Shortcuts */}
        <div className="order-first lg:order-none lg:col-span-4 space-y-4">
          {hasPendingApprovals ? (
            <KgCard className="p-4 border-[var(--kg-danger)]/25">
              <div className="flex items-center justify-between gap-2 mb-3 border-b border-[var(--kg-border)] pb-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <BellRing size={16} className="text-[var(--kg-danger)] animate-pulse flex-shrink-0" />
                  <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider truncate">
                    Cần duyệt &amp; xử lý
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[var(--kg-danger)] text-white dark:text-[#0D1015] text-[11px] font-mono tabular-nums font-extrabold flex-shrink-0">
                  {totalAdminQueueCount}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {pendingMissedClaimsCount > 0 && (
                  <button
                    type="button"
                    onClick={onOpenAdminMissedModal}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-amber-800 dark:text-amber-300 hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Bổ sung công (
                      <span className="font-mono tabular-nums">{pendingMissedClaimsCount}</span>)
                    </span>
                    <span>Duyệt →</span>
                  </button>
                )}
                {cashAuditDisputesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'dispatch')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Đối soát lệch quỹ (
                      <span className="font-mono tabular-nums">{cashAuditDisputesCount}</span>)
                    </span>
                    <span>Kiểm tra →</span>
                  </button>
                )}
                {openIncidentsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'dispatch')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-amber-800 dark:text-amber-300 hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Sự cố đang mở (
                      <span className="font-mono tabular-nums">{openIncidentsCount}</span>)
                    </span>
                    <span>Xử lý →</span>
                  </button>
                )}
                {payrollDisputesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_people_pay', 'payroll')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Khiếu nại / ĐC lương (
                      <span className="font-mono tabular-nums">{payrollDisputesCount}</span>)
                    </span>
                    <span>Xem →</span>
                  </button>
                )}
                {pendingSwapsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'inbox')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/20 text-[var(--kg-success)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Đổi ca (<span className="font-mono tabular-nums">{pendingSwapsCount}</span>)
                    </span>
                    <span>Chi tiết →</span>
                  </button>
                )}
                {pendingLeavesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_ops', 'inbox')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Yêu cầu xin nghỉ (
                      <span className="font-mono tabular-nums">{pendingLeavesCount}</span>)
                    </span>
                    <span>Chi tiết →</span>
                  </button>
                )}
                {pendingAdvancesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateHubSubTab('admin_people_pay', 'payroll')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-amber-800 dark:text-amber-300 hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Ứng lương (
                      <span className="font-mono tabular-nums">{pendingAdvancesCount}</span>)
                    </span>
                    <span>Chi tiết →</span>
                  </button>
                )}
                {pendingFeedbackCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onTabChange('feedback')}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/20 text-[var(--kg-info)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]"
                  >
                    <span>
                      Góp ý chưa trả lời (
                      <span className="font-mono tabular-nums">{pendingFeedbackCount}</span>)
                    </span>
                    <span>Trả lời →</span>
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

          {/* Admin Quick Shortcuts wired to canonical admin_ops / admin_people_pay */}
          <KgCard className="p-4">
            <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider mb-3">
              Điều hướng nhanh quản lý
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Phân ca',
                  icon: CalendarRange,
                  tab: 'admin_ops' as TabId,
                  subTab: 'schedule',
                  color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)]',
                },
                {
                  label: 'Bảng công',
                  icon: CalendarClock,
                  tab: 'timesheet' as TabId,
                  color: 'text-amber-700 dark:text-amber-300 bg-amber-500/12',
                },
                {
                  label: 'Bảng lương',
                  icon: Banknote,
                  tab: 'admin_people_pay' as TabId,
                  subTab: 'payroll',
                  color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12',
                },
                {
                  label: 'Nhân sự',
                  icon: Users,
                  tab: 'admin_people_pay' as TabId,
                  subTab: 'employees',
                  color: 'text-[var(--kg-accent-ink)] bg-[var(--kg-accent-soft)]',
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
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/50 hover:bg-[var(--kg-surface-soft)] active:scale-[0.98] transition-colors text-xs font-bold text-[var(--kg-text)] min-h-[46px]"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}
                  >
                    <item.icon size={15} />
                  </div>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </KgCard>
        </div>
      </div>
    </div>
  );
}
