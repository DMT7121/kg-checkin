import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { openPreview } from '../components/ImagePreview';
import { speak, fetchWithRetry } from '../utils/helpers';
import { escapeHtml } from '../utils/security';
import Swal from 'sweetalert2';
import { CalendarCheck, ShieldCheck, FileSpreadsheet, Bot, PackageOpen, Image as ImageIcon, CircleCheck, CircleAlert, Loader2, Users, History, ListTree } from 'lucide-react';

export default function ActivityHistory() {
  const { logs, stats, currentUser, isUpdating, groqKeys, users } = useAppStore();
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  const openTimesheet = () => {
    Swal.fire({
      title: 'Hướng dẫn xem dữ liệu',
      html: '<p class="text-sm">Bạn sắp được chuyển đến Bảng dữ liệu gốc.</p><p class="text-sm font-bold text-ocean-600 mt-2">Vui lòng tìm và chọn sheet có tên <span class="bg-gray-100 px-2 py-1 rounded border border-gray-200">✔️CHẤM CÔNG</span> ở thanh công cụ phía dưới cùng để xem dữ liệu của mình nhé!</p>',
      icon: 'info', showCancelButton: true, confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280', confirmButtonText: 'Đã hiểu, tới Bảng tính', cancelButtonText: 'Đóng',
    }).then((result) => {
      if (result.isConfirmed) window.open('https://docs.google.com/spreadsheets/d/1UtDinbNZdOF8LRwxX1SlTKxUBFvr0UG6_iu7NyXDteY', '_blank');
    });
  };

  const analyzeMyProductivity = async () => {
    const apiKey = groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
    if (!apiKey) { Swal.fire('Cảnh báo', 'Hệ thống chưa đồng bộ Groq API Key.', 'warning'); return; }
    if (logs.length === 0) { Swal.fire('Chú ý', 'Bạn chưa có dữ liệu chấm công.', 'info'); return; }

    Swal.fire({ title: 'Llama 3.3 đang đánh giá...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const myLogs = logs.filter((l) => l.fullname === currentUser?.fullname).slice(0, 10).map((l) => `${l.type} lúc ${l.time} - Trạng thái: ${l.status}`);
    const promptText = `Đây là lịch sử đi làm của tôi (${currentUser?.fullname}): \n${myLogs.join('\n')}\nHãy đưa ra một lời nhận xét thật vui vẻ, tự nhiên và động viên tôi (chỉ khoảng 2-3 câu).`;

    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: "Bạn là một Quản lý nhân sự người Việt Nam vô cùng thân thiện, tâm lý và gần gũi của nhà hàng King's Grill. Hãy dùng từ ngữ khích lệ chuẩn văn phong người Việt, khen ngợi hoặc động viên nhân viên một cách tự nhiên nhất. Tuyệt đối không dùng từ ngữ dịch máy, cứng nhắc." },
        { role: 'user', content: promptText },
      ],
      temperature: 0.6, max_tokens: 150,
    };

    try {
      const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload),
      });
      const aiText = result.choices?.[0]?.message?.content || 'Không thể phân tích lúc này.';
      const safeText = escapeHtml(aiText);
      Swal.fire({ title: '✨ Lời Khuyên Quản Lý AI', html: `<div class="text-left text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${safeText}</div>`, icon: 'info', confirmButtonColor: '#0ea5e9', confirmButtonText: 'Cảm ơn AI!' });
      speak(aiText);
    } catch {
      speak('Lỗi kết nối Gờ rốc AI.');
      Swal.fire('Lỗi', 'Lỗi kết nối Groq AI. Vui lòng thử lại sau.', 'error');
    }
  };

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-600 via-gray-600 to-zinc-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <History size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Lịch sử Hoạt động</h2>
          </div>
          <p className="text-gray-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Theo dõi chi tiết mọi thay đổi trên hệ thống.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <ListTree size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-gray-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-2">
            <div className="p-1.5 bg-ocean-100 dark:bg-ocean-900 rounded-lg text-ocean-600 dark:text-ocean-300"><CalendarCheck size={16} /></div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tháng này</p>
          </div>
          <h4 className="text-3xl font-extrabold text-gray-800 dark:text-white">{stats.totalCheckIn} ca</h4>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-2">
            <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded-lg text-green-600 dark:text-green-300"><ShieldCheck size={16} /></div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Hợp lệ</p>
          </div>
          <h4 className="text-3xl font-extrabold text-green-600 dark:text-green-400">{stats.validCount}</h4>
        </div>
      </div>

      {/* Action buttons */}
      <button onClick={openTimesheet} className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-green-500/50 transition-all transform active:scale-95 flex items-center justify-center mb-2 touch-manipulation border border-green-400">
        <FileSpreadsheet size={20} className="mr-2" /> XEM BẢNG CHẤM CÔNG GỐC
      </button>

      <button onClick={analyzeMyProductivity} className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-cyan-500/50 transition-all transform active:scale-95 flex items-center justify-center mb-2 touch-manipulation border border-cyan-400">
        <Bot size={20} className="mr-2" /> ✨ AI ĐÁNH GIÁ NĂNG SUẤT
      </button>

      {/* Logs */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
          <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center">
            Nhật ký hoạt động
            {isUpdating && <Loader2 className="ml-2 text-ocean-500 animate-spin" size={16} />}
          </h3>
          
          {isAdmin && (
            <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
              <Users size={14} className="text-gray-500" />
              <select 
                value={selectedUser} 
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-transparent text-sm font-medium focus:outline-none text-gray-700 dark:text-gray-300 w-full sm:w-auto"
              >
                <option value="ALL">Tất cả nhân sự</option>
                {users.map(u => (
                  <option key={u.username} value={u.fullname}>{u.fullname}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {(() => {
          const displayLogs = isAdmin && selectedUser !== 'ALL' 
            ? logs.filter(l => l.fullname === selectedUser)
            : !isAdmin 
              ? logs.filter(l => l.fullname === currentUser?.fullname)
              : logs;

          if (displayLogs.length === 0) {
            return (
              <div className="text-center py-12 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <PackageOpen size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">Chưa có dữ liệu nào</p>
              </div>
            );
          }

          return displayLogs.map((log, idx) => {
            const isIn = log.type === 'Vào ca' || log.type === 'IN';
            const isValid = log.status?.includes('Hợp lệ') || log.status?.includes('HỢP LỆ') || log.status === 'Đồng bộ...';
            return (
              <div key={idx} className="group bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isIn ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className="flex justify-between items-center pl-3">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`font-extrabold text-sm px-2 py-0.5 rounded ${isIn ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {isIn ? 'VÀO CA' : 'RA CA'}
                      </span>
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{log.time}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      {isValid ? <CircleCheck size={10} className="mr-1 text-green-500" /> : <CircleAlert size={10} className="mr-1 text-red-500" />}
                      <span>{log.status}</span>
                    </p>
                    {log.note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1">
                        <CircleAlert size={10} className="mr-1 text-orange-500" />
                        <span className="text-orange-500 font-medium">{log.note}</span>
                      </p>
                    )}
                  </div>
                  {log.image && (
                    <button onClick={() => openPreview(log.image!)} className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-ocean-600 dark:text-ocean-400 hover:bg-ocean-100 dark:hover:bg-ocean-900 transition touch-manipulation">
                      <ImageIcon size={20} />
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
