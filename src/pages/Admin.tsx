import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, fetchWithRetry, computeWeekInfo, DAY_NAMES, ADMIN_SHIFT_OPTIONS, getAdminShiftClass } from '../utils/helpers';
import { sha256, ADMIN_PIN_HASH, MASTER_PIN_HASH, escapeHtml, checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '../utils/security';
import Swal from 'sweetalert2';
import { Lock, Key, CalendarCheck, RefreshCw, Inbox, CheckCheck, Wand2, Cpu, CloudUpload, Eye, Loader2, Users } from 'lucide-react';

export default function Admin() {
  const store = useAppStore();
  const { isAdminUnlocked, adminSchedules, originalAdminSchedules, groqKeysInput, groqKeys, logs, users, isUpdating } = store;
  const weekInfo = computeWeekInfo();

  // === UNLOCK (with rate limiting + hash comparison) ===
  const unlockAdmin = async () => {
    const rl = checkRateLimit();
    if (!rl.allowed) {
      Swal.fire('Tạm khóa', `Quá nhiều lần thử sai. Đợi ${rl.waitSeconds}s.`, 'error');
      return;
    }
    const { value: pin } = await Swal.fire({
      title: 'Xác thực', input: 'password', inputPlaceholder: 'Nhập mã PIN Admin',
      inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
      confirmButtonColor: '#006994', showCancelButton: true, cancelButtonText: 'Hủy',
    });
    if (!pin) return;
    const pinHash = await sha256(pin);
    if (pinHash === ADMIN_PIN_HASH) {
      resetFailedAttempts();
      store.setAdminUnlocked(true);
      speak('Xác thực quản trị viên thành công');
      Swal.fire({ icon: 'success', title: 'Đã mở khóa', timer: 1500, showConfirmButton: false });
    } else {
      recordFailedAttempt();
      speak('Mã PIN không hợp lệ');
      Swal.fire('Từ chối', 'Mã PIN không hợp lệ', 'error');
    }
  };

  // === LOAD SCHEDULES ===
  const loadAdminSchedules = async () => {
    store.setLoading(true, 'Đang kết nối Server...');
    const res = await callApi('GET_ALL_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel });
    store.setLoading(false);
    if (res?.ok) {
      const parsedSchedules = Array.isArray(res.data) ? res.data : (res.data.schedules || []);
      
      // Clean up previously appended notes so dropdowns map correctly
      const cleanSchedules = parsedSchedules.map((emp: any) => {
        const shifts: string[] = [];
        const shiftNotes: string[] = emp.shiftNotes || Array(7).fill('');
        
        (emp.shifts || []).forEach((s: string, idx: number) => {
          if (s && s.includes('\n')) {
            const parts = s.split('\n');
            shifts[idx] = parts[0].trim();
            if (!shiftNotes[idx]) {
               shiftNotes[idx] = parts.slice(1).join('\n').trim();
            }
          } else {
            shifts[idx] = s;
          }
        });

        return {
          ...emp,
          shifts,
          shiftNotes
        };
      });

      store.setAdminSchedules(cleanSchedules);
      store.setOriginalAdminSchedules(JSON.parse(JSON.stringify(cleanSchedules)));
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã tải dữ liệu lịch', showConfirmButton: false, timer: 2000 });
    } else if (res) {
      Swal.fire('Thông báo', res.message, 'info');
    }
  };

  // === TRACK CHANGES ===
  const trackScheduleChange = (empIndex: number, currentSchedules: any[]) => {
    const currentEmp = currentSchedules[empIndex];
    const origEmp = originalAdminSchedules[empIndex];
    const changes: string[] = [];
    for (let i = 0; i < 7; i++) {
      if (currentEmp.shifts[i] !== origEmp.shifts[i]) {
        changes.push(`Ngày ${weekInfo.weekDates[i]} (${origEmp.shifts[i] || 'Chưa ĐK'} ⮕ ${currentEmp.shifts[i]})`);
      }
    }
    const updated = [...currentSchedules];
    updated[empIndex] = { ...currentEmp, note: changes.length > 0 ? 'Điều chỉnh: ' + changes.join('; ') : '' };
    store.setAdminSchedules(updated);
  };

  const updateShift = (empIndex: number, dayIndex: number, value: string) => {
    const updated = [...adminSchedules];
    const emp = { ...updated[empIndex], shifts: [...updated[empIndex].shifts] };
    emp.shifts[dayIndex] = value;
    updated[empIndex] = emp;
    trackScheduleChange(empIndex, updated);
  };

  // === APPROVE ALL ===
  const approveAllSchedules = async () => {
    if (adminSchedules.length === 0) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Duyệt toàn bộ lịch?', text: 'Dữ liệu sẽ được chèn/ghi đè trực tiếp lên Google Sheets.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#16a34a', cancelButtonColor: '#6b7280', confirmButtonText: 'Đồng ý duyệt',
    });
    if (!isConfirmed) return;

    store.setLoading(true, 'Đang duyệt lịch...');
    
    // Format the payload so Google Sheet cells actually contain just the shift, and notes separately
    const finalSchedules = adminSchedules.map((emp, empIdx) => {
      const origEmp = originalAdminSchedules[empIdx];
      const newShifts = [...emp.shifts];
      const newNotes = [...(emp.shiftNotes || [])];
      for (let i = 0; i < 7; i++) {
        if (newShifts[i] && origEmp.shifts[i] !== newShifts[i]) {
          newNotes[i] = `Sửa từ ${origEmp.shifts[i] || 'Chưa ĐK'}`;
        }
      }
      return { ...emp, shifts: newShifts, shiftNotes: newNotes };
    });

    const res = await callApi('APPROVE_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel, schedules: finalSchedules, isFinal: true });
    store.setLoading(false);
    if (res?.ok) {
      Swal.fire('Thành công', res.message, 'success');
      // Reset original reference to current edited state so the UI considers them saved
      store.setOriginalAdminSchedules(JSON.parse(JSON.stringify(adminSchedules)));
      loadAdminSchedules(); // Fetch fresh to ensure sync
    } else {
      Swal.fire('Lỗi', 'Không thể duyệt lịch lúc này', 'error');
    }
  };

  // === GROQ AI ===
  const analyzeWithGroq = async () => {
    const apiKey = groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
    if (!apiKey) { Swal.fire('Cảnh báo', 'Hệ thống chưa được đồng bộ Groq API Key.', 'warning'); return; }
    if (logs.length === 0) { Swal.fire('Chú ý', 'Chưa có dữ liệu.', 'info'); return; }

    Swal.fire({ title: 'Groq đang chạy...', text: 'Chip LPU đang tổng hợp dữ liệu với Llama 3.3...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const todayLogs = logs.slice(0, 15).map((l) => `${l.fullname} - ${l.type} lúc ${l.time} - Trạng thái: ${l.status}`);
    const promptText = `Hãy xem danh sách hoạt động chấm công gần nhất và viết một tóm tắt siêu ngắn gọn (3-4 câu) để báo cáo tình hình. Danh sách: \n${todayLogs.join('\n')}`;

    try {
      const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Bạn là Trợ lý AI Quản lý nhân sự tiếng Việt. Trả lời chuyên nghiệp, súc tích, có dùng biểu tượng cảm xúc.' }, { role: 'user', content: promptText }], temperature: 0.5, max_tokens: 256 }),
      });
      const aiText = result.choices?.[0]?.message?.content || 'Không thể lấy phân tích từ Groq lúc này.';
      const safeText = escapeHtml(aiText);
      Swal.fire({ title: '✨ Phân Tích Groq AI', html: `<div class="text-left text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${safeText}</div>`, icon: 'success', confirmButtonColor: '#8b5cf6', confirmButtonText: 'Tuyệt vời!' });
      speak(aiText);
    } catch {
      speak('Lỗi kết nối Gờ rốc AI.');
      Swal.fire('Lỗi', 'Không thể kết nối đến Groq. Kiểm tra lại hạn mức API Key.', 'error');
    }
  };

  // === API KEY MANAGEMENT ===
  const syncApiKeys = async () => {
    const keyArray = groqKeysInput.split('\n').map((k) => k.trim()).filter(Boolean);
    if (keyArray.length === 0) { Swal.fire('Lỗi', 'Vui lòng nhập ít nhất 1 Key để đồng bộ', 'warning'); return; }
    store.setLoading(true, 'Đang đồng bộ...');
    const res = await callApi('SYNC_KEYS', { keys: keyArray });
    store.setLoading(false);
    if (res?.ok) {
      Swal.fire('Thành công', 'Đã lưu trữ hệ thống Key an toàn', 'success');
      store.setGroqKeysInput('');
      store.setGroqKeys(keyArray);
    } else { Swal.fire('Lỗi', 'Không thể đồng bộ Key lúc này', 'error'); }
  };

  const extractApiKeys = async () => {
    const rl = checkRateLimit();
    if (!rl.allowed) {
      Swal.fire('Tạm khóa', `Quá nhiều lần thử sai. Đợi ${rl.waitSeconds}s.`, 'error');
      return;
    }
    const { value: masterPin } = await Swal.fire({
      title: 'Trích xuất Key', text: 'Yêu cầu Mật mã riêng cấp 2', input: 'password',
      inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
      confirmButtonColor: '#dc2626', showCancelButton: true,
    });
    if (!masterPin) return;
    const pinHash = await sha256(masterPin);
    if (pinHash === MASTER_PIN_HASH) {
      resetFailedAttempts();
      store.setLoading(true, 'Đang trích xuất...');
      const res = await callApi('GET_KEYS', {});
      store.setLoading(false);
      if (res?.ok && res.data) {
        store.setGroqKeysInput(res.data.join('\n'));
        Swal.fire({ icon: 'success', title: 'Đã tải bộ Key', timer: 1500, showConfirmButton: false });
        setTimeout(() => store.setGroqKeysInput(''), 30000);
      } else { Swal.fire('Chú ý', 'Hệ thống hiện chưa lưu Key nào.', 'info'); }
    } else {
      recordFailedAttempt();
      Swal.fire('Cảnh báo bảo mật', 'Mật mã Master không chính xác!', 'error');
    }
  };

  // === LOCKED STATE ===
  if (!isAdminUnlocked) {
    return (
      <div className="p-4 animate-slide-up">
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-6">
            <Lock size={40} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Khu Vực Nội Bộ</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm px-4">Yêu cầu quyền truy cập cấp cao để vào bảng điều khiển quản trị viên.</p>
          <button onClick={unlockAdmin} className="bg-gray-800 dark:bg-gray-700 hover:bg-black dark:hover:bg-gray-600 text-white font-bold py-3.5 px-8 rounded-full transition shadow-lg flex items-center">
            <Key size={18} className="mr-2" /> Xác Thực Quản Trị Viên
          </button>
        </div>
      </div>
    );
  }

  // === UNLOCKED STATE ===
  return (
    <div className="p-4 space-y-4 animate-slide-up">
      {/* Schedule approval */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white">
            <CalendarCheck size={18} className="mr-2 text-ocean-600" /> Duyệt Lịch Làm Việc
          </h3>
          <button onClick={loadAdminSchedules} className="text-sm bg-ocean-100 text-ocean-700 dark:bg-ocean-900/50 dark:text-ocean-300 px-3 py-1.5 rounded-lg hover:bg-ocean-200 transition flex items-center">
            <RefreshCw size={14} className="mr-1" /> Tải lịch
          </button>
        </div>

        {adminSchedules.length > 0 ? (
          <>
            <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 mb-4">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-gray-200 dark:bg-gray-800 z-10 font-bold">Nhân Viên</th>
                    {DAY_NAMES.map((d) => (
                      <th key={d} className="px-2 py-3 text-center">{d.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}</th>
                    ))}
                    <th className="px-4 py-3">Lý do / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {adminSchedules.map((emp, empIdx) => (
                    <tr key={empIdx} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 font-medium text-gray-900 dark:text-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                        {emp.fullname}
                      </td>
                      {emp.shifts.map((shift, dayIdx) => {
                        const isChanged = originalAdminSchedules[empIdx]?.shifts[dayIdx] !== shift;
                        const hasNote = emp.shiftNotes && emp.shiftNotes[dayIdx];
                        const tooltipText = isChanged 
                          ? `Sửa từ ${originalAdminSchedules[empIdx]?.shifts[dayIdx] || 'Chưa ĐK'}` 
                          : (hasNote ? emp.shiftNotes[dayIdx] : '');
                          
                        return (
                          <td key={dayIdx} className="px-1 py-2 relative">
                            {isChanged && <div className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Đã thay đổi"></div>}
                            {!isChanged && hasNote && <div className="absolute top-0 right-0 w-2 h-2 bg-ocean-500 rounded-full" title={tooltipText}></div>}
                            <div className="relative group" title={tooltipText}>
                              <select value={shift || 'OFF'} onChange={(e) => updateShift(empIdx, dayIdx, e.target.value)}
                                className={`text-xs font-bold rounded-lg border focus:outline-none p-1.5 w-full cursor-pointer appearance-none text-center transition-all ${
                                  isChanged 
                                    ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900/50 shadow-md ' + getAdminShiftClass(shift)
                                    : 'border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-ocean-500 ' + getAdminShiftClass(shift)
                                }`}>
                                {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt} className="bg-white text-gray-800">{opt}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate" title={emp.reason || emp.note || ''}>
                        {!emp.hasApproved ? emp.reason : <span className="text-gray-500 font-medium italic">{emp.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={approveAllSchedules} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center touch-manipulation">
              <CheckCheck size={18} className="mr-2" /> DUYỆT TOÀN BỘ LỊCH
            </button>
          </>
        ) : (
          <div className="text-center py-6 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <Inbox size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Bấm "Tải lịch" để xem danh sách tuần tới</p>
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <button onClick={analyzeWithGroq} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-purple-500/50 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation border border-purple-400">
          <Wand2 size={20} className="mr-2" /> ✨ GROQ PHÂN TÍCH NHÂN SỰ
        </button>
      </div>

      {/* API Key Management */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Cpu size={18} className="mr-2 text-ocean-600" /> Quản lý Nguồn lực AI
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Danh sách Groq API Keys (Llama 3.3)</label>
            <textarea value={groqKeysInput} onChange={(e) => store.setGroqKeysInput(e.target.value)} rows={5}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono text-gray-800 dark:text-white" placeholder={'gsk_...\ngsk_...'} />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={syncApiKeys} className="bg-ocean-600 hover:bg-ocean-700 text-white font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center">
              <CloudUpload size={14} className="mr-1" /> Đồng bộ
            </button>
            <button onClick={extractApiKeys} className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center">
              <Eye size={14} className="mr-1" /> Trích xuất
            </button>
          </div>
        </div>
      </div>

      {/* Real-time users */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Users size={18} className="mr-2 text-ocean-600" /> Hôm nay (Real-time)
          {isUpdating && <Loader2 size={14} className="ml-2 text-ocean-500 animate-spin" />}
        </h3>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.username} className="flex items-center justify-between text-sm py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl min-h-[44px]">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-ocean-100 dark:bg-ocean-900 text-ocean-600 flex items-center justify-center font-bold text-xs mr-3">
                  {user.fullname.charAt(0)}
                </div>
                <span className="font-medium text-gray-800 dark:text-gray-200">{user.fullname}</span>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-300">Chờ cập nhật</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
