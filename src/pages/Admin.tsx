import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, fetchWithRetry, computeWeekInfo, DAY_NAMES, ADMIN_SHIFT_OPTIONS, getAdminShiftClass } from '../utils/helpers';
import { sha256, ADMIN_PIN_HASH, MASTER_PIN_HASH, escapeHtml, checkRateLimit, recordFailedAttempt, resetFailedAttempts } from '../utils/security';
import Swal from 'sweetalert2';
import { Lock, Key, CalendarCheck, RefreshCw, Inbox, CheckCheck, Wand2, Cpu, CloudUpload, Eye, Loader2, Users, KeyRound, ArrowLeftRight, ExternalLink, Plus, Trash2, Edit2, Check, X, ShieldAlert, Database, HardDrive } from 'lucide-react';
import { type AIPrompt } from '../store/useAppStore';
import { KgModuleHero } from '../components/KgDesignSystem';

interface EdgeDbStatus {
  ok: boolean;
  engine?: string;
  d1Bound?: boolean;
  kvBound?: boolean;
  region?: string;
  tables?: {
    edge_schedules?: number;
    edge_checkin_logs?: number;
    edge_kv_cache?: number;
    edge_sync_queue_pending?: number;
  };
  timestamp?: string;
}

export default function Admin() {
  const store = useAppStore(
    useShallow((s) => ({
      isAdminUnlocked: s.isAdminUnlocked,
      adminSchedules: s.adminSchedules,
      originalAdminSchedules: s.originalAdminSchedules,
      groqKeysInput: s.groqKeysInput,
      groqKeys: s.groqKeys,
      aiPrompts: s.aiPrompts,
      logs: s.logs,
      users: s.users,
      isUpdating: s.isUpdating,
      swapRequests: s.swapRequests,
      setGroqKeysInput: s.setGroqKeysInput,
      setLoading: s.setLoading,
      setGroqKeys: s.setGroqKeys,
      setAiPrompts: s.setAiPrompts,
    }))
  );
  const { isAdminUnlocked, adminSchedules, originalAdminSchedules, groqKeysInput, groqKeys, aiPrompts, logs, users, isUpdating, swapRequests } = store;
  const weekInfo = computeWeekInfo();
  
  const [localPrompts, setLocalPrompts] = useState<AIPrompt[]>(aiPrompts || []);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [edgeStatus, setEdgeStatus] = useState<EdgeDbStatus | null>(null);
  const [checkingEdge, setCheckingEdge] = useState(false);

  const loadEdgeDbStatus = async () => {
    setCheckingEdge(true);
    try {
      const res = await callApi('GET_EDGE_DB_STATUS', {}, { background: true, cacheTtlMs: 0 });
      if (res && typeof res === 'object') {
        setEdgeStatus(res);
      }
    } catch {
      // ignore
    } finally {
      setCheckingEdge(false);
    }
  };

  useEffect(() => {
    loadEdgeDbStatus();
  }, []);

  useEffect(() => {
    setLocalPrompts(aiPrompts || []);
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
  };

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
      <KgModuleHero
        moduleId="admin"
        title="AI & Tích Hợp"
        description="Quản lý khóa API, trợ lý AI, cơ sở dữ liệu Cloudflare D1 Edge và các cấu hình tự động hóa dùng chung."
        eyebrow="Hệ thống"
      />

      {/* Cloudflare D1 + KV Edge Database Status */}
      <div className="soft3d-card p-5 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/50">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b dark:border-gray-700 pb-2.5">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm sm:text-base">
            <Database size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
            Cơ sở dữ liệu Edge (Cloudflare D1 SQLite + KV + Google Sheets)
          </h3>
          <button
            type="button"
            onClick={loadEdgeDbStatus}
            disabled={checkingEdge}
            className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold px-3 py-1.5 rounded-lg flex items-center hover:bg-emerald-100 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={13} className={`mr-1.5 ${checkingEdge ? 'animate-spin' : ''}`} />
            Kiểm tra DB
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50">
            <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">D1 SQLite (APAC)</p>
            <p className="text-sm font-black text-emerald-800 dark:text-emerald-200 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${edgeStatus?.d1Bound ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {edgeStatus ? (edgeStatus.d1Bound ? 'Đang hoạt động' : 'Local / Fallback') : 'Đang kiểm tra...'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/50">
            <p className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400">Lịch ca trên Edge</p>
            <p className="text-base font-black text-sky-900 dark:text-sky-200 mt-0.5">
              {edgeStatus?.tables?.edge_schedules ?? 0} <span className="text-xs font-semibold">bản ghi</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50">
            <p className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400">Bộ đệm SWR (D1/KV)</p>
            <p className="text-base font-black text-indigo-900 dark:text-indigo-200 mt-0.5">
              {edgeStatus?.tables?.edge_kv_cache ?? 0} <span className="text-xs font-semibold">queries</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50">
            <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Hàng đợi đồng bộ Sheet</p>
            <p className="text-base font-black text-amber-900 dark:text-amber-200 mt-0.5">
              {edgeStatus?.tables?.edge_sync_queue_pending ?? 0} <span className="text-xs font-semibold">đang chờ</span>
            </p>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <HardDrive size={13} className="text-emerald-600 shrink-0" />
          <span>
            Kiến trúc <b>Write-Through + Read-Overlay</b>: Ghi tức thì vào Cloudflare D1 (&lt;15ms) chống nghẽn khi nhiều nhân viên gửi cùng lúc, tự động đồng bộ 100% về Google Sheets.
          </span>
        </p>
      </div>

      {/* Groq AI Keys */}



      {/* AI Analysis */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <button onClick={analyzeWithGroq} className="soft3d-card w-full !bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-4 hover: transition-all transform active:scale-95 flex items-center justify-center touch-manipulation border border-purple-400 border-opacity-30">
          <Wand2 size={20} className="mr-2" /> ✨ GROQ PHÂN TÍCH NHÂN SỰ
        </button>
      </div>

      {/* API Key Management */}
      <div className="soft3d-card p-5 rounded-2xl  ">
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
              className="w-full soft3d-bg border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono text-gray-800 dark:text-white mb-2" placeholder={'gsk_...\ngsk_...'} />
            
            {/* Tag Display */}
            {groqKeys.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {groqKeys.map((k, i) => {
                  const rawKey = typeof k === 'string' ? k : (k?.key || '');
                  const maskedKey = rawKey.length > 10 ? `${rawKey.slice(0, 6)}••••${rawKey.slice(-4)}` : '••••••••';
                  return (
                    <div key={i} className="flex items-center bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-md text-[10px] font-bold border border-green-200 dark:border-green-800/50 max-w-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse shrink-0"></span>
                      <span className="truncate">{k.tag || `Key ${i + 1}`}: {maskedKey}</span>
                    </div>
                  );
                })}
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

      <div className="soft3d-card p-5 rounded-2xl  ">
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
            <div className="text-center py-6 soft3d-bg/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
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
                        className="w-full soft3d-card border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 text-gray-800 dark:text-white"
                        placeholder="VD: Trợ lý Nhân Sự"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nội dung (System Context)</label>
                      <textarea 
                        value={prompt.content} 
                        onChange={(e) => updatePrompt(prompt.id, 'content', e.target.value)}
                        rows={4}
                        className="w-full soft3d-card border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-gray-800 dark:text-white"
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
