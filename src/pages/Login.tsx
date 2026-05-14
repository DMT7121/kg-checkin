import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, computeWeekInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { User, Lock, Eye, EyeOff, ChevronLeft, ArrowRight, Fingerprint, Mail, Phone, Calendar, BadgeCheck, KeyRound } from 'lucide-react';
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
              icon: 'info', confirmButtonColor: '#0ea5e9',
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
    <div className="flex-1 flex flex-col justify-center p-4 sm:p-6 min-h-screen relative overflow-hidden soft3d-bg font-sans">

      <div className="relative z-10 w-full max-w-5xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-6 lg:gap-10 items-center">
      {/* Logo */}
      <div className="text-center lg:text-left animate-fade-in">
        <div className="inline-flex mb-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-lg">
          <img src="/LOGO.png?v=3" alt="King's Grill Logo" className="w-[150px] h-auto object-contain" />
        </div>
        <p 
          className="text-teal-700 dark:text-teal-300 font-bold text-sm tracking-wide cursor-pointer"
          onClick={() => {
            const newCount = clickCount + 1;
            setClickCount(newCount);
            if (newCount >= 5) {
              setClickCount(0);
              triggerDeveloperMode();
            }
          }}
        >
          KING'S GRILL OPERATIONS
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white leading-tight">
          Quản lý ca, chấm công và vận hành nhà hàng
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-md mx-auto lg:mx-0">
          Một giao diện tập trung cho nhân sự, lịch làm, checklist, bàn giao ca và công lương.
        </p>
      </div>

      {/* LOGIN FORM */}
      {mode === 'login' && (
        <div className="soft3d-card p-8 animate-slide-up w-full">
          <h3 className="text-2xl font-extrabold mb-6 text-center text-gray-800 dark:text-gray-100">Đăng Nhập</h3>
          <form onSubmit={handleLogin}>
            <div className="mb-5 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-ocean-500 transition-colors">
                <User size={16} />
              </div>
              <input type="text" id="username" name="username" autoComplete="username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full bg-gray-50 dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-11 pr-4 py-3.5 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 min-h-[44px] text-gray-800 dark:text-white transition-all placeholder-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" placeholder="Tài khoản" />
            </div>
            <div className="mb-4 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-ocean-500 transition-colors">
                <Lock size={16} />
              </div>
              <input type={showPass ? 'text' : 'password'} id="password" name="password" autoComplete="current-password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full bg-gray-50 dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-11 pr-12 py-3.5 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 min-h-[44px] text-gray-800 dark:text-white transition-all placeholder-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" placeholder="Mật khẩu" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none min-h-[44px] min-w-[44px]">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            
            <div className="mb-6 flex items-center">
              <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-ocean-600 focus:ring-ocean-500 border-gray-300 rounded soft3d-bg dark:border-gray-600" />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                Ghi nhớ đăng nhập
              </label>
            </div>

            <button type="submit" className="soft3d-btn-primary w-full font-bold py-3.5 min-h-[44px] flex items-center justify-center">
              ĐĂNG NHẬP <ArrowRight size={14} className="ml-2 opacity-80" />
            </button>
          </form>
          <div className="flex justify-between items-center mt-6 text-sm">
            <button type="button" onClick={() => setMode('forgot')} className="text-gray-500 hover:text-ocean-600 dark:hover:text-ocean-400 font-medium transition-colors">Quên mật khẩu?</button>
            <button type="button" onClick={() => setMode('register')} className="text-ocean-600 dark:text-ocean-400 font-bold hover:underline">Đăng ký mới</button>
          </div>
        </div>
      )}

      {/* REGISTER FORM */}
      {mode === 'register' && (
        <div className="soft3d-card p-6 md:p-8 animate-slide-up w-full">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">Tạo tài khoản mới</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gia nhập hệ thống King's Grill</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            {/* Section 1: Tài khoản bảo mật */}
            <div className="p-5 rounded-2xl border-2 border-green-100 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10 relative">
              <h4 className="text-[13px] font-bold text-green-700 dark:text-green-400 mb-4 flex items-center uppercase tracking-wide">
                <Lock size={14} className="mr-1.5" /> 1. Tài khoản bảo mật
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <User size={16} />
                  </div>
                  <input type="text" required value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} placeholder="Tên đăng nhập" className="w-full bg-white dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-9 pr-3 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm text-gray-800 dark:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all" />
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input type="password" required value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="Mật khẩu" className="w-full bg-white dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-9 pr-3 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 text-sm text-gray-800 dark:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all" />
                </div>
              </div>
            </div>

            {/* Section 2: Hồ sơ cá nhân */}
            <div className="p-5 rounded-2xl border-2 border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 relative">
              <h4 className="text-[13px] font-bold text-blue-700 dark:text-blue-400 mb-4 flex items-center uppercase tracking-wide">
                <User size={14} className="mr-1.5" /> 2. Hồ sơ cá nhân
              </h4>
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <BadgeCheck size={16} />
                  </div>
                  <input type="text" required value={registerForm.fullname} onChange={(e) => setRegisterForm({ ...registerForm, fullname: e.target.value })} placeholder="Họ và Tên" className="w-full bg-white dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-11 pr-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-gray-800 dark:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                      <Mail size={16} />
                    </div>
                    <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="Email cá nhân" className="w-full bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm text-gray-800 dark:text-white  transition-all" />
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                      <Phone size={16} />
                    </div>
                    <input type="tel" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} placeholder="SĐT / Zalo" className="w-full bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm text-gray-800 dark:text-white  transition-all" />
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <Calendar size={16} />
                  </div>
                  <input type="text" inputMode="numeric" value={registerForm.dob} onChange={handleDobChange} placeholder="Ngày sinh (Gõ số liền nhau, VD: 15082000)" className="w-full bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm text-gray-800 dark:text-white  tracking-widest font-medium transition-all" />
                </div>
              </div>
            </div>

            <button type="submit" className="soft3d-btn-primary w-full mt-2 font-bold py-3.5 min-h-[44px] flex items-center justify-center">
              HOÀN TẤT ĐĂNG KÝ
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full mt-4 text-gray-500 text-sm hover:text-gray-800 dark:hover:text-white font-medium flex items-center justify-center transition-colors">
              <ChevronLeft size={16} className="mr-1" /> Quay lại đăng nhập
            </button>
          </form>
        </div>
      )}

      {/* FORGOT PASSWORD FORM */}
      {mode === 'forgot' && (
        <div className="soft3d-card p-8 animate-slide-up w-full">
          <div className="text-center mb-6">
            <div className="w-12 h-12 paint-layer bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-3">
              <KeyRound size={24} className="text-orange-500" />
            </div>
            <h3 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">Khôi phục mật khẩu</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Nhập Email hoặc SĐT đã đăng ký để nhận mã OTP khôi phục</p>
          </div>

          <form onSubmit={handleForgot}>
            {forgotStep === 1 ? (
              <>
                <div className="relative group mb-6">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-orange-500 transition-colors">
                    <Mail size={16} />
                  </div>
                  <input type="email" required value={forgotForm.email} onChange={(e) => setForgotForm({ email: e.target.value })} placeholder="Nhập Email đã đăng ký..." className="w-full bg-gray-50 dark:bg-[#2a2a35] border border-gray-200 dark:border-gray-700 rounded-sm pl-11 pr-4 py-3.5 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 min-h-[44px] text-gray-800 dark:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" />
                </div>
                <button type="submit" className="soft3d-btn w-full font-bold py-3.5 min-h-[44px] flex items-center justify-center text-orange-600 dark:text-orange-400">
                  GỬI MÃ OTP
                </button>
              </>
            ) : (
              <>
                <div className="relative group mb-4">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-orange-500 transition-colors">
                    <KeyRound size={16} />
                  </div>
                  <input type="text" required value={resetForm.otp} onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })} placeholder="Nhập mã OTP 6 số" className="w-full soft3d-bg/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 min-h-[44px] text-gray-800 dark:text-white text-center tracking-widest font-bold" maxLength={6} />
                </div>
                <div className="relative group mb-6">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-orange-500 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input type="password" required value={resetForm.newPassword} onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} placeholder="Mật khẩu mới" className="w-full soft3d-bg/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 min-h-[44px] text-gray-800 dark:text-white" />
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-green-500/40 transition transform active:scale-95 min-h-[44px] flex items-center justify-center">
                  ĐẶT LẠI MẬT KHẨU
                </button>
              </>
            )}
            
            <button type="button" onClick={() => { setMode('login'); setForgotStep(1); }} className="w-full mt-4 text-gray-500 text-[1rem] hover:text-gray-800 dark:hover:text-white font-medium min-h-[44px] flex items-center justify-center transition-colors">
              <ChevronLeft size={16} className="mr-1" /> Quay lại
            </button>
          </form>
        </div>
      )}
      
      </div>
    </div>
  );
}
