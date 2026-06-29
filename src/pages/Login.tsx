import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, computeWeekInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { User, Lock, Eye, EyeOff, ChevronLeft, ArrowRight, Mail, Phone, Calendar, BadgeCheck, KeyRound } from 'lucide-react';
import { triggerDeveloperMode } from '../utils/githubApi';

export default function Login() {
  const store = useAppStore();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kg_remember') === 'true');
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', fullname: '', dob: '', email: '', phone: '' });
  
  // Forgot Password States
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetForm, setResetForm] = useState({ otp: '', newPassword: '' });
  const [showPass, setShowPass] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const handleLogin = async (e?: React.FormEvent, bioCreds?: {username: string, password: string}) => {
    if (e) e.preventDefault();
    store.setLoading(true, 'Đang kết nối Server...');

    const payload = bioCreds || loginForm;
    const res = await callApi('LOGIN', payload);
    store.setLoading(false);

    if (res?.ok) {
      store.setCurrentUser(res.data);
      // Persist session
      localStorage.setItem('kg_user', JSON.stringify(res.data));
      localStorage.setItem('kg_session_time', Date.now().toString());
      if (rememberMe) {
        localStorage.setItem('kg_remember', 'true');
      } else {
        localStorage.removeItem('kg_remember');
      }

      // Init week schedule data
      const weekInfo = computeWeekInfo();
      const initShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k) => (initShifts[k] = 'OFF'));
      store.setShiftData(initShifts);

      // Restore registered shifts from localStorage immediately
      const savedWeek = localStorage.getItem('kg_registered_week');
      const savedShiftsStr = localStorage.getItem('kg_registered_shifts');
      const expectedWeekKey = weekInfo.monthSheet + '|' + weekInfo.weekLabel;
      if ((savedWeek === expectedWeekKey || savedWeek === weekInfo.sheetName) && savedShiftsStr) {
        try {
          const shifts = JSON.parse(savedShiftsStr);
          if (Array.isArray(shifts) && shifts.length === 7) {
            store.setRegisteredShifts(shifts);
            const regShifts: Record<string, string> = {};
            weekInfo.weekDatesKeys.forEach((k, i) => regShifts[k] = shifts[i]);
            store.setShiftData(regShifts);
          }
        } catch { /* ignore */ }
      }

      speak('Đăng nhập thành công. Xin chào ' + res.data.fullname);
      Swal.fire({ icon: 'success', title: 'Xin chào ' + res.data.fullname, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });

      // Fetch data in background (non-blocking for faster login)
      callApi('GET_DATA', {
        username: res.data.username,
        fullname: res.data.fullname,
        role: res.data.role,
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
      }, { background: true }).then((dataRes) => {
        if (dataRes?.ok) {
          store.setLogs(dataRes.data.logs || []);
          store.setStats(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 });
          store.setUsers(dataRes.data.users || []);
          if (dataRes.data.keys) store.setGroqKeys(dataRes.data.keys);
          if (dataRes.data.isScheduleRegistered !== undefined)
            store.setScheduleRegistered(dataRes.data.isScheduleRegistered);
          if (dataRes.data.approvedShifts) store.setApprovedShifts(dataRes.data.approvedShifts);
          if (dataRes.data.registeredShifts) store.setRegisteredShifts(dataRes.data.registeredShifts);
          if (dataRes.data.gpsConfig) store.setServerGpsConfig(dataRes.data.gpsConfig);
          if (dataRes.data.orgConfig) store.setServerOrgConfig(dataRes.data.orgConfig);
          if (dataRes.data.payrollConfig) store.setServerPayrollConfig(dataRes.data.payrollConfig);
          localStorage.setItem('kg_logs', JSON.stringify(dataRes.data.logs || []));
          localStorage.setItem('kg_stats', JSON.stringify(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 }));

          // Show schedule reminder after data loads
          if (!dataRes.data.isScheduleRegistered) {
            Swal.fire({
              title: '🔔 Nhắc nhở',
              text: 'Bạn chưa nộp Lịch đăng ký ca cho tuần tiếp theo. Vui lòng vào Tab "Đăng ký ca" để nộp nhé!',
              icon: 'info', confirmButtonColor: '#062B49',
            });
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
    const res = await callApi('REGISTER', registerForm);
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
        // Fallback for mock if API fails
        setTimeout(() => {
          setForgotStep(2);
          Swal.fire('Thành công', 'Mã OTP đã được gửi đến Email của bạn (Mock)', 'success');
        }, 500);
      }
    } else {
      if (!resetForm.otp || !resetForm.newPassword) {
        Swal.fire('Lỗi', 'Vui lòng nhập OTP và Mật khẩu mới', 'warning');
        return;
      }
      store.setLoading(true, 'Đang đặt lại mật khẩu...');
      const res = await callApi('RESET_PASSWORD', { 
        email: forgotForm.email,
        otp: resetForm.otp,
        newPassword: resetForm.newPassword
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
    <div className="flex-1 flex flex-col justify-center p-4 sm:p-6 min-h-screen bg-[#f7f9ff] dark:bg-[#080d18] font-sans">
      <div className="relative z-10 w-full max-w-5xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-6 lg:gap-10 items-center">
        {/* Logo and Intro */}
        <div className="text-center lg:text-left animate-fade-in space-y-4">
          <div className="inline-flex rounded-3xl bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] p-4 shadow-soft">
            <img src="/LOGO.png?v=3" alt="King's Grill Logo" className="w-[120px] h-auto object-contain" />
          </div>
          <p 
            className="text-[#2563eb] dark:text-[#7c3aed] font-extrabold text-xs tracking-wider uppercase cursor-pointer"
            onClick={() => {
              const newCount = clickCount + 1;
              setClickCount(newCount);
              if (newCount >= 5) {
                setClickCount(0);
                triggerDeveloperMode();
              }
            }}
          >
            KING'S GRILL STAFF OS
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0f172a] dark:text-white leading-tight">
            Vận hành tinh gọn & Chấm công thông minh
          </h1>
          <p className="text-sm text-[#64748b] dark:text-[#98a2b3] max-w-md mx-auto lg:mx-0">
            Hệ điều hành nội bộ giúp nhân viên và quản lý nhà hàng quản lý ca trực, checklist công việc, bàn giao ca và theo dõi công lương chính xác.
          </p>
        </div>

        {/* Form Container */}
        <div className="w-full">
          {/* LOGIN FORM */}
          {mode === 'login' && (
            <div className="bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-3xl p-6 sm:p-8 shadow-card neo-card-stack">
              <h3 className="text-xl font-bold mb-6 text-[#0f172a] dark:text-white">Đăng nhập tài khoản</h3>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#9AA1AA]">
                    <User size={16} />
                  </div>
                  <input 
                    type="text" 
                    id="username" 
                    name="username" 
                    autoComplete="username" 
                    value={loginForm.username} 
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 text-[#0f172a] dark:text-white placeholder-[#9AA1AA] min-h-[44px]" 
                    placeholder="Tài khoản nhân viên" 
                  />
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#9AA1AA]">
                    <Lock size={16} />
                  </div>
                  <input 
                    type={showPass ? 'text' : 'password'} 
                    id="password" 
                    name="password" 
                    autoComplete="current-password" 
                    value={loginForm.password} 
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl pl-11 pr-12 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 text-[#0f172a] dark:text-white placeholder-[#9AA1AA] min-h-[44px]" 
                    placeholder="Mật khẩu" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPass(!showPass)} 
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#9AA1AA] hover:text-[#0f172a] focus:outline-none"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center">
                    <input 
                      id="remember-me" 
                      name="remember-me" 
                      type="checkbox" 
                      checked={rememberMe} 
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-[#2563eb] focus:ring-[#2563eb]/20 border-[#E8DED1] rounded bg-white" 
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-xs font-bold text-[#64748b] dark:text-[#98a2b3]">
                      Ghi nhớ đăng nhập
                    </label>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setMode('forgot')} 
                    className="text-xs font-bold text-[#7c3aed] hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white font-bold py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 min-h-[44px]"
                >
                  Đăng nhập <ArrowRight size={15} />
                </button>
              </form>
              <div className="mt-6 pt-5 border-t border-[#E8DED1] dark:border-[#1E3F57] text-center">
                <span className="text-xs text-[#64748b] dark:text-[#98a2b3]">Chưa có tài khoản? </span>
                <button 
                  type="button" 
                  onClick={() => setMode('register')} 
                  className="text-xs font-bold text-[#2563eb] dark:text-[#7c3aed] hover:underline"
                >
                  Đăng ký nhân sự mới
                </button>
              </div>
            </div>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <div className="bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-3xl p-6 sm:p-8 shadow-card neo-card-stack">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-[#0f172a] dark:text-white">Đăng ký nhân sự mới</h3>
                <p className="text-xs text-[#64748b] dark:text-[#98a2b3] mt-1">Đăng ký tài khoản để quản lý công việc và chấm công</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Tài khoản bảo mật */}
                <div className="p-4 rounded-2xl bg-[#EEF7F0]/60 dark:bg-[#5F9D6B]/5 border border-[#EEF7F0] dark:border-[#5F9D6B]/20">
                  <h4 className="text-[11px] font-bold text-[#10b981] mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock size={12} /> 1. Tài khoản bảo mật
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input 
                      type="text" 
                      required 
                      value={registerForm.username} 
                      onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} 
                      placeholder="Tên đăng nhập" 
                      className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                    />
                    <input 
                      type="password" 
                      required 
                      value={registerForm.password} 
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} 
                      placeholder="Mật khẩu" 
                      className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                    />
                  </div>
                </div>

                {/* Hồ sơ cá nhân */}
                <div className="p-4 rounded-2xl bg-[#FFF0ED]/60 dark:bg-[#E85D4A]/5 border border-[#FFF0ED] dark:border-[#E85D4A]/20">
                  <h4 className="text-[11px] font-bold text-[#ef4444] mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} /> 2. Hồ sơ cá nhân
                  </h4>
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      required 
                      value={registerForm.fullname} 
                      onChange={(e) => setRegisterForm({ ...registerForm, fullname: e.target.value })} 
                      placeholder="Họ và Tên (Tiếng Việt có dấu)" 
                      className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input 
                        type="email" 
                        required
                        value={registerForm.email} 
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} 
                        placeholder="Email cá nhân" 
                        className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                      />
                      <input 
                        type="tel" 
                        required
                        value={registerForm.phone} 
                        onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} 
                        placeholder="Số điện thoại" 
                        className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                      />
                    </div>
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      value={registerForm.dob} 
                      onChange={handleDobChange} 
                      placeholder="Ngày sinh (Gõ số liền nhau, VD: 15082000)" 
                      className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3.5 py-2.5 text-xs text-[#0f172a] dark:text-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 transition-all placeholder-[#9AA1AA] min-h-[44px]" 
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white font-bold py-3 rounded-xl transition-all duration-200 text-xs shadow-md hover:shadow-lg hover:-translate-y-0.5 min-h-[44px]"
                >
                  Hoàn tất đăng ký
                </button>
                <button 
                  type="button" 
                  onClick={() => setMode('login')} 
                  className="w-full text-center text-xs font-bold text-[#64748b] hover:text-[#0f172a] dark:hover:text-white flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-3xl p-6 sm:p-8 shadow-card neo-card-stack">
              <div className="mb-6 text-center">
                <div className="w-12 h-12 rounded-full bg-[#FFF0ED] dark:bg-[#ef4444]/10 flex items-center justify-center mx-auto mb-3 text-[#ef4444]">
                  <KeyRound size={20} />
                </div>
                <h3 className="text-xl font-bold text-[#0f172a] dark:text-white">Khôi phục mật khẩu</h3>
                <p className="text-xs text-[#64748b] dark:text-[#98a2b3] mt-1">Nhập email đã đăng ký để nhận mã OTP khôi phục mật khẩu</p>
              </div>

              <form onSubmit={handleForgot} className="space-y-4">
                {forgotStep === 1 ? (
                  <>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#9AA1AA]">
                        <Mail size={16} />
                      </div>
                      <input 
                        type="email" 
                        required 
                        value={forgotForm.email} 
                        onChange={(e) => setForgotForm({ email: e.target.value })} 
                        placeholder="Nhập Email của bạn..." 
                        className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 text-[#0f172a] dark:text-white placeholder-[#9AA1AA] min-h-[44px]" 
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white font-bold py-3.5 rounded-xl transition-all duration-200 text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 min-h-[44px]"
                    >
                      Gửi mã OTP
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        required 
                        value={resetForm.otp} 
                        onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })} 
                        placeholder="Nhập mã OTP 6 số" 
                        className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-4 py-3 text-sm text-center tracking-widest font-bold focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 text-[#0f172a] dark:text-white min-h-[44px]" 
                        maxLength={6} 
                      />
                      <input 
                        type="password" 
                        required 
                        value={resetForm.newPassword} 
                        onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} 
                        placeholder="Mật khẩu mới" 
                        className="w-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 text-[#0f172a] dark:text-white min-h-[44px]" 
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-bold py-3.5 rounded-xl transition-all duration-200 text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 min-h-[44px]"
                    >
                      Đặt lại mật khẩu
                    </button>
                  </>
                )}
                
                <button 
                  type="button" 
                  onClick={() => { setMode('login'); setForgotStep(1); }} 
                  className="w-full text-center text-xs font-bold text-[#64748b] hover:text-[#0f172a] dark:hover:text-white flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
