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
  ChevronLeft,
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
    setSyncedProfileCount(getCachedFaceProfiles().length);
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
    return () => {
      unsub();
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthNotice(null);
    store.setLoading(true, 'Đang đăng nhập...');

    let passwordHash = '';
    try {
      passwordHash = await hashPassword(loginForm.password);
    } catch {
      /* ignore */
    }

    const res = await callApi(
      'LOGIN',
      {
        ...loginForm,
        passwordHash: passwordHash || undefined,
      },
      { timeoutMs: 15000, maxAttempts: 1 }
    );
    store.setLoading(false);

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

  return (
    <div className="login-shell relative flex-1 flex flex-col justify-between p-3.5 sm:p-6 lg:p-8 min-h-dvh bg-[var(--kg-bg)] text-[var(--kg-text)] font-sans transition-colors duration-200 overflow-x-hidden">
      {/* Top Bar: Mobile 56px Compact Brand Header + Utility Controls */}
      <header className="relative z-20 w-full max-w-5xl mx-auto h-14 flex items-center justify-between gap-2 pb-2 md:pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="md:hidden w-9 h-9 rounded-xl bg-white border border-[var(--kg-border)] p-1 shadow-xs flex items-center justify-center shrink-0">
            <img
              src="/android-chrome-192x192.png?v=3"
              width={28}
              height={28}
              decoding="async"
              fetchPriority="high"
              alt="King's Grill Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="md:hidden min-w-0">
            <p className="text-xs font-extrabold tracking-tight text-[var(--kg-text)] truncate leading-none">
              KING&apos;S GRILL
            </p>
            <p className="text-[10.5px] font-semibold text-[var(--kg-text-muted)] truncate mt-0.5 leading-none">
              Staff OS
            </p>
          </div>
          <div className="hidden md:block">
            <KgVersionBadge showCodename />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="md:hidden">
            <KgVersionBadge />
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
            className="w-11 h-11 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center shadow-xs transition-colors flex-shrink-0"
          >
            {isDark ? <Sun size={18} className="text-[var(--kg-warning)]" /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main Split: Mobile single-column above the fold; Tablet/Desktop 2-col inside max-w-5xl */}
      <div className="relative z-10 my-auto w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.04fr_0.96fr] gap-4 sm:gap-6 lg:gap-8 items-stretch">
        {/* LEFT SHOWCASE: Tablet & Desktop Editorial Brand Atelier (Hidden on mobile so Kiosk + Login stay immediately above the fold) */}
        <section className="hidden md:flex min-w-0 rounded-3xl bg-[var(--kg-rail-bg)] border border-[var(--kg-rail-border)] p-6 lg:p-9 text-[var(--kg-rail-text)] shadow-hero relative overflow-hidden flex-col justify-between gap-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-12 w-64 h-64 rounded-full bg-[var(--kg-accent)]/20"
          />

          <div className="relative z-10 space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="login-logo-card w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-white p-2 shadow-md flex items-center justify-center flex-shrink-0">
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
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--kg-rail-surface)] border border-[var(--kg-rail-border)] text-[11px] font-extrabold uppercase tracking-wider text-amber-200">
                  KING&apos;S GRILL STAFF OS
                </span>
                <p className="text-xs sm:text-sm text-[var(--kg-rail-muted)] font-semibold mt-1 truncate">
                  Warm Hospitality Super-App • {APP_VERSION_TAG}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <h1 className="text-2xl lg:text-[32px] font-extrabold text-[var(--kg-rail-text)] tracking-tight leading-[1.18] text-balance">
                Vận hành tinh gọn &amp; Chấm công thông minh thế hệ mới
              </h1>
              <p className="text-sm text-[var(--kg-rail-muted)] max-w-lg leading-relaxed text-pretty">
                Không gian điều hành ca trực, AI FaceID 5 góc, bàn giao khu vực và đối soát công lương minh bạch — đồng bộ tức thì trên mọi thiết bị.
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--kg-rail-surface)] border border-[var(--kg-rail-border)] text-xs font-semibold text-[var(--kg-rail-text)]">
              <ScanFace size={14} className="text-amber-300" /> AI Face Match 5 góc
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--kg-rail-surface)] border border-[var(--kg-rail-border)] text-xs font-semibold text-[var(--kg-rail-text)]">
              <MapPin size={14} className="text-emerald-300" /> GPS Geofence ≤25m
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--kg-rail-surface)] border border-[var(--kg-rail-border)] text-xs font-semibold text-[var(--kg-rail-text)]">
              <ShieldCheck size={14} className="text-sky-300" /> Công lương minh bạch
            </span>
          </div>
        </section>

        {/* RIGHT FORM PANEL */}
        <div className="w-full min-w-0 max-w-md mx-auto md:max-w-none flex flex-col justify-center gap-3.5">
          {/* OPEN MULTI-EMPLOYEE FACE ID STATION CTA (v2 Parallel Kiosk) */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => setKioskScannerOpen(true)}
              data-testid="open-kiosk-face-v2"
              className="w-full min-h-[64px] text-left rounded-2xl bg-[var(--kg-rail-bg)] hover:brightness-110 border border-[var(--kg-rail-border)] p-3.5 sm:p-4 text-[var(--kg-rail-text)] shadow-md transition-all duration-150 flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[var(--kg-accent)] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <ScanFace size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs sm:text-sm font-extrabold text-[var(--kg-rail-text)] tracking-tight">
                      Chấm Công Khuôn Mặt Nhanh
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold border ${
                        syncedProfileCount > 0
                          ? 'bg-emerald-950/70 border-emerald-400/50 text-emerald-300'
                          : 'bg-sky-950/70 border-sky-400/50 text-sky-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          syncedProfileCount > 0 ? 'bg-emerald-400' : 'bg-sky-400'
                        }`}
                      />
                      <span>
                        {syncedProfileCount > 0
                          ? `${syncedProfileCount} hồ sơ sẵn sàng`
                          : 'V2 Tự động'}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--kg-rail-muted)] mt-0.5 leading-snug">
                    Mở trạm quét tự động • Bán kính ≤25m
                  </p>
                </div>
              </div>
              <span className="w-9 h-9 rounded-xl bg-[var(--kg-rail-surface)] group-hover:bg-[var(--kg-accent)] border border-[var(--kg-rail-border)] group-hover:border-[var(--kg-accent)] text-[var(--kg-rail-text)] group-hover:text-white flex items-center justify-center flex-shrink-0 transition-colors">
                <ArrowRight size={16} />
              </span>
            </button>
          )}

          {/* Inline Auth Feedback Banner */}
          {authNotice && (
            <KgAlertCard variant={authNotice.variant} title={authNotice.title}>
              {authNotice.text}
            </KgAlertCard>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <div className="login-card relative overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-card">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--kg-primary)] via-[var(--kg-accent)] to-[var(--kg-warning)]"
              />
              <div className="mb-4 sm:mb-5">
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
                      className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[46px] transition-colors"
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
                      className="flex-1 min-w-0 bg-transparent border-0 py-2.5 pr-2 text-base sm:text-sm focus:outline-none focus:ring-0 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                    <span className="h-[18px] w-[18px] rounded-[5px] border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] peer-checked:bg-[var(--kg-primary)] peer-checked:border-[var(--kg-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--kg-primary)]/30 inline-flex items-center justify-center text-white transition-colors shrink-0">
                      {rememberMe && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-medium text-[var(--kg-text-muted)]">
                      Ghi nhớ đăng nhập
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthNotice(null);
                      setMode('forgot');
                    }}
                    className="text-xs font-bold text-[var(--kg-accent-ink)] hover:underline min-h-[44px] px-2 inline-flex items-center whitespace-nowrap"
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                <button
                  type="submit"
                  className="login-primary w-full bg-[var(--kg-accent)] hover:brightness-95 text-white font-bold py-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 text-sm shadow-md active:scale-[0.99] min-h-[48px]"
                >
                  <span>Đăng nhập vào Ca trực</span> <ArrowRight size={16} />
                </button>
              </form>
              <div className="mt-4 pt-3 border-t border-[var(--kg-border)] flex flex-wrap items-center justify-center gap-1 text-center">
                <span className="text-xs text-[var(--kg-text-muted)]">Chưa có tài khoản?</span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthNotice(null);
                    setMode('register');
                  }}
                  className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] px-2 inline-flex items-center"
                >
                  Đăng ký nhân sự mới
                </button>
              </div>
            </div>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <div className="login-card bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 sm:p-7 shadow-card">
              <div className="mb-5">
                <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] tracking-tight">
                  Đăng ký nhân sự mới
                </h2>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                  Tạo hồ sơ để bắt đầu xếp lịch ca và chấm công
                </p>
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                        className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-base sm:text-sm font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 transition-colors placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                  onClick={() => {
                    setAuthNotice(null);
                    setMode('login');
                  }}
                  className="w-full text-center text-xs font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center gap-1 transition-colors min-h-[44px]"
                >
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="login-card bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 sm:p-7 shadow-card">
              <div className="mb-5 text-center">
                <div className="w-11 h-11 rounded-xl bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/20 flex items-center justify-center mx-auto mb-3 text-[var(--kg-accent)]">
                  <KeyRound size={20} />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] tracking-tight">
                  Khôi phục mật khẩu
                </h2>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                  Nhập email đã đăng ký để nhận mã OTP 6 chữ số
                </p>
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
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] min-h-[44px]"
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
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-base sm:text-sm text-center tracking-[0.35em] font-mono tabular-nums font-bold focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[44px]"
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
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:bg-[var(--kg-surface)] focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[44px]"
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
                  onClick={() => {
                    setAuthNotice(null);
                    setMode('login');
                    setForgotStep(1);
                  }}
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
      <footer className="relative z-10 w-full max-w-5xl mx-auto pt-4 text-center text-[11px] font-medium text-[var(--kg-text-muted)]">
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
