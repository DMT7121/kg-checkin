import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  GraduationCap, BookOpen, Award, CheckCircle2,
  RefreshCw, ChevronRight, Search, Sparkles,
  HelpCircle, BookMarked, UserCheck, ChevronDown, ChevronUp,
  X, Zap, ShieldAlert, ListFilter, Eye, FileText, Tablet,
  Frown, UtensilsCrossed, Receipt, Flame, ShieldCheck, ArrowLeftRight,
  Shield, CalendarClock, Gavel, Heart, BarChart3, ClipboardCheck,
  Star, Briefcase, Users, DoorOpen, Megaphone, CreditCard,
  ChefHat, GlassWater, Banknote, Car, Video, Trash2, AlertTriangle, Coins,
  MessageSquare, type LucideIcon
} from 'lucide-react';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { sopData } from './sopData';
import { cukcukData } from './cukcukData';
import {
  isCriticalSop,
  searchSops,
  sectionMatchesScope,
  type SopScope
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
  KgModuleHero
} from '../components/KgDesignSystem';

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

function formatSopDetailsHtml(html: string): string {
  return html.replace(/<i[^>]*class="([^"]*)"[^>]*><\/i>/gi, (_match, cls: string) => {
    const isDanger = /triangle-exclamation|circle-exclamation|fire|biohazard|ban|gavel/.test(cls);
    const isCheck = /check|award|star|shield/.test(cls);
    const svgPath = isDanger
      ? '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
      : isCheck
      ? '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'
      : '<circle cx="12" cy="12" r="3.5"/>';
    return `<span class="sop-inline-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></span>`;
  });
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
  const store = { setAiOpen };
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

  // Tabs: 'sop' (Sổ tay vận hành) or 'quiz' (Bài học & Đào tạo) or 'cukcuk' (Hướng dẫn CUKCUK)
  const [activeTab, setActiveTab] = useState<'sop' | 'quiz' | 'cukcuk'>('sop');

  // SOP State
  const [selectedSection, setSelectedSection] = useState<string>('welcome');
  const [searchTerm, setSearchTerm] = useState('');
  const [sopScope, setSopScope] = useState<SopScope>('all');
  const [sopViewMode, setSopViewMode] = useState<'quick' | 'full'>('quick');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [isMobileCategoryOpen, setIsMobileCategoryOpen] = useState(false);

  // CUKCUK State
  const [cukcukSearch, setCukcukSearch] = useState('');
  const [activeCukcukIndex, setActiveCukcukIndex] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
  const [isDraggingZoom, setIsDraggingZoom] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartScale, setTouchStartScale] = useState<number>(1);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const resetZoom = () => {
    setZoomScale(1);
    setZoomPos({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    setZoomScale(prev => Math.min(prev + 0.25, 4));
  };
  const zoomOut = () => {
    setZoomScale(prev => Math.max(prev - 0.25, 0.75));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsDraggingZoom(true);
    setDragStart({ x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingZoom || zoomScale <= 1) return;
    setZoomPos({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDraggingZoom(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomIntensity = 0.15;
    const delta = e.deltaY < 0 ? 1 : -1;
    setZoomScale(prev => Math.max(0.75, Math.min(prev + delta * zoomIntensity, 4)));
  };

  const getTouchDistance = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return 0;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = e.timeStamp;
    
    // Check for double-tap zoom
    if (e.touches.length === 1) {
      if (now - lastTouchTime < 300) {
        e.preventDefault();
        handleDoubleClick();
        setLastTouchTime(0); // Reset lastTouchTime
        return;
      }
      setLastTouchTime(now);

      const touch = e.touches[0];
      // single touch starts panning if scale is > 1
      if (zoomScale > 1) {
        setIsDraggingZoom(true);
        setDragStart({ x: touch.clientX - zoomPos.x, y: touch.clientY - zoomPos.y });
      } else {
        // Record starting touch coordinates for swiping
        setSwipeStartX(touch.clientX);
        setSwipeStartY(touch.clientY);
      }
    } else if (e.touches.length === 2) {
      // Two-finger touch starts pinch zoom
      const dist = getTouchDistance(e);
      setTouchStartDist(dist);
      setTouchStartScale(zoomScale);
      setIsDraggingZoom(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      e.preventDefault();
      const currentDist = getTouchDistance(e);
      if (currentDist > 0) {
        const scaleRatio = currentDist / touchStartDist;
        const newScale = Math.max(0.75, Math.min(touchStartScale * scaleRatio, 4));
        setZoomScale(newScale);
      }
    } else if (e.touches.length === 1) {
      if (isDraggingZoom && zoomScale > 1) {
        e.preventDefault();
        const touch = e.touches[0];
        setZoomPos({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y
        });
      } else if (zoomScale === 1 && swipeStartX !== null && swipeStartY !== null) {
        const touch = e.touches[0];
        const diffX = touch.clientX - swipeStartX;
        const diffY = touch.clientY - swipeStartY;
        if (Math.abs(diffX) > Math.abs(diffY)) {
          // Prevent scroll if swiping horizontally
          if (e.cancelable) e.preventDefault();
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDraggingZoom(false);
    setTouchStartDist(null);

    // Handle swiping
    if (zoomScale === 1 && swipeStartX !== null && swipeStartY !== null && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const diffX = touch.clientX - swipeStartX;
      const diffY = touch.clientY - swipeStartY;

      // Threshold for swipe: 60px
      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          // Swiped left -> Next step
          if (activeCukcukIndex !== null && activeCukcukIndex < cukcukData.length - 1) {
            setActiveCukcukIndex(activeCukcukIndex + 1);
          }
        } else {
          // Swiped right -> Previous step
          if (activeCukcukIndex !== null && activeCukcukIndex > 0) {
            setActiveCukcukIndex(activeCukcukIndex - 1);
          }
        }
      }
    }
    setSwipeStartX(null);
    setSwipeStartY(null);
  };

  const handleDoubleClick = () => {
    if (zoomScale > 1) {
      resetZoom();
    } else {
      setZoomScale(2);
      setZoomPos({ x: 0, y: 0 });
    }
  };

  // Keyboard events inside lightbox
  useEffect(() => {
    if (activeCukcukIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveCukcukIndex(null);
      } else if (e.key === 'ArrowLeft') {
        if (activeCukcukIndex > 0) {
          setActiveCukcukIndex(activeCukcukIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (activeCukcukIndex < cukcukData.length - 1) {
          setActiveCukcukIndex(activeCukcukIndex + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeCukcukIndex]);

  // Reset zoom and description whenever active step changes
  const [prevCukcukIndex, setPrevCukcukIndex] = useState<number | null>(activeCukcukIndex);
  if (activeCukcukIndex !== prevCukcukIndex) {
    setPrevCukcukIndex(activeCukcukIndex);
    setZoomScale(1);
    setZoomPos({ x: 0, y: 0 });
    setShowDescription(false);
  }

  // Filter cukcuk steps
  const filteredCukcukSteps = useMemo(() => {
    const term = cukcukSearch.trim().toLowerCase();
    if (!term) return cukcukData;
    return cukcukData.filter(
      item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        `bước ${item.step}`.includes(term)
    );
  }, [cukcukSearch]);



  // Fetch training lessons
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [contentRes, progressRes] = await Promise.all([
          callApi('GET_TRAINING_CONTENT', {}, { background: true }),
          callApi('GET_TRAINING_PROGRESS', { username: currentUser!.username }, { background: true })
        ]);
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
      }
      setLoading(false);
    };
    fetchData();
  }, [currentUser]);



  const totalLessons = lessons.length;
  const completedCount = [...completedIds].filter(id => lessons.some(l => l.id === id)).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const roleReadiness = useMemo(
    () =>
      computeRoleReadinessProgress({
        position: currentUser?.position,
        completedSopIds: readSopIds,
        completedLessonIds: completedIds,
        availableLessons: lessons,
      }),
    [currentUser?.position, readSopIds, completedIds, lessons]
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
      `${currentUser?.username || 'staff'}-${lesson.id}-${nextNonce}`
    );
    setActiveShuffledSession(session);
    setWrongReviews([]);
    setQuizMode(lesson.id);
    setAnswers({});
  };

  const handleSubmitQuiz = async (lesson: Lesson) => {
    const session =
      activeShuffledSession && activeShuffledSession.lessonId === lesson.id
        ? activeShuffledSession
        : createShuffledQuizSession(lesson.id, lesson.quiz, `${lesson.id}-fallback`);

    const evaluation = evaluateShuffledQuizAttempt(session, answers, 70);

    if (!evaluation.passed) {
      setWrongReviews(evaluation.wrongReviews);
      Swal.fire({
        title: 'Chưa đạt yêu cầu',
        html: `Bạn trả lời đúng <b class="tabular-nums">${evaluation.correctCount}/${evaluation.totalQuestions}</b> câu (<b class="tabular-nums">${evaluation.scorePct}%</b>).<br/>Cần đạt tối thiểu <b>70%</b> để hoàn thành. Hãy xem gợi ý ôn tập bên dưới và bấm <b>Đảo đề &amp; Thử lại</b>.`,
        icon: 'warning',
        confirmButtonText: 'Xem câu cần ôn lại',
        confirmButtonColor: '#d97706'
      });
      return;
    }

    const res = await callApi('SUBMIT_TRAINING_QUIZ', {
      username: currentUser!.username,
      fullname: currentUser!.fullname,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      score: evaluation.scorePct,
      points: lesson.points
    });

    if (res?.ok) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f59e0b', '#22c55e', '#3b82f6'] });
      setCompletedIds(prev => new Set([...prev, lesson.id]));
      setQuizMode(null);
      setActiveShuffledSession(null);
      setWrongReviews([]);
      setAnswers({});
      Swal.fire({
        title: 'Hoàn thành xuất sắc!',
        html: `Điểm: <b class="tabular-nums">${evaluation.scorePct}%</b> (${evaluation.correctCount}/${evaluation.totalQuestions})<br/>+${lesson.points} King Coins đã được cộng!`,
        icon: 'success',
        confirmButtonColor: '#4F8A5B'
      });
    } else {
      Swal.fire('Lưu ý', res?.message || 'Không thể ghi nhận kết quả', 'info');
    }
  };

  // Toggle Accordion in SOP view
  const toggleAccordion = (subtitle: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [subtitle]: !prev[subtitle]
    }));
  };

  const searchResults = useMemo(
    () => searchSops(sopData, searchTerm, sopScope, currentUser?.position),
    [searchTerm, sopScope, currentUser?.position]
  );

  const visibleSopSections = useMemo(
    () => sopData.filter(section => sectionMatchesScope(section, sopScope, currentUser?.position)),
    [sopScope, currentUser?.position]
  );

  if (visibleSopSections.length > 0 && !visibleSopSections.some(section => section.id === selectedSection)) {
    setSelectedSection(visibleSopSections[0].id);
  }

  // Pre-load active section content
  const activeSopSection = visibleSopSections.find(s => s.id === selectedSection) || visibleSopSections[0];
  const activeSopItems = activeSopSection?.content.filter(
    item => sopScope !== 'critical' || isCriticalSop(activeSopSection, item)
  ) || [];
  const generalSops = visibleSopSections.filter(s => s.group === 'general');
  const departmentSops = visibleSopSections.filter(s => s.group === 'department');

  const getQuickSopList = (html: string): string[] => {
    const liMatches = html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (liMatches && liMatches.length > 0) {
      return liMatches
        .slice(0, 3)
        .map(li => {
          let clean = li.replace(/<[^>]+>/g, '').trim();
          clean = clean.replace(/\s+/g, ' ');
          return clean;
        })
        .filter(Boolean);
    }
    const cleanHtml = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = cleanHtml.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    return sentences.slice(0, 2);
  };

  return (
    <div className="p-4 animate-slide-up pb-12 space-y-4 max-w-7xl mx-auto w-full">
      <style>{`
        .sop-content-details ul {
          list-style-type: none;
          padding-left: 0 !important;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .sop-content-details li {
          margin-bottom: 0.75rem;
          color: inherit;
          display: flex;
          align-items: flex-start;
          line-height: 1.6;
        }
        .sop-content-details li .sop-inline-icon {
          flex-shrink: 0;
          width: 1.25rem;
          margin-right: 0.65rem;
          margin-top: 4px;
          color: var(--kg-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .sop-content-details strong {
          color: inherit;
          font-weight: 700;
        }
        .sop-content-details a {
          color: var(--kg-primary);
          font-weight: 600;
          text-decoration: underline;
        }
        .sop-content-details a:hover {
          opacity: 0.8;
        }
        .sop-content-details li.icon-tip .sop-inline-icon { color: #0891b2 !important; }
        .sop-content-details li.icon-note .sop-inline-icon { color: #ca8a04 !important; }
        .sop-content-details li.icon-danger .sop-inline-icon { color: #dc2626 !important; }
        .sop-content-details li.icon-script .sop-inline-icon { color: #6b7280 !important; }
        .sop-content-details li.icon-script span {
          font-family: monospace;
          font-style: italic;
          background-color: rgba(0, 0, 0, 0.05);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .dark .sop-content-details li.icon-script span {
          background-color: rgba(255, 255, 255, 0.1);
        }
        .sop-content-details ol {
          list-style-type: none;
          padding-left: 0 !important;
          margin-top: 0.5rem;
          width: 100%;
        }
        .sop-content-details ol li {
          margin-bottom: 0.5rem;
        }
        .chat-bubble-content hr {
          border-top: 1px solid #E8DED1;
          margin: 0.75rem 0;
        }
        .dark .chat-bubble-content hr {
          border-top: 1px solid #1E3F57;
        }
      `}</style>
      {/* Header Banner */}
      <KgModuleHero
        moduleId="training"
        eyebrow="Đào tạo SOP"
        title="Sổ Tay Vận Hành & Đào Tạo"
        description="Tra cứu quy trình chuẩn (SOP), nội quy nhà hàng và làm bài kiểm tra nghiệp vụ tích lũy King Coins."
        features={totalLessons > 0 ? [`${completedCount}/${totalLessons} bài hoàn thành`] : [`${sopData.length} chuyên đề SOP`]}
        tipTitle="Hướng dẫn Tự học & Kiểm tra SOP"
        tips={[
          "Tab SOP: Hướng dẫn chi tiết từng vị trí (Phục vụ, Pha chế, Bếp, Thu ngân, Vệ sinh).",
          "Tab Bài kiểm tra: Trả lời 10 câu hỏi trắc nghiệm thực tế, đạt trên 80% sẽ nhận chứng chỉ và +50 King Coins.",
          "Tab Trợ lý AI: Hỏi đáp trực tiếp các tình huống giao tiếp với khách hàng hoặc xử lý sự cố."
        ]}
      />

      {/* Role-Readiness Certification Track */}
      <KgCard className="p-4 sm:p-5 border border-[var(--kg-border)] shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[var(--kg-primary-soft)] text-[var(--kg-primary)]">
                <GraduationCap size={13} />
                {currentUser?.position || 'Nhân sự Vận hành'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                  roleReadiness.isRoleCertified
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/50'
                }`}
              >
                {roleReadiness.isRoleCertified ? <ShieldCheck size={13} /> : <Zap size={13} />}
                {roleReadiness.isRoleCertified ? `Đã mở khóa: ${roleReadiness.badgeLabel}` : 'Đang mở khóa chuẩn vị trí'}
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
            <p className="text-lg sm:text-xl font-black font-mono tabular-nums text-[var(--kg-primary)]">
              {roleReadiness.completionPct}%
            </p>
            <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] font-semibold">
              {roleReadiness.completedMilestones}/{roleReadiness.totalMilestones} mốc chuẩn
            </p>
          </div>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              roleReadiness.isRoleCertified ? 'bg-emerald-500' : 'bg-[var(--kg-primary)]'
            }`}
            style={{ width: `${roleReadiness.completionPct}%` }}
          />
        </div>

        {roleReadiness.nextAction && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <p className="text-xs font-semibold text-[var(--kg-text-muted)]">
              Bước tiếp theo: <span className="text-[var(--kg-text)] font-bold">{roleReadiness.nextAction.label}</span>
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
              className="px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-95 transition-all shrink-0"
            >
              <span>Tiếp tục lộ trình</span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </KgCard>

      {/* Tab Buttons */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-6 p-1.5 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('sop')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 flex-shrink-0 select-none ${
              activeTab === 'sop'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <BookMarked size={15} /> Tra cứu SOP
            {activeTab === 'sop' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 relative flex-shrink-0 select-none ${
              activeTab === 'quiz'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <UserCheck size={15} /> Kiểm tra năng lực
            {activeTab === 'quiz' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-0.5" />}
            {totalLessons > 0 && completedCount < totalLessons && activeTab !== 'quiz' && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cukcuk')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all active:scale-95 flex-shrink-0 select-none ${
              activeTab === 'cukcuk'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <Tablet size={15} /> Hướng dẫn CUKCUK
            {activeTab === 'cukcuk' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-0.5" />}
          </button>
      </div>

      {/* Tab 1: Tra cứu SOP */}
      {activeTab === 'sop' && (
        <div className="space-y-4">
          {/* Controls: Search & AI Assistant button */}
          <div className="flex flex-col sm:flex-row gap-3 w-full items-stretch sm:items-center">
            <div className="relative flex-1 min-w-0">
              <KgInput
                placeholder="Tìm tình huống, quy trình hoặc nhiệm vụ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={Search}
                className="w-full"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]"
                  aria-label="Xóa nội dung tìm kiếm"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <KgButton
              variant="primary"
              onClick={() => store.setAiOpen(true)}
              icon={Sparkles}
              className="bg-[var(--kg-primary)] border-none text-white hover:opacity-90 h-[44px] shadow-xs"
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
                {QUICK_SOP_QUERIES.map(item => {
                  const QuickIcon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setSearchTerm(item.query);
                        setSopScope('all');
                      }}
                      className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
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
                {SOP_SCOPES.map(scope => (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => setSopScope(scope.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                      sopScope === scope.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {scope.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex p-1 rounded-xl bg-[var(--kg-surface-soft)] self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setSopViewMode('quick')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                    sopViewMode === 'quick' ? 'bg-[var(--kg-surface)] text-blue-600 shadow-sm' : 'text-[var(--kg-text-muted)]'
                  }`}
                >
                  <Eye size={13} /> Xem nhanh
                </button>
                <button
                  type="button"
                  onClick={() => setSopViewMode('full')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                    sopViewMode === 'full' ? 'bg-[var(--kg-surface)] text-blue-600 shadow-sm' : 'text-[var(--kg-text-muted)]'
                  }`}
                >
                  <FileText size={13} /> Đầy đủ
                </button>
              </div>
            </div>
          </KgCard>

          {/* SOP Explorer Layout */}
          {searchTerm.trim() ? (
            /* Search Results View */
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6F7785] dark:text-[#A0ABC0] px-1">
                Kết quả tìm kiếm cho &ldquo;{searchTerm}&rdquo; ({searchResults.length} kết quả)
              </h3>
              {searchResults.length === 0 ? (
                <KgCard className="p-8 text-center">
                  <HelpCircle size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm font-bold text-gray-800 dark:text-white">Không tìm thấy kết quả nào</p>
                  <p className="text-xs text-gray-500 mt-1">Hãy thử tìm từ khóa khác hoặc bấm King's Grill AI Assistant để hỏi nhanh nhé.</p>
                </KgCard>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {searchResults.map(({ sectionTitle, sectionId, item, excerpt, isCritical, matchedTerms }) => {
                    const resultKey = `${sectionId}:${item.subtitle}`;
                    const isOpen = sopViewMode === 'full' || (openAccordions[resultKey] ?? false);
                    return (
                      <KgCard key={resultKey} className="overflow-hidden p-0 border border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => toggleAccordion(resultKey)}
                          className="w-full flex items-start justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-1.5 mb-1">
                              <span className="text-[10px] uppercase font-bold text-[var(--kg-primary)] tracking-wider">
                                {sectionTitle}
                              </span>
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[9px] font-extrabold uppercase text-red-600 dark:text-red-300">
                                  <ShieldAlert size={10} /> Quan trọng
                                </span>
                              )}
                            </div>
                            <h4 className="font-extrabold text-slate-800 dark:text-white text-sm leading-snug">{item.subtitle}</h4>
                            {!isOpen && (
                              <p className="mt-2 text-xs leading-relaxed text-[var(--kg-text-muted)] line-clamp-3">
                                {excerpt}
                              </p>
                            )}
                            {matchedTerms.length > 0 && !isOpen && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {matchedTerms.slice(0, 4).map(term => (
                                  <span key={term} className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-300">
                                    {term}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isOpen ? <ChevronUp size={16} className="text-slate-400 mt-1" /> : <ChevronDown size={16} className="text-slate-400 mt-1" />}
                        </button>
                        {isOpen && (
                          <div className="p-4 sm:p-5 bg-[var(--kg-surface)] border-t border-[var(--kg-border)] text-sm text-[var(--kg-text)] leading-relaxed font-medium sop-content-details">
                            <div className="max-w-[68ch]" dangerouslySetInnerHTML={{ __html: formatSopDetailsHtml(item.details) }} />
                          </div>
                        )}
                      </KgCard>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Regular Categories View */
            <div className="space-y-4">
              {/* Mobile Category Selector */}
              <div className="block lg:hidden w-full">
                <button
                  type="button"
                  onClick={() => setIsMobileCategoryOpen(true)}
                  className="w-full flex items-center justify-between p-3.5 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs active:scale-[0.99] transition-all font-bold text-sm text-[var(--kg-text)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {activeSopSection && <SopIcon name={activeSopSection.icon} size={16} className="text-[var(--kg-primary)] flex-shrink-0" />}
                    <span className="truncate">{activeSopSection?.title || 'Chọn danh mục quy trình'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                    <span>Thay đổi</span>
                    <ChevronDown size={14} />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column: Category selector list */}
                <div className="hidden lg:block lg:col-span-4 space-y-4">
                <KgCard className="p-4 space-y-4">
                  {/* General Category Group */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#9AA1AA] border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                      Tiêu chuẩn chung
                    </h3>
                    <div className="space-y-1">
                      {generalSops.map(section => (
                        <button
                          key={section.id}
                          onClick={() => setSelectedSection(section.id)}
                          className={`w-full flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 active:scale-95 ${
                            selectedSection === section.id
                              ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <SopIcon name={section.icon} size={15} className={`flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span className="truncate">{section.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Department Category Group */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#9AA1AA] border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                      Quy trình bộ phận
                    </h3>
                    <div className="space-y-1">
                      {departmentSops.map(section => (
                        <button
                          key={section.id}
                          onClick={() => setSelectedSection(section.id)}
                          className={`w-full flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 active:scale-95 ${
                            selectedSection === section.id
                              ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <SopIcon name={section.icon} size={15} className={`flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span className="truncate">{section.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </KgCard>
              </div>

              {/* Right Column: Active section details */}
              <div className="lg:col-span-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {activeSopSection && (
                      <>
                        <SopIcon name={activeSopSection.icon} size={18} className="text-[var(--kg-primary)] flex-shrink-0" />
                        <h3 className="text-base font-extrabold text-slate-800 dark:text-white truncate">
                          {activeSopSection.title}
                        </h3>
                      </>
                    )}
                  </div>
                  {activeSopSection && (
                    <button
                      type="button"
                      onClick={() => toggleMarkSopRead(activeSopSection.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-all active:scale-95 ${
                        readSopIds.includes(activeSopSection.id)
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-[var(--kg-surface)] text-[var(--kg-primary)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
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
                  const isOpen = sopViewMode === 'full' || (openAccordions[item.subtitle] ?? (idx === 0));
                  return (
                    <KgCard key={idx} className="overflow-hidden p-0 border border-[var(--kg-border)] animate-fade-in">
                      <button
                        onClick={() => toggleAccordion(item.subtitle)}
                        className="w-full flex items-center justify-between p-4 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.icon && <SopIcon name={item.icon} size={15} className="text-[var(--kg-primary)] flex-shrink-0" />}
                          <h4 className="font-extrabold text-[var(--kg-text)] text-sm truncate">{item.subtitle}</h4>
                        </div>
                        {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="p-4 sm:p-5 bg-[var(--kg-surface)] text-sm text-[var(--kg-text)] leading-relaxed font-medium sop-content-details">
                          <div className="max-w-[68ch]" dangerouslySetInnerHTML={{ __html: formatSopDetailsHtml(item.details) }} />
                        </div>
                      )}
                      {!isOpen && sopViewMode === 'quick' && (
                        <button
                          type="button"
                          onClick={() => toggleAccordion(item.subtitle)}
                          className="w-full px-5 py-3 text-left bg-[var(--kg-surface-soft)]/50 border-t border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] transition-colors"
                        >
                          <div className="space-y-1">
                            {getQuickSopList(item.details).map((text, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs font-semibold text-[var(--kg-text-muted)] leading-relaxed">
                                <span className="text-[var(--kg-primary)] select-none flex-shrink-0">•</span>
                                <span className="line-clamp-1">{text}</span>
                              </div>
                            ))}
                            <div className="flex items-center gap-1 text-[10px] text-[var(--kg-primary)] font-extrabold mt-1.5 hover:underline">
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
        <div className="space-y-4">
          {/* Progress Overview */}
          <KgCard className="p-4 shadow-xs border-[var(--kg-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tiến độ bài học kiểm tra</span>
              <span className="text-sm font-black font-mono tabular-nums text-[var(--kg-primary)]">{completedCount}/{totalLessons} bài</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-[var(--kg-primary)] h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-right text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1.5 font-bold">{progressPct}% Hoàn thành</p>
          </KgCard>

          {/* Lessons List */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#6F7785]">
              <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải bài học...
            </div>
          ) : lessons.length === 0 ? (
            <KgCard className="p-8 text-center border-dashed border-slate-100 dark:border-slate-800">
              <GraduationCap size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 font-bold">Chưa có bài học nào được cấu hình trên hệ thống.</p>
            </KgCard>
          ) : (
            <div className="space-y-3">
              {lessons.map((lesson, idx) => {
                const isCompleted = completedIds.has(lesson.id);
                const isActive = activeLesson === lesson.id;
                const isQuiz = quizMode === lesson.id;

                return (
                  <motion.div
                    key={lesson.id}
                    className="soft3d-card overflow-hidden"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                  >
                    {/* Lesson Header */}
                    <button
                      onClick={() => {
                        setActiveLesson(isActive ? null : lesson.id);
                        if (isActive) {
                          setQuizMode(null);
                          setAnswers({});
                        }
                      }}
                      className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
                    >
                      <div className="flex items-center min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                        }`}>
                          {isCompleted ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-slate-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                                <CheckCircle2 size={11} /> Đã hoàn thành
                              </span>
                            ) : (
                              <>
                                <span>{lesson.quiz.length} câu hỏi</span>
                                <span>•</span>
                                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-bold">
                                  +{lesson.points} <Coins size={11} />
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className={`text-gray-400 transition-transform flex-shrink-0 ${isActive ? 'rotate-90' : ''}`} />
                    </button>

                    {/* Lesson Content */}
                    {isActive && !isQuiz && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4"
                      >
                        <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed mb-4 font-medium max-w-[68ch]">
                          {lesson.content}
                        </div>
                        {!isCompleted && lesson.quiz.length > 0 && (
                          <KgButton
                            onClick={() => startShuffledQuiz(lesson)}
                            className="w-full bg-[var(--kg-primary)] hover:opacity-95 text-white"
                            icon={Award}
                          >
                            Làm bài kiểm tra (+{lesson.points} King Coins)
                          </KgButton>
                        )}
                        {isCompleted && (
                          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center border border-emerald-100 dark:border-emerald-900/10">
                            ✓ Bạn đã hoàn thành bài này!
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Quiz Mode */}
                    {isQuiz && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="px-4 pb-4 border-t border-amber-100 dark:border-amber-900/30 pt-4 bg-amber-50/20 dark:bg-amber-950/5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Award size={18} className="text-amber-500" />
                            <h4 className="font-extrabold text-slate-800 dark:text-white text-sm">Trắc nghiệm: {lesson.title}</h4>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                            Đề chống học vẹt • Tự đảo đáp án
                          </span>
                        </div>

                        {wrongReviews.length > 0 && (
                          <div className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                                Cần ôn lại {wrongReviews.length} câu trước khi làm lượt mới:
                              </p>
                              <button
                                type="button"
                                onClick={() => startShuffledQuiz(lesson)}
                                className="text-xs font-black text-amber-700 dark:text-amber-300 underline hover:opacity-80 shrink-0"
                              >
                                Đảo đề &amp; Thử lại
                              </button>
                            </div>
                            <ul className="space-y-1.5 text-xs text-amber-900/90 dark:text-amber-200/90">
                              {wrongReviews.map((w) => (
                                <li key={w.questionNumber} className="leading-relaxed">
                                  <b>Câu {w.questionNumber}:</b> Đáp án vừa chọn <i>&ldquo;{w.pickedOptionText}&rdquo;</i> chưa chính xác. {w.reviewHint}
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
                              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Câu {qIdx + 1}: {q.q}
                              </p>
                                <div className="space-y-2.5">
                                  {q.options.map((opt, oIdx) => {
                                    const isSelected = answers[qIdx] === oIdx;
                                    return (
                                      <label
                                        key={oIdx}
                                        className={`flex items-center p-3.5 border-2 rounded-2xl cursor-pointer transition-all active:scale-[0.99] select-none ${
                                          isSelected
                                            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 dark:border-amber-500 shadow-xs'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`q${lesson.id}_${qIdx}`}
                                          checked={isSelected}
                                          onChange={() => setAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                                          className="text-amber-500 mr-3 w-4 h-4 focus:ring-amber-500 focus:ring-offset-0"
                                        />
                                        <span className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-amber-900 dark:text-amber-200 font-black' : 'text-slate-700 dark:text-slate-300 font-semibold'}`}>
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
                          <KgButton
                            onClick={() => handleSubmitQuiz(lesson)}
                            disabled={Object.keys(answers).length < lesson.quiz.length}
                            className="flex-1 bg-amber-500 border-amber-500 text-white hover:bg-amber-600"
                          >
                            Nộp bài kiểm tra
                          </KgButton>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Hướng dẫn CUKCUK */}
      {activeTab === 'cukcuk' && (
        <div className="space-y-4">
          {/* Controls: Search */}
          <div className="relative w-full">
            <KgInput
              placeholder="Tìm kiếm bước hướng dẫn (ví dụ: đăng nhập, hủy món, chuyển bàn...)"
              value={cukcukSearch}
              onChange={(e) => setCukcukSearch(e.target.value)}
              icon={Search}
              className="w-full"
            />
            {cukcukSearch && (
              <button
                type="button"
                onClick={() => setCukcukSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 z-10"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {filteredCukcukSteps.length === 0 ? (
            <KgCard className="p-8 text-center border-dashed border-slate-100 dark:border-slate-800">
              <HelpCircle size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 font-bold">Không tìm thấy bước hướng dẫn nào khớp với từ khóa.</p>
            </KgCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCukcukSteps.map((stepItem) => {
                const originalIndex = cukcukData.findIndex(item => item.step === stepItem.step);

                return (
                  <motion.div
                    key={stepItem.step}
                    className="soft3d-card flex flex-col justify-between overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-[var(--kg-surface)] hover:shadow-md transition-all duration-300 group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
                      <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/35 dark:text-blue-400">
                        Bước {stepItem.step < 10 ? `0${stepItem.step}` : stepItem.step}
                      </span>
                      <h4 className="font-extrabold text-slate-800 dark:text-white text-xs truncate max-w-[180px]">
                        {stepItem.title}
                      </h4>
                    </div>

                    {/* Image Area */}
                    <div
                      onClick={() => {
                        setActiveCukcukIndex(originalIndex);
                      }}
                      className="relative overflow-hidden cursor-zoom-in bg-slate-100 dark:bg-slate-950 flex items-center justify-center border-b border-slate-100 dark:border-slate-800/80 aspect-video"
                    >
                      <img
                        src={stepItem.image}
                        alt={stepItem.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <span className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 backdrop-blur-sm">
                          <Eye size={12} /> Xem ảnh rõ nét
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold mb-4 min-h-[48px]">
                        {stepItem.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCukcukIndex(originalIndex);
                        }}
                        className="w-full py-2.5 text-center text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50/50 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/35 rounded-xl transition-all duration-200"
                      >
                        Phóng to chi tiết
                      </button>
                    </div>
                  </motion.div>
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
          {/* General Category Group */}
          <div>
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#9AA1AA] border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
              Tiêu chuẩn chung
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {generalSops.map(section => (
                <button
                  key={section.id}
                  onClick={() => {
                    setSelectedSection(section.id);
                    setIsMobileCategoryOpen(false);
                  }}
                  className={`w-full flex items-center p-3 rounded-xl text-left text-xs font-bold transition-all gap-3 active:scale-98 ${
                    selectedSection === section.id
                      ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  <SopIcon name={section.icon} size={16} className={`flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="truncate">{section.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Department Category Group */}
          <div className="pt-2">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-[#9AA1AA] border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
              Quy trình bộ phận
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {departmentSops.map(section => (
                <button
                  key={section.id}
                  onClick={() => {
                    setSelectedSection(section.id);
                    setIsMobileCategoryOpen(false);
                  }}
                  className={`w-full flex items-center p-3 rounded-xl text-left text-xs font-bold transition-all gap-3 active:scale-98 ${
                    selectedSection === section.id
                      ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  <SopIcon name={section.icon} size={16} className={`flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="truncate">{section.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </KgBottomSheet>

      {/* Lightbox Zoom Modal */}
      {activeCukcukIndex !== null && createPortal(
        <div id="cukcuk-lightbox" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm select-none">
          {/* Header Controls */}
          <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-black/0 text-white z-10">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold font-mono tabular-nums">
                Hướng dẫn sử dụng CUKCUK • Bước {activeCukcukIndex + 1}/{cukcukData.length}
              </span>
              <h3 className="text-sm font-black text-white">
                {cukcukData[activeCukcukIndex].title}
              </h3>
            </div>
            
            {/* Zoom Percent indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black font-mono tabular-nums bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveCukcukIndex(null);
                }}
                className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-xl transition-all"
                title="Đóng (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Image Container with Panning/Zooming */}
          <div 
            className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing p-4 select-none touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            <div
              className="transition-transform duration-75 ease-out select-none"
              style={{
                transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})`,
              }}
              onDoubleClick={handleDoubleClick}
            >
              <img
                src={cukcukData[activeCukcukIndex].image}
                alt={cukcukData[activeCukcukIndex].title}
                className="max-h-[80vh] max-w-[95vw] md:max-h-[85vh] md:max-w-[85vw] object-contain pointer-events-none rounded shadow-2xl border border-white/10"
              />
            </div>
          </div>

          {/* Floating Action Bar */}
          <div className="absolute bottom-6 flex flex-col items-center gap-3 w-full max-w-lg px-6 z-10">
            {/* Description Text */}
            {!showDescription ? (
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-md border border-slate-800 flex items-center gap-2 backdrop-blur-sm transition-all active:scale-95 animate-fade-in"
              >
                <BookOpen size={14} className="text-blue-400" />
                Đọc hướng dẫn, mô tả
              </button>
            ) : (
              <div className="bg-slate-900/90 text-slate-100 text-xs font-semibold p-4 rounded-2xl shadow-xl border border-slate-800/80 backdrop-blur-md w-full leading-relaxed relative flex flex-col items-center animate-slide-up">
                <div className="max-h-[120px] overflow-y-auto w-full text-center mb-1">
                  {cukcukData[activeCukcukIndex].description}
                </div>
                <button
                  type="button"
                  onClick={() => setShowDescription(false)}
                  className="text-[10px] text-slate-400 hover:text-white font-bold flex items-center gap-1 mt-1 hover:underline"
                >
                  <ChevronDown size={12} /> Thu gọn
                </button>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between w-full bg-slate-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800/80 shadow-2xl">
              <button
                type="button"
                disabled={activeCukcukIndex === 0}
                onClick={() => {
                  if (activeCukcukIndex > 0) {
                    setActiveCukcukIndex(activeCukcukIndex - 1);
                  }
                }}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none active:scale-95 rounded-xl transition-all text-white"
                title="Bước trước"
              >
                <ChevronRight size={18} className="rotate-180" />
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={zoomOut}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 active:scale-95 transition-all"
                  title="Thu nhỏ"
                >
                  <span className="text-sm font-black">-</span> Thu nhỏ
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all"
                  title="Đặt lại zoom"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 active:scale-95 transition-all"
                  title="Phóng to"
                >
                  <span className="text-sm font-black">+</span> Phóng to
                </button>
              </div>

              <button
                type="button"
                disabled={activeCukcukIndex === cukcukData.length - 1}
                onClick={() => {
                  if (activeCukcukIndex < cukcukData.length - 1) {
                    setActiveCukcukIndex(activeCukcukIndex + 1);
                  }
                }}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none active:scale-95 rounded-xl transition-all text-white"
                title="Bước sau"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
