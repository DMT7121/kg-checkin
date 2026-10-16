import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  CornerDownLeft,
  LayoutDashboard,
  Camera,
  Banknote,
  Clock3,
  History,
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
  BookOpen,
  UserRound,
  Users,
  KeyRound,
  MapPinned,
  Settings2,
  BarChart3,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { hasTabPermission } from '../utils/permissions';
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
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

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
        label: 'Chấm công GPS & Selfie',
        description: 'Điểm danh vào ca / ra ca với định vị vệ tinh GPS',
        category: 'Cá nhân',
        keywords: 'cham cong checkin gps camera vao ca ra ca',
        icon: Camera,
        hubId: 'checkin',
        permissionId: 'checkin'
      },
      {
        id: 'nav-payroll',
        label: 'Phiếu lương cá nhân',
        description: 'Xem chi tiết thu nhập, phụ cấp và công chuẩn tháng này',
        category: 'Công & Lương',
        keywords: 'phieu luong thu nhap tien luong payroll',
        icon: Banknote,
        hubId: 'attendance',
        subTabId: 'payroll',
        permissionId: 'payroll'
      },
      {
        id: 'nav-timesheet',
        label: 'Bảng công chi tiết',
        description: 'Tra cứu giờ vào/ra và tổng số giờ công từng ngày',
        category: 'Công & Lương',
        keywords: 'bang cong timesheet gio lam',
        icon: Clock3,
        hubId: 'attendance',
        subTabId: 'timesheet',
        permissionId: 'timesheet'
      },
      {
        id: 'nav-history',
        label: 'Lịch sử chấm công',
        description: 'Xem lại ảnh chụp minh chứng và lịch sử quét GPS',
        category: 'Công & Lương',
        keywords: 'lich su cham cong history anh chup',
        icon: History,
        hubId: 'attendance',
        subTabId: 'history',
        permissionId: 'history'
      },
      {
        id: 'nav-advance',
        label: 'Ứng lương',
        description: 'Gửi đề xuất ứng lương và theo dõi trạng thái duyệt',
        category: 'Công & Lương',
        keywords: 'ung luong advance tam ung',
        icon: HandCoins,
        hubId: 'attendance',
        subTabId: 'advance',
        permissionId: 'advance'
      },
      // Lịch làm việc
      {
        id: 'nav-schedule',
        label: 'Đăng ký lịch làm việc',
        description: 'Đăng ký ca làm tuần tới và xem lịch cá nhân',
        category: 'Lịch Làm Việc',
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
        category: 'Lịch Làm Việc',
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
        category: 'Lịch Làm Việc',
        keywords: 'doi ca xin nghi phep swap shift',
        icon: Repeat2,
        hubId: 'workforce',
        subTabId: 'swap',
        permissionId: 'swap'
      },
      // Vận hành
      {
        id: 'nav-checklist',
        label: 'Checklist phân khu',
        description: 'Kiểm tra đầu mục công việc mở ca, giao ca và đóng ca',
        category: 'Vận hành',
        keywords: 'checklist cong viec phan khu kiem tra',
        icon: ClipboardCheck,
        hubId: 'work',
        subTabId: 'checklist',
        permissionId: 'checklist'
      },
      {
        id: 'nav-operations',
        label: 'Phân công trực khu vực',
        description: 'Xem nhóm trực, khu vực phụ trách và nhiệm vụ trong ca',
        category: 'Vận hành',
        keywords: 'phan cong truc khu vuc operations',
        icon: Network,
        hubId: 'work',
        subTabId: 'operations',
        permissionId: 'operations'
      },
      {
        id: 'nav-handover',
        label: 'Sổ bàn giao ca & Quỹ tiền mặt',
        description: 'Bàn giao tiền mặt, tồn kho và xác nhận đối soát 2 chiều',
        category: 'Vận hành',
        keywords: 'ban giao ca tien mat ket sắt handover',
        icon: Repeat2,
        hubId: 'work',
        subTabId: 'handover',
        permissionId: 'handover'
      },
      {
        id: 'nav-soldout',
        label: 'Báo món tạm hết (Sold Out)',
        description: 'Cập nhật nhanh danh sách món hết giữa Bếp, Bar và Phục vụ',
        category: 'Vận hành',
        keywords: 'mon het sold out bep bar thuc don',
        icon: UtensilsCrossed,
        hubId: 'work',
        subTabId: 'soldout',
        permissionId: 'soldout'
      },
      // Thi đua & Truyền thông
      {
        id: 'nav-reward',
        label: 'Ghi nhận & King Coins',
        description: 'Bảng vàng khen thưởng và điểm thưởng tích lũy',
        category: 'Thi đua & Nội bộ',
        keywords: 'khen thuong king coins ghi nhan reward',
        icon: Trophy,
        hubId: 'income',
        subTabId: 'reward',
        permissionId: 'reward'
      },
      {
        id: 'nav-discipline',
        label: 'Nội quy & Kỷ luật',
        description: 'Theo dõi biên bản nhắc nhở và quy chế kỷ luật',
        category: 'Thi đua & Nội bộ',
        keywords: 'ky luat phat vi pham discipline',
        icon: ShieldAlert,
        hubId: 'income',
        subTabId: 'discipline',
        permissionId: 'discipline'
      },
      {
        id: 'nav-news',
        label: 'Bảng tin nhà hàng',
        description: 'Thông báo chính thức từ Ban quản lý King\'s Grill',
        category: 'Thi đua & Nội bộ',
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
        category: 'Thi đua & Nội bộ',
        keywords: 'gop y phan anh feedback',
        icon: MessageSquareText,
        hubId: 'communications',
        subTabId: 'feedback',
        permissionId: 'feedback'
      },
      {
        id: 'nav-training',
        label: 'Đào tạo & Quy trình SOP',
        description: 'Tài liệu tiêu chuẩn phục vụ, vệ sinh và nghiệp vụ',
        category: 'Kiến thức',
        keywords: 'dao tao sop tai lieu training',
        icon: GraduationCap,
        hubId: 'knowledge',
        subTabId: 'training',
        permissionId: 'training'
      },
      {
        id: 'nav-guide',
        label: 'Hướng dẫn sử dụng hệ thống',
        description: 'Cẩm nang thao tác trên ứng dụng KG Staff OS',
        category: 'Kiến thức',
        keywords: 'huong dan su dung cam nang guide',
        icon: BookOpen,
        hubId: 'knowledge',
        subTabId: 'guide',
        permissionId: 'guide'
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
      // Quản trị (Admin)
      {
        id: 'admin-employees',
        label: 'Quản lý Hồ sơ Nhân sự',
        description: 'Danh sách nhân viên, phân quyền, trạng thái làm việc & đặt lại MK',
        category: 'Quản trị (Admin)',
        keywords: 'nhan su danh sach nhan vien hr list',
        icon: Users,
        hubId: 'admin_people',
        subTabId: 'employees',
        adminOnly: true
      },
      {
        id: 'admin-org',
        label: 'Cơ cấu Tổ chức & Phân quyền',
        description: 'Thiết lập bộ phận, vị trí và quyền hạn truy cập',
        category: 'Quản trị (Admin)',
        keywords: 'to chuc phan quyen bo phan org',
        icon: KeyRound,
        hubId: 'admin_people',
        subTabId: 'organization',
        adminOnly: true
      },
      {
        id: 'admin-schedule',
        label: 'Duyệt & Xếp lịch làm việc (Admin)',
        description: 'Phê duyệt ca đăng ký và điều phối lịch làm toàn nhà hàng',
        category: 'Quản trị (Admin)',
        keywords: 'duyet lich xep lich phan ca admin schedule',
        icon: CalendarRange,
        hubId: 'admin_workforce',
        subTabId: 'schedule',
        adminOnly: true
      },
      {
        id: 'admin-shift-gps',
        label: 'Cấu hình Ca làm & Bán kính GPS',
        description: 'Chỉnh sửa khung giờ ca và tọa độ/bán kính chấm công GPS',
        category: 'Quản trị (Admin)',
        keywords: 'cau hinh ca gps ban kinh toa do',
        icon: MapPinned,
        hubId: 'admin_workforce',
        subTabId: 'settings',
        adminOnly: true
      },
      {
        id: 'admin-checklist-cfg',
        label: 'Cấu hình Danh mục Checklist',
        description: 'Thêm/sửa hạng mục kiểm tra cho từng khu vực',
        category: 'Quản trị (Admin)',
        keywords: 'cau hinh checklist hang muc',
        icon: ClipboardCheck,
        hubId: 'admin_work',
        subTabId: 'checklist',
        adminOnly: true
      },
      {
        id: 'admin-operations-cfg',
        label: 'Quản lý Khu trực & Điều phối',
        description: 'Thiết lập nhóm trực, khu vực, phân công và đánh giá nhân sự',
        category: 'Quản trị (Admin)',
        keywords: 'khu truc dieu phoi nhom truc danh gia',
        icon: Network,
        hubId: 'admin_work',
        subTabId: 'operations',
        adminOnly: true
      },
      {
        id: 'admin-payroll-cfg',
        label: 'Cấu hình Đơn giá Lương & Phụ cấp',
        description: 'Thiết lập mức lương theo giờ, phụ cấp và thưởng/phạt',
        category: 'Quản trị (Admin)',
        keywords: 'cau hinh luong don gia phu cap',
        icon: Settings2,
        hubId: 'admin_income',
        subTabId: 'config',
        adminOnly: true
      },
      {
        id: 'admin-payroll-board',
        label: 'Bảng tổng hợp lương toàn nhà hàng',
        description: 'Đối soát công và bảng lương tổng hợp của tất cả nhân viên',
        category: 'Quản trị (Admin)',
        keywords: 'bang luong tong hop doi soat admin payroll',
        icon: Banknote,
        hubId: 'admin_income',
        subTabId: 'payroll',
        adminOnly: true
      },
      {
        id: 'admin-analytics',
        label: 'Báo cáo & Phân tích vận hành',
        description: 'Biểu đồ chuyên cần, chi phí nhân sự và hiệu suất ca',
        category: 'Quản trị (Admin)',
        keywords: 'bao cao thong ke phan tich analytics',
        icon: BarChart3,
        hubId: 'admin_system',
        subTabId: 'analytics',
        adminOnly: true
      },
      {
        id: 'admin-ai',
        label: 'Cấu hình Trợ lý AI & API Key',
        description: 'Quản lý Gemini API Key và thông số hệ thống',
        category: 'Quản trị (Admin)',
        keywords: 'cau hinh ai gemini api key he thong',
        icon: Sparkles,
        hubId: 'admin_system',
        subTabId: 'ai',
        adminOnly: true
      },
      // Thao tác nhanh
      {
        id: 'action-guide-modal',
        label: 'Mở Cẩm nang Nhân sự mới',
        description: 'Xem nhanh quy trình 4 bước dành cho nhân viên mới',
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

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectItem = (item: CommandItem) => {
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
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
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
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10100] flex items-start sm:items-center justify-center px-3 sm:px-4 pt-[6vh] sm:pt-0 pb-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm nhanh phân hệ"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-[560px] max-h-[82dvh] sm:max-h-[78vh] mx-auto bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Search input header */}
            <div className="flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-3 sm:py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--kg-primary)]/10 text-[var(--kg-primary)] flex items-center justify-center flex-shrink-0">
                <Search size={17} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tìm nhanh phân hệ, bảng công, lịch ca..."
                className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] outline-none border-none p-0 focus:ring-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] px-2 py-1 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] active:scale-95 transition-all flex-shrink-0"
                >
                  Xóa
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng tìm kiếm"
                className="w-9 h-9 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results list */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1 min-h-0">
              {filteredItems.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <p className="text-sm font-bold text-[var(--kg-text-muted)]">
                    Không tìm thấy phân hệ phù hợp với "{query}"
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
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-3 rounded-xl text-left transition-colors active:scale-[0.99] ${
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
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] flex-shrink-0">
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
                          active ? 'opacity-100 text-[var(--kg-primary)]' : 'opacity-0'
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
              <span>{filteredItems.length} phân hệ</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
