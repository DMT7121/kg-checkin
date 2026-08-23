import { useState, useEffect } from 'react';
import { Newspaper, Heart, MessageSquare, Send, Edit3, Loader2, Megaphone, Image as ImageIcon, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { fileToBase64, uploadImageToDrive } from '../utils/helpers';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';


export default function NewsFeed() {
  const { currentUser, news: posts, setNews: setPosts } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  
  // Image Upload state
  const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Lấy dữ liệu bài đăng thực tế khi mở tab và auto-refresh
  useEffect(() => {
    const fetchPosts = async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      const res = await callApi('GET_POSTS', {}, { background: isBackground });
      if (res?.ok && res.data) {
        setPosts(res.data);
      } else if (!isBackground) {
        // Fallback mock nếu chưa setup Backend (Trải nghiệm mượt mà)
        if (posts.length === 0) {
          setPosts([
            {
              id: 1, author: 'Hệ thống King Grill', role: 'System', time: 'Vừa xong',
              content: 'Chào mừng bạn đến với Bảng tin phiên bản Mới! Hiện tại chưa có dữ liệu từ máy chủ. Admin hãy đăng bài đầu tiên nhé!',
              likes: [], comments: []
            }
          ]);
        }
      }
      if (!isBackground) setLoading(false);
    };
    
    fetchPosts(false); // Initial load

    // Polling every 15 seconds for real-time feel
    const interval = setInterval(() => {
      fetchPosts(true);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const toggleLike = async (id: number) => {
    // Optimistic Update
    const currentUsername = currentUser?.username || 'Guest';
    let isLiking = true;
    
    setPosts(posts.map(p => {
      if (p.id === id) {
        const hasLiked = p.likes.includes(currentUsername);
        isLiking = !hasLiked;
        return { 
          ...p, 
          likes: hasLiked ? p.likes.filter(u => u !== currentUsername) : [...p.likes, currentUsername] 
        };
      }
      return p;
    }));

    // Gửi lên Backend ngầm
    callApi('INTERACT_POST', { postId: id, action: 'LIKE', username: currentUsername }, { background: true });
  };

  const handleAddComment = async (postId: number) => {
    if (!commentInput.trim()) return;
    const content = commentInput.trim();
    setCommentInput('');
    
    // Optimistic Update
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [...p.comments, {
            id: Date.now(),
            author: currentUser?.fullname || 'Bạn',
            content,
            time: 'Vừa xong'
          }]
        };
      }
      return p;
    }));
    
    // Gửi lên Backend ngầm
    callApi('INTERACT_POST', { 
      postId, 
      action: 'COMMENT', 
      author: currentUser?.fullname || 'Ẩn danh',
      content
    }, { background: true });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const base64 = await fileToBase64(file);
      setNewPostImagePreview(base64); // Show preview immediately

      // Upload in background
      const url = await uploadImageToDrive(base64, `newsfeed_${Date.now()}.webp`);
      if (url) {
        setNewPostImagePreview(url); // Replace preview with real URL
      } else {
        Swal.fire('Lỗi', 'Không thể tải ảnh lên. Vui lòng thử lại.', 'error');
        setNewPostImagePreview(null);
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Lỗi', 'Có lỗi xảy ra khi xử lý ảnh', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddPost = async () => {
    if (!newPostContent.trim() && !newPostImagePreview) return;
    setIsPosting(true);
    
    const content = newPostContent.trim();
    
    // Gọi API
    const res = await callApi('ADD_POST', {
      author: currentUser?.fullname || 'Admin',
      content,
      image: newPostImagePreview || ''
    });

    if (res?.ok) {
      setNewPostContent('');
      setNewPostImagePreview(null);
      // Tải lại bài đăng để lấy ID chuẩn từ DB
      const reloadRes = await callApi('GET_POSTS', {});
      if (reloadRes?.ok) setPosts(reloadRes.data);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã đăng bài lên Bảng tin', showConfirmButton: false, timer: 2000 });
    } else {
      Swal.fire('Lỗi', 'Không thể đăng bài. Vui lòng kiểm tra lại Google Apps Script!', 'error');
    }
    
    setIsPosting(false);
  };

  return (
    <div className="p-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="news"
        title="Bảng tin Nội bộ"
        description="Thông báo và tin tức quan trọng từ nhà hàng."
        eyebrow="Thông tin"
      />


      {/* Admin Post Box */}
      {currentUser?.role === 'admin' && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden mb-6 p-4 sm:p-5 shadow-xs space-y-3">
          <h3 className="font-black text-[var(--kg-text)] flex items-center text-xs sm:text-sm">
            <Edit3 size={16} className="mr-2 text-indigo-500" /> Tạo thông báo mới cho toàn quán
          </h3>
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            rows={3}
            placeholder="Bạn muốn thông báo điều gì cho toàn bộ nhân sự?"
            className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--kg-text)] resize-none"
          />

          {/* Image Preview */}
          {newPostImagePreview && (
            <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-[var(--kg-border)]">
              <img src={newPostImagePreview} alt="Preview" className="w-full h-full object-cover" />
              <button 
                type="button"
                onClick={() => setNewPostImagePreview(null)}
                className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition"
              >
                <X size={13} />
              </button>
              {uploadingImage && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-white" />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <label className="cursor-pointer text-indigo-500 hover:text-indigo-600 p-2 hover:bg-[var(--kg-surface-soft)] rounded-xl transition">
              <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploadingImage} />
              <ImageIcon size={20} />
            </label>
            <button 
              type="button"
              onClick={handleAddPost}
              disabled={isPosting || uploadingImage || (!newPostContent.trim() && !newPostImagePreview)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-2.5 px-5 rounded-xl transition-all shadow-md active:scale-95 flex items-center text-xs sm:text-sm disabled:opacity-50"
            >
              {isPosting ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Send size={15} className="mr-1.5" />}
              Đăng tin
            </button>
          </div>
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => {
            const hasLiked = post.likes.includes(currentUser?.username || 'Guest');
            
            return (
              <div key={post.id} className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden shadow-xs animate-fade-in">
                {/* Author */}
                <div className="p-3.5 sm:p-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm sm:text-base mr-3 border border-indigo-500/20 shrink-0">
                      {post.author.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-black text-[var(--kg-text)] text-xs sm:text-sm flex items-center">
                        {post.author} 
                        {(post.author === 'Admin' || post.role === 'Admin') && <span className="ml-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] px-2 py-0.5 rounded-full font-black border border-rose-500/20">ADMIN</span>}
                        {post.role === 'System' && <span className="ml-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] px-2 py-0.5 rounded-full font-black border border-blue-500/20">SYSTEM</span>}
                      </h4>
                      <p className="text-[10px] text-[var(--kg-text-muted)] font-medium mt-0.5">{post.time || 'Gần đây'}</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-3.5 sm:px-4 pb-3">
                  <p className="text-xs sm:text-sm text-[var(--kg-text)] leading-relaxed whitespace-pre-line font-medium">
                    {post.content}
                  </p>
                </div>

                {/* Image */}
                {post.image && (
                  <div className="w-full max-h-72 bg-[var(--kg-surface-soft)] overflow-hidden">
                    <img src={post.image} alt="Post cover" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Stats */}
                <div className="px-3.5 sm:px-4 py-2 flex justify-between text-[11px] text-[var(--kg-text-muted)] font-medium border-t border-[var(--kg-border)]/50">
                  <div className="flex items-center space-x-3 w-full">
                    <div className="flex items-center cursor-help">
                      <Heart size={13} className="mr-1 text-rose-500 fill-current" /> 
                      <span className="mr-1 font-bold">{post.likes.length}</span>
                      {post.likes.length > 0 && (
                        <span className="text-[10px] opacity-70 truncate max-w-[120px]">
                          ({post.likes.length <= 2 ? post.likes.join(', ') : `${post.likes[0]} và ${post.likes.length - 1} người khác`})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center ml-auto cursor-pointer hover:text-blue-500 font-bold" onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)}>
                      <MessageSquare size={13} className="mr-1 text-blue-500" /> {post.comments.length} bình luận
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex px-2 py-1 border-t border-[var(--kg-border)]">
                  <button 
                    type="button"
                    onClick={() => toggleLike(post.id)} 
                    className={`flex-1 flex justify-center items-center py-2 text-xs font-black rounded-xl transition-all active:scale-95 ${hasLiked ? 'text-rose-500 bg-rose-500/10' : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'}`}
                  >
                    <Heart size={15} className={`mr-1.5 ${hasLiked ? 'fill-current' : ''}`} /> {hasLiked ? 'Đã thích' : 'Thích'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)} 
                    className={`flex-1 flex justify-center items-center py-2 text-xs font-black rounded-xl transition-all active:scale-95 ${activeCommentPostId === post.id ? 'text-blue-600 bg-blue-500/10' : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'}`}
                  >
                    <MessageSquare size={15} className="mr-1.5" /> Bình luận
                  </button>
                </div>

                {/* Latest Comment Preview (if not expanded) */}
                {activeCommentPostId !== post.id && post.comments.length > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 bg-[var(--kg-surface-soft)]/50 cursor-pointer hover:bg-[var(--kg-surface-soft)] transition-colors border-t border-[var(--kg-border)]" onClick={() => setActiveCommentPostId(post.id)}>
                    <div className="flex space-x-2">
                      <div className="w-5 h-5 rounded-full bg-[var(--kg-border)] flex-shrink-0 flex items-center justify-center text-[9px] font-black text-[var(--kg-text)]">
                        {post.comments[post.comments.length - 1].author.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[var(--kg-text)] truncate">
                          <span className="font-bold mr-1">{post.comments[post.comments.length - 1].author}:</span>
                          {post.comments[post.comments.length - 1].content}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                {activeCommentPostId === post.id && (
                  <div className="bg-[var(--kg-surface-soft)]/40 p-3.5 sm:p-4 border-t border-[var(--kg-border)] space-y-3 animate-fade-in">
                    <div className="space-y-3 max-h-[250px] overflow-y-auto hide-scrollbar pr-1">
                      {post.comments.map(comment => (
                        <div key={comment.id} className="flex space-x-2">
                          <div className="w-7 h-7 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] flex-shrink-0 flex items-center justify-center text-xs font-black text-[var(--kg-text)]">
                            {comment.author.charAt(0)}
                          </div>
                          <div className="flex-1 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl rounded-tl-none p-2.5 shadow-2xs">
                            <h5 className="text-[11px] font-black text-[var(--kg-text)] mb-0.5">{comment.author}</h5>
                            <p className="text-xs text-[var(--kg-text)] font-medium leading-relaxed">{comment.content}</p>
                            <p className="text-[9px] text-[var(--kg-text-muted)] mt-1">{comment.time}</p>
                          </div>
                        </div>
                      ))}
                      {post.comments.length === 0 && (
                        <p className="text-xs text-center text-[var(--kg-text-muted)] py-2 font-medium">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                      )}
                    </div>
                    
                    {/* Add Comment Input */}
                    <div className="flex items-center space-x-2 pt-1">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex-shrink-0 flex items-center justify-center text-indigo-600 text-xs font-black">
                        {currentUser?.fullname.charAt(0) || 'U'}
                      </div>
                      <div className="flex-1 relative">
                        <input 
                          type="text" 
                          value={commentInput}
                          onChange={(e) => setCommentInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                          placeholder="Viết bình luận..." 
                          className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-full pl-3.5 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--kg-text)]"
                        />
                        <button 
                          type="button"
                          onClick={() => handleAddComment(post.id)}
                          disabled={!commentInput.trim()}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          <Send size={11} className="ml-0.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
