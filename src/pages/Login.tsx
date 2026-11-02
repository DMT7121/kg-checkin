import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  speak,
  computeWeekInfo,
  getScheduleRegistrationWindow,
  isNextWeekScheduleRegistered,
  isScheduleRegistrationRequired,
  markScheduleRegisteredLocally,
  getSavedRegisteredShiftsForWeek,
} from '../utils/helpers';
import Swal from 'sweetalert2';
import { User, Lock, Eye, EyeOff, ChevronLeft, ArrowRight, Mail, Phone, Calendar, ShieldCheck, KeyRound, MapPin, ScanFace, Check, Sun, Moon, Sparkles } from 'lucide-react';
import { hashPassword } from '../utils/security';
import { KgVersionBadge } from '../components/VersionReleaseModal';
import { APP_RELEASE_DATE, APP_VERSION_TAG, openReleaseNotesModal } from '../config/releaseNotes';

export default function Login() {
  const store = useAppStore.getState();
  const isDark = useAppStore((s) => s.isDark);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kg_remember') !== 'false');
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', fullname: '', dob: '', email: '', phone: '' });

  // Forgot Password States
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetForm, setResetForm] = useState({ otp: '', newPassword: '' });
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e?: React.FormEvent, bioCreds?: { username: string; password: string }) => {
    if (e) e.preventDefault();
    store.setLoading(true, 'Đang đăng nhập...');

    const payload = bioCreds || loginForm;
    let passwordHash = '';
    try {
      passwordHash = await hashPassword(payload.password);
    } catch { /* ignore */ }

    const res = await callApi('LOGIN', {
      ...payload,
      passwordHash: passwordHash || undefined
    }, { timeoutMs: 15000, maxAttempts: 1 });
    store.setLoading(false);

    if (res?.ok) {
      store.setCurrentUser(res.data);
      // Persist session
      localStorage.setItem('kg_user', JSON.stringify(res.data));
      localStorage.setItem('kg_session_time', Date.now().toString());
      localStorage.setItem('kg_remember', rememberMe ? 'true' : 'false');

      // Init week schedule data
      const weekInfo = computeWeekInfo();
      const initShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k) => (initShifts[k] = 'OFF'));
      store.setShiftData(initShifts);

      // Restore registered shifts from localStorage immediately ONLY if matching expectedWeekKey
      const expectedWeekKey = weekInfo.monthSheet + '|' + weekInfo.weekLabel;
      const savedShifts = getSavedRegisteredShiftsForWeek(res.data.username, weekInfo);
      const hasLocalReg = isNextWeekScheduleRegistered(false, res.data.username, weekInfo, savedShifts, null);
      if (hasLocalReg) {
        if (savedShifts && savedShifts.length === 7) {
          store.setRegisteredShifts(savedShifts);
          const regShifts: Record<string, string> = {};
          weekInfo.weekDatesKeys.forEach((k, i) => (regShifts[k] = savedShifts[i]));
          store.setShiftData(regShifts);
        }
        store.setScheduleRegistered(true, expectedWeekKey);
        markScheduleRegisteredLocally(res.data.username, expectedWeekKey, savedShifts);
      } else {
        store.setScheduleRegistered(false);
        store.setRegisteredShifts([]);
      }

      speak('Đăng nhập thành công. Xin chào ' + res.data.fullname);
      Swal.fire({ icon: 'success', title: 'Xin chào ' + res.data.fullname, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });

      // Fetch data in background (non-blocking for faster login)
      const currentWeekInfo = computeWeekInfo(undefined, false);
      callApi('GET_DATA', {
        username: res.data.username,
        fullname: res.data.fullname,
        role: res.data.role,
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
        currentMonthSheet: currentWeekInfo.monthSheet,
        currentWeekLabel: currentWeekInfo.weekLabel,
      }, { background: true }).then((dataRes) => {
        if (dataRes?.ok) {
          store.setLogs(dataRes.data.logs || []);
          store.setStats(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 });
          store.setUsers(dataRes.data.users || []);
          if (dataRes.data.keys) store.setGroqKeys(dataRes.data.keys);

          const serverConfirmed = dataRes.data.isScheduleRegistered === true;
          const isReg =
            serverConfirmed ||
            isNextWeekScheduleRegistered(
              false,
              res.data.username,
              weekInfo,
              dataRes.data.registeredShifts,
              serverConfirmed ? expectedWeekKey : null
            );
          if (isReg) {
            const finalShifts =
              Array.isArray(dataRes.data.registeredShifts) && dataRes.data.registeredShifts.length === 7
                ? dataRes.data.registeredShifts
                : savedShifts;
            if (finalShifts && finalShifts.length === 7) {
              store.setRegisteredShifts(finalShifts);
              const regShifts: Record<string, string> = {};
              weekInfo.weekDatesKeys.forEach((k, i) => (regShifts[k] = finalShifts[i]));
              store.setShiftData(regShifts);
            }
            markScheduleRegisteredLocally(res.data.username, expectedWeekKey, finalShifts, {
              updatedAt: dataRes.data.scheduleUpdatedAt,
              sheetSynced: dataRes.data.scheduleSheetSynced !== false,
              offReason: dataRes.data.scheduleOffReason,
              status: dataRes.data.scheduleStatus,
            });
            store.setScheduleRegistered(true, expectedWeekKey, {
              updatedAt: dataRes.data.scheduleUpdatedAt,
              sheetSynced: dataRes.data.scheduleSheetSynced !== false,
              offReason: dataRes.data.scheduleOffReason,
            });
          } else {
            store.setScheduleRegistered(false);
            store.setRegisteredShifts([]);
          }
          store.setScheduleMeta({ isScheduleHydrated: true });

          if (dataRes.data.approvedShifts) store.setApprovedShifts(dataRes.data.approvedShifts);
          if (dataRes.data.currentWeekApprovedShifts !== undefined) {
            store.setCurrentWeekApprovedShifts(dataRes.data.currentWeekApprovedShifts);
          } else if (
            currentWeekInfo.monthSheet !== weekInfo.monthSheet ||
            currentWeekInfo.weekLabel !== weekInfo.weekLabel
          ) {
            callApi('GET_DATA', {
              username: res.data.username,
              fullname: res.data.fullname,
              role: res.data.role,
              monthSheet: currentWeekInfo.monthSheet,
              weekLabel: currentWeekInfo.weekLabel,
            }, { background: true }).then((cwRes) => {
              if (cwRes?.ok) {
                store.setCurrentWeekApprovedShifts(cwRes.data?.approvedShifts ?? null);
              }
            });
          } else {
            store.setCurrentWeekApprovedShifts(dataRes.data.approvedShifts ?? null);
          }
          if (dataRes.data.gpsConfig) store.setServerGpsConfig(dataRes.data.gpsConfig);
          if (dataRes.data.orgConfig) store.setServerOrgConfig(dataRes.data.orgConfig);
          if (dataRes.data.payrollConfig) store.setServerPayrollConfig(dataRes.data.payrollConfig);
          localStorage.setItem('kg_stats', JSON.stringify(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 }));
          store.setLastFetchTime(Date.now());

          // Mandatory schedule registration guidance on T5, T6, T7 before 17:00
          const regWindow = getScheduleRegistrationWindow();
          const mustRegister = isScheduleRegistrationRequired(res.data);
          if (mustRegister && regWindow.isMandatoryWindow && !isReg) {
            // Smoothly direct staff straight to schedule registration sub-tab
            store.setCurrentTab('schedule');
          }
        }
      });
    } else if (res) {
      speak('Đăng nhập thất bại');
      Swal.fire('Thất bại', res.message, 'error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    store.setLoading(true, 'Đang gửi thông tin...');
    let passwordHash = '';
    try {
      passwordHash = await hashPassword(registerForm.password);
    } catch { /* ignore */ }

    const res = await callApi('REGISTER', {
      ...registerForm,
      passwordHash: passwordHash || undefined
    });
    store.setLoading(false);

    if (res?.ok) {
      Swal.fire('Thành công', res.message, 'success');
      setMode('login');
      setRegisterForm({ username: '', password: '', fullname: '', dob: '', email: '', phone: '' });
      // Tự động điền username vào form đăng nhập
      setLoginForm({ ...loginForm, username: registerForm.username });
    } else if (res) {
      Swal.fire('Lỗi', res.message, 'error');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotStep === 1) {
      if (!forgotForm.email) {
        Swal.fire('Lỗi', 'Vui lòng nhập Email', 'warning');
        return;
      }
      store.setLoading(true, 'Đang gửi mã OTP...');
      const res = await callApi('REQUEST_OTP', { email: forgotForm.email });
      store.setLoading(false);

      if (res?.ok) {
        setForgotStep(2);
        Swal.fire('Thành công', 'Mã OTP đã được gửi đến Email của bạn', 'success');
      } else {
        Swal.fire('Không thể gửi OTP', res?.message || 'Không tìm thấy Email hoặc máy chủ đang bận. Vui lòng kiểm tra lại.', 'error');
      }
    } else {
      if (!resetForm.otp || !resetForm.newPassword) {
        Swal.fire('Lỗi', 'Vui lòng nhập OTP và Mật khẩu mới', 'warning');
        return;
      }
      store.setLoading(true, 'Đang đặt lại mật khẩu...');
      let passwordHash = '';
      try {
        passwordHash = await hashPassword(resetForm.newPassword);
      } catch { /* ignore */ }

      const res = await callApi('RESET_PASSWORD', {
        email: forgotForm.email,
        otp: resetForm.otp,
        newPassword: resetForm.newPassword,
        passwordHash: passwordHash || undefined
      });
      store.setLoading(false);

      if (res?.ok) {
        Swal.fire('Thành công', 'Mật khẩu đã được đặt lại', 'success');
        setMode('login');
        setForgotStep(1);
        setForgotForm({ email: '' });
        setResetForm({ otp: '', newPassword: '' });
      } else {
        Swal.fire('Lỗi', res?.message || 'Mã OTP không đúng hoặc đã hết hạn', 'error');
      }
    }
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
    if (value.length > 8) value = value.slice(0, 8);

    let formattedValue = value;
    if (value.length >= 5) {
      formattedValue = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    } else if (value.length >= 3) {
      formattedValue = `${value.slice(0, 2)}/${value.slice(2)}`;
    }

    setRegisterForm({ ...registerForm, dob: formattedValue });
  };

  return (
    <div className="login-shell relative flex-1 flex flex-col justify-between p-3.5 sm:p-6 lg:p-8 min-h-screen bg-[var(--kg-bg)] text-[var(--kg-text)] font-sans transition-colors duration-200 overflow-x-hidden">
      {/* Top Utility Bar (Zero overlap on 360px-1920px) */}
      <header className="relative z-20 w-full max-w-6xl mx-auto flex items-center justify-between gap-2 pb-3 sm:pb-4">
        <KgVersionBadge showCodename />
        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
          className="w-11 h-11 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center shadow-xs transition-colors flex-shrink-0"
        >
          {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
        </button>
      </header>

      <div className="relative z-10 my-auto w-full max-w-6xl mx-auto grid lg:grid-cols-[1.06fr_0.94fr] gap-4 sm:gap-6 lg:gap-8 items-stretch">
        {/* LEFT SHOWCASE: Warm Hospitality Midnight × Grill Ember Atelier */}
        <section className="rounded-2xl sm:rounded-3xl bg-[#0B253C] dark:bg-[#121824] border border-white/10 p-4 sm:p-7 lg:p-9 text-white shadow-[0_20px_48px_-16px_rgba(11,37,60,0.42)] relative overflow-hidden flex flex-col justify-between gap-4 lg:gap-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#C8432B]/25 blur-3xl"
          />

          {/* Compact Mobile Header + Full Desktop Editorial Showcase */}
          <div className="relative z-10 space-y-3 sm:space-y-5">
            <div className="flex items-center gap-3">
              <div className="login-logo-card w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white p-1.5 sm:p-2 shadow-md flex items-center justify-center flex-shrink-0">
                <img
                  src="/android-chrome-192x192.png?v=3"
                  srcSet="/android-chrome-192x192.png?v=3 1x, /android-chrome-512x512.png?v=3 2x"
                  width={56}
                  height={56}
                  decoding="async"
                  fetchPriority="high"
                  alt="King's Grill Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-[11px] font-extrabold uppercase tracking-wider text-amber-200">
                  KING&apos;S GRILL STAFF OS
                </span>
                <p className="text-xs sm:text-sm text-slate-200 font-semibold mt-1 truncate">
                  Warm Hospitality Super-App • {APP_VERSION_TAG}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-3xl lg:text-[34px] font-extrabold text-white tracking-tight leading-[1.18] text-balance">
                Vận hành tinh gọn &amp; Chấm công thông minh thế hệ mới
              </h1>
              <p className="hidden sm:block text-sm text-slate-200/90 max-w-lg leading-relaxed text-pretty">
                Không gian điều hành ca trực, AI FaceID, bàn giao khu vực và đối soát công lương minh bạch — được tái thiết kế 100% chuẩn khít trên mọi thiết bị&nbsp;di&nbsp;động.
              </p>
            </div>

            <div className="hidden sm:flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white">
                <ScanFace size={14} className="text-amber-300" /> AI Face Match
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white">
                <MapPin size={14} className="text-emerald-300" /> GPS Geofence
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white">
                <ShieldCheck size={14} className="text-sky-300" /> Công lương minh bạch
              </span>
            </div>
          </div>

          {/* Interactive v4.0.0 Release Notes Card (Visible on BOTH Mobile & Desktop) */}
          <button
            type="button"
            onClick={() => openReleaseNotesModal('all')}
            className="relative z-10 w-full min-h-[48px] text-left rounded-xl sm:rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 p-3 sm:p-4 transition-all active:scale-[0.99] flex items-center justify-between gap-3 group"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#B83821] text-white text-[11px] font-extrabold font-mono tabular-nums">
                  <Sparkles size={11} /> MỚI {APP_VERSION_TAG}
                </span>
                <span className="text-[11px] font-semibold text-slate-200 font-mono tabular-nums">
                  Cập nhật {APP_RELEASE_DATE}
                </span>
              </div>
              <p className="text-xs sm:text-[13px] font-bold text-white leading-snug">
                Đổi mới 100% giao diện Mobile Super-App, Nút AI Home ảo &amp; Nhật ký phiên bản
              </p>
              <p className="hidden sm:block text-xs text-slate-200/85">
                Nhấn để xem chi tiết nâng cấp thêm gì, chỉnh sửa &amp; tối ưu gì ở bản mới
              </p>
            </div>
            <span className="w-9 h-9 rounded-xl bg-white/15 group-hover:bg-[#B83821] text-white flex items-center justify-center flex-shrink-0 transition-colors">
              <ArrowRight size={16} />
            </span>
          </button>
        </section>

        {/* RIGHT FORM PANEL */}
        <div className="w-full max-w-lg mx-auto lg:max-w-none flex flex-col justify-center">
          {/* LOGIN FORM */}
          {mode === 'login' && (
            <div className="login-card relative overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl sm:rounded-3xl p-5 sm:p-7 lg:p-8 shadow-card">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0B253C] via-[#C8432B] to-[#D97706]"
              />
              <div className="mb-5">
                <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--kg-accent-ink)] mb-1">
                  Cổng xác thực nhân sự
                </span>
                <h2 className="text-lg sm:text-2xl font-extrabold text-[var(--kg-text)] tracking-tight">
                  Đăng nhập tài khoản
                </h2>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                  Sử dụng mã tài khoản nhân sự được cấp bởi Ban Quản Lý
                </p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs font-bold text-[var(--kg-text)]">
                    Tài khoản nhân viên
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-soft)]">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      id="username"
                      name="username"
                      autoComplete="username"
                      required
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[46px] transition-colors"
                      placeholder="Nhập tên đăng nhập"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-bold text-[var(--kg-text)]">
                    Mật khẩu
                  </label>
                  <div className="flex items-center bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl focus-within:bg-[var(--kg-surface)] focus-within:border-[var(--kg-primary)] focus-within:ring-2 focus-within:ring-[var(--kg-primary)]/15 transition-colors min-h-[46px]">
                    <div className="pl-3.5 pr-2.5 flex items-center pointer-events-none text-[var(--kg-text-soft)] shrink-0">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPass ? 'text' : 'password'}
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent border-0 py-2.5 pr-2 text-sm focus:outline-none focus:ring-0 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      placeholder="Nhập mật khẩu"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="w-11 h-11 shrink-0 flex items-center justify-center text-[var(--kg-text-soft)] hover:text-[var(--kg-text)] rounded-r-xl transition-colors"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 py-0.5">
                  <label htmlFor="remember-me" className="inline-flex items-center gap-2.5 min-h-[44px] pr-2 cursor-pointer select-none">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span className="h-[18px] w-[18px] rounded-[5px] border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] peer-checked:bg-[var(--kg-primary)] peer-checked:border-[var(--kg-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--kg-primary)]/30 inline-flex items-center justify-center text-white transition-colors shrink-0">
                      {rememberMe && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-medium text-[var(--kg-text-muted)]">
                      Ghi nhớ đăng nhập
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs font-bold text-[var(--kg-accent-ink)] hover:underline min-h-[44px] px-2 inline-flex items-center whitespace-nowrap"
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                <button
                  type="submit"
                  className="login-primary w-full bg-[#B83821] hover:bg-[#9E2F1B] text-white font-bold py-3 rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 text-sm shadow-md active:scale-[0.99] min-h-[48px]"
                >
                  <span>Đăng nhập vào Ca trực</span> <ArrowRight size={16} />
                </button>
              </form>
              <div className="mt-4 pt-3 border-t border-[var(--kg-border)] flex flex-wrap items-center justify-center gap-1 text-center">
                <span className="text-xs text-[var(--kg-text-muted)]">Chưa có tài khoản?</span>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] px-2 inline-flex items-center"
                >
                  Đăng ký nhân sự mới
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="login-card bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-6 sm:p-7 shadow-card">
              <div className="mb-5">
                <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] tracking-tight">Đăng ký nhân sự mới</h2>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">Tạo hồ sơ để bắt đầu xếp lịch ca và chấm công</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h3 className="text-[11px] font-bold text-[var(--kg-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Lock size={12} /> 1. Tài khoản bảo mật
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="reg-username" className="block text-xs font-semibold text-[var(--kg-text)]">
                        Tên đăng nhập <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <input
                        id="reg-username"
                        type="text"
                        required
                        autoComplete="username"
                        value={registerForm.username}
                        onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                        placeholder="VD: nguyenvana"
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="reg-password" className="block text-xs font-semibold text-[var(--kg-text)]">
                        Mật khẩu <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <input
                        id="reg-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        placeholder="Tối thiểu 6 ký tự"
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Hồ sơ cá nhân */}
                <div className="p-4 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h3 className="text-[11px] font-bold text-[var(--kg-accent)] uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} /> 2. Hồ sơ cá nhân
                  </h3>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="reg-fullname" className="block text-xs font-semibold text-[var(--kg-text)]">
                        Họ và Tên <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <input
                        id="reg-fullname"
                        type="text"
                        required
                        autoComplete="name"
                        value={registerForm.fullname}
                        onChange={(e) => setRegisterForm({ ...registerForm, fullname: e.target.value })}
                        placeholder="Gõ tiếng Việt có dấu (VD: Nguyễn Văn A)"
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="reg-email" className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]">
                          <Mail size={12} className="text-[var(--kg-text-soft)]" /> Email cá nhân <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reg-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          placeholder="email@gmail.com"
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="reg-phone" className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]">
                          <Phone size={12} className="text-[var(--kg-text-soft)]" /> Số điện thoại <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reg-phone"
                          type="tel"
                          required
                          autoComplete="tel"
                          value={registerForm.phone}
                          onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                          placeholder="09xxxxxxxx"
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="reg-dob" className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]">
                        <Calendar size={12} className="text-[var(--kg-text-soft)]" /> Ngày sinh (DD/MM/YYYY)
                      </label>
                      <input
                        id="reg-dob"
                        type="text"
                        inputMode="numeric"
                        value={registerForm.dob}
                        onChange={handleDobChange}
                        placeholder="Gõ 8 số liền nhau, VD: 15082002"
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="login-primary w-full bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs active:scale-[0.99] min-h-[44px]"
                >
                  Hoàn tất đăng ký
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-center text-xs font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center gap-1 transition-colors min-h-[44px]"
                >
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="login-card bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-6 sm:p-7 shadow-card">
              <div className="mb-5 text-center">
                <div className="w-11 h-11 rounded-xl bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/20 flex items-center justify-center mx-auto mb-3 text-[var(--kg-accent)]">
                  <KeyRound size={20} />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] tracking-tight">Khôi phục mật khẩu</h2>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">Nhập email đã đăng ký để nhận mã OTP 6 chữ số</p>
              </div>

              <form onSubmit={handleForgot} className="space-y-4">
                {forgotStep === 1 ? (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="forgot-email" className="block text-xs font-semibold text-[var(--kg-text)]">
                        Email khôi phục <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-soft)]">
                          <Mail size={16} />
                        </div>
                        <input
                          id="forgot-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={forgotForm.email}
                          onChange={(e) => setForgotForm({ email: e.target.value })}
                          placeholder="Nhập email cá nhân đã đăng ký"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[44px]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="login-primary w-full bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs active:scale-[0.99] min-h-[44px]"
                    >
                      Gửi mã OTP
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label htmlFor="reset-otp" className="block text-xs font-semibold text-[var(--kg-text)]">
                          Mã xác thực OTP (6 chữ số) <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reset-otp"
                          type="text"
                          inputMode="numeric"
                          required
                          value={resetForm.otp}
                          onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })}
                          placeholder="000000"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-base text-center tracking-[0.35em] font-mono tabular-nums font-bold focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[44px]"
                          maxLength={6}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="reset-password" className="block text-xs font-semibold text-[var(--kg-text)]">
                          Mật khẩu mới <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reset-password"
                          type="password"
                          required
                          autoComplete="new-password"
                          value={resetForm.newPassword}
                          onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                          placeholder="Nhập mật khẩu mới"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[44px]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-[var(--kg-success)] hover:brightness-95 text-white font-semibold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs active:scale-[0.99] min-h-[44px]"
                    >
                      Đặt lại mật khẩu
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { setMode('login'); setForgotStep(1); }}
                  className="w-full text-center text-xs font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center gap-1 transition-colors min-h-[44px]"
                >
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Footer Version Stamp */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto pt-4 text-center text-[11px] font-medium text-[var(--kg-text-muted)]">
        King&apos;s Grill Staff OS <span className="font-mono tabular-nums font-bold">{APP_VERSION_TAG}</span> • Chuẩn hóa giao diện đa thiết bị
      </footer>
    </div>
  );
}
