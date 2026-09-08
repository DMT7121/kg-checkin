import { useState } from 'react';
import { useAppStore, LogEntry } from '../store/useAppStore';
import { openPreview } from '../components/ImagePreview';
import { speak, fetchWithRetry, auditCheckInAnomalies } from '../utils/helpers';
import { escapeHtml } from '../utils/security';
import { callApi } from '../services/api';
import { refreshAppData } from '../utils/refreshData';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import {
  CalendarCheck,
  ShieldCheck,
  FileSpreadsheet,
  Bot,
  PackageOpen,
  Image as ImageIcon,
  CircleCheck,
  CircleAlert,
  Loader2,
  Users,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { KgModuleHero, KgBottomSheet, KgButton, KgTextarea } from '../components/KgDesignSystem';

export default function ActivityHistory() {
  const { logs, stats, currentUser, isUpdating, groqKeys, users } = useAppStore();
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  // Audit anomalies for current user
  const anomalies = auditCheckInAnomalies(logs, currentUser);

  // Edit log modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [newTypeChoice, setNewTypeChoice] = useState<string>('Vào ca');
  const [editReason, setEditReason] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

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

  const handleOpenEdit = (log: LogEntry) => {
    setEditingLog(log);
    const isIn = log.type.includes('Vào ca') || log.type.includes('IN');
    setNewTypeChoice(isIn ? 'Ra ca' : 'Vào ca');
    setEditReason('');
    setEditModalOpen(true);
  };

  const handleConfirmEditType = async () => {
    if (!editingLog || !currentUser) return;
    setIsSubmittingEdit(true);
    try {
      const res = await callApi('UPDATE_CHECKIN_TYPE', {
        username: currentUser.username,
        fullname: editingLog.fullname,
        role: currentUser.role,
        rowIndex: editingLog.rowIndex,
        time: editingLog.time,
        originalType: editingLog.type,
        newType: newTypeChoice,
        reason: editReason || 'Nhân viên cập nhật loại chấm công'
      });

      if (res?.ok) {
        useAppStore.getState().updateLogType(editingLog.time, newTypeChoice, editReason);
        setEditModalOpen(false);
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        speak('Đã cập nhật loại chấm công thành công.');
        Swal.fire({
          icon: 'success',
          title: 'Đã cập nhật!',
          text: `Đã sửa thành "${newTypeChoice}" trên Bảng Chấm Công gốc.`,
          timer: 2000,
          showConfirmButton: false
        });
        refreshAppData(true);
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể cập nhật loại chấm công.', 'error');
      }
    } catch (err: any) {
      Swal.fire('Lỗi', err.message || 'Lỗi hệ thống khi cập nhật.', 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="history"
        title="Lịch sử Hoạt động"
        description="Theo dõi chi tiết lịch sử vào ca, ra ca và ghi nhận trạng thái chấm công của nhân sự."
        eyebrow="Nhật ký"
      />

      {/* Anomaly Detection Banner */}
      {anomalies.length > 0 && (
        <div className="bg-gradient-to-r from-rose-500/15 via-red-500/10 to-rose-500/15 border border-rose-500/30 rounded-2xl p-4 text-[var(--kg-text)] shadow-xs animate-fade-in space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
              <CircleAlert size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                ⚠️ Phát hiện nghi vấn chọn sai loại ({anomalies.length} lượt)
              </h4>
              <p className="text-xs font-bold text-[var(--kg-text)] mt-1">
                {anomalies[0].title}: {anomalies[0].message}
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] mt-1 leading-relaxed">
                Nếu bạn chọn nhầm loại, vui lòng bấm nút <span className="font-bold text-ocean-600 dark:text-ocean-400">✏️ Sửa loại</span> trên thẻ tương ứng bên dưới để đồng bộ lại dữ liệu chuẩn xác.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="soft3d-card p-4 rounded-2xl">
          <div className="flex items-center space-x-2 mb-2">
            <div className="p-1.5 bg-ocean-100 dark:bg-ocean-900 rounded-lg text-ocean-600 dark:text-ocean-300"><CalendarCheck size={16} /></div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tháng này</p>
          </div>
          <h4 className="text-3xl font-extrabold text-gray-800 dark:text-white">{stats.totalCheckIn} ca</h4>
        </div>
        <div className="soft3d-card p-4 rounded-2xl">
          <div className="flex items-center space-x-2 mb-2">
            <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded-lg text-green-600 dark:text-green-300"><ShieldCheck size={16} /></div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Hợp lệ</p>
          </div>
          <h4 className="text-3xl font-extrabold text-green-600 dark:text-green-400">{stats.validCount}</h4>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={openTimesheet} className="soft3d-card w-full !bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3.5 hover:shadow-md transition-all transform active:scale-95 flex items-center justify-center touch-manipulation border border-green-400 border-opacity-30 rounded-2xl text-xs sm:text-sm">
          <FileSpreadsheet size={18} className="mr-2" /> XEM SHEET ✔️CHẤM CÔNG GỐC
        </button>

        <button onClick={analyzeMyProductivity} className="soft3d-card w-full !bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold py-3.5 hover:shadow-md transition-all transform active:scale-95 flex items-center justify-center touch-manipulation border border-cyan-400 border-opacity-30 rounded-2xl text-xs sm:text-sm">
          <Bot size={18} className="mr-2" /> ✨ AI ĐÁNH GIÁ NĂNG SUẤT
        </button>
      </div>

      {/* Logs */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
          <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center">
            Nhật ký hoạt động
            {isUpdating && <Loader2 className="ml-2 text-ocean-500 animate-spin" size={16} />}
          </h3>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshAppData(true)}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition active:scale-95"
              title="Làm mới dữ liệu từ Google Sheets"
            >
              <RotateCcw size={14} className={isUpdating ? 'animate-spin' : ''} />
            </button>

            {isAdmin && (
              <div className="flex items-center space-x-2 paint-layer px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
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
        </div>

        {(() => {
          const displayLogs = isAdmin && selectedUser !== 'ALL' 
            ? logs.filter(l => l.fullname === selectedUser)
            : !isAdmin 
              ? logs.filter(l => l.fullname === currentUser?.fullname)
              : logs;

          if (displayLogs.length === 0) {
            return (
              <div className="text-center py-12 text-gray-400 paint-layer/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <PackageOpen size={48} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">Chưa có dữ liệu nào</p>
              </div>
            );
          }

          return displayLogs.map((log, idx) => {
            const isIn = log.type.includes('Vào ca') || log.type.includes('IN');
            const isValid = log.status?.includes('Hợp lệ') || log.status?.includes('HỢP LỆ') || log.status === 'Đồng bộ...';
            const logAnomaly = anomalies.find(a => a.logTime === log.time);
            const canEdit = isAdmin || (currentUser && log.fullname.toLowerCase() === currentUser.fullname.toLowerCase());

            return (
              <div
                key={idx}
                className={`group soft3d-card p-4 rounded-2xl hover:shadow-md transition-all relative overflow-hidden ${
                  logAnomaly ? 'border-2 border-rose-500/40 bg-rose-500/5' : ''
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isIn ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pl-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`font-black text-xs px-2.5 py-0.5 rounded-lg ${
                        isIn
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-500/20'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {log.type.toUpperCase()}
                      </span>

                      {log.isCorrected && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                          ✓ Đã sửa
                        </span>
                      )}

                      {logAnomaly && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle size={10} />
                          <span>Cần kiểm tra</span>
                        </span>
                      )}

                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{log.time}</span>
                    </div>

                    {isAdmin && (
                      <p className="text-xs font-bold text-[var(--kg-text)] mb-0.5">
                        {log.fullname}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <p className="flex items-center">
                        {isValid ? <CircleCheck size={12} className="mr-1 text-green-500 flex-shrink-0" /> : <CircleAlert size={12} className="mr-1 text-red-500 flex-shrink-0" />}
                        <span>{log.status}</span>
                      </p>
                      {log.distance && (
                        <span className="text-[11px] font-mono opacity-80">• {log.distance}</span>
                      )}
                      {log.location && log.location !== 'Khong xac dinh' && (
                        <span className="text-[11px] opacity-75 truncate max-w-[200px]" title={log.location}>• {log.location}</span>
                      )}
                    </div>

                    {log.note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1">
                        <CircleAlert size={11} className="mr-1 text-amber-500 flex-shrink-0" />
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{log.note}</span>
                      </p>
                    )}
                  </div>

                  {/* Actions right on card */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(log)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-ocean-500/10 hover:bg-ocean-500/20 text-ocean-600 dark:text-ocean-400 border border-ocean-500/20 text-xs font-black transition active:scale-95 touch-manipulation"
                        title="Sửa loại chấm công nếu bấm nhầm"
                      >
                        <Edit3 size={12} />
                        <span>Sửa loại</span>
                      </button>
                    )}

                    {log.image && (
                      <button
                        onClick={() => openPreview(log.image!)}
                        className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-ocean-600 dark:text-ocean-400 hover:bg-ocean-100 dark:hover:bg-ocean-900 transition touch-manipulation"
                        title="Xem ảnh minh chứng"
                      >
                        <ImageIcon size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Edit Check-in Type Bottom Sheet */}
      <KgBottomSheet
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="✏️ Sửa Loại Chấm Công"
      >
        {editingLog && (
          <div className="space-y-4 text-[var(--kg-text)]">
            {/* Info Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Nhân sự:</span>
                <span className="font-black text-[var(--kg-text)]">{editingLog.fullname}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Thời gian:</span>
                <span className="font-mono font-bold text-[var(--kg-text)]">{editingLog.time}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Loại hiện tại:</span>
                <span className="font-black px-2 py-0.5 rounded bg-slate-500/15 text-[var(--kg-text)]">
                  {editingLog.type}
                </span>
              </div>
            </div>

            {/* Select New Type */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Chọn loại chấm công chính xác:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Vào ca', label: 'Vào ca', desc: 'Bắt đầu ca làm việc' },
                  { id: 'Ra ca', label: 'Ra ca', desc: 'Kết thúc ca làm việc' },
                  { id: 'Vào ca 2', label: 'Vào ca 2', desc: 'Bắt đầu ca gãy / tăng ca' },
                  { id: 'Ra ca 2', label: 'Ra ca 2', desc: 'Kết thúc ca gãy' }
                ].map((item) => {
                  const isSelected = newTypeChoice === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNewTypeChoice(item.id)}
                      className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30 font-black'
                          : 'bg-[var(--kg-surface)] border-[var(--kg-border)] text-[var(--kg-text)] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black">{item.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-blue-500" />}
                      </div>
                      <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Reasons */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Lý do điều chỉnh nhanh:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Bấm nhầm khi về',
                  'Bấm nhầm khi đến',
                  'Chấm ca gãy nhầm nút',
                  'Bị cấn màn hình'
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setEditReason(reasonText)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                      editReason === reasonText
                        ? 'bg-ocean-500 text-white border-ocean-500'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Reason Textarea */}
            <KgTextarea
              label="Ghi chú chi tiết (lưu lên Google Sheets)"
              placeholder="Nhập lý do chọn nhầm loại chấm công..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={2}
            />

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] text-xs font-black hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
              >
                Hủy bỏ
              </button>

              <KgButton
                variant="primary"
                size="md"
                loading={isSubmittingEdit}
                onClick={handleConfirmEditType}
                className="flex-1 py-3 text-xs font-black"
                icon={CheckCircle2}
              >
                Xác Nhận Sửa
              </KgButton>
            </div>
          </div>
        )}
      </KgBottomSheet>
    </div>
  );
}

