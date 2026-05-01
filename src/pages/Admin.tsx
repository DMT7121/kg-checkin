import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, fetchWithRetry, computeWeekInfo, DAY_NAMES, ADMIN_SHIFT_OPTIONS, getAdminShiftClass } from '../utils/helpers';
import { sha256, ADMIN_PIN_HASH, MASTER_PIN_HASH, escapeHtml, checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '../utils/security';
import Swal from 'sweetalert2';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert, KeyRound, ArrowLeftRight, ExternalLink } from 'lucide-react';
import { AIPrompt } from '../store/useAppStore';

export default function Admin() {
  const store = useAppStore();
  const { isAdminUnlocked, adminSchedules, originalAdminSchedules, groqKeysInput, groqKeys, aiPrompts, logs, users, isUpdating, swapRequests } = store;
  const weekInfo = computeWeekInfo();
  
  const [localPrompts, setLocalPrompts] = useState<AIPrompt[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);

  useEffect(() => {
    if (aiPrompts) {
      setLocalPrompts(aiPrompts);
    }
  }, [aiPrompts]);

  // Auto-populate groqKeysInput if empty
  useEffect(() => {
    if (store.groqKeys.length > 0 && !store.groqKeysInput) {
      store.setGroqKeysInput(store.groqKeys.map(k => k.key).join('\n'));
    }
  }, [store.groqKeys, store.groqKeysInput, store.setGroqKeysInput]);

  // === GROQ AI ===
  const analyzeWithGroq = async () => {
    const selectedKey = groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
    const apiKey = selectedKey ? selectedKey.key : null;
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
      const updatedKeys = keyArray.map((k, i) => ({ key: k, tag: 'Key ' + (i + 1), status: 'Active' }));
      store.setGroqKeys(updatedKeys);
    } else { Swal.fire('Lỗi', 'Không thể đồng bộ Key lúc này', 'error'); }
  const syncAiPrompts = async () => {
    store.setLoading(true, 'Đang lưu cấu hình Prompt...');
    const res = await callApi('UPDATE_AI_PROMPTS', { prompts: localPrompts, role: 'admin' });
    store.setLoading(false);
    if (res?.ok) {
      Swal.fire('Thành công', 'Đã lưu cấu hình AI Prompt', 'success');
      store.setAiPrompts(localPrompts);
    } else {
      Swal.fire('Lỗi', 'Không thể lưu cấu hình Prompt lúc này', 'error');
    }
  };

  const addPrompt = () => {
    const newPrompt: AIPrompt = {
      id: Date.now().toString(),
      name: 'Prompt mới',
      content: 'Bạn là trợ lý AI chuyên nghiệp...',
      isActive: false
    };
    setLocalPrompts([...localPrompts, newPrompt]);
    setEditingPromptId(newPrompt.id);
  };

  const updatePrompt = (id: string, field: keyof AIPrompt, value: any) => {
    setLocalPrompts(localPrompts.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePrompt = (id: string) => {
    setLocalPrompts(localPrompts.filter(p => p.id !== id));
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
            <textarea value={groqKeysInput} onChange={(e) => store.setGroqKeysInput(e.target.value)} rows={3}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono text-gray-800 dark:text-white mb-2" placeholder={'gsk_...\ngsk_...'} />
            
            {/* Tag Display */}
            {groqKeys.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {groqKeys.map((k, i) => (
                  <div key={i} className="flex items-center bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-md text-[10px] font-bold border border-green-200 dark:border-green-800/50 max-w-full">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse shrink-0"></span>
                    <span className="truncate">{k.tag}: {k.key}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-2">
            <button onClick={syncApiKeys} className="w-full bg-ocean-600 hover:bg-ocean-700 text-white font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center">
              <CloudUpload size={14} className="mr-1" /> Lưu & Đồng bộ
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white">
            <ShieldAlert size={18} className="mr-2 text-rose-500" /> Cấu hình System Prompts (AI)
          </h3>
          <button onClick={addPrompt} className="text-xs bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold px-3 py-1.5 rounded-lg flex items-center hover:bg-rose-100 transition-colors">
            <Plus size={14} className="mr-1" /> Thêm Prompt
          </button>
        </div>
        
        <div className="space-y-4">
          {localPrompts.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Chưa có System Prompt nào được cấu hình.</p>
              <button onClick={addPrompt} className="text-xs text-rose-500 font-bold hover:underline">Tạo prompt đầu tiên</button>
            </div>
          ) : (
            localPrompts.map((prompt) => (
              <div key={prompt.id} className={`p-4 rounded-xl border ${prompt.isActive ? 'border-rose-300 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-900/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'}`}>
                {editingPromptId === prompt.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tên Prompt</label>
                      <input 
                        value={prompt.name} 
                        onChange={(e) => updatePrompt(prompt.id, 'name', e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 text-gray-800 dark:text-white"
                        placeholder="VD: Trợ lý Nhân Sự"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nội dung (System Context)</label>
                      <textarea 
                        value={prompt.content} 
                        onChange={(e) => updatePrompt(prompt.id, 'content', e.target.value)}
                        rows={4}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-gray-800 dark:text-white"
                        placeholder="Bạn là chuyên gia nhân sự. Nhiệm vụ của bạn là..."
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={prompt.isActive}
                          onChange={(e) => updatePrompt(prompt.id, 'isActive', e.target.checked)}
                          className="w-4 h-4 text-rose-600 bg-gray-100 border-gray-300 rounded focus:ring-rose-500 dark:focus:ring-rose-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Kích hoạt sử dụng</span>
                      </label>
                      <button onClick={() => setEditingPromptId(null)} className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center transition">
                        <Check size={14} className="mr-1" /> Xong
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center">
                        <span className={`w-2 h-2 rounded-full mr-2 ${prompt.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                        <h4 className="font-bold text-gray-800 dark:text-white text-sm">{prompt.name}</h4>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => setEditingPromptId(prompt.id)} className="p-1.5 text-gray-500 hover:text-ocean-600 hover:bg-ocean-50 dark:hover:bg-ocean-900/30 rounded-md transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => removePrompt(prompt.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 italic">"{prompt.content}"</p>
                  </div>
                )}
              </div>
            ))
          )}
          
          {localPrompts.length > 0 && (
            <div className="pt-2">
              <button onClick={syncAiPrompts} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center">
                <CloudUpload size={14} className="mr-1" /> Lưu Cấu hình Prompts
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
