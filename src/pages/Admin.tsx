import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, fetchWithRetry, computeWeekInfo, DAY_NAMES, ADMIN_SHIFT_OPTIONS, getAdminShiftClass } from '../utils/helpers';
import { sha256, ADMIN_PIN_HASH, MASTER_PIN_HASH, escapeHtml, checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '../utils/security';
import Swal from 'sweetalert2';
import { Lock, Key, CalendarCheck, RefreshCw, Inbox, CheckCheck, Wand2, Cpu, CloudUpload, Eye, Loader2, Users, KeyRound, ArrowLeftRight, ExternalLink } from 'lucide-react';

export default function Admin() {
  const store = useAppStore();
  const { isAdminUnlocked, adminSchedules, originalAdminSchedules, groqKeysInput, groqKeys, logs, users, isUpdating, swapRequests } = store;
  const weekInfo = computeWeekInfo();

  // Auto-populate groqKeysInput if empty
  useEffect(() => {
    if (store.groqKeys.length > 0 && !store.groqKeysInput) {
      store.setGroqKeysInput(store.groqKeys.join('\n'));
    }
  }, [store.groqKeys, store.groqKeysInput, store.setGroqKeysInput]);

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
      store.setGroqKeys(keyArray);
    } else { Swal.fire('Lỗi', 'Không thể đồng bộ Key lúc này', 'error'); }
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      {/* Groq AI Keys */}



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
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">Danh sách Groq API Keys (Llama 3.3)</label>
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-[10px] text-ocean-600 dark:text-ocean-400 hover:text-ocean-700 font-bold flex items-center bg-ocean-50 dark:bg-ocean-900/30 px-2 py-1 rounded-md transition-colors">
                Lấy Key miễn phí <ExternalLink size={10} className="ml-1" />
              </a>
            </div>
            <textarea value={groqKeysInput} onChange={(e) => store.setGroqKeysInput(e.target.value)} rows={5}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono text-gray-800 dark:text-white" placeholder={'gsk_...\ngsk_...'} />
          </div>
          <div className="pt-2">
            <button onClick={syncApiKeys} className="w-full bg-ocean-600 hover:bg-ocean-700 text-white font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center">
              <CloudUpload size={14} className="mr-1" /> Lưu & Đồng bộ
            </button>
          </div>
        </div>
      </div>


    </div>
  );
}
