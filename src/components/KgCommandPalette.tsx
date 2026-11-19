import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  CornerDownLeft,
  LayoutDashboard,
  Camera,
  Banknote,
  Clock3,
  HandCoins,
  CalendarDays,
  CalendarRange,
  Repeat2,
  ClipboardCheck,
  Network,
  UtensilsCrossed,
  Trophy,
  ShieldAlert,
  Newspaper,
  MessageSquareText,
  GraduationCap,
  UserRound,
  Users,
  KeyRound,
  Settings2,
  BarChart3,
  Sparkles,
  Sun,
  Moon,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { hasTabPermission, isAdminUser } from '../utils/permissions';
import { useDialogA11y } from '../utils/modalQueue';
import type { TabId } from '../types/navigation';

export interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: string;
  keywords: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hubId?: TabId;
  subTabId?: string;
  permissionId?: TabId;
  adminOnly?: boolean;
  onAction?: () => void;
}

interface KgCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: TabId) => void;
  onOpenGuide: () => void;
}

export default function KgCommandPalette({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenGuide
}: KgCommandPaletteProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const isDark = useAppStore(state => state.isDark);
  const toggleDarkMode = useAppStore(state => state.toggleDarkMode);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isAdmin = isAdminUser(currentUser);

  useDialogA11y({
    isOpen,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: true,
  });

  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Cá nhân & Chấm công
      {
        id: 'nav-dashboard',
        label: 'Tổng quan hôm nay',
        description: 'Bảng điều khiển cá nhân, ca làm hôm nay & thông báo nhanh',
        category: 'Cá nhân',
        keywords: 'hom nay dashboard tong quan trang chu',
        icon: LayoutDashboard,
        hubId: 'dashboard',
        permissionId: 'dashboard'
      },
      {
        id: 'nav-checkin',
        label: 'Chấm công GPS & Khuôn mặt',
        description: 'Điểm danh vào ca / ra ca với Face ID & định vị GPS',
        category: 'Cá nhân',
        keywords: 'cham cong checkin gps camera selfie face id vao ca ra ca',
        icon: Camera,
        hubId: 'checkin',
        permissionId: 'checkin'
      },
      // Công & Thu nhập (attendance hub)
      {
        id: 'nav-payroll',
        label: 'Phiếu lương cá nhân',
        description: 'Xem chi tiết thu nhập, phụ cấp và công chuẩn tháng này',
        category: 'Công & Thu nhập',
        keywords: 'phieu luong thu nhap tien luong payroll',
        icon: Banknote,
        hubId: 'attendance',
        subTabId: 'payroll',
        permissionId: 'payroll'
      },
      {
        id: 'nav-ledger',
        label: 'Bảng công & Nhật ký chấm công',
        description: 'Tra cứu giờ vào/ra, lịch tháng, ảnh minh chứng và tổng giờ công',
        category: 'Công & Thu nhập',
        keywords: 'bang cong timesheet gio lam lich su cham cong history anh chup ledger',
        icon: Clock3,
        hubId: 'attendance',
        subTabId: 'ledger',
        permissionId: 'ledger'
      },
      {
        id: 'nav-advance',
        label: 'Ứng lương',
        description: 'Gửi đề xuất ứng lương và theo dõi trạng thái duyệt',
        category: 'Công & Thu nhập',
        keywords: 'ung luong advance tam ung',
        icon: HandCoins,
        hubId: 'attendance',
        subTabId: 'advance',
        permissionId: 'advance'
      },
      {
        id: 'nav-discipline',
        label: 'Nội quy & Kỷ luật',
        description: 'Theo dõi biên bản nhắc nhở và quy chế kỷ luật',
        category: 'Công & Thu nhập',
        keywords: 'ky luat phat vi pham discipline income',
        icon: ShieldAlert,
        hubId: 'attendance',
        subTabId: 'discipline',
        permissionId: 'discipline'
      },
      // Lịch làm việc (workforce hub)
      {
        id: 'nav-schedule',
        label: 'Đăng ký lịch làm việc',
        description: 'Đăng ký ca làm tuần tới và xem lịch cá nhân',
        category: 'Lịch làm việc',
        keywords: 'lich lam viec dang ky ca schedule',
        icon: CalendarDays,
        hubId: 'workforce',
        subTabId: 'schedule',
        permissionId: 'schedule'
      },
      {
        id: 'nav-roster',
        label: 'Lịch tổng toàn nhà hàng',
        description: 'Xem danh sách nhân sự trực theo từng ca trong tuần',
        category: 'Lịch làm việc',
        keywords: 'lich tong roster ca truc dong nghiep',
        icon: CalendarRange,
        hubId: 'workforce',
        subTabId: 'roster',
        permissionId: 'roster'
      },
      {
        id: 'nav-swap',
        label: 'Chợ đổi ca & Xin nghỉ phép',
        description: 'Tìm người làm thay ca hoặc gửi đơn xin nghỉ phép',
        category: 'Lịch làm việc',
        keywords: 'doi ca xin nghi phep swap shift',
        icon: Repeat2,
        hubId: 'workforce',
        subTabId: 'swap',
        permissionId: 'swap'
      },
      // Vận hành Ca (work hub)
      {
        id: 'nav-checklist',
        label: 'Checklist phân khu & Công việc ca',
        description: 'Kiểm tra đầu mục công việc mở ca, giao ca và đóng ca',
        category: 'Vận hành Ca',
        keywords: 'checklist cong viec phan khu kiem tra phan cong truc operations',
        icon: ClipboardCheck,
        hubId: 'work',
        subTabId: 'checklist',
        permissionId: 'checklist'
      },
      {
        id: 'nav-handover',
        label: 'Sổ bàn giao ca & Quỹ tiền mặt',
        description: 'Bàn giao tiền mặt, tồn kho và xác nhận đối soát 2 chiều',
        category: 'Vận hành Ca',
        keywords: 'ban giao ca tien mat ket sat handover',
        icon: Repeat2,
        hubId: 'work',
        subTabId: 'handover',
        permissionId: 'handover'
      },
      {
        id: 'nav-incidents',
        label: 'Sự cố ca trực',
        description: 'Báo cáo và theo dõi xử lý sự cố thiết bị, khu vực trong ca',
        category: 'Vận hành Ca',
        keywords: 'su co bao cao hong hoc incident handover',
        icon: AlertTriangle,
        hubId: 'work',
        subTabId: 'incidents',
        permissionId: 'incidents'
      },
      {
        id: 'nav-soldout',
        label: 'Báo món tạm hết (Sold Out)',
        description: 'Cập nhật nhanh danh sách món hết giữa Bếp, Bar và Phục vụ',
        category: 'Vận hành Ca',
        keywords: 'mon het sold out bep bar thuc don',
        icon: UtensilsCrossed,
        hubId: 'work',
        subTabId: 'soldout',
        permissionId: 'soldout'
      },
      // Cộng đồng (communications hub)
      {
        id: 'nav-news',
        label: 'Bảng tin nhà hàng',
        description: "Thông báo chính thức từ Ban quản lý King's Grill",
        category: 'Cộng đồng',
        keywords: 'bang tin thong bao news',
        icon: Newspaper,
        hubId: 'communications',
        subTabId: 'news',
        permissionId: 'news'
      },
      {
        id: 'nav-feedback',
        label: 'Hòm thư góp ý',
        description: 'Gửi ý kiến đóng góp hoặc phản ánh ẩn danh tới Quản lý',
        category: 'Cộng đồng',
        keywords: 'gop y phan anh feedback',
        icon: MessageSquareText,
        hubId: 'communications',
        subTabId: 'feedback',
        permissionId: 'feedback'
      },
      {
        id: 'nav-reward',
        label: 'Ghi nhận & King Coins',
        description: 'Bảng vàng khen thưởng và điểm thưởng tích lũy',
        category: 'Cộng đồng',
        keywords: 'khen thuong king coins ghi nhan reward thi dua income',
        icon: Trophy,
        hubId: 'communications',
        subTabId: 'reward',
        permissionId: 'reward'
      },
      // Kiến thức & SOP (flat direct page)
      {
        id: 'nav-knowledge',
        label: 'Kiến thức, Đào tạo & Quy trình SOP',
        description: 'Tài liệu tiêu chuẩn phục vụ, vệ sinh, nghiệp vụ & hướng dẫn',
        category: 'Kiến thức & SOP',
        keywords: 'dao tao sop tai lieu training huong dan su dung cam nang guide knowledge',
        icon: GraduationCap,
        hubId: 'knowledge',
        permissionId: 'knowledge'
      },
      {
        id: 'nav-profile',
        label: 'Hồ sơ cá nhân & Đổi mật khẩu',
        description: 'Cập nhật thông tin liên hệ và bảo mật tài khoản',
        category: 'Cá nhân',
        keywords: 'ho so ca nhan doi mat khau profile',
        icon: UserRound,
        hubId: 'profile',
        permissionId: 'profile'
      },
      // Quản trị (3 Canonical Admin Hubs)
      {
        id: 'admin-inbox',
        label: 'Hộp duyệt & Cấu hình Ca/GPS',
        description: 'Xử lý nhanh yêu cầu duyệt và chỉnh sửa khung giờ ca, tọa độ GPS',
        category: 'Điều hành & Duyệt',
        keywords: 'hop duyet phe duyet yeu cau cau hinh ca gps ban kinh toa do admin shift',
        icon: Inbox,
        hubId: 'admin_ops',
        subTabId: 'inbox',
        permissionId: 'admin_ops',
        adminOnly: true
      },
      {
        id: 'admin-schedule',
        label: 'Duyệt & Xếp lịch làm việc (Admin)',
        description: 'Phê duyệt ca đăng ký và điều phối lịch làm toàn nhà hàng',
        category: 'Điều hành & Duyệt',
        keywords: 'duyet lich xep lich phan ca admin schedule workforce',
        icon: CalendarRange,
        hubId: 'admin_ops',
        subTabId: 'schedule',
        permissionId: 'admin_ops',
        adminOnly: true
      },
      {
        id: 'admin-dispatch',
        label: 'Quản lý Khu trực & Điều phối',
        description: 'Thiết lập nhóm trực, khu vực, phân công và đánh giá nhân sự',
        category: 'Điều hành & Duyệt',
        keywords: 'khu truc dieu phoi nhom truc danh gia operations admin work dispatch',
        icon: Network,
        hubId: 'admin_ops',
        subTabId: 'dispatch',
        permissionId: 'admin_ops',
        adminOnly: true
      },
      {
        id: 'admin-checklist-cfg',
        label: 'Cấu hình Danh mục Checklist',
        description: 'Thêm/sửa hạng mục kiểm tra cho từng khu vực',
        category: 'Điều hành & Duyệt',
        keywords: 'cau hinh checklist hang muc admin checklist',
        icon: ClipboardCheck,
        hubId: 'admin_ops',
        subTabId: 'checklist',
        permissionId: 'admin_ops',
        adminOnly: true
      },
      {
        id: 'admin-employees',
        label: 'Quản lý Hồ sơ Nhân sự',
        description: 'Danh sách nhân viên, phân quyền, trạng thái làm việc & đặt lại MK',
        category: 'Nhân sự & Lương',
        keywords: 'nhan su danh sach nhan vien hr list admin people',
        icon: Users,
        hubId: 'admin_people_pay',
        subTabId: 'employees',
        permissionId: 'admin_people_pay',
        adminOnly: true
      },
      {
        id: 'admin-payroll-board',
        label: 'Bảng tổng hợp lương & Ứng lương',
        description: 'Đối soát công, bảng lương tổng hợp và duyệt ứng lương',
        category: 'Nhân sự & Lương',
        keywords: 'bang luong tong hop doi soat duyet ung luong admin payroll income advance',
        icon: Banknote,
        hubId: 'admin_people_pay',
        subTabId: 'payroll',
        permissionId: 'admin_people_pay',
        adminOnly: true
      },
      {
        id: 'admin-salary-rates',
        label: 'Cấu hình Đơn giá Lương & Phụ cấp',
        description: 'Thiết lập mức lương theo giờ, phụ cấp và thưởng/phạt',
        category: 'Nhân sự & Lương',
        keywords: 'cau hinh luong don gia phu cap salary rates config admin payroll',
        icon: Settings2,
        hubId: 'admin_people_pay',
        subTabId: 'salary_rates',
        permissionId: 'admin_people_pay',
        adminOnly: true
      },
      {
        id: 'admin-discipline',
        label: 'Quản lý Kỷ luật & Biên bản (Admin)',
        description: 'Ghi nhận vi phạm nội quy và theo dõi kỷ luật nhân sự',
        category: 'Nhân sự & Lương',
        keywords: 'ky luat vi pham bien ban admin discipline',
        icon: ShieldAlert,
        hubId: 'admin_people_pay',
        subTabId: 'discipline',
        permissionId: 'admin_people_pay',
        adminOnly: true
      },
      {
        id: 'admin-analytics',
        label: 'Báo cáo & Phân tích vận hành',
        description: 'Biểu đồ chuyên cần, chi phí nhân sự và hiệu suất ca',
        category: 'Báo cáo & Hệ thống',
        keywords: 'bao cao thong ke phan tich analytics',
        icon: BarChart3,
        hubId: 'admin_system',
        subTabId: 'analytics',
        permissionId: 'admin_system',
        adminOnly: true
      },
      {
        id: 'admin-settings',
        label: 'Cấu hình Hệ thống & Trợ lý AI',
        description: 'Quản lý API Key, AI prompt và thông số hệ thống',
        category: 'Báo cáo & Hệ thống',
        keywords: 'cau hinh ai gemini groq api key he thong admin settings',
        icon: Sparkles,
        hubId: 'admin_system',
        subTabId: 'settings',
        permissionId: 'admin_system',
        adminOnly: true
      },
      {
        id: 'admin-audit',
        label: 'Cơ cấu Tổ chức, Quyền & Nhật ký',
        description: 'Thiết lập bộ phận, vị trí, quyền hạn truy cập & kiểm tra hệ thống',
        category: 'Báo cáo & Hệ thống',
        keywords: 'to chuc phan quyen bo phan org audit nhat ky',
        icon: KeyRound,
        hubId: 'admin_system',
        subTabId: 'audit',
        permissionId: 'admin_system',
        adminOnly: true
      },
      // Thao tác nhanh
      {
        id: 'action-guide-modal',
        label: 'Mở Cẩm nang Nhân sự mới',
        description: 'Xem nhanh quy trình 5 bước dành cho nhân viên mới',
        category: 'Thao tác nhanh',
        keywords: 'huong dan nguoi moi newbie cam nang',
        icon: GraduationCap,
        onAction: () => {
          onClose();
          onOpenGuide();
        }
      },
      {
        id: 'action-toggle-theme',
        label: isDark ? 'Chuyển sang Giao diện Sáng (Light Mode)' : 'Chuyển sang Giao diện Tối (Dark Mode)',
        description: 'Đổi chế độ màu sắc hiển thị của toàn bộ ứng dụng',
        category: 'Thao tác nhanh',
        keywords: 'giao dien sang toi dark mode light mode theme',
        icon: isDark ? Sun : Moon,
        onAction: () => {
          toggleDarkMode();
          onClose();
        }
      }
    ];

    return items.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.permissionId && !hasTabPermission(item.permissionId, currentUser)) return false;
      return true;
    });
  }, [currentUser, isAdmin, isDark, onClose, onOpenGuide, toggleDarkMode]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    const normalizedQuery = q
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    return allItems.filter(item => {
      const haystack = `${item.label} ${item.description} ${item.category} ${item.keywords}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
      return haystack.includes(normalizedQuery);
    });
  }, [allItems, query]);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelectItem = useCallback((item: CommandItem) => {
    if (item.onAction) {
      item.onAction();
      return;
    }
    if (item.hubId) {
      if (item.subTabId) {
        try {
          sessionStorage.setItem(`kg_hub_subtab_${item.hubId}`, item.subTabId);
        } catch { /* ignore */ }
      }
      onNavigateTab(item.hubId);
      if (item.subTabId) {
        const hub = item.hubId;
        const subTab = item.subTabId;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
        }, 30);
      }
    }
    onClose();
  }, [onClose, onNavigateTab]);

  useEffect(() => {
    if (!isOpen) return;
    const activeEl = optionRefs.current[selectedIndex];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, selectedIndex, filteredItems.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev =>
          filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
        );
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        handleSelectItem(filteredItems[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, handleSelectItem]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10055] flex items-start sm:items-center justify-center px-3 sm:px-4 pt-[6vh] sm:pt-0 pb-4">
      <div
        onClick={onClose}
        className="kg-fade-in fixed inset-0 bg-black/60 backdrop-blur-xs"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Tìm kiếm nhanh phân hệ"
        onClick={(e) => e.stopPropagation()}
        className="kg-scale-in relative z-10 w-full max-w-[560px] max-h-[82dvh] sm:max-h-[78vh] mx-auto bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
      >
        {/* Search input header */}
        <div className="flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-3 sm:py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center flex-shrink-0">
            <Search size={17} />
          </div>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={true}
            aria-controls="kg-command-listbox"
            aria-activedescendant={filteredItems[selectedIndex] ? `kg-cmd-option-${filteredItems[selectedIndex].id}` : undefined}
            aria-label="Tìm nhanh phân hệ"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Tìm nhanh phân hệ, bảng công, lịch ca..."
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm font-semibold text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] outline-none border-none p-0 focus:ring-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] px-2.5 min-h-[44px] sm:min-h-[36px] py-1 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] active:scale-95 transition-all flex-shrink-0 whitespace-nowrap"
            >
              Xóa
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng tìm kiếm"
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results list */}
        <div
          id="kg-command-listbox"
          role="listbox"
          aria-label="Danh sách phân hệ"
          className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1 min-h-0"
        >
          {filteredItems.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <p className="text-sm font-bold text-[var(--kg-text-muted)]">
                Không tìm thấy phân hệ phù hợp với &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-[var(--kg-text-soft)] mt-1">
                Thử tìm theo từ khóa như: chấm công, phiếu lương, bàn giao, đổi ca...
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  id={`kg-cmd-option-${item.id}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelectItem(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-3 min-h-[44px] rounded-xl text-left transition-colors active:scale-[0.99] ${
                    active
                      ? 'bg-[var(--kg-accent-soft)] text-[var(--kg-text)] border border-[var(--kg-primary)]/25'
                      : 'hover:bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-transparent'
                  }`}
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      active
                        ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                    }`}
                  >
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-extrabold truncate">
                        {item.label}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] flex-shrink-0 max-w-[110px] sm:max-w-none truncate">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--kg-text-muted)] truncate mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <CornerDownLeft
                    size={14}
                    className={`hidden sm:block flex-shrink-0 transition-opacity ${
                      active ? 'opacity-100 text-[var(--kg-primary-ink)]' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3.5 sm:px-4 py-2.5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between text-[11px] font-semibold text-[var(--kg-text-muted)] flex-shrink-0">
          <div className="hidden sm:flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-bold">↑↓</kbd> Di chuyển</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-bold">Enter</kbd> Mở ngay</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-bold">Esc</kbd> Đóng</span>
          </div>
          <span className="sm:hidden text-[11px] text-[var(--kg-text-muted)]">Chạm vào mục bất kỳ để mở ngay</span>
          <span className="font-mono tabular-nums">{filteredItems.length} phân hệ</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
