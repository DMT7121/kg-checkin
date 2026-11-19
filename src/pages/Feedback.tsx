import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { kgToast, type FeedbackTone } from '../store/useFeedbackStore';
import { callApi } from '../services/api';
import { navigateToHubSubTab } from '../utils/hubNavigation';
import {
  Send,
  EyeOff,
  User,
  Clock,
  AlertCircle,
  CornerDownRight,
  RefreshCw,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import {
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
  KgStatusBadge,
} from '../components/KgDesignSystem';

const FEEDBACK_CATEGORIES = [
  'Góp ý cải tiến quy trình',
  'Khiếu nại ca làm / lương thưởng',
  'Cơ sở vật chất / công cụ làm việc',
  'Khác',
] as const;

export default function Feedback() {
  const currentUser = useAppStore((s) => s.currentUser);
  const feedbacks = useAppStore((s) => s.feedbacks);
  const setFeedbacks = useAppStore((s) => s.setFeedbacks);
  const setUpdating = useAppStore((s) => s.setUpdating);

  const [loading, setLoading] = useState(() => feedbacks.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Form states
  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0]);
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'REVIEWED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Admin reply states
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

  const pushToast = useCallback((message: string, tone: FeedbackTone) => {
    kgToast(message, tone);
  }, []);

  const fetchFeedbacks = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
      else setIsRefreshing(true);
      setLoadError('');
      try {
        const res = await callApi(
          'GET_FEEDBACKS',
          {
            username: currentUser?.username,
            role: currentUser?.role,
          },
          { background: true },
        );

        if (res?.ok && Array.isArray(res.data)) {
          setFeedbacks(res.data);
        } else if (!res?.ok) {
          setLoadError(res?.message || 'Không thể tải danh sách góp ý.');
        }
      } catch {
        setLoadError('Lỗi kết nối máy chủ khi tải lịch sử góp ý.');
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentUser?.role, currentUser?.username, setFeedbacks],
  );

  useEffect(() => {
    void fetchFeedbacks(feedbacks.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!content.trim()) {
      setFormError('Vui lòng nhập nội dung góp ý hoặc kiến nghị.');
      return;
    }

    setUpdating(true);
    setIsSubmitting(true);
    try {
      const res = await callApi('SUBMIT_FEEDBACK', {
        username: isAnonymous ? 'Anonymous' : currentUser?.username,
        fullname: isAnonymous ? 'Ẩn danh' : currentUser?.fullname,
        category,
        content,
        isAnonymous,
      });

      if (res?.ok) {
        pushToast('Đã gửi góp ý thành công', 'success');
        setContent('');
        await fetchFeedbacks(false);
      } else {
        setFormError(
          res?.message ||
            'Máy chủ đang bận hoặc mất kết nối. Nội dung của bạn vẫn được giữ nguyên, vui lòng thử lại.',
        );
      }
    } catch {
      setFormError('Không thể gửi góp ý. Nội dung của bạn vẫn được giữ nguyên.');
    } finally {
      setUpdating(false);
      setIsSubmitting(false);
    }
  };

  const handleReply = async (feedbackId: string) => {
    if (!replyContent.trim()) return;

    setUpdating(true);
    setReplyBusyId(feedbackId);
    try {
      const res = await callApi('REPLY_FEEDBACK', {
        feedbackId,
        reply: replyContent,
      });

      if (res?.ok) {
        pushToast('Đã gửi phản hồi thành công', 'success');
        setReplyContent('');
        setReplyingTo(null);
        await fetchFeedbacks(false);
      } else {
        pushToast(res?.message || 'Máy chủ đang bận hoặc mất kết nối. Vui lòng thử lại.', 'error');
      }
    } catch {
      pushToast('Không thể gửi phản hồi. Vui lòng thử lại.', 'error');
    } finally {
      setUpdating(false);
      setReplyBusyId(null);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  const counts = useMemo(
    () => ({
      all: feedbacks.length,
      reviewed: feedbacks.filter((fb) => fb.status === 'Reviewed').length,
      pending: feedbacks.filter((fb) => fb.status !== 'Reviewed').length,
    }),
    [feedbacks],
  );

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((fb) => {
      if (statusFilter === 'REVIEWED' && fb.status !== 'Reviewed') return false;
      if (statusFilter === 'PENDING' && fb.status === 'Reviewed') return false;
      if (categoryFilter !== 'ALL' && fb.category !== categoryFilter) return false;
      return true;
    });
  }, [feedbacks, statusFilter, categoryFilter]);

  return (
    <div className="flex flex-col space-y-4 pb-24 md:pb-12 animate-fade-in max-w-[1440px] mx-auto w-full">
      <KgModuleHero
        moduleId="feedback"
        title="Góp Ý & Khiếu Nại"
        description="Lắng nghe ý kiến đóng góp, đề xuất và thắc mắc của nhân sự với bảo mật tuyệt đối."
        eyebrow="Khảo sát"
        features={['Tuỳ chọn ẩn danh 100%', 'Gửi thẳng Quản lý', 'Theo dõi phản hồi']}
        tipTitle="Chính sách Góp ý & Khiếu nại Nội bộ"
        tips={[
          'Mọi ý kiến đóng góp nhằm cải thiện quy trình, vệ sinh, không khí làm việc đều được trân trọng.',
          "Chế độ 'Gửi ẩn danh' đảm bảo tuyệt đối không lưu lại danh tính hay tài khoản của người gửi.",
          'Ban Quản lý cam kết phản hồi công khai hoặc xử lý thỏa đáng trong vòng 24 - 48 giờ làm việc.',
        ]}
      />

      {/* Desktop lg:grid-cols-12 (5/7 split for staff, full 12 cols for admin) */}
      <div className="relative z-20 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column (5 cols on lg): User Submit Form */}
        {!isAdmin && (
          <div className="lg:col-span-5 lg:sticky lg:top-28 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="font-black text-[var(--kg-text)] text-xs sm:text-sm flex items-center">
              <Send size={15} className="mr-2 text-[var(--kg-primary)]" /> Gửi phản hồi / kiến nghị mới
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="feedback-category"
                  className="block text-[11px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-1"
                >
                  Nhóm nội dung
                </label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] text-xs sm:text-sm font-medium"
                >
                  {FEEDBACK_CATEGORIES.map((cat) => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Subtle inline hint directing urgent broken-equipment reports to Work -> Incidents */}
              <div className="p-2.5 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-[var(--kg-text)] font-medium leading-snug min-w-0 flex-1">
                  <Wrench size={13} className="text-[var(--kg-warning)] shrink-0" />
                  <span>Thiết bị hỏng cần sửa gấp trong ca?</span>
                </span>
                <button
                  type="button"
                  onClick={() => navigateToHubSubTab('work', 'incidents')}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-warning)]/30 text-[var(--kg-warning)] font-extrabold inline-flex items-center gap-1 hover:brightness-95 shrink-0 whitespace-nowrap touch-manipulation"
                >
                  <span>Báo sự cố</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              <div>
                <label
                  htmlFor="feedback-content"
                  className="block text-[11px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider mb-1"
                >
                  Chi tiết góp ý / kiến nghị
                </label>
                <textarea
                  id="feedback-content"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="Nhập nội dung chi tiết..."
                  rows={4}
                  className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] text-xs sm:text-sm"
                />
              </div>

              {formError && (
                <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none min-h-[44px]">
                  <div
                    className={`w-9 h-5 flex items-center bg-[var(--kg-border-strong)] rounded-full p-0.5 transition-colors duration-200 ${
                      isAnonymous ? '!bg-[var(--kg-primary)]' : ''
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        isAnonymous ? 'translate-x-4' : ''
                      }`}
                    />
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAnonymous}
                    onChange={() => setIsAnonymous(!isAnonymous)}
                  />
                  <span className="text-xs font-bold text-[var(--kg-text)] flex items-center">
                    <EyeOff size={13} className="mr-1 text-[var(--kg-text-muted)]" /> Ẩn danh
                  </span>
                </label>

                <KgButton
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  icon={Send}
                >
                  Gửi phản hồi
                </KgButton>
              </div>
            </form>
          </div>
        )}

        {/* Right Column (7 cols on lg for staff, 12 cols for admin): Feedback List + Filters */}
        <div className={`${isAdmin ? 'lg:col-span-12' : 'lg:col-span-7'} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="font-black text-[var(--kg-text-muted)] text-[11px] uppercase tracking-wider">
              Lịch sử phản hồi (<span className="font-mono tabular-nums">{filteredFeedbacks.length}</span>)
            </h3>
            <button
              type="button"
              onClick={() => void fetchFeedbacks(false)}
              disabled={isRefreshing || loading}
              aria-label="Làm mới danh sách phản hồi"
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors touch-manipulation"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {(
                [
                  { id: 'ALL', label: `Tất cả (${counts.all})` },
                  { id: 'PENDING', label: `Chờ phản hồi (${counts.pending})` },
                  { id: 'REVIEWED', label: `Đã xem xét (${counts.reviewed})` },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`shrink-0 whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
                    statusFilter === pill.id
                      ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                      : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <label className="block w-full sm:w-60 shrink-0">
              <span className="sr-only">Lọc theo nhóm nội dung</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[36px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              >
                <option value="ALL">Tất cả nhóm nội dung</option>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loadError ? (
            <KgErrorState
              title="Không thể tải lịch sử góp ý"
              description={loadError}
              onRetry={() => void fetchFeedbacks(false)}
            />
          ) : loading ? (
            <div className="space-y-3">
              <KgSkeleton className="h-28 w-full" />
              <KgSkeleton className="h-28 w-full" />
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <KgEmptyState
              icon={AlertCircle}
              title={feedbacks.length === 0 ? 'Chưa có phản hồi nào' : 'Không có phản hồi khớp bộ lọc'}
              description={
                feedbacks.length === 0
                  ? 'Các góp ý và phản hồi từ Quản lý sẽ hiển thị tại đây.'
                  : 'Thử đổi trạng thái hoặc nhóm nội dung để xem thêm.'
              }
              action={
                feedbacks.length > 0 ? (
                  <KgButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setCategoryFilter('ALL');
                    }}
                  >
                    Xóa bộ lọc
                  </KgButton>
                ) : undefined
              }
            />
          ) : (
            <div className={`grid grid-cols-1 ${isAdmin ? 'xl:grid-cols-2' : ''} gap-3 items-start`}>
              {filteredFeedbacks.map((fb) => (
                <div
                  key={fb.id}
                  className="kg-fade-in bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs space-y-2.5"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`p-1.5 rounded-xl ${
                          fb.isAnonymous
                            ? 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                            : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]'
                        }`}
                      >
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
                    <KgStatusBadge variant={fb.status === 'Reviewed' ? 'success' : 'warning'}>
                      {fb.status === 'Reviewed' ? 'Đã xem xét' : 'Chờ phản hồi'}
                    </KgStatusBadge>
                  </div>

                  <span className="inline-block bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                    {fb.category}
                  </span>

                  <p className="text-xs sm:text-sm text-[var(--kg-text)] font-medium leading-relaxed whitespace-pre-wrap">
                    {fb.content}
                  </p>

                  {fb.adminReply ? (
                    <div className="mt-3 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3 rounded-xl">
                      <p className="text-xs font-bold text-[var(--kg-primary-ink)] flex items-center mb-1">
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
                          />
                          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
                            <KgButton
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={replyBusyId === fb.id}
                              onClick={() => setReplyingTo(null)}
                              className="w-full sm:w-auto"
                            >
                              Hủy
                            </KgButton>
                            <KgButton
                              type="button"
                              variant="primary"
                              size="sm"
                              loading={replyBusyId === fb.id}
                              disabled={!replyContent.trim()}
                              onClick={() => void handleReply(fb.id)}
                              className="w-full sm:w-auto"
                            >
                              Gửi phản hồi
                            </KgButton>
                          </div>
                        </div>
                      ) : (
                        <KgButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={CornerDownRight}
                          onClick={() => setReplyingTo(fb.id)}
                        >
                          Nhập phản hồi
                        </KgButton>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
