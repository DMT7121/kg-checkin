import { lazy, Suspense, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  GraduationCap,
  BookOpen,
  Award,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  Search,
  Sparkles,
  HelpCircle,
  BookMarked,
  UserCheck,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  ShieldAlert,
  ListFilter,
  Eye,
  FileText,
  Tablet,
  Frown,
  UtensilsCrossed,
  Receipt,
  Flame,
  ShieldCheck,
  ArrowLeftRight,
  Shield,
  CalendarClock,
  Gavel,
  Heart,
  BarChart3,
  ClipboardCheck,
  Star,
  Briefcase,
  Users,
  DoorOpen,
  Megaphone,
  CreditCard,
  ChefHat,
  GlassWater,
  Banknote,
  Car,
  Video,
  Trash2,
  AlertTriangle,
  Coins,
  MessageSquare,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { kgAlert, kgToast } from '../store/useFeedbackStore';
import type { SopSection } from './sopData';
import type { CukcukStep } from './cukcukData';
import {
  isCriticalSop,
  searchSops,
  sectionMatchesScope,
  type SopScope,
} from '../utils/sopSearch';
import {
  computeRoleReadinessProgress,
  createShuffledQuizSession,
  evaluateShuffledQuizAttempt,
  type ShuffledQuizSession,
  type QuizWrongReview,
} from '../utils/trainingGamification';
import {
  KgCard,
  KgButton,
  KgInput,
  KgBottomSheet,
  KgModuleHero,
} from '../components/KgDesignSystem';

const CukcukGuideLightbox = lazy(() => import('../components/training/CukcukGuideLightbox'));

interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string;
  quiz: QuizQuestion[];
  points: number;
}

interface CompletedLesson {
  lessonId: string;
  score: number;
  completedAt: string;
}

const QUICK_SOP_QUERIES: { label: string; query: string; icon: LucideIcon }[] = [
  { label: 'Khách phàn nàn', query: 'khách phàn nàn', icon: Frown },
  { label: 'Món hết', query: 'hết món sold out', icon: UtensilsCrossed },
  { label: 'Thanh toán lỗi', query: 'thanh toán lỗi hóa đơn', icon: Receipt },
  { label: 'Đổ vỡ', query: 'đổ vỡ ly chén', icon: GlassWater },
  { label: 'PCCC', query: 'PCCC cháy', icon: Flame },
  { label: 'Vệ sinh ATTP', query: 'vệ sinh an toàn thực phẩm', icon: ShieldCheck },
  { label: 'Bàn giao ca', query: 'bàn giao ca', icon: ArrowLeftRight },
];

const SOP_ICON_MAP: Record<string, LucideIcon> = {
  'fa-book-open': BookOpen,
  'fa-handshake': Users,
  'fa-shield-halved': Shield,
  'fa-calendar-clock': CalendarClock,
  'fa-user-check': UserCheck,
  'fa-fire': Flame,
  'fa-gavel': Gavel,
  'fa-heart': Heart,
  'fa-hand-holding-heart': Heart,
  'fa-chart-bar': BarChart3,
  'fa-face-smile-plus': Sparkles,
  'fa-clipboard-check': ClipboardCheck,
  'fa-star': Star,
  'fa-briefcase': Briefcase,
  'fa-message': MessageSquare,
  'fa-comments': MessageSquare,
  'fa-users-gear': Users,
  'fa-users': Users,
  'fa-door-open': DoorOpen,
  'fa-bullhorn': Megaphone,
  'fa-eye': Eye,
  'fa-credit-card': CreditCard,
  'fa-circle-exclamation': AlertTriangle,
  'fa-triangle-exclamation': AlertTriangle,
  'fa-biohazard': ShieldAlert,
  'fa-hat-chef': ChefHat,
  'fa-list-check': ClipboardCheck,
  'fa-check-double': CheckCircle2,
  'fa-sparkles': Sparkles,
  'fa-spray-can-sparkles': Sparkles,
  'fa-glass-water': GlassWater,
  'fa-martini-glass-citrus': GlassWater,
  'fa-hand-holding-dollar': Banknote,
  'fa-money-bill-wave': Banknote,
  'fa-shield-virus': ShieldCheck,
  'fa-shield-check': ShieldCheck,
  'fa-car': Car,
  'fa-video': Video,
  'fa-trash-can': Trash2,
};

function SopIcon({ name, size = 15, className = '' }: { name?: string; size?: number; className?: string }) {
  const token = (name || '').split(/\s+/).find((part) => part.startsWith('fa-') && part !== 'fa-solid') || '';
  const IconComp = SOP_ICON_MAP[token] || FileText;
  return <IconComp size={size} className={className} />;
}

function isSafeExternalUrl(rawHref: string | null): string | null {
  if (!rawHref) return null;
  try {
    const parsed = new URL(rawHref, 'https://example.invalid');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

const ALLOWED_SOP_LI_CLASSES = new Set(['icon-tip', 'icon-note', 'icon-danger', 'icon-script']);

function getSopLiIconColorClass(liClass: string): string {
  if (liClass.includes('icon-tip')) return 'text-[var(--kg-info)]';
  if (liClass.includes('icon-note')) return 'text-[var(--kg-warning)]';
  if (liClass.includes('icon-danger')) return 'text-[var(--kg-danger)]';
  if (liClass.includes('icon-script')) return 'text-[var(--kg-text-muted)]';
  return 'text-[var(--kg-primary)]';
}

function renderSafeSopNode(
  node: ChildNode,
  key: string,
  parentLiClass = '',
): ReactNode {
  if (node.nodeType === 3) {
    return node.textContent;
  }
  if (node.nodeType !== 1) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'ul':
      return (
        <ul key={key} className="list-none pl-0 my-2 space-y-2.5">
          {Array.from(el.childNodes).map((child, idx) => renderSafeSopNode(child, `${key}_${idx}`))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-none pl-0 mt-2 w-full space-y-2">
          {Array.from(el.childNodes).map((child, idx) => renderSafeSopNode(child, `${key}_${idx}`))}
        </ol>
      );
    case 'li': {
      const clsList = (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => ALLOWED_SOP_LI_CLASSES.has(c))
        .join(' ');
      return (
        <li key={key} className="flex items-start leading-relaxed text-[var(--kg-text)]">
          {Array.from(el.childNodes).map((child, idx) =>
            renderSafeSopNode(child, `${key}_${idx}`, clsList),
          )}
        </li>
      );
    }
    case 'i': {
      const cls = el.getAttribute('class') || '';
      const isDanger = /triangle-exclamation|circle-exclamation|fire|biohazard|ban|gavel/.test(cls);
      const isCheck = /check|award|star|shield/.test(cls);
      const FallbackIcon = isDanger ? AlertTriangle : isCheck ? CheckCircle2 : SopIcon;
      const iconTone = getSopLiIconColorClass(parentLiClass);
      return (
        <span
          key={key}
          className={`flex-shrink-0 w-5 mr-2.5 mt-1 inline-flex items-center justify-center ${iconTone}`}
          aria-hidden="true"
        >
          {isDanger || isCheck ? <FallbackIcon size={15} /> : <SopIcon name={cls} size={15} />}
        </span>
      );
    }
    case 'strong':
    case 'b':
      return (
        <strong key={key} className="font-bold text-[var(--kg-text)]">
          {Array.from(el.childNodes).map((child, idx) =>
            renderSafeSopNode(child, `${key}_${idx}`, parentLiClass),
          )}
        </strong>
      );
    case 'em':
      return (
        <em key={key}>
          {Array.from(el.childNodes).map((child, idx) =>
            renderSafeSopNode(child, `${key}_${idx}`, parentLiClass),
          )}
        </em>
      );
    case 'br':
      return <br key={key} />;
    case 'a': {
      const safeHref = isSafeExternalUrl(el.getAttribute('href'));
      const children = Array.from(el.childNodes).map((child, idx) =>
        renderSafeSopNode(child, `${key}_${idx}`, parentLiClass),
      );
      if (!safeHref) return <span key={key}>{children}</span>;
      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--kg-primary-ink)] font-semibold underline hover:opacity-80"
        >
          {children}
        </a>
      );
    }
    case 'span':
    case 'p':
    case 'div': {
      const children = Array.from(el.childNodes).map((child, idx) =>
        renderSafeSopNode(child, `${key}_${idx}`, parentLiClass),
      );
      const isScript = parentLiClass.includes('icon-script') && tag === 'span';
      return (
        <span
          key={key}
          className={
            isScript
              ? 'font-mono italic bg-[var(--kg-surface-soft)] px-1.5 py-0.5 rounded'
              : undefined
          }
        >
          {children}
        </span>
      );
    }
    default:
      return (
        <span key={key}>
          {Array.from(el.childNodes).map((child, idx) =>
            renderSafeSopNode(child, `${key}_${idx}`, parentLiClass),
          )}
        </span>
      );
  }
}

function SopDetailsRenderer({ html }: { html: string }) {
  const nodes = useMemo(() => {
    if (typeof DOMParser === 'undefined') {
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.body.childNodes).map((child, idx) => renderSafeSopNode(child, `sop_${idx}`));
  }, [html]);

  return <div className="max-w-[68ch] text-sm text-[var(--kg-text)] leading-relaxed font-medium">{nodes}</div>;
}

const SOP_SCOPES: { id: SopScope; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'recommended', label: 'Dành cho bạn' },
  { id: 'critical', label: 'Quan trọng' },
  { id: 'general', label: 'Tiêu chuẩn chung' },
  { id: 'department', label: 'Theo bộ phận' },
];

export default function Training() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setAiOpen = useAppStore((s) => s.setAiOpen);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizAttemptNonce, setQuizAttemptNonce] = useState<number>(1);
  const [activeShuffledSession, setActiveShuffledSession] = useState<ShuffledQuizSession | null>(null);
  const [wrongReviews, setWrongReviews] = useState<QuizWrongReview[]>([]);
  const [readSopIds, setReadSopIds] = useState<string[]>(() => {
    try {
      const key = `kg_sop_read_${currentUser?.username || 'staff'}`;
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);

  // Flat KnowledgeCenter tabs: Tra cứu SOP | Kiểm tra | CUKCUK
  const [activeTab, setActiveTab] = useState<'sop' | 'quiz' | 'cukcuk'>('sop');

  // SOP State (loaded dynamically on demand)
  const [sopData, setSopData] = useState<SopSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('welcome');
  const [searchTerm, setSearchTerm] = useState('');
  const [sopScope, setSopScope] = useState<SopScope>('all');
  const [sopViewMode, setSopViewMode] = useState<'quick' | 'full'>('quick');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [isMobileCategoryOpen, setIsMobileCategoryOpen] = useState(false);

  // CUKCUK State (loaded dynamically on demand)
  const [cukcukData, setCukcukData] = useState<CukcukStep[]>([]);
  const [cukcukLoading, setCukcukLoading] = useState(false);
  const [cukcukSearch, setCukcukSearch] = useState('');
  const [activeCukcukIndex, setActiveCukcukIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab !== 'sop' || sopData.length > 0) return;
    let cancelled = false;
    void import('./sopData').then((mod) => {
      if (!cancelled) setSopData(mod.sopData);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, sopData.length]);

  useEffect(() => {
    if (activeTab !== 'cukcuk' || cukcukData.length > 0) return;
    let cancelled = false;
    setCukcukLoading(true);
    void import('./cukcukData')
      .then((mod) => {
        if (!cancelled) setCukcukData(mod.cukcukData);
      })
      .finally(() => {
        if (!cancelled) setCukcukLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, cukcukData.length]);

  const filteredCukcukSteps = useMemo(() => {
    const term = cukcukSearch.trim().toLowerCase();
    if (!term) return cukcukData;
    return cukcukData.filter(
      (item) =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        `bước ${item.step}`.includes(term),
    );
  }, [cukcukData, cukcukSearch]);

  // Fetch training lessons & progress
  useEffect(() => {
    if (!currentUser?.username) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [contentRes, progressRes] = await Promise.all([
          callApi('GET_TRAINING_CONTENT', {}, { background: true }),
          callApi('GET_TRAINING_PROGRESS', { username: currentUser.username }, { background: true }),
        ]);
        if (cancelled) return;
        if (contentRes?.ok) {
          const safeLessons = Array.isArray(contentRes.data)
            ? contentRes.data
            : Array.isArray(contentRes.data?.lessons)
              ? contentRes.data.lessons
              : [];
          setLessons(safeLessons);
        }
        if (progressRes?.ok) {
          const rawCompleted = Array.isArray(progressRes.data)
            ? progressRes.data
            : Array.isArray(progressRes.data?.completed)
              ? progressRes.data.completed
              : [];
          const ids = new Set<string>(rawCompleted.map((c: CompletedLesson) => c.lessonId));
          setCompletedIds(ids);
        }
      } catch (e) {
        console.error('Training fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.username]);

  const totalLessons = lessons.length;
  const completedCount = [...completedIds].filter((id) => lessons.some((l) => l.id === id)).length;

  const roleReadiness = useMemo(
    () =>
      computeRoleReadinessProgress({
        position: currentUser?.position,
        completedSopIds: readSopIds,
        completedLessonIds: completedIds,
        availableLessons: lessons,
      }),
    [currentUser?.position, readSopIds, completedIds, lessons],
  );

  const toggleMarkSopRead = (sectionId: string) => {
    setReadSopIds((prev) => {
      const next = prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId];
      try {
        localStorage.setItem(`kg_sop_read_${currentUser?.username || 'staff'}`, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const startShuffledQuiz = (lesson: Lesson) => {
    const nextNonce = quizAttemptNonce + 1;
    setQuizAttemptNonce(nextNonce);
    const session = createShuffledQuizSession(
      lesson.id,
      lesson.quiz,
      `${currentUser?.username || 'staff'}-${lesson.id}-${nextNonce}`,
    );
    setActiveShuffledSession(session);
    setWrongReviews([]);
    setQuizMode(lesson.id);
    setAnswers({});
  };

  const handleSubmitQuiz = async (lesson: Lesson) => {
    if (!currentUser?.username) return;
    const session =
      activeShuffledSession && activeShuffledSession.lessonId === lesson.id
        ? activeShuffledSession
        : createShuffledQuizSession(lesson.id, lesson.quiz, `${lesson.id}-fallback`);

    const evaluation = evaluateShuffledQuizAttempt(session, answers, 70);

    if (!evaluation.passed) {
      setWrongReviews(evaluation.wrongReviews);
      void kgAlert(
        'Chưa đạt yêu cầu',
        `Bạn trả lời đúng ${evaluation.correctCount}/${evaluation.totalQuestions} câu (${evaluation.scorePct}%).\nCần đạt tối thiểu 70% để hoàn thành. Hãy xem gợi ý ôn tập bên dưới và bấm Đảo đề & Thử lại.`,
        'warning',
      );
      return;
    }

    const res = await callApi('SUBMIT_TRAINING_QUIZ', {
      username: currentUser.username,
      fullname: currentUser.fullname,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      score: evaluation.scorePct,
      points: lesson.points,
    });

    if (res?.ok) {
      setCompletedIds((prev) => new Set([...prev, lesson.id]));
      setQuizMode(null);
      setActiveShuffledSession(null);
      setWrongReviews([]);
      setAnswers({});
      void kgAlert(
        'Hoàn thành xuất sắc!',
        `Điểm: ${evaluation.scorePct}% (${evaluation.correctCount}/${evaluation.totalQuestions})\n+${lesson.points} King Coins đã được cộng!`,
        'success',
      );
    } else {
      kgToast(res?.message || 'Không thể ghi nhận kết quả', 'info', 'Lưu ý');
    }
  };

  const toggleAccordion = (subtitle: string) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [subtitle]: !prev[subtitle],
    }));
  };

  const searchResults = useMemo(
    () => searchSops(sopData, searchTerm, sopScope, currentUser?.position),
    [sopData, searchTerm, sopScope, currentUser?.position],
  );

  const visibleSopSections = useMemo(
    () => sopData.filter((section) => sectionMatchesScope(section, sopScope, currentUser?.position)),
    [sopData, sopScope, currentUser?.position],
  );

  const activeSopSection =
    visibleSopSections.find((s) => s.id === selectedSection) || visibleSopSections[0];
  const effectiveSelectedSection = activeSopSection?.id || selectedSection;
  const activeSopItems =
    activeSopSection?.content.filter(
      (item) => sopScope !== 'critical' || isCriticalSop(activeSopSection, item),
    ) || [];
  const generalSops = visibleSopSections.filter((s) => s.group === 'general');
  const departmentSops = visibleSopSections.filter((s) => s.group === 'department');

  const getQuickSopList = (html: string): string[] => {
    const liMatches = html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (liMatches && liMatches.length > 0) {
      return liMatches
        .slice(0, 3)
        .map((li) => li.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' '))
        .filter(Boolean);
    }
    const cleanHtml = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = cleanHtml
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return sentences.slice(0, 2);
  };

  return (
    <div className="p-4 animate-slide-up pb-12 space-y-4 max-w-7xl mx-auto w-full">
      {/* Flat KnowledgeCenter Hero */}
      <KgModuleHero
        moduleId="training"
        eyebrow="Trung tâm Kiến thức"
        title="Sổ Tay Vận Hành & Đào Tạo"
        description="Tra cứu SOP, làm bài kiểm tra đạt ≥70% nhận King Coins và xem hướng dẫn POS CUKCUK."
        features={
          totalLessons > 0
            ? [`${completedCount}/${totalLessons} bài đạt`, `${readSopIds.length} SOP đã đọc`]
            : [`${sopData.length} chuyên đề SOP`]
        }
        tipTitle="Hướng dẫn Tự học & Kiểm tra SOP"
        tips={[
          'Tra cứu SOP: Hướng dẫn chi tiết từng vị trí (Phục vụ, Pha chế, Bếp, Thu ngân, Vệ sinh) kèm nút tìm nhanh theo tình huống.',
          'Kiểm tra: Trả lời câu hỏi trắc nghiệm thực tế, đạt tối thiểu 70% để hoàn thành bài và nhận thưởng King Coins.',
          'CUKCUK: Hướng dẫn từng bước thao tác máy POS / máy tính bảng kèm ảnh phóng to.',
          'Bấm "Hướng dẫn dùng OS" để xem lại Cẩm nang 5 bước thao tác Staff OS bất cứ lúc nào.',
        ]}
        actions={
          <KgButton
            type="button"
            variant="secondary"
            size="sm"
            icon={Compass}
            onClick={() => window.dispatchEvent(new CustomEvent('kg:open-newbie-guide'))}
          >
            Hướng dẫn dùng OS
          </KgButton>
        }
      />

      {/* Unified Reading & Role-Readiness Progress Tracker */}
      <KgCard className="p-4 sm:p-5 border border-[var(--kg-border)] shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]">
                <GraduationCap size={13} />
                {currentUser?.position || 'Nhân sự Vận hành'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                  roleReadiness.isRoleCertified
                    ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                    : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                }`}
              >
                {roleReadiness.isRoleCertified ? <ShieldCheck size={13} /> : <Zap size={13} />}
                {roleReadiness.isRoleCertified
                  ? `Đã mở khóa: ${roleReadiness.badgeLabel}`
                  : 'Đang mở khóa chuẩn vị trí'}
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--kg-text)]">
              {roleReadiness.trackTitle}
            </h3>
            <p className="text-xs text-[var(--kg-text-muted)]">
              {roleReadiness.unlockedPermissionsSummary}
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-[var(--kg-primary-ink)]">
              {roleReadiness.completionPct}%
            </p>
            <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] font-semibold">
              {roleReadiness.completedMilestones}/{roleReadiness.totalMilestones} mốc chuẩn
              {totalLessons > 0 ? ` · ${completedCount}/${totalLessons} bài` : ''}
            </p>
          </div>
        </div>

        <div className="w-full bg-[var(--kg-surface-soft)] rounded-full h-2.5 overflow-hidden border border-[var(--kg-border)]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              roleReadiness.isRoleCertified ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-primary)]'
            }`}
            style={{ width: `${roleReadiness.completionPct}%` }}
          />
        </div>

        {roleReadiness.nextAction && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <p className="text-xs font-semibold text-[var(--kg-text-muted)]">
              Bước tiếp theo:{' '}
              <span className="text-[var(--kg-text)] font-bold">{roleReadiness.nextAction.label}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                if (!roleReadiness.nextAction) return;
                if (roleReadiness.nextAction.kind === 'sop') {
                  setActiveTab('sop');
                  setSopScope('all');
                  setSelectedSection(roleReadiness.nextAction.targetId);
                } else {
                  setActiveTab('quiz');
                  setActiveLesson(roleReadiness.nextAction.targetId);
                }
              }}
              className="min-h-[44px] sm:min-h-[36px] px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-95 transition-all shrink-0 touch-manipulation"
            >
              <span>Tiếp tục lộ trình</span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </KgCard>

      {/* Flat 3-Tab KnowledgeCenter Switcher: Tra cứu SOP | Kiểm tra | CUKCUK */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar p-1.5 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('sop')}
          className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 flex-shrink-0 select-none touch-manipulation ${
            activeTab === 'sop'
              ? 'bg-[var(--kg-primary)] text-white shadow-xs'
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <BookMarked size={15} /> Tra cứu SOP
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('quiz')}
          className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 relative flex-shrink-0 select-none touch-manipulation ${
            activeTab === 'quiz'
              ? 'bg-[var(--kg-primary)] text-white shadow-xs'
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <UserCheck size={15} /> Kiểm tra
          {totalLessons > 0 && completedCount < totalLessons && activeTab !== 'quiz' && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]">
              {totalLessons - completedCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cukcuk')}
          className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 flex-shrink-0 select-none touch-manipulation ${
            activeTab === 'cukcuk'
              ? 'bg-[var(--kg-primary)] text-white shadow-xs'
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <Tablet size={15} /> CUKCUK
        </button>
      </div>

      {/* Tab 1: Tra cứu SOP */}
      {activeTab === 'sop' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 w-full items-stretch sm:items-center">
            <div className="flex-1 min-w-0">
              <KgInput
                placeholder="Tìm tình huống, quy trình hoặc nhiệm vụ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={Search}
                className="w-full"
                rightAdornment={
                  searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors touch-manipulation"
                      aria-label="Xóa nội dung tìm kiếm"
                    >
                      <X size={15} />
                    </button>
                  ) : null
                }
              />
            </div>
            <KgButton
              variant="primary"
              onClick={() => setAiOpen(true)}
              icon={Sparkles}
              className="h-[44px] shadow-xs"
            >
              King&apos;s Grill AI Assistant
            </KgButton>
          </div>

          <KgCard className="p-3 md:p-4 space-y-4 bg-[var(--kg-surface)] border border-[var(--kg-border)] shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={15} className="text-[var(--kg-accent)]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text)]">
                  Tra cứu nhanh theo tình huống
                </h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {QUICK_SOP_QUERIES.map((item) => {
                  const QuickIcon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setSearchTerm(item.query);
                        setSopScope('all');
                      }}
                      className={`min-h-[44px] sm:min-h-[36px] flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 touch-manipulation ${
                        searchTerm === item.query
                          ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)] shadow-sm'
                          : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:border-[var(--kg-primary)]'
                      }`}
                    >
                      <QuickIcon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between pt-3 border-t border-[var(--kg-border)]">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--kg-text-muted)] flex-shrink-0 pr-1">
                  <ListFilter size={13} /> Lọc:
                </span>
                {SOP_SCOPES.map((scope) => (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => setSopScope(scope.id)}
                    className={`flex-shrink-0 min-h-[44px] sm:min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
                      sopScope === scope.id
                        ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {scope.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex p-1 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]/60 self-start md:self-auto gap-1">
                <button
                  type="button"
                  onClick={() => setSopViewMode('quick')}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold touch-manipulation ${
                    sopViewMode === 'quick'
                      ? 'bg-[var(--kg-surface)] text-[var(--kg-primary-ink)] shadow-sm'
                      : 'text-[var(--kg-text-muted)]'
                  }`}
                >
                  <Eye size={13} /> Xem nhanh
                </button>
                <button
                  type="button"
                  onClick={() => setSopViewMode('full')}
                  className={`inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold touch-manipulation ${
                    sopViewMode === 'full'
                      ? 'bg-[var(--kg-surface)] text-[var(--kg-primary-ink)] shadow-sm'
                      : 'text-[var(--kg-text-muted)]'
                  }`}
                >
                  <FileText size={13} /> Đầy đủ
                </button>
              </div>
            </div>
          </KgCard>

          {searchTerm.trim() ? (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--kg-text-muted)] px-1">
                Kết quả tìm kiếm cho &ldquo;{searchTerm}&rdquo; ({searchResults.length} kết quả)
              </h3>
              {searchResults.length === 0 ? (
                <KgCard className="p-8 text-center">
                  <HelpCircle size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
                  <p className="text-sm font-bold text-[var(--kg-text)]">Không tìm thấy kết quả nào</p>
                  <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                    Hãy thử tìm từ khóa khác hoặc bấm King&apos;s Grill AI Assistant để hỏi nhanh nhé.
                  </p>
                </KgCard>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {searchResults.map(({ sectionTitle, sectionId, item, excerpt, isCritical, matchedTerms }) => {
                    const resultKey = `${sectionId}:${item.subtitle}`;
                    const isOpen = sopViewMode === 'full' || (openAccordions[resultKey] ?? false);
                    return (
                      <KgCard key={resultKey} className="overflow-hidden p-0 border border-[var(--kg-border)]">
                        <button
                          type="button"
                          onClick={() => toggleAccordion(resultKey)}
                          className="w-full min-h-[44px] flex items-start justify-between gap-3 p-4 bg-[var(--kg-surface-soft)] text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-1.5 mb-1">
                              <span className="text-[10px] uppercase font-bold text-[var(--kg-primary-ink)] tracking-wider">
                                {sectionTitle}
                              </span>
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--kg-danger-soft)] px-2 py-0.5 text-[9px] font-extrabold uppercase text-[var(--kg-danger)]">
                                  <ShieldAlert size={10} /> Quan trọng
                                </span>
                              )}
                            </div>
                            <h4 className="font-extrabold text-[var(--kg-text)] text-sm leading-snug">
                              {item.subtitle}
                            </h4>
                            {!isOpen && (
                              <p className="mt-2 text-xs leading-relaxed text-[var(--kg-text-muted)] line-clamp-3">
                                {excerpt}
                              </p>
                            )}
                            {matchedTerms.length > 0 && !isOpen && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {matchedTerms.slice(0, 4).map((term) => (
                                  <span
                                    key={term}
                                    className="rounded-md bg-[var(--kg-info-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--kg-info)]"
                                  >
                                    {term}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isOpen ? (
                            <ChevronUp size={16} className="text-[var(--kg-text-muted)] mt-1" />
                          ) : (
                            <ChevronDown size={16} className="text-[var(--kg-text-muted)] mt-1" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="p-4 sm:p-5 bg-[var(--kg-surface)] border-t border-[var(--kg-border)]">
                            <SopDetailsRenderer html={item.details} />
                          </div>
                        )}
                      </KgCard>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mobile Category Selector */}
              <div className="block lg:hidden w-full">
                <button
                  type="button"
                  onClick={() => setIsMobileCategoryOpen(true)}
                  className="w-full min-h-[44px] flex items-center justify-between p-3.5 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs active:scale-[0.99] transition-all font-bold text-sm text-[var(--kg-text)] touch-manipulation"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {activeSopSection && (
                      <SopIcon
                        name={activeSopSection.icon}
                        size={16}
                        className="text-[var(--kg-primary-ink)] flex-shrink-0"
                      />
                    )}
                    <span className="truncate">{activeSopSection?.title || 'Chọn danh mục quy trình'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--kg-text-muted)] flex-shrink-0">
                    <span>Thay đổi</span>
                    <ChevronDown size={14} />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Desktop Left Category List */}
                <div className="hidden lg:block lg:col-span-4 space-y-4">
                  <KgCard className="p-4 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--kg-text-muted)] border-b border-[var(--kg-border)] pb-2 mb-2">
                        Tiêu chuẩn chung
                      </h3>
                      <div className="space-y-1">
                        {generalSops.map((section) => (
                          <button
                            type="button"
                            key={section.id}
                            onClick={() => setSelectedSection(section.id)}
                            className={`w-full min-h-[40px] flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 active:scale-95 ${
                              effectiveSelectedSection === section.id
                                ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                                : 'text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
                            }`}
                          >
                            <SopIcon
                              name={section.icon}
                              size={15}
                              className={`flex-shrink-0 ${
                                effectiveSelectedSection === section.id
                                  ? 'text-white'
                                  : 'text-[var(--kg-text-muted)]'
                              }`}
                            />
                            <span className="truncate flex-1">{section.title}</span>
                            {readSopIds.includes(section.id) && (
                              <CheckCircle2
                                size={13}
                                className={
                                  effectiveSelectedSection === section.id
                                    ? 'text-white/90 shrink-0'
                                    : 'text-[var(--kg-success)] shrink-0'
                                }
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--kg-text-muted)] border-b border-[var(--kg-border)] pb-2 mb-2">
                        Quy trình bộ phận
                      </h3>
                      <div className="space-y-1">
                        {departmentSops.map((section) => (
                          <button
                            type="button"
                            key={section.id}
                            onClick={() => setSelectedSection(section.id)}
                            className={`w-full min-h-[40px] flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 active:scale-95 ${
                              effectiveSelectedSection === section.id
                                ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                                : 'text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
                            }`}
                          >
                            <SopIcon
                              name={section.icon}
                              size={15}
                              className={`flex-shrink-0 ${
                                effectiveSelectedSection === section.id
                                  ? 'text-white'
                                  : 'text-[var(--kg-text-muted)]'
                              }`}
                            />
                            <span className="truncate flex-1">{section.title}</span>
                            {readSopIds.includes(section.id) && (
                              <CheckCircle2
                                size={13}
                                className={
                                  effectiveSelectedSection === section.id
                                    ? 'text-white/90 shrink-0'
                                    : 'text-[var(--kg-success)] shrink-0'
                                }
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </KgCard>
                </div>

                {/* Right Column: Active Section Details */}
                <div className="lg:col-span-8 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {activeSopSection && (
                        <>
                          <SopIcon
                            name={activeSopSection.icon}
                            size={18}
                            className="text-[var(--kg-primary-ink)] flex-shrink-0"
                          />
                          <h3 className="text-base font-extrabold text-[var(--kg-text)] truncate">
                            {activeSopSection.title}
                          </h3>
                        </>
                      )}
                    </div>
                    {activeSopSection && (
                      <button
                        type="button"
                        onClick={() => toggleMarkSopRead(activeSopSection.id)}
                        className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation border ${
                          readSopIds.includes(activeSopSection.id)
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                            : 'bg-[var(--kg-surface)] text-[var(--kg-primary-ink)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        <span>
                          {readSopIds.includes(activeSopSection.id)
                            ? 'Đã xác nhận nắm vững SOP'
                            : 'Xác nhận đã đọc & nắm vững'}
                        </span>
                      </button>
                    )}
                  </div>

                  {activeSopItems.map((item, idx) => {
                    const isOpen = sopViewMode === 'full' || (openAccordions[item.subtitle] ?? idx === 0);
                    return (
                      <KgCard
                        key={idx}
                        className="overflow-hidden p-0 border border-[var(--kg-border)] animate-fade-in"
                      >
                        <button
                          type="button"
                          onClick={() => toggleAccordion(item.subtitle)}
                          className="w-full min-h-[44px] flex items-center justify-between p-4 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-left touch-manipulation"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.icon && (
                              <SopIcon
                                name={item.icon}
                                size={15}
                                className="text-[var(--kg-primary-ink)] flex-shrink-0"
                              />
                            )}
                            <h4 className="font-extrabold text-[var(--kg-text)] text-sm truncate">
                              {item.subtitle}
                            </h4>
                          </div>
                          {isOpen ? (
                            <ChevronUp size={16} className="text-[var(--kg-text-muted)] shrink-0" />
                          ) : (
                            <ChevronDown size={16} className="text-[var(--kg-text-muted)] shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="p-4 sm:p-5 bg-[var(--kg-surface)]">
                            <SopDetailsRenderer html={item.details} />
                          </div>
                        )}
                        {!isOpen && sopViewMode === 'quick' && (
                          <button
                            type="button"
                            onClick={() => toggleAccordion(item.subtitle)}
                            className="w-full px-5 py-3 text-left bg-[var(--kg-surface-soft)]/50 border-t border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] transition-colors"
                          >
                            <div className="space-y-1">
                              {getQuickSopList(item.details).map((text, bulletIdx) => (
                                <div
                                  key={bulletIdx}
                                  className="flex items-start gap-2 text-xs font-semibold text-[var(--kg-text-muted)] leading-relaxed"
                                >
                                  <span className="text-[var(--kg-primary-ink)] select-none flex-shrink-0">•</span>
                                  <span className="line-clamp-1">{text}</span>
                                </div>
                              ))}
                              <div className="flex items-center gap-1 text-[10px] text-[var(--kg-primary-ink)] font-extrabold mt-1.5 hover:underline">
                                <span>Xem đầy đủ</span>
                                <ChevronDown size={11} />
                              </div>
                            </div>
                          </button>
                        )}
                      </KgCard>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Kiểm tra năng lực */}
      {activeTab === 'quiz' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--kg-text-muted)]">
              <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải bài học...
            </div>
          ) : lessons.length === 0 ? (
            <KgCard className="p-8 text-center border-dashed border-[var(--kg-border)]">
              <GraduationCap size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
              <p className="text-sm text-[var(--kg-text-muted)] font-bold">
                Chưa có bài học nào được cấu hình trên hệ thống.
              </p>
            </KgCard>
          ) : (
            <div className="space-y-3">
              {lessons.map((lesson) => {
                const isCompleted = completedIds.has(lesson.id);
                const isActive = activeLesson === lesson.id;
                const isQuiz = quizMode === lesson.id;

                return (
                  <div
                    key={lesson.id}
                    className="kg-fade-in bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLesson(isActive ? null : lesson.id);
                        if (isActive) {
                          setQuizMode(null);
                          setAnswers({});
                        }
                      }}
                      className="w-full min-h-[44px] flex items-center justify-between p-4 text-left focus:outline-none touch-manipulation"
                    >
                      <div className="flex items-center min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 ${
                            isCompleted
                              ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                              : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-[var(--kg-text)] text-sm truncate">
                            {lesson.title}
                          </h4>
                          <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-[var(--kg-success)] font-sans font-bold">
                                <CheckCircle2 size={11} /> Đã hoàn thành
                              </span>
                            ) : (
                              <>
                                <span>{lesson.quiz.length} câu hỏi</span>
                                <span>•</span>
                                <span className="inline-flex items-center gap-0.5 text-[var(--kg-warning)] font-bold">
                                  +{lesson.points} <Coins size={11} />
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className={`text-[var(--kg-text-muted)] transition-transform flex-shrink-0 ${
                          isActive ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {isActive && !isQuiz && (
                      <div className="kg-fade-in px-4 pb-4 border-t border-[var(--kg-border)] pt-4">
                        <div className="text-sm text-[var(--kg-text-muted)] whitespace-pre-line leading-relaxed mb-4 font-medium max-w-[68ch]">
                          {lesson.content}
                        </div>
                        {!isCompleted && lesson.quiz.length > 0 && (
                          <KgButton
                            onClick={() => startShuffledQuiz(lesson)}
                            className="w-full"
                            icon={Award}
                          >
                            Làm bài kiểm tra (+{lesson.points} King Coins)
                          </KgButton>
                        )}
                        {isCompleted && (
                          <div className="p-3 bg-[var(--kg-success-soft)] rounded-xl text-[var(--kg-success)] text-xs font-bold text-center border border-[var(--kg-success)]/25">
                            ✓ Bạn đã hoàn thành bài này!
                          </div>
                        )}
                      </div>
                    )}

                    {isQuiz && (
                      <div className="kg-fade-in px-4 pb-4 border-t border-[var(--kg-warning)]/25 pt-4 bg-[var(--kg-surface-soft)]/40">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Award size={18} className="text-[var(--kg-warning)]" />
                            <h4 className="font-extrabold text-[var(--kg-text)] text-sm">
                              Trắc nghiệm: {lesson.title}
                            </h4>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25">
                            Đạt ≥70% • Tự đảo đáp án
                          </span>
                        </div>

                        {wrongReviews.length > 0 && (
                          <div className="mb-4 p-3.5 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-extrabold text-[var(--kg-warning)] flex items-center gap-1.5">
                                <AlertTriangle size={14} className="shrink-0" />
                                Cần ôn lại {wrongReviews.length} câu trước khi làm lượt mới:
                              </p>
                              <button
                                type="button"
                                onClick={() => startShuffledQuiz(lesson)}
                                className="min-h-[36px] text-xs font-black text-[var(--kg-warning)] underline hover:opacity-80 shrink-0 touch-manipulation"
                              >
                                Đảo đề &amp; Thử lại
                              </button>
                            </div>
                            <ul className="space-y-1.5 text-xs text-[var(--kg-text)]">
                              {wrongReviews.map((w) => (
                                <li key={w.questionNumber} className="leading-relaxed">
                                  <b>Câu {w.questionNumber}:</b> Đáp án vừa chọn{' '}
                                  <i>&ldquo;{w.pickedOptionText}&rdquo;</i> chưa chính xác. {w.reviewHint}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="space-y-5">
                          {(activeShuffledSession && activeShuffledSession.lessonId === lesson.id
                            ? activeShuffledSession.questions
                            : lesson.quiz.map((q, qIdx) => ({
                                questionIndex: qIdx,
                                q: q.q,
                                options: q.options,
                                shuffledToCanonical: q.options.map((_, i) => i),
                                canonicalAnswer: q.answer,
                              }))
                          ).map((q, qIdx) => (
                            <div key={qIdx}>
                              <p className="text-sm font-bold text-[var(--kg-text)] mb-2">
                                Câu {qIdx + 1}: {q.q}
                              </p>
                              <div className="space-y-2.5">
                                {q.options.map((opt, oIdx) => {
                                  const isSelected = answers[qIdx] === oIdx;
                                  return (
                                    <label
                                      key={oIdx}
                                      className={`flex items-center p-3.5 min-h-[44px] border-2 rounded-2xl cursor-pointer transition-all active:scale-[0.99] select-none touch-manipulation ${
                                        isSelected
                                          ? 'border-[var(--kg-warning)] bg-[var(--kg-warning-soft)] shadow-xs'
                                          : 'border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-border-strong)]'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`q${lesson.id}_${qIdx}`}
                                        checked={isSelected}
                                        onChange={() => setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                                        className="text-[var(--kg-warning)] mr-3 w-4 h-4 focus:ring-[var(--kg-warning)] focus:ring-offset-0"
                                      />
                                      <span
                                        className={`text-xs sm:text-sm leading-relaxed ${
                                          isSelected
                                            ? 'text-[var(--kg-text)] font-black'
                                            : 'text-[var(--kg-text-muted)] font-semibold'
                                        }`}
                                      >
                                        {opt}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-3 mt-5">
                          <KgButton
                            variant="secondary"
                            onClick={() => {
                              setQuizMode(null);
                              setActiveShuffledSession(null);
                              setWrongReviews([]);
                              setAnswers({});
                            }}
                            className="flex-1"
                          >
                            Quay lại
                          </KgButton>
                          {(() => {
                            const answeredCount = lesson.quiz.reduce(
                              (count, _q, idx) => (answers[idx] !== undefined ? count + 1 : count),
                              0,
                            );
                            const unansweredCount = Math.max(0, lesson.quiz.length - answeredCount);
                            return (
                              <KgButton
                                variant="warning"
                                onClick={() => void handleSubmitQuiz(lesson)}
                                disabled={unansweredCount > 0}
                                className="flex-1"
                              >
                                {unansweredCount > 0
                                  ? `Còn ${unansweredCount}/${lesson.quiz.length} câu chưa chọn`
                                  : 'Nộp bài kiểm tra'}
                              </KgButton>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: CUKCUK */}
      {activeTab === 'cukcuk' && (
        <div className="space-y-4">
          <div className="w-full">
            <KgInput
              placeholder="Tìm kiếm bước hướng dẫn (ví dụ: đăng nhập, hủy món, chuyển bàn...)"
              value={cukcukSearch}
              onChange={(e) => setCukcukSearch(e.target.value)}
              icon={Search}
              className="w-full"
              rightAdornment={
                cukcukSearch ? (
                  <button
                    type="button"
                    onClick={() => setCukcukSearch('')}
                    className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors touch-manipulation"
                    aria-label="Xóa tìm kiếm CUKCUK"
                  >
                    <X size={16} />
                  </button>
                ) : null
              }
            />
          </div>

          {cukcukLoading ? (
            <KgCard className="p-8 text-center">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-[var(--kg-primary)]" />
              <p className="text-xs font-semibold text-[var(--kg-text-muted)]">
                Đang tải hướng dẫn CUKCUK...
              </p>
            </KgCard>
          ) : filteredCukcukSteps.length === 0 ? (
            <KgCard className="p-8 text-center border-dashed border-[var(--kg-border)]">
              <HelpCircle size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
              <p className="text-sm text-[var(--kg-text-muted)] font-bold">
                Không tìm thấy bước hướng dẫn nào khớp với từ khóa.
              </p>
            </KgCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCukcukSteps.map((stepItem) => {
                const originalIndex = cukcukData.findIndex((item) => item.step === stepItem.step);

                return (
                  <div
                    key={stepItem.step}
                    className="kg-fade-in flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] shadow-xs hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="p-4 border-b border-[var(--kg-border)] flex items-center justify-between gap-2 bg-[var(--kg-surface-soft)]/60">
                      <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-[var(--kg-info-soft)] text-[var(--kg-info)] shrink-0">
                        Bước {stepItem.step < 10 ? `0${stepItem.step}` : stepItem.step}
                      </span>
                      <h4 className="font-extrabold text-[var(--kg-text)] text-xs truncate">
                        {stepItem.title}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveCukcukIndex(originalIndex)}
                      className="relative overflow-hidden cursor-zoom-in bg-[var(--kg-surface-soft)] flex items-center justify-center border-b border-[var(--kg-border)] aspect-video w-full"
                    >
                      <img
                        src={stepItem.image}
                        alt={stepItem.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <span className="bg-[var(--kg-surface)]/95 text-[var(--kg-text)] text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5">
                          <Eye size={12} /> Xem ảnh rõ nét
                        </span>
                      </div>
                    </button>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-[var(--kg-text-muted)] leading-relaxed font-semibold mb-4 min-h-[48px]">
                        {stepItem.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveCukcukIndex(originalIndex)}
                        className="w-full min-h-[44px] sm:min-h-[38px] py-2 text-center text-xs font-black text-[var(--kg-info)] bg-[var(--kg-info-soft)] hover:brightness-95 rounded-xl transition-all duration-150 touch-manipulation"
                      >
                        Phóng to chi tiết
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile Category Selector Bottom Sheet */}
      <KgBottomSheet
        isOpen={isMobileCategoryOpen}
        onClose={() => setIsMobileCategoryOpen(false)}
        title="Danh mục quy trình (SOP)"
      >
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] border-b border-[var(--kg-border)] pb-2 mb-2">
              Tiêu chuẩn chung
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {generalSops.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => {
                    setSelectedSection(section.id);
                    setIsMobileCategoryOpen(false);
                  }}
                  className={`w-full min-h-[44px] flex items-center p-3 rounded-xl text-left text-xs font-bold transition-all gap-3 active:scale-98 touch-manipulation ${
                    effectiveSelectedSection === section.id
                      ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  <SopIcon
                    name={section.icon}
                    size={16}
                    className={`flex-shrink-0 ${
                      effectiveSelectedSection === section.id ? 'text-white' : 'text-[var(--kg-text-muted)]'
                    }`}
                  />
                  <span className="truncate flex-1">{section.title}</span>
                  {readSopIds.includes(section.id) && (
                    <CheckCircle2
                      size={14}
                      className={
                        effectiveSelectedSection === section.id
                          ? 'text-white/90 shrink-0'
                          : 'text-[var(--kg-success)] shrink-0'
                      }
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] border-b border-[var(--kg-border)] pb-2 mb-2">
              Quy trình bộ phận
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {departmentSops.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  onClick={() => {
                    setSelectedSection(section.id);
                    setIsMobileCategoryOpen(false);
                  }}
                  className={`w-full min-h-[44px] flex items-center p-3 rounded-xl text-left text-xs font-bold transition-all gap-3 active:scale-98 touch-manipulation ${
                    effectiveSelectedSection === section.id
                      ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  <SopIcon
                    name={section.icon}
                    size={16}
                    className={`flex-shrink-0 ${
                      effectiveSelectedSection === section.id ? 'text-white' : 'text-[var(--kg-text-muted)]'
                    }`}
                  />
                  <span className="truncate flex-1">{section.title}</span>
                  {readSopIds.includes(section.id) && (
                    <CheckCircle2
                      size={14}
                      className={
                        effectiveSelectedSection === section.id
                          ? 'text-white/90 shrink-0'
                          : 'text-[var(--kg-success)] shrink-0'
                      }
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </KgBottomSheet>

      {/* Lazy-loaded CUKCUK Lightbox */}
      {activeCukcukIndex !== null && cukcukData[activeCukcukIndex] && (
        <Suspense fallback={null}>
          <CukcukGuideLightbox
            steps={cukcukData}
            activeIndex={activeCukcukIndex}
            onSelectIndex={setActiveCukcukIndex}
          />
        </Suspense>
      )}
    </div>
  );
}
