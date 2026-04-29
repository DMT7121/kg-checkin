import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, computeWeekInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { User, Lock, Eye, EyeOff, ChevronLeft, ArrowRight, Fingerprint, Mail, Phone, Calendar, BadgeCheck, KeyRound } from 'lucide-react';

export default function Login() {
  const store = useAppStore();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', fullname: '', dob: '', email: '', phone: '' });
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e?: React.FormEvent, bioCreds?: {username: string, password: string}) => {
    if (e) e.preventDefault();
    store.setLoading(true, 'Đang kết nối Server...');

    const payload = bioCreds || loginForm;
    const res = await callApi('LOGIN', payload);
    store.setLoading(false);

    if (res?.ok) {
      store.setCurrentUser(res.data);
      // Always persist session for 30 minutes
      localStorage.setItem('kg_user', JSON.stringify(res.data));
      localStorage.setItem('kg_session_time', Date.now().toString());

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

      // PROMPT BIOMETRICS
      if (window.PublicKeyCredential && !localStorage.getItem('kg_bio_auth')) {
        setTimeout(() => {
          Swal.fire({
            title: 'Bật Sinh Trắc Học?',
            text: 'Dùng FaceID / Vân tay cho các lần đăng nhập sau?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Bật ngay',
            cancelButtonText: 'Không, cảm ơn',
          }).then(async (result) => {
            if (result.isConfirmed) {
              try {
                await navigator.credentials.create({
                  publicKey: {
                    challenge: window.crypto.getRandomValues(new Uint8Array(32)),
                    rp: { name: "King's Grill", id: window.location.hostname },
                    user: {
                      id: window.crypto.getRandomValues(new Uint8Array(16)),
                      name: payload.username,
                      displayName: res.data.fullname,
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                    timeout: 60000,
                  }
                });
                localStorage.setItem('kg_bio_auth', btoa(JSON.stringify({ u: payload.username, p: payload.password })));
                Swal.fire('Thành công', 'Đã bật đăng nhập bằng sinh trắc học', 'success');
              } catch (e) {
                console.error(e);
              }
            }
          });
        }, 1500);
      }

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

  const handleBiometricLogin = async () => {
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: window.crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname,
          userVerification: "required",
        }
      });
      if (assertion) {
        const saved = localStorage.getItem('kg_bio_auth');
        if (saved) {
          const auth = JSON.parse(atob(saved));
          handleLogin(undefined, { username: auth.u, password: auth.p });
        }
      }
    } catch (e) {
      console.error(e);
      Swal.fire('Thất bại', 'Đăng nhập sinh trắc học bị hủy hoặc thất bại', 'error');
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
    if (!forgotForm.email) {
      Swal.fire('Lỗi', 'Vui lòng nhập Email hoặc Số điện thoại', 'warning');
      return;
    }
    store.setLoading(true, 'Đang gửi yêu cầu...');
    // Gọi API FORGOT_PASSWORD (Backend sẽ phát triển ở phase sau)
    setTimeout(() => {
      store.setLoading(false);
      Swal.fire({
        icon: 'success',
        title: 'Đã gửi yêu cầu',
        text: 'Mã xác nhận (OTP) đã được gửi đến Email của bạn. Tính năng đang trong giai đoạn thử nghiệm.',
        confirmButtonText: 'Đóng'
      });
      setMode('login');
      setForgotForm({ email: '' });
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 min-h-screen">
      {/* Logo */}
      <div className="text-center mb-8 animate-fade-in">
        <div className="inline-block mb-2 transform hover:scale-105 transition-transform duration-300">
          <img src="/LOGO.png?v=3" alt="King's Grill Logo" className="w-[160px] h-auto object-contain mx-auto drop-shadow-[0_0_12px_rgba(14,165,233,0.3)] dark:drop-shadow-[0_0_20px_rgba(14,165,233,0.5)]" />
        </div>
        <p className="text-ocean-600 dark:text-ocean-400 font-semibold text-sm tracking-wide">Hệ thống Chấm công v4.7</p>
      </div>

      {/* LOGIN FORM */}
      {mode === 'login' && (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100 dark:border-gray-700 animate-slide-up">
          <h3 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">Đăng Nhập</h3>
          <form onSubmit={handleLogin}>
            <div className="mb-5 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-ocean-500 transition-colors">
                <User size={16} />
              </div>
              <input type="text" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-ocean-500/50 min-h-[44px] text-gray-800 dark:text-white" placeholder="Tài khoản" />
            </div>
            <div className="mb-6 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-ocean-500 transition-colors">
                <Lock size={16} />
              </div>
              <input type={showPass ? 'text' : 'password'} value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-ocean-500/50 min-h-[44px] text-gray-800 dark:text-white" placeholder="Mật khẩu" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none min-h-[44px] min-w-[44px]">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="mb-6" />
            <button type="submit" className="w-full bg-gradient-to-r from-ocean-600 to-ocean-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-ocean-500/50 transition-all transform hover:-translate-y-0.5 active:scale-95 min-h-[44px] touch-manipulation flex items-center justify-center">
              ĐĂNG NHẬP <ArrowRight size={14} className="ml-2 opacity-80" />
            </button>
            {localStorage.getItem('kg_bio_auth') && (
              <button type="button" onClick={handleBiometricLogin} className="w-full mt-4 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all transform hover:-translate-y-0.5 active:scale-95 min-h-[44px] touch-manipulation flex items-center justify-center border border-gray-200 dark:border-gray-600">
                <Fingerprint size={18} className="mr-2 text-ocean-600 dark:text-ocean-400" /> FaceID / Vân tay
              </button>
            )}
          </form>
          <div className="flex justify-between items-center mt-6 text-sm">
            <button type="button" onClick={() => setMode('forgot')} className="text-gray-500 hover:text-ocean-600 dark:hover:text-ocean-400 font-medium transition-colors">Quên mật khẩu?</button>
            <button type="button" onClick={() => setMode('register')} className="text-ocean-600 dark:text-ocean-400 font-bold hover:underline">Đăng ký mới</button>
          </div>
        </div>
      )}

      {/* REGISTER FORM */}
      {mode === 'register' && (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 animate-slide-up w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <BadgeCheck size={24} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Tạo tài khoản</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Đăng ký nhanh để gia nhập hệ thống</p>
          </div>

          <form onSubmit={handleRegister}>
            <div className="space-y-4">
              {/* Row 1: Fullname */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                  <User size={16} />
                </div>
                <input type="text" required value={registerForm.fullname} onChange={(e) => setRegisterForm({ ...registerForm, fullname: e.target.value })} placeholder="Họ và Tên (VD: Nguyễn Văn A)" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 min-h-[44px] text-gray-800 dark:text-white" />
              </div>

              {/* Row 2: Username & Password in Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <User size={16} />
                  </div>
                  <input type="text" required value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} placeholder="Tài khoản" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 min-h-[44px] text-sm text-gray-800 dark:text-white" />
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <Lock size={16} />
                  </div>
                  <input type="password" required value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="Mật khẩu" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 min-h-[44px] text-sm text-gray-800 dark:text-white" />
                </div>
              </div>

              {/* Row 3: Email & Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <Mail size={16} />
                  </div>
                  <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="Email" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 min-h-[44px] text-sm text-gray-800 dark:text-white" />
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                    <Phone size={16} />
                  </div>
                  <input type="tel" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} placeholder="SĐT / Zalo" className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 min-h-[44px] text-sm text-gray-800 dark:text-white" />
                </div>
              </div>

              {/* Row 4: DOB */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-500 transition-colors">
                  <Calendar size={16} />
                </div>
                <input type="date" value={registerForm.dob} onChange={(e) => setRegisterForm({ ...registerForm, dob: e.target.value })} className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-green-500/50 text-gray-800 dark:text-white min-h-[44px]" />
              </div>
            </div>

            <button type="submit" className="w-full mt-8 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-green-500/40 transition transform active:scale-95 min-h-[44px] flex items-center justify-center">
              HOÀN TẤT ĐĂNG KÝ
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full mt-4 text-gray-500 text-[1rem] hover:text-gray-800 dark:hover:text-white font-medium min-h-[44px] flex items-center justify-center transition-colors">
              <ChevronLeft size={16} className="mr-1" /> Quay lại đăng nhập
            </button>
          </form>
        </div>
      )}

      {/* FORGOT PASSWORD FORM */}
      {mode === 'forgot' && (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 animate-slide-up w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <KeyRound size={24} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Khôi phục mật khẩu</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Nhập Email hoặc SĐT đã đăng ký để nhận mã OTP khôi phục</p>
          </div>

          <form onSubmit={handleForgot}>
            <div className="relative group mb-6">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-orange-500 transition-colors">
                <Mail size={16} />
              </div>
              <input type="text" required value={forgotForm.email} onChange={(e) => setForgotForm({ email: e.target.value })} placeholder="Email hoặc SĐT..." className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 min-h-[44px] text-gray-800 dark:text-white" />
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-orange-500/40 transition transform active:scale-95 min-h-[44px] flex items-center justify-center">
              GỬI MÃ OTP
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full mt-4 text-gray-500 text-[1rem] hover:text-gray-800 dark:hover:text-white font-medium min-h-[44px] flex items-center justify-center transition-colors">
              <ChevronLeft size={16} className="mr-1" /> Quay lại
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
