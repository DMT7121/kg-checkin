import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { MessageSquareWarning, Send, EyeOff, CheckCircle2, User, Clock, AlertCircle, CornerDownRight, Mailbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';


export default function Feedback() {
  const currentUser = useAppStore((s) => s.currentUser);
  const feedbacks = useAppStore((s) => s.feedbacks);
  const setFeedbacks = useAppStore((s) => s.setFeedbacks);
  const setUpdating = useAppStore((s) => s.setUpdating);
  const setGlobalLoading = useAppStore((s) => s.setLoading);
  const store = { setFeedbacks, setUpdating, setLoading: setGlobalLoading };
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [category, setCategory] = useState('Góp ý cải tiến quy trình');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Admin reply states
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await callApi('GET_FEEDBACKS', { 
        username: currentUser?.username,
        role: currentUser?.role
      }, { background: true });
      
      if (res?.ok && Array.isArray(res.data)) {
        store.setFeedbacks(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập nội dung', 'warning');
      return;
    }

    store.setUpdating(true);
    store.setLoading(true, 'Đang gửi góp ý...');
    try {
      const res = await callApi('SUBMIT_FEEDBACK', {
        username: isAnonymous ? 'Anonymous' : currentUser?.username,
        fullname: isAnonymous ? 'Ẩn danh' : currentUser?.fullname,
        category,
        content,
        isAnonymous
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Đã gửi góp ý thành công', 'success');
        setContent('');
        fetchFeedbacks();
      } else {
        Swal.fire('Không thể gửi góp ý', res?.message || 'Máy chủ đang bận hoặc mất kết nối. Nội dung của bạn vẫn được giữ nguyên, vui lòng thử lại.', 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể gửi góp ý', 'error');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  const handleReply = async (feedbackId: string) => {
    if (!replyContent.trim()) return;
    
    store.setUpdating(true);
    store.setLoading(true, 'Đang gửi phản hồi...');
    try {
      const res = await callApi('REPLY_FEEDBACK', {
        feedbackId,
        reply: replyContent
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Đã phản hồi thành công', 'success');
        setReplyContent('');
        setReplyingTo(null);
        fetchFeedbacks();
      } else {
        Swal.fire('Không thể gửi phản hồi', res?.message || 'Máy chủ đang bận hoặc mất kết nối. Vui lòng thử lại.', 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể gửi phản hồi', 'error');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  // Filter feedback for normal user: only see their own or anonymous ones they created
  // Since backend handles filtering, here we just show what is in store.feedbacks
  const displayFeedbacks = feedbacks;

  return (
    <div className="h-full flex flex-col space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="feedback"
        title="Góp Ý & Khiếu Nại"
        description="Lắng nghe ý kiến đóng góp, đề xuất và thắc mắc của nhân sự với bảo mật tuyệt đối."
        eyebrow="Khảo sát"
        features={['Tuỳ chọn ẩn danh 100%', 'Gửi thẳng Quản lý', 'Theo dõi phản hồi']}
        tipTitle="Chính sách Góp ý & Khiếu nại Nội bộ"
        tips={[
          "Mọi ý kiến đóng góp nhằm cải thiện quy trình, vệ sinh, không khí làm việc đều được trân trọng.",
          "Chế độ 'Gửi ẩn danh' đảm bảo tuyệt đối không lưu lại danh tính hay tài khoản của người gửi.",
          "Ban Quản lý cam kết phản hồi công khai hoặc xử lý thỏa đáng trong vòng 24 - 48 giờ làm việc."
        ]}
      />

      <div className="relative z-20 flex-1 flex flex-col space-y-4">
        
        {/* User Submit Form (Hide for Admin unless Admin wants to submit) */}
        {!isAdmin && (
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs shrink-0 space-y-3">
            <h3 className="font-black text-[var(--kg-text)] text-xs sm:text-sm flex items-center">
              <Send size={15} className="mr-2 text-[var(--kg-primary)]" /> Gửi phản hồi / kiến nghị mới
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="feedback-category" className="block text-[11px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-1">
                  Nhóm nội dung
                </label>
                <select 
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] text-xs sm:text-sm font-medium"
                >
                  <option>Góp ý cải tiến quy trình</option>
                  <option>Khiếu nại ca làm / lương thưởng</option>
                  <option>Cơ sở vật chất / công cụ làm việc</option>
                  <option>Khác</option>
                </select>
              </div>

              <div>
                <label htmlFor="feedback-content" className="block text-[11px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-1">
                  Chi tiết góp ý / kiến nghị
                </label>
                <textarea 
                  id="feedback-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Nhập nội dung chi tiết..."
                  rows={3}
                  className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <div className={`w-9 h-5 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-0.5 transition-colors duration-200 ${isAnonymous ? '!bg-[var(--kg-primary)]' : ''}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${isAnonymous ? 'translate-x-4' : ''}`}></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={isAnonymous} onChange={() => setIsAnonymous(!isAnonymous)} />
                  <span className="text-xs font-bold text-[var(--kg-text)] flex items-center">
                    <EyeOff size={13} className="mr-1 text-[var(--kg-text-muted)]" /> Ẩn danh
                  </span>
                </label>

                <button 
                  type="submit" 
                  className="bg-[var(--kg-primary)] hover:brightness-110 text-white font-black py-2.5 px-5 rounded-xl shadow-xs transition-all active:scale-98 text-xs sm:text-sm"
                >
                  Gửi phản hồi
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Feedback List */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
          <h3 className="font-black text-[var(--kg-text-muted)] text-[11px] uppercase tracking-wider pl-1">Lịch sử phản hồi</h3>
          
          {loading ? (
            <div className="flex justify-center py-6"><div className="animate-spin h-6 w-6 border-2 border-[var(--kg-primary)] border-t-transparent rounded-full"></div></div>
          ) : displayFeedbacks.length === 0 ? (
            <div className="text-center py-8 bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)] rounded-2xl">
              <AlertCircle size={28} className="mx-auto text-[var(--kg-text-muted)] opacity-40 mb-2" />
              <p className="text-xs font-bold text-[var(--kg-text-muted)]">Chưa có phản hồi nào</p>
            </div>
          ) : (
            <AnimatePresence>
              {displayFeedbacks.map((fb, idx) => (
                <motion.div 
                  key={fb.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs space-y-2.5"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-xl ${fb.isAnonymous ? 'bg-gray-100 text-gray-500 dark:bg-gray-800' : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary)]'}`}>
                        {fb.isAnonymous ? <EyeOff size={14} /> : <User size={14} />}
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
                          {fb.isAnonymous ? 'Người dùng ẩn danh' : fb.fullname}
                        </p>
                        <p className="text-[10px] text-[var(--kg-text-muted)] flex items-center mt-0.5 font-medium font-mono tabular-nums">
                          <Clock size={10} className="mr-1" /> {fb.date}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${fb.status === 'Reviewed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'}`}>
                      {fb.status === 'Reviewed' ? 'Đã xem xét' : 'Chờ phản hồi'}
                    </span>
                  </div>
                  
                  <span className="inline-block bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                    {fb.category}
                  </span>
                  
                  <p className="text-xs sm:text-sm text-[var(--kg-text)] font-medium leading-relaxed whitespace-pre-wrap">{fb.content}</p>

                  {/* Admin Reply Section */}
                  {fb.adminReply ? (
                    <div className="mt-3 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3 rounded-xl">
                      <p className="text-xs font-bold text-[var(--kg-primary)] flex items-center mb-1">
                        <CornerDownRight size={12} className="mr-1" /> Phản hồi từ Quản lý:
                      </p>
                      <p className="text-sm text-[var(--kg-text)] whitespace-pre-wrap">{fb.adminReply}</p>
                    </div>
                  ) : isAdmin ? (
                    <div className="mt-4 pt-3 border-t border-[var(--kg-border)]">
                      {replyingTo === fb.id ? (
                        <div className="space-y-2">
                          <textarea 
                            aria-label="Nhập phản hồi của Quản lý"
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Nhập phản hồi của bạn..."
                            className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]"
                            rows={2}
                          ></textarea>
                          <div className="flex justify-end space-x-2">
                            <button type="button" onClick={() => setReplyingTo(null)} className="px-3 py-1.5 text-xs text-[var(--kg-text-muted)] font-bold hover:bg-[var(--kg-surface-soft)] rounded-lg">Hủy</button>
                            <button type="button" onClick={() => handleReply(fb.id)} className="px-3.5 py-1.5 bg-[var(--kg-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90">Gửi phản hồi</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setReplyingTo(fb.id)} className="text-xs font-bold text-[var(--kg-primary)] flex items-center hover:underline">
                          <CornerDownRight size={14} className="mr-1" /> Nhập phản hồi
                        </button>
                      )}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
