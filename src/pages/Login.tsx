import { lazy, Suspense, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { hydrateSessionAfterLogin } from '../services/authSession';
import {
  getCachedFaceProfiles,
  subscribeCachedFaceProfiles,
  syncLatestFaceProfilesFromEdge,
} from '../utils/faceProfileCache';
import { speak } from '../utils/helpers';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  KeyRound,
  MapPin,
  ScanFace,
  Check,
  Sun,
  Moon,
  Flame,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { hashPassword } from '../utils/security';
import { KgVersionBadge } from '../components/KgVersionBadge';
import { APP_VERSION_TAG } from '../config/appVersion';
import { KgAlertCard } from '../components/KgDesignSystem';

const FastFaceScannerV2 = lazy(() => import('../components/FastFaceScannerV2'));

export default function Login() {
  const store = useAppStore.getState();
  const isDark = useAppStore((s) => s.isDark);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kg_remember') !== 'false');
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    fullname: '',
    dob: '',
    email: '',
    phone: '',
  });

  // Forgot Password States
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetForm, setResetForm] = useState({ otp: '', newPassword: '' });
  const [showPass, setShowPass] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [kioskScannerOpen, setKioskScannerOpen] = useState(false);
  const [syncedProfileCount, setSyncedProfileCount] = useState<number>(
    () => getCachedFaceProfiles().length
  );
  const [authNotice, setAuthNotice] = useState<{
    variant: 'error' | 'warning' | 'success' | 'info';
    title: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeCachedFaceProfiles((list) => {
      setSyncedProfileCount(list.length);
    });
    // Always revalidate Face ID profiles from Cloudflare Edge D1 in background (SWR)
    // even when localStorage already holds older profiles, so faces enrolled on Device A appear on Device B immediately
    void syncLatestFaceProfilesFromEdge(callApi);
    const onFocusOrVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void syncLatestFaceProfilesFromEdge(callApi);
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    // Preload Dashboard chunk silently while user enters credentials so post-login transition is 0ms instant
    const preloadTimer = window.setTimeout(() => {
      void import('./Dashboard').catch(() => {});
    }, 350);

    return () => {
      window.clearTimeout(preloadTimer);
      unsub();
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  const handleModeSwitch = (nextMode: 'login' | 'register' | 'forgot') => {
    setAuthNotice(null);
    setMode(nextMode);
    if (nextMode !== 'forgot') {
      setForgotStep(1);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoggingIn) return;
    const cleanUsername = loginForm.username.trim();
    if (!cleanUsername || !loginForm.password) return;

    setAuthNotice(null);
    setIsLoggingIn(true);

    try {
      let passwordHash = '';
      try {
        passwordHash = await hashPassword(loginForm.password);
      } catch {
        /* ignore */
      }

      const res = await callApi(
        'LOGIN',
        {
          username: cleanUsername,
          password: loginForm.password,
          passwordHash: passwordHash || undefined,
        },
        { background: true, timeoutMs: 15000, maxAttempts: 1 }
      );

      if (res?.ok) {
        hydrateSessionAfterLogin(res.data, rememberMe);
      } else if (res) {
        speak('Đăng nhập thất bại');
        setAuthNotice({
          variant: 'error',
          title: 'Đăng nhập thất bại',
          text: res.message || 'Tên đăng nhập hoặc mật khẩu chưa đúng.',
        });
      } else {
        setAuthNotice({
          variant: 'error',
          title: 'Lỗi kết nối',
          text: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
        });
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    store.setLoading(true, 'Đang gửi thông tin...');
    let passwordHash = '';
    try {
      passwordHash = await hashPassword(registerForm.password);
    } catch {
      /* ignore */
    }

    const res = await callApi('REGISTER', {
      ...registerForm,
      passwordHash: passwordHash || undefined,
    });
    store.setLoading(false);

    if (res?.ok) {
      setAuthNotice({
        variant: 'success',
        title: 'Đăng ký thành công',
        text: res.message || 'Tài khoản đã được tạo. Bạn có thể đăng nhập ngay.',
      });
      setMode('login');
      setRegisterForm({ username: '', password: '', fullname: '', dob: '', email: '', phone: '' });
      setLoginForm({ ...loginForm, username: registerForm.username });
    } else if (res) {
      setAuthNotice({
        variant: 'error',
        title: 'Đăng ký thất bại',
        text: res.message || 'Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin.',
      });
    } else {
      setAuthNotice({
        variant: 'error',
        title: 'Lỗi kết nối',
        text: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
      });
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    if (forgotStep === 1) {
      if (!forgotForm.email) {
        setAuthNotice({
          variant: 'warning',
          title: 'Thiếu thông tin',
          text: 'Vui lòng nhập Email đã đăng ký.',
        });
        return;
      }
      store.setLoading(true, 'Đang gửi mã OTP...');
      const res = await callApi('REQUEST_OTP', { email: forgotForm.email });
      store.setLoading(false);

      if (res?.ok) {
        setForgotStep(2);
        setAuthNotice({
          variant: 'success',
          title: 'Đã gửi mã OTP',
          text: 'Mã OTP đã được gửi đến Email của bạn.',
        });
      } else {
        setAuthNotice({
          variant: 'error',
          title: 'Không thể gửi OTP',
          text:
            res?.message || 'Không tìm thấy Email hoặc máy chủ đang bận. Vui lòng kiểm tra lại.',
        });
      }
    } else {
      if (!resetForm.otp || !resetForm.newPassword) {
        setAuthNotice({
          variant: 'warning',
          title: 'Thiếu thông tin',
          text: 'Vui lòng nhập OTP và Mật khẩu mới.',
        });
        return;
      }
      store.setLoading(true, 'Đang đặt lại mật khẩu...');
      let passwordHash = '';
      try {
        passwordHash = await hashPassword(resetForm.newPassword);
      } catch {
        /* ignore */
      }

      const res = await callApi('RESET_PASSWORD', {
        email: forgotForm.email,
        otp: resetForm.otp,
        newPassword: resetForm.newPassword,
        passwordHash: passwordHash || undefined,
      });
      store.setLoading(false);

      if (res?.ok) {
        setAuthNotice({
          variant: 'success',
          title: 'Đặt lại mật khẩu thành công',
          text: 'Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.',
        });
        setMode('login');
        setForgotStep(1);
        setForgotForm({ email: '' });
        setResetForm({ otp: '', newPassword: '' });
      } else {
        setAuthNotice({
          variant: 'error',
          title: 'Lỗi đặt lại mật khẩu',
          text: res?.message || 'Mã OTP không đúng hoặc đã hết hạn.',
        });
      }
    }
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);

    let formattedValue = value;
    if (value.length >= 5) {
      formattedValue = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    } else if (value.length >= 3) {
      formattedValue = `${value.slice(0, 2)}/${value.slice(2)}`;
    }

    setRegisterForm({ ...registerForm, dob: formattedValue });
  };

  const cardTitle =
    mode === 'login'
      ? 'Đăng nhập tài khoản'
      : mode === 'register'
      ? 'Đăng ký nhân sự mới'
      : 'Khôi phục mật khẩu';

  const cardSubtitle =
    mode === 'login'
      ? 'Touch Operations • Staff OS 5.0'
      : mode === 'register'
      ? 'Tạo hồ sơ để bắt đầu xếp lịch ca và chấm công'
      : 'Nhập email đã đăng ký để nhận mã OTP 6 chữ số';

  return (
    <div className="login-shell relative flex-1 flex flex-col justify-between p-3.5 sm:p-6 lg:p-8 min-h-dvh bg-[var(--kg-bg)] text-[var(--kg-text)] font-sans transition-colors duration-150 overflow-x-hidden">
      {/* Top Bar: Mobile/Tablet Compact Brand Header + Utility Controls */}
      <header className="relative z-20 w-full max-w-5xl xl:max-w-[1080px] mx-auto h-14 flex items-center justify-between gap-2 pb-2 lg:pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="lg:hidden w-9 h-9 rounded-xl bg-[#F29055] text-[#241C17] flex items-center justify-center shrink-0 shadow-xs">
            <Flame size={20} strokeWidth={2} />
          </div>
          <div className="lg:hidden min-w-0">
            <p className="text-xs font-extrabold tracking-wide text-[var(--kg-text)] truncate leading-none">
              KING&apos;S GRILL
            </p>
            <p className="text-[10px] font-bold tracking-wider text-[var(--kg-text-muted)] truncate mt-1 leading-none">
              TOUCH OPERATIONS
            </p>
          </div>
          <div className="hidden lg:block">
            <KgVersionBadge showCodename />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="lg:hidden">
            <KgVersionBadge />
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
            className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] inline-flex items-center justify-center shadow-xs transition-colors flex-shrink-0 touch-manipulation"
          >
            {isDark ? <Sun size={18} className="text-[var(--kg-warning)]" /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main Split: Mobile/Tablet Portrait centered single-column; Laptop/Desktop (>= 1024px) 2-col #202C27 Forest Showcase */}
      <div className="relative z-10 my-auto w-full max-w-5xl xl:max-w-[1080px] mx-auto grid grid-cols-1 lg:grid-cols-[1.04fr_0.96fr] gap-5 lg:gap-8 xl:gap-10 items-stretch">
        {/* LEFT SHOWCASE: Laptop & Desktop #202C27 Forest Operations Panel */}
        <section className="kg-animate-fade-up kg-stagger-1 hidden lg:flex min-w-0 rounded-3xl bg-[#202C27] border border-white/10 p-8 lg:p-9 text-[#F6F8F4] shadow-hero relative overflow-hidden flex-col justify-between gap-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-36 w-[380px] h-[380px] rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-24 w-[250px] h-[250px] rounded-full border border-white/10"
          />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-[#F29055] text-[#241C17] flex items-center justify-center flex-shrink-0 shadow-xs">
                <Flame size={28} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-extrabold uppercase tracking-wider text-[#F5AA7C]">
                  KING&apos;S GRILL STAFF OS
                </span>
                <p className="text-xs text-[#B7C8BC] font-semibold mt-1 truncate">
                  Toast Touch Operations •{' '}
                  <span className="font-mono tabular-nums">{APP_VERSION_TAG}</span>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-[30px] font-extrabold text-[#F6F8F4] tracking-tight leading-[1.18] text-balance">
                Một nhịp vận hành.
                <br />
                Chấm công tức thì &amp; minh bạch.
              </h1>
              <p className="text-sm text-[#B7C8BC] max-w-md leading-relaxed text-pretty">
                Không gian điều hành ca trực tại quầy, nhận diện khuôn mặt 5 góc trong dưới 1 giây, bàn giao két và đối soát công lương đồng bộ trên mọi thiết bị.
              </p>
            </div>
          </div>

          <div className="relative z-10 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-white/10 border border-white/15 p-3.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#B7C8BC]">
                  Trạm Face ID Kiosk
                </span>
                <span className="block text-base font-extrabold text-white mt-1">
                  {syncedProfileCount > 0 ? (
                    <>
                      <span className="font-mono tabular-nums">{syncedProfileCount}</span> hồ sơ
                    </>
                  ) : (
                    'V2 Sẵn sàng'
                  )}
                </span>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/15 p-3.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#B7C8BC]">
                  Chuẩn Geofence
                </span>
                <span className="block text-base font-extrabold font-mono tabular-nums text-[#7EDBA8] mt-1">
                  ≤ 25m GPS
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-[#F6F8F4]">
                <ScanFace size={14} className="text-[#F29055]" /> Face ID 5 góc
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-[#F6F8F4]">
                <MapPin size={14} className="text-[#7EDBA8]" /> Chu kỳ{' '}
                <span className="font-mono tabular-nums">06:00–05:59</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-[#F6F8F4]">
                <ShieldCheck size={14} className="text-[#7AC4FF]" /> Công lương minh bạch
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT FORM PANEL */}
        <div className="w-full min-w-0 max-w-md md:max-w-[500px] mx-auto lg:max-w-none flex flex-col justify-center gap-3.5">
          {/* Bold Terracotta Kiosk Face ID CTA (mode === 'login') */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => setKioskScannerOpen(true)}
              data-testid="open-kiosk-face-v2"
              className="kg-animate-fade-up kg-stagger-1 kg-card-interactive kg-pressable w-full min-h-[64px] text-left rounded-2xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] border border-[var(--kg-primary)] p-3.5 sm:p-4 shadow-card transition-colors duration-150 flex items-center justify-between gap-3 group cursor-pointer touch-manipulation"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#202C27] text-[#F29055] flex items-center justify-center flex-shrink-0">
                  <ScanFace size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs sm:text-sm font-extrabold tracking-tight">
                      Chấm công khuôn mặt nhanh (Kiosk)
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        syncedProfileCount > 0
                          ? 'bg-[#202C27] border-emerald-400/40 text-[#7EDBA8]'
                          : 'bg-[#202C27] border-sky-400/40 text-[#7AC4FF]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          syncedProfileCount > 0 ? 'bg-[#7EDBA8]' : 'bg-[#7AC4FF]'
                        }`}
                      />
                      <span>
                        {syncedProfileCount > 0 ? (
                          <>
                            <span className="font-mono tabular-nums">{syncedProfileCount}</span> hồ sơ sẵn sàng
                          </>
                        ) : (
                          'V2 Tự động'
                        )}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-snug font-medium">
                    Mở trạm quét tự động • Bán kính{' '}
                    <span className="font-mono tabular-nums">≤25m</span>
                  </p>
                </div>
              </div>
              <span className="w-9 h-9 rounded-xl bg-black/15 flex items-center justify-center flex-shrink-0 transition-transform group-hover:translate-x-0.5">
                <ArrowRight size={16} />
              </span>
            </button>
          )}

          {/* Inline Auth Feedback Banner */}
          {authNotice && (
            <KgAlertCard
              variant={authNotice.variant}
              title={authNotice.title}
              className="kg-animate-scale-in"
            >
              {authNotice.text}
            </KgAlertCard>
          )}

          {/* UNIFIED AUTH CARD WITH 3-TAB SEGMENTED CONTROL */}
          <div className="login-card kg-animate-scale-in kg-stagger-2 relative overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-card">
            <div className="mb-4 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="inline-block text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--kg-primary-ink)]">
                  Cổng nhân sự King&apos;s Grill
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--kg-text)] tracking-tight">
                {cardTitle}
              </h2>
              <p className="text-xs text-[var(--kg-text-muted)] mt-1">{cardSubtitle}</p>
            </div>

            {/* Unified 3-Tab Segmented Control inside Pill Tray */}
            <div
              role="tablist"
              aria-label="Chuyển chế độ tài khoản"
              className="flex items-center gap-1 p-1 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] mb-5"
            >
              {(
                [
                  { id: 'login', label: 'Đăng nhập', flexClass: 'flex-1' },
                  { id: 'register', label: 'Đăng ký', flexClass: 'flex-1' },
                  { id: 'forgot', label: 'Quên mật khẩu', flexClass: 'flex-[1.35]' },
                ] as const
              ).map((tab) => {
                const isActive = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleModeSwitch(tab.id)}
                    className={`kg-pressable ${tab.flexClass} min-w-0 min-h-[44px] sm:min-h-[40px] px-2 py-2 rounded-lg text-xs transition-all duration-150 touch-manipulation whitespace-nowrap flex items-center justify-center ${
                      isActive
                        ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                        : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form key="login" onSubmit={handleLogin} className="kg-animate-fade-up space-y-4">
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
                      className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/20 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[46px] transition-colors"
                      placeholder="Nhập tên đăng nhập"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-bold text-[var(--kg-text)]">
                    Mật khẩu
                  </label>
                  <div className="flex items-center bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl focus-within:bg-[var(--kg-surface)] focus-within:border-[var(--kg-primary)] focus-within:ring-2 focus-within:ring-[var(--kg-primary)]/20 transition-colors min-h-[46px]">
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
                      className="flex-1 min-w-0 bg-transparent border-0 py-2.5 pr-2 text-base sm:text-sm focus:outline-none focus:ring-0 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      placeholder="Nhập mật khẩu"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center text-[var(--kg-text-soft)] hover:text-[var(--kg-text)] rounded-r-xl transition-colors touch-manipulation"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-start py-0.5">
                  <label
                    htmlFor="remember-me"
                    className="inline-flex items-center gap-2.5 min-h-[44px] pr-2 cursor-pointer select-none"
                  >
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span className="h-[18px] w-[18px] rounded-[5px] border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] peer-checked:bg-[var(--kg-primary)] peer-checked:border-[var(--kg-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--kg-primary)]/30 inline-flex items-center justify-center text-[var(--kg-primary-fg)] transition-colors shrink-0">
                      {rememberMe && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-semibold text-[var(--kg-text-muted)]">
                      Ghi nhớ đăng nhập
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="login-primary kg-pressable w-full bg-[var(--kg-primary)] border-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] disabled:opacity-75 text-[var(--kg-primary-fg)] font-extrabold py-3 rounded-xl transition-colors duration-150 flex items-center justify-center gap-2 text-sm shadow-xs min-h-[48px] touch-manipulation"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang xác thực...</span>
                    </>
                  ) : (
                    <>
                      <span>Đăng nhập vào Ca trực</span> <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* REGISTER FORM */}
            {mode === 'register' && (
              <form key="register" onSubmit={handleRegister} className="kg-animate-fade-up space-y-4">
                <div className="p-3.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h3 className="text-[11px] font-bold text-[var(--kg-primary-ink)] uppercase tracking-wider flex items-center gap-1.5">
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h3 className="text-[11px] font-bold text-[var(--kg-primary-ink)] uppercase tracking-wider flex items-center gap-1.5">
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="reg-email"
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]"
                        >
                          <Mail size={12} className="text-[var(--kg-text-soft)]" /> Email cá nhân{' '}
                          <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reg-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          placeholder="email@gmail.com"
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="reg-phone"
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]"
                        >
                          <Phone size={12} className="text-[var(--kg-text-soft)]" /> Số điện thoại{' '}
                          <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <input
                          id="reg-phone"
                          type="tel"
                          required
                          autoComplete="tel"
                          value={registerForm.phone}
                          onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                          placeholder="09xxxxxxxx"
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="reg-dob"
                        className="flex items-center gap-1 text-xs font-semibold text-[var(--kg-text)]"
                      >
                        <Calendar size={12} className="text-[var(--kg-text-soft)]" /> Ngày sinh (DD/MM/YYYY)
                      </label>
                      <input
                        id="reg-dob"
                        type="text"
                        inputMode="numeric"
                        value={registerForm.dob}
                        onChange={handleDobChange}
                        placeholder="Gõ 8 số liền nhau, VD: 15082002"
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="login-primary kg-pressable w-full bg-[var(--kg-primary)] border-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-extrabold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs min-h-[48px] touch-manipulation"
                >
                  Hoàn tất đăng ký
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot' && (
              <form key="forgot" onSubmit={handleForgot} className="kg-animate-fade-up space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
                  <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center shrink-0">
                    <KeyRound size={18} />
                  </div>
                  <p className="text-xs text-[var(--kg-text-muted)] leading-snug">
                    {forgotStep === 1
                      ? 'Hệ thống sẽ gửi mã OTP 6 chữ số đến email bạn đã đăng ký.'
                      : `Đã gửi OTP tới ${forgotForm.email || 'email của bạn'}. Nhập mã xác thực để đặt mật khẩu mới.`}
                  </p>
                </div>

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
                          className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[46px]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="login-primary kg-pressable w-full bg-[var(--kg-primary)] border-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-extrabold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs min-h-[48px] touch-manipulation"
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
                          className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl px-4 py-2.5 text-base sm:text-sm text-center tracking-[0.35em] font-mono tabular-nums font-bold focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[46px]"
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
                          className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[46px]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="kg-pressable w-full bg-[var(--kg-success)] hover:brightness-95 text-white dark:text-[#0F2419] font-extrabold py-3 rounded-xl transition-colors duration-150 text-sm shadow-xs min-h-[48px] touch-manipulation"
                    >
                      Đặt lại mật khẩu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthNotice(null);
                        setForgotStep(1);
                      }}
                      className="kg-pressable w-full text-center text-xs font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center gap-1.5 transition-colors min-h-[44px] rounded-xl touch-manipulation"
                    >
                      <RotateCcw size={13} /> Đổi email / Gửi lại OTP
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Subtle Footer Version Stamp */}
      <footer className="relative z-10 w-full max-w-5xl xl:max-w-[1080px] mx-auto pt-4 text-center text-[11px] font-medium text-[var(--kg-text-muted)]">
        King&apos;s Grill Staff OS <span className="font-mono tabular-nums font-bold">{APP_VERSION_TAG}</span> • Chuẩn hóa giao diện đa thiết bị
      </footer>

      {kioskScannerOpen && (
        <Suspense fallback={null}>
          <FastFaceScannerV2
            isOpen={kioskScannerOpen}
            isKioskMode={true}
            onClose={() => setKioskScannerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
