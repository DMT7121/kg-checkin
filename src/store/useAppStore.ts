// ============================================
// useAppStore.ts - Complete app state (100% from original)
// ============================================
import { create } from 'zustand';

export interface User {
  username: string;
  fullname: string;
  email: string;
  role?: string;
}

export interface Comment {
  id: number;
  author: string;
  content: string;
  time: string;
}

export interface Post {
  id: number;
  author: string;
  role: string;
  time: string;
  content: string;
  image?: string;
  likes: string[];
  comments: Comment[];
  hasRead?: boolean;
}

export interface SoldOutItem {
  id: string;
  itemName: string;
  reportedBy: string;
  reportedAt: string;
}

export interface AdvanceRequest {
  id: string;
  username: string;
  fullname: string;
  amount: number;
  reason: string;
  createdAt: number;
  status: string; // 'Pending', 'Approved', 'Rejected'
}

export interface BonusPenaltyRecord {
  id: string;
  createdAt: number;
  targetUsername: string;
  targetFullname: string;
  type: 'BONUS' | 'PENALTY';
  amount: number;
  reason: string;
}

export interface PayrollRecord {
  username: string;
  fullname: string;
  baseSalaryPerHour: number;
  totalHours: number;
  totalBaseSalary: number;
  advances: number;
  bonus: number;
  penalty: number;
  netPay: number;
}

export interface SwapRequest {
  id: string;
  username: string;
  fullname: string;
  dayName: string;
  shift: string;
  date: string;
  reason: string;
  createdAt: number;
  targetUsername?: string;
  targetFullname?: string;
  status?: string; // 'Pending_User', 'Pending_Admin', 'Approved', 'Rejected'
}

export interface ChecklistItem {
  id: string;
  shift: string;
  department: string;
  position: string;
  taskName: string;
  points: number;
  isActive: boolean;
}

export interface ChecklistLog {
  id: string;
  date: string;
  shift: string;
  username: string;
  fullname: string;
  checkedTasks: string[]; // JSON array of task IDs
  timestamp: string;
}

export interface Feedback {
  id: string;
  date: string;
  username: string;
  fullname: string;
  category: string;
  content: string;
  isAnonymous: boolean;
  status: string;
  adminReply: string;
}

export interface LogEntry {
  fullname: string;
  type: string;
  time: string;
  status: string;
  note?: string;
  image?: string;
}

export interface AdminScheduleEntry {
  fullname: string;
  username: string;
  shifts: string[];
  shiftNotes?: string[];
  reason?: string;
  note?: string;
  hasApproved?: boolean;
}

interface AppState {
  // Auth
  currentUser: User | null;
  rememberMe: boolean;

  // UI
  isDark: boolean;
  loading: boolean;
  loadingText: string;
  isUpdating: boolean;
  currentTab: 'dashboard' | 'news' | 'soldout' | 'feedback' | 'training' | 'checkin' | 'checklist' | 'handover' | 'schedule' | 'swap' | 'roster' | 'history' | 'timesheet' | 'advance' | 'payroll' | 'discipline' | 'admin';
  shiftName: string;
  currentTime: string;

  // Camera
  capturedImage: string | null;
  capturedTime: string | null;

  // GPS
  gps: {
    lat: number | null;
    lng: number | null;
    isValid: boolean;
    status: string;
    message: string;
    address?: string;
  };

  // Data
  logs: LogEntry[];
  stats: { totalCheckIn: number; validCount: number };
  users: User[];
  news: Post[];
  shiftData: Record<string, string>;
  registeredShifts: string[];
  soldOutItems: SoldOutItem[];
  swapRequests: SwapRequest[];
  hasNewSwaps: boolean;
  advances: AdvanceRequest[];
  bonusPenalties: BonusPenaltyRecord[];
  payroll: PayrollRecord[];
  isCheckInOutCompleted: boolean;
  checklists: ChecklistItem[];
  checklistLogs: ChecklistLog[];
  feedbacks: Feedback[];

  // Schedule registration
  isScheduleRegistered: boolean;
  approvedShifts: string[] | null;
  offReason: string;

  // Admin
  isAdminUnlocked: boolean;
  groqKeysInput: string;
  groqKeys: string[];
  adminSchedules: AdminScheduleEntry[];
  originalAdminSchedules: AdminScheduleEntry[];

  // Preview
  isPreviewOpen: boolean;
  previewImageUrl: string;

  // Anti-spam
  lastCheckInTime: number;

  // Actions
  setCurrentUser: (user: User | null) => void;
  setRememberMe: (v: boolean) => void;
  setDark: (v: boolean) => void;
  setNews: (news: Post[]) => void;
  setSoldOutItems: (items: SoldOutItem[]) => void;
  setSwapRequests: (reqs: SwapRequest[]) => void;
  setChecklists: (items: ChecklistItem[]) => void;
  setChecklistLogs: (logs: ChecklistLog[]) => void;
  setFeedbacks: (items: Feedback[]) => void;
  toggleDarkMode: () => void;
  setLoading: (v: boolean, text?: string) => void;
  setUpdating: (v: boolean) => void;
  setCurrentTab: (tab: AppState['currentTab']) => void;
  setShiftName: (v: string) => void;
  setCurrentTime: (v: string) => void;
  setCapturedImage: (v: string | null) => void;
  setCapturedTime: (v: string | null) => void;
  setGps: (gps: Partial<AppState['gps']>) => void;
  setLogs: (logs: LogEntry[]) => void;
  prependLog: (log: LogEntry) => void;
  removeFirstLog: () => void;
  setStats: (stats: AppState['stats']) => void;
  setUsers: (users: User[]) => void;
  setScheduleRegistered: (v: boolean) => void;
  setApprovedShifts: (v: string[] | null) => void;
  setRegisteredShifts: (v: string[]) => void;
  setShiftData: (data: Record<string, string>) => void;
  updateShiftData: (key: string, value: string) => void;
  setOffReason: (v: string) => void;
  setAdminUnlocked: (v: boolean) => void;
  setGroqKeysInput: (v: string) => void;
  setGroqKeys: (v: string[]) => void;
  setAdminSchedules: (v: AdminScheduleEntry[]) => void;
  setOriginalAdminSchedules: (v: AdminScheduleEntry[]) => void;
  setPreviewOpen: (v: boolean) => void;
  setPreviewImageUrl: (v: string) => void;
  setLastCheckInTime: (v: number) => void;
  addSwapRequest: (v: SwapRequest) => void;
  setHasNewSwaps: (has: boolean) => void;
  setAdvances: (advances: AdvanceRequest[]) => void;
  addAdvance: (advance: AdvanceRequest) => void;
  setBonusPenalties: (records: BonusPenaltyRecord[]) => void;
  setPayroll: (payroll: PayrollRecord[]) => void;
  setCheckInOutCompleted: (completed: boolean) => void;
  setSwapRequests: (reqs: SwapRequest[]) => void;
  setChecklists: (items: ChecklistItem[]) => void;
  removeSwapRequest: (id: string) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  currentUser: null,
  rememberMe: false,

  // UI
  isDark: false,
  loading: false,
  loadingText: 'Đang tải...',
  isUpdating: false,
  currentTab: 'dashboard',
  shiftName: '',
  currentTime: '',

  // Camera
  capturedImage: null,
  capturedTime: null,

  // GPS
  gps: { lat: null, lng: null, isValid: false, status: 'Chưa định vị', message: '' },

  // Data
  logs: [],
  stats: { totalCheckIn: 0, validCount: 0 },
  users: [],
  news: [],
  shiftData: {},
  registeredShifts: [],
  soldOutItems: [],
  swapRequests: [],
  hasNewSwaps: false,
  advances: [],
  bonusPenalties: [],
  payroll: [],
  isCheckInOutCompleted: false,
  checklists: [],
  checklistLogs: [],
  feedbacks: [],

  // Schedule
  isScheduleRegistered: false,
  approvedShifts: null,
  offReason: '',

  // Admin
  isAdminUnlocked: false,
  groqKeysInput: '',
  groqKeys: [],
  adminSchedules: [],
  originalAdminSchedules: [],

  // Preview
  isPreviewOpen: false,
  previewImageUrl: '',

  // Anti-spam
  lastCheckInTime: 0,

  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),
  setRememberMe: (v) => set({ rememberMe: v }),
  setDark: (isDark) => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set({ isDark });
  },
  setNews: (news) => set({ news }),
  setSoldOutItems: (items) => set({ soldOutItems: items }),
  setHasNewSwaps: (has) => set({ hasNewSwaps: has }),
  setSwapRequests: (reqs) => set({ swapRequests: reqs }),
  setChecklists: (items) => set({ checklists: items }),
  setAdvances: (advances) => set({ advances }),
  addAdvance: (advance) => set((state) => ({ advances: [advance, ...state.advances] })),
  setBonusPenalties: (records) => set({ bonusPenalties: records }),
  setPayroll: (payroll) => set({ payroll }),
  setCheckInOutCompleted: (completed) => set({ isCheckInOutCompleted: completed }),
  setChecklistLogs: (logs) => set({ checklistLogs: logs }),
  setFeedbacks: (items) => set({ feedbacks: items }),
  toggleDarkMode: () =>
    set((s) => {
      const newDark = !s.isDark;
      if (newDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return { isDark: newDark };
    }),
  setLoading: (loading, loadingText) =>
    set({ loading, loadingText: loadingText ?? 'Đang xử lý...' }),
  setUpdating: (isUpdating) => set({ isUpdating }),
  setCurrentTab: (currentTab) => set({ currentTab }),
  setShiftName: (shiftName) => set({ shiftName }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setCapturedImage: (capturedImage) => set({ capturedImage }),
  setCapturedTime: (capturedTime) => set({ capturedTime }),
  setGps: (partial) => set((s) => ({ gps: { ...s.gps, ...partial } })),
  setLogs: (logs) => set({ logs }),
  prependLog: (log) => set((s) => ({ logs: [log, ...s.logs] })),
  removeFirstLog: () => set((s) => ({ logs: s.logs.slice(1) })),
  setStats: (stats) => set({ stats }),
  setUsers: (users) => set({ users }),
  setScheduleRegistered: (isScheduleRegistered) => set({ isScheduleRegistered }),
  setApprovedShifts: (approvedShifts) => set({ approvedShifts }),
  setRegisteredShifts: (registeredShifts) => set({ registeredShifts }),
  setShiftData: (shiftData) => set({ shiftData }),
  updateShiftData: (key, value) =>
    set((s) => ({ shiftData: { ...s.shiftData, [key]: value } })),
  setOffReason: (offReason) => set({ offReason }),
  setAdminUnlocked: (isAdminUnlocked) => set({ isAdminUnlocked }),
  setGroqKeysInput: (groqKeysInput) => set({ groqKeysInput }),
  setGroqKeys: (groqKeys) => set({ groqKeys }),
  setAdminSchedules: (adminSchedules) => set({ adminSchedules }),
  setOriginalAdminSchedules: (originalAdminSchedules) => set({ originalAdminSchedules }),
  setPreviewOpen: (isPreviewOpen) => set({ isPreviewOpen }),
  setPreviewImageUrl: (previewImageUrl) => set({ previewImageUrl }),
  setLastCheckInTime: (lastCheckInTime) => set({ lastCheckInTime }),
  addSwapRequest: (req) =>
    set((state) => {
      const exists = state.swapRequests.find((r) => r.id === req.id);
      if (exists) return state;
      return {
        swapRequests: [req, ...state.swapRequests],
        hasNewSwaps: true,
      };
    }),
  setHasNewSwaps: (hasNewSwaps) => set({ hasNewSwaps }),
  removeSwapRequest: (id) => set((s) => ({ swapRequests: s.swapRequests.filter(r => r.id !== id) })),

  logout: () => {
    localStorage.removeItem('kg_user');
    localStorage.removeItem('kg_session_time');
    localStorage.removeItem('kg_registered_shifts');
    localStorage.removeItem('kg_registered_week');
    localStorage.removeItem('kg_logs');
    localStorage.removeItem('kg_stats');
    localStorage.removeItem('kg_last_checkin');
    set({
      currentUser: null,
      logs: [],
      stats: { totalCheckIn: 0, validCount: 0 },
      capturedImage: null,
      isAdminUnlocked: false,
      groqKeys: [],
      groqKeysInput: '',
      isScheduleRegistered: false,
      offReason: '',
      adminSchedules: [],
      originalAdminSchedules: [],
      approvedShifts: null,
      registeredShifts: null,
      lastCheckInTime: 0,
      isPreviewOpen: false,
      previewImageUrl: '',
    });
  },
}));
