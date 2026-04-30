import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { MessageSquareWarning, Send, EyeOff, CheckCircle2, User, Clock, AlertCircle, CornerDownRight, Mailbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Feedback() {
  const store = useAppStore();
  const { currentUser, feedbacks } = store;
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [category, setCategory] = useState('Góp ý hệ thống');
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
      
      if (res?.ok && res.data) {
        store.setFeedbacks(res.data);
      } else {
        // Mock data
        store.setFeedbacks([
          { id: 'FB_1', date: '29/04/2026', username: 'nguyenvana', fullname: 'Nguyễn Văn A', category: 'Khiếu nại lương/ca', content: 'Tháng này em bị tính thiếu 1 ca ngày 25/04.', isAnonymous: false, status: 'Pending', adminReply: '' },
          { id: 'FB_2', date: '28/04/2026', username: 'Anonymous', fullname: 'Ẩn danh', category: 'Thái độ đồng nghiệp', content: 'Khu vực bếp hôm qua có bạn B nói chuyện quá lớn tiếng ảnh hưởng khách.', isAnonymous: true, status: 'Reviewed', adminReply: 'Cảm ơn bạn đã phản ánh. Quản lý sẽ nhắc nhở bộ phận Bếp.' }
        ]);
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
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        category,
        content,
        isAnonymous
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Đã gửi góp ý thành công', 'success');
        setContent('');
        fetchFeedbacks();
      } else {
        setTimeout(() => {
          Swal.fire('Thành công', 'Đã gửi góp ý thành công (Mock)', 'success');
          setContent('');
        }, 1000);
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
        setTimeout(() => {
          Swal.fire('Thành công', 'Đã phản hồi (Mock)', 'success');
          setReplyContent('');
          setReplyingTo(null);
        }, 1000);
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 animate-fade-in relative pb-6">
      <div className="p-4 flex-none">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 mb-6">
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <MessageSquareWarning size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Góp ý & Khiếu nại</h2>
            </div>
            <p className="text-blue-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Lắng nghe ý kiến từ nhân sự.
            </p>
          </div>
          <div className="hidden md:block relative z-10 opacity-80">
            <Mailbox size={80} strokeWidth={1} />
          </div>
          {/* Background Decorations */}
          <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
          <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-blue-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
        </div>
      </div>

      <div className="px-4 relative z-20 flex-1 flex flex-col overflow-hidden space-y-4">
        
        {/* User Submit Form (Hide for Admin unless Admin wants to submit) */}
        {!isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 shrink-0">
            <h3 className="font-bold text-gray-800 dark:text-white mb-3 text-sm flex items-center">
              <Send size={16} className="mr-2 text-purple-500" /> Gửi phản hồi mới
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-gray-800 dark:text-white text-sm"
              >
                <option>Góp ý hệ thống</option>
                <option>Khiếu nại lương/ca</option>
                <option>Thái độ đồng nghiệp</option>
                <option>Khác</option>
              </select>

              <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nội dung chi tiết..."
                rows={3}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-gray-800 dark:text-white text-sm"
              ></textarea>

              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-600 rounded-full p-1 transition-colors duration-300 ease-in-out ${isAnonymous ? 'bg-purple-500' : ''}`}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${isAnonymous ? 'translate-x-4' : ''}`}></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={isAnonymous} onChange={() => setIsAnonymous(!isAnonymous)} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <EyeOff size={14} className="mr-1" /> Ẩn danh
                  </span>
                </label>

                <button type="submit" className="bg-purple-600 text-white font-semibold py-2 px-6 rounded-xl shadow-md hover:bg-purple-700 transition active:scale-95 text-sm">
                  Gửi đi
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Feedback List */}
        <div className="flex-1 overflow-y-auto pb-6 no-scrollbar space-y-3">
          <h3 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider ml-1">Lịch sử phản hồi</h3>
          
          {loading ? (
            <div className="flex justify-center py-4"><div className="animate-spin h-6 w-6 border-b-2 border-purple-500 rounded-full"></div></div>
          ) : displayFeedbacks.length === 0 ? (
            <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <AlertCircle size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">Chưa có phản hồi nào</p>
            </div>
          ) : (
            <AnimatePresence>
              {displayFeedbacks.map((fb, idx) => (
                <motion.div 
                  key={fb.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-full ${fb.isAnonymous ? 'bg-gray-100 text-gray-500 dark:bg-gray-700' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40'}`}>
                        {fb.isAnonymous ? <EyeOff size={14} /> : <User size={14} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-white">
                          {fb.isAnonymous ? 'Người dùng ẩn danh' : fb.fullname}
                        </p>
                        <p className="text-[10px] text-gray-400 flex items-center mt-0.5">
                          <Clock size={10} className="mr-1" /> {fb.date}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fb.status === 'Reviewed' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                      {fb.status === 'Reviewed' ? 'Đã xem xét' : 'Chờ xử lý'}
                    </span>
                  </div>
                  
                  <span className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-semibold px-2 py-0.5 rounded mb-2">
                    {fb.category}
                  </span>
                  
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{fb.content}</p>

                  {/* Admin Reply Section */}
                  {fb.adminReply ? (
                    <div className="mt-3 bg-purple-50 dark:bg-purple-900/10 border-l-2 border-purple-400 p-3 rounded-r-xl">
                      <p className="text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center mb-1">
                        <CornerDownRight size={12} className="mr-1" /> Phản hồi từ Quản lý:
                      </p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{fb.adminReply}</p>
                    </div>
                  ) : isAdmin ? (
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                      {replyingTo === fb.id ? (
                        <div className="space-y-2">
                          <textarea 
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Nhập phản hồi của bạn..."
                            className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                            rows={2}
                          ></textarea>
                          <div className="flex justify-end space-x-2">
                            <button onClick={() => setReplyingTo(null)} className="px-3 py-1 text-xs text-gray-500 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={() => handleReply(fb.id)} className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700">Gửi phản hồi</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReplyingTo(fb.id)} className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center hover:underline">
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
