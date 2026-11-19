import { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, MessageSquare, Send, Edit3, Loader2, Image as ImageIcon, X, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { kgToast, type FeedbackTone } from '../store/useFeedbackStore';
import { callApi } from '../services/api';
import { fileToBase64, uploadImageToDrive } from '../utils/helpers';
import {
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
} from '../components/KgDesignSystem';

export default function NewsFeed() {
  const currentUser = useAppStore((s) => s.currentUser);
  const posts = useAppStore((s) => s.news);
  const setPosts = useAppStore((s) => s.setNews);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [newPostContent, setNewPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // Image Upload state
  const [newPostImagePreview, setNewPostImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const pushToast = useCallback((message: string, tone: FeedbackTone) => {
    kgToast(message, tone);
  }, []);

  const fetchPosts = useCallback(
    async (isBackground = false) => {
      if (isBackground) {
        const isDocumentVisible =
          typeof document === 'undefined' || document.visibilityState === 'visible';
        const isContainerVisible =
          !containerRef.current || containerRef.current.offsetParent !== null;
        if (!isDocumentVisible || !isContainerVisible) {
          return;
        }
      }
      if (!isBackground) {
        setLoading(true);
        setLoadError('');
      }
      try {
        const res = await callApi('GET_POSTS', {}, { background: isBackground });
        if (res?.ok && Array.isArray(res.data)) {
          setPosts(res.data);
        } else if (!isBackground && useAppStore.getState().news.length === 0) {
          setLoadError(res?.message || 'Không thể tải bảng tin từ máy chủ.');
        }
      } catch {
        if (!isBackground && useAppStore.getState().news.length === 0) {
          setLoadError('Lỗi kết nối máy chủ khi tải bảng tin.');
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [setPosts],
  );

  useEffect(() => {
    void fetchPosts(false);
    const interval = setInterval(() => {
      void fetchPosts(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  const toggleLike = async (id: number) => {
    const currentUsername = currentUser?.username || 'Guest';
    const prevPosts = useAppStore.getState().news;

    setPosts(
      prevPosts.map((p) => {
        if (p.id === id) {
          const hasLiked = p.likes.includes(currentUsername);
          return {
            ...p,
            likes: hasLiked ? p.likes.filter((u) => u !== currentUsername) : [...p.likes, currentUsername],
          };
        }
        return p;
      }),
    );

    try {
      const res = await callApi(
        'INTERACT_POST',
        { postId: id, subAction: 'LIKE', username: currentUsername },
        { background: true },
      );
      if (!res?.ok) {
        setPosts(prevPosts);
        pushToast(res?.message || 'Không thể lưu lượt thích. Đã hoàn tác.', 'error');
      }
    } catch {
      setPosts(prevPosts);
      pushToast('Lỗi kết nối khi thả tim bài viết. Đã hoàn tác.', 'error');
    }
  };

  const handleAddComment = async (postId: number) => {
    const raw = commentInputs[postId] || '';
    if (!raw.trim()) return;
    const content = raw.trim();
    const prevPosts = useAppStore.getState().news;

    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    setPosts(
      prevPosts.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            comments: [
              ...p.comments,
              {
                id: Date.now(),
                author: currentUser?.fullname || 'Bạn',
                content,
                time: 'Vừa xong',
              },
            ],
          };
        }
        return p;
      }),
    );

    try {
      const res = await callApi(
        'INTERACT_POST',
        {
          postId,
          subAction: 'COMMENT',
          author: currentUser?.fullname || 'Ẩn danh',
          content,
        },
        { background: true },
      );
      if (!res?.ok) {
        setPosts(prevPosts);
        setCommentInputs((prev) => ({ ...prev, [postId]: content }));
        pushToast(res?.message || 'Không thể gửi bình luận. Vui lòng thử lại.', 'error');
      }
    } catch {
      setPosts(prevPosts);
      setCommentInputs((prev) => ({ ...prev, [postId]: content }));
      pushToast('Lỗi kết nối khi gửi bình luận. Nội dung đã được giữ lại.', 'error');
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const base64 = await fileToBase64(file);
      setNewPostImagePreview(base64);

      const url = await uploadImageToDrive(base64, `newsfeed_${Date.now()}.webp`);
      if (url) {
        setNewPostImagePreview(url);
      } else {
        pushToast('Không thể tải ảnh lên. Vui lòng thử lại.', 'error');
        setNewPostImagePreview(null);
      }
    } catch {
      pushToast('Có lỗi xảy ra khi xử lý ảnh.', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddPost = async () => {
    if (uploadingImage) {
      pushToast('Vui lòng chờ tải ảnh hoàn tất trước khi đăng bài.', 'info');
      return;
    }
    if (!newPostContent.trim() && !newPostImagePreview) return;
    if (newPostImagePreview && newPostImagePreview.startsWith('data:') && newPostImagePreview.length > 45000) {
      pushToast('Ảnh dung lượng lớn chưa tải xong lên máy chủ. Vui lòng chọn lại ảnh.', 'warning');
      return;
    }
    setIsPosting(true);
    try {
      const content = newPostContent.trim();
      const res = await callApi('ADD_POST', {
        author: currentUser?.fullname || 'Admin',
        content,
        image: newPostImagePreview || '',
      });

      if (res?.ok) {
        setNewPostContent('');
        setNewPostImagePreview(null);
        const reloadRes = await callApi('GET_POSTS', {});
        if (reloadRes?.ok && Array.isArray(reloadRes.data)) setPosts(reloadRes.data);
        pushToast('Đã đăng bài lên Bảng tin', 'success');
      } else {
        pushToast(res?.message || 'Không thể đăng bài lên Bảng tin.', 'error');
      }
    } catch {
      pushToast('Lỗi kết nối máy chủ khi đăng bài.', 'error');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div ref={containerRef} className="p-4 animate-slide-up pb-24 md:pb-10 space-y-5">
      <KgModuleHero
        moduleId="news"
        title="Bảng tin Nội bộ"
        description="Thông báo và tin tức quan trọng từ nhà hàng."
        eyebrow="Thông tin"
        tipTitle="Quy chế Bảng tin Nội bộ"
        tips={[
          'Mọi nhân viên cần theo dõi bảng tin hàng ngày để cập nhật các thông báo điều hành và sự kiện quan trọng.',
          'Quản lý có thể ghim bài viết quan trọng và gửi thông báo trực tiếp tới toàn bộ nhân sự.',
          "Thả tim và bình luận tích cực để xây dựng tinh thần đồng đội tại King's Grill.",
        ]}
        actions={
          <button
            type="button"
            onClick={() => void fetchPosts(false)}
            disabled={loading}
            aria-label="Làm mới bảng tin"
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors touch-manipulation"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Desktop-constrained feed column */}
      <div className="max-w-2xl mx-auto w-full space-y-4">
        {/* Admin Post Box */}
        {currentUser?.role === 'admin' && (
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden p-4 sm:p-5 shadow-xs space-y-3">
            <label
              htmlFor="newsfeed-post-input"
              className="font-black text-[var(--kg-text)] flex items-center text-xs sm:text-sm cursor-pointer"
            >
              <Edit3 size={16} className="mr-2 text-[var(--kg-primary)]" /> Tạo thông báo mới cho toàn quán
            </label>
            <textarea
              id="newsfeed-post-input"
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              rows={3}
              placeholder="Bạn muốn thông báo điều gì cho toàn bộ nhân sự?"
              className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] resize-none"
            />

            {newPostImagePreview && (
              <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-[var(--kg-border)]">
                <img src={newPostImagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setNewPostImagePreview(null)}
                  className="absolute top-1 right-1 min-w-[36px] min-h-[36px] bg-black/65 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition"
                  aria-label="Xóa ảnh đính kèm"
                >
                  <X size={14} />
                </button>
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <label
                aria-label="Đính kèm hình ảnh"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center cursor-pointer text-[var(--kg-primary-ink)] hover:opacity-80 hover:bg-[var(--kg-surface-soft)] rounded-xl transition touch-manipulation"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                  disabled={uploadingImage}
                />
                <ImageIcon size={20} />
              </label>
              <KgButton
                type="button"
                variant="primary"
                size="md"
                loading={isPosting}
                disabled={isPosting || uploadingImage || (!newPostContent.trim() && !newPostImagePreview)}
                icon={Send}
                onClick={() => void handleAddPost()}
              >
                Đăng tin
              </KgButton>
            </div>
          </div>
        )}

        {loadError ? (
          <KgErrorState
            title="Không thể tải bảng tin"
            description={loadError}
            onRetry={() => void fetchPosts(false)}
          />
        ) : loading && posts.length === 0 ? (
          <div className="space-y-4">
            <KgSkeleton className="h-40 w-full" />
            <KgSkeleton className="h-40 w-full" />
          </div>
        ) : posts.length === 0 ? (
          <KgEmptyState
            title="Chưa có bài đăng nào"
            description="Các thông báo vận hành và tin tức nội bộ mới nhất sẽ hiển thị tại đây."
          />
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const hasLiked = post.likes.includes(currentUser?.username || 'Guest');
              const isCommentsOpen = activeCommentPostId === post.id;
              const commentValue = commentInputs[post.id] || '';

              return (
                <article
                  key={post.id}
                  className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden shadow-xs animate-fade-in"
                >
                  {/* Author */}
                  <div className="p-3.5 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center font-black text-sm sm:text-base mr-3 border border-[var(--kg-border)] shrink-0">
                        {post.author.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-black text-[var(--kg-text)] text-xs sm:text-sm flex items-center">
                          {post.author}
                          {(post.author === 'Admin' || post.role === 'Admin') && (
                            <span className="ml-2 bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] text-[9px] px-2 py-0.5 rounded-full font-black border border-[var(--kg-danger)]/20">
                              ADMIN
                            </span>
                          )}
                          {post.role === 'System' && (
                            <span className="ml-2 bg-[var(--kg-info-soft)] text-[var(--kg-info)] text-[9px] px-2 py-0.5 rounded-full font-black border border-[var(--kg-info)]/20">
                              SYSTEM
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-[var(--kg-text-muted)] font-medium mt-0.5 font-mono tabular-nums">
                          {post.time || 'Gần đây'}
                        </p>
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
                  <div className="px-3.5 sm:px-4 py-2 flex justify-between items-center text-[11px] text-[var(--kg-text-muted)] font-medium border-t border-[var(--kg-border)]/50">
                    <div className="flex items-center space-x-3 w-full">
                      <div className="flex items-center">
                        <Heart size={13} className="mr-1 text-[var(--kg-danger)] fill-current" />
                        <span className="mr-1 font-bold font-mono tabular-nums">{post.likes.length}</span>
                        {post.likes.length > 0 && (
                          <span className="text-[10px] opacity-75 truncate max-w-[140px]">
                            (
                            {post.likes.length <= 2
                              ? post.likes.join(', ')
                              : `${post.likes[0]} và ${post.likes.length - 1} người khác`}
                            )
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveCommentPostId(isCommentsOpen ? null : post.id)}
                        aria-expanded={isCommentsOpen}
                        className="flex items-center ml-auto min-h-[44px] sm:min-h-[32px] px-2 -mr-2 rounded-lg hover:text-[var(--kg-info)] font-bold touch-manipulation"
                      >
                        <MessageSquare size={13} className="mr-1 text-[var(--kg-info)]" />
                        <span className="font-mono tabular-nums mr-1">{post.comments.length}</span> bình luận
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 px-2 py-1.5 border-t border-[var(--kg-border)]">
                    <button
                      type="button"
                      onClick={() => void toggleLike(post.id)}
                      aria-pressed={hasLiked}
                      className={`flex-1 min-h-[44px] sm:min-h-[40px] flex justify-center items-center py-2 text-xs font-black rounded-xl transition-all active:scale-95 touch-manipulation ${
                        hasLiked
                          ? 'text-[var(--kg-danger)] bg-[var(--kg-danger-soft)]'
                          : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
                      }`}
                    >
                      <Heart size={15} className={`mr-1.5 flex-shrink-0 ${hasLiked ? 'fill-current' : ''}`} />{' '}
                      {hasLiked ? 'Đã thích' : 'Thích'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCommentPostId(isCommentsOpen ? null : post.id)}
                      aria-expanded={isCommentsOpen}
                      className={`flex-1 min-h-[44px] sm:min-h-[40px] flex justify-center items-center py-2 text-xs font-black rounded-xl transition-all active:scale-95 touch-manipulation ${
                        isCommentsOpen
                          ? 'text-[var(--kg-info)] bg-[var(--kg-info-soft)]'
                          : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
                      }`}
                    >
                      <MessageSquare size={15} className="mr-1.5 flex-shrink-0" /> Bình luận
                    </button>
                  </div>

                  {/* Latest Comment Preview */}
                  {!isCommentsOpen && post.comments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveCommentPostId(post.id)}
                      className="w-full min-h-[44px] text-left px-3.5 sm:px-4 py-2.5 bg-[var(--kg-surface-soft)]/50 hover:bg-[var(--kg-surface-soft)] transition-colors border-t border-[var(--kg-border)] touch-manipulation"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-full bg-[var(--kg-border)] flex-shrink-0 flex items-center justify-center text-[9px] font-black text-[var(--kg-text)]">
                          {post.comments[post.comments.length - 1].author.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-[var(--kg-text)] truncate">
                            <span className="font-bold mr-1">
                              {post.comments[post.comments.length - 1].author}:
                            </span>
                            {post.comments[post.comments.length - 1].content}
                          </p>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Comments Section */}
                  {isCommentsOpen && (
                    <div className="bg-[var(--kg-surface-soft)]/40 p-3.5 sm:p-4 border-t border-[var(--kg-border)] space-y-3 animate-fade-in">
                      <div className="space-y-3 max-h-[250px] overflow-y-auto hide-scrollbar pr-1">
                        {post.comments.map((comment) => (
                          <div key={comment.id} className="flex space-x-2">
                            <div className="w-7 h-7 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] flex-shrink-0 flex items-center justify-center text-xs font-black text-[var(--kg-text)]">
                              {comment.author.charAt(0)}
                            </div>
                            <div className="flex-1 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl rounded-tl-none p-2.5 shadow-2xs">
                              <h5 className="text-[11px] font-black text-[var(--kg-text)] mb-0.5">
                                {comment.author}
                              </h5>
                              <p className="text-xs text-[var(--kg-text)] font-medium leading-relaxed">
                                {comment.content}
                              </p>
                              <p className="text-[9px] text-[var(--kg-text-muted)] mt-1 font-mono tabular-nums">
                                {comment.time}
                              </p>
                            </div>
                          </div>
                        ))}
                        {post.comments.length === 0 && (
                          <p className="text-xs text-center text-[var(--kg-text-muted)] py-2 font-medium">
                            Chưa có bình luận nào. Hãy là người đầu tiên!
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <div className="w-8 h-8 rounded-lg bg-[var(--kg-primary-soft)] flex-shrink-0 flex items-center justify-center text-[var(--kg-primary-ink)] text-xs font-black">
                          {currentUser?.fullname.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            aria-label="Viết bình luận"
                            value={commentValue}
                            onChange={(e) =>
                              setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            onKeyDown={(e) => e.key === 'Enter' && void handleAddComment(post.id)}
                            placeholder="Viết bình luận..."
                            className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-full pl-3.5 pr-12 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]"
                          />
                          <button
                            type="button"
                            aria-label="Gửi bình luận"
                            onClick={() => void handleAddComment(post.id)}
                            disabled={!commentValue.trim()}
                            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-[var(--kg-primary)] text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            <Send size={14} className="ml-0.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
