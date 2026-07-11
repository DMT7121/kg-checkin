import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  GraduationCap, BookOpen, Award, CheckCircle2,
  RefreshCw, ChevronRight, Search, Sparkles, Send,
  HelpCircle, Bot, BookMarked, UserCheck, ChevronDown, ChevronUp,
  X, Zap, ShieldAlert, ListFilter, Eye, FileText
} from 'lucide-react';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { sopData } from './sopData';
import {
  isCriticalSop,
  plainSopText,
  searchSops,
  sectionMatchesScope,
  type SopScope
} from '../utils/sopSearch';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_SOP_QUERIES = [
  { label: 'Khách phàn nàn', query: 'khách phàn nàn', icon: 'fa-solid fa-face-frown' },
  { label: 'Món hết', query: 'hết món sold out', icon: 'fa-solid fa-bowl-food' },
  { label: 'Thanh toán lỗi', query: 'thanh toán lỗi hóa đơn', icon: 'fa-solid fa-receipt' },
  { label: 'Đổ vỡ', query: 'đổ vỡ ly chén', icon: 'fa-solid fa-wine-glass-empty' },
  { label: 'PCCC', query: 'PCCC cháy', icon: 'fa-solid fa-fire-extinguisher' },
  { label: 'Vệ sinh ATTP', query: 'vệ sinh an toàn thực phẩm', icon: 'fa-solid fa-shield-virus' },
  { label: 'Bàn giao ca', query: 'bàn giao ca', icon: 'fa-solid fa-right-left' },
];

const SOP_SCOPES: { id: SopScope; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'recommended', label: 'Dành cho bạn' },
  { id: 'critical', label: 'Quan trọng' },
  { id: 'general', label: 'Tiêu chuẩn chung' },
  { id: 'department', label: 'Theo bộ phận' },
];

export default function Training() {
  useEffect(() => {
    const stylesheetId = 'kg-font-awesome';
    if (document.getElementById(stylesheetId)) return;
    const stylesheet = document.createElement('link');
    stylesheet.id = stylesheetId;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
    document.head.appendChild(stylesheet);
  }, []);

  const store = useAppStore();
  const { currentUser } = store;
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  // Tabs: 'sop' (Sổ tay vận hành) or 'quiz' (Bài học & Đào tạo)
  const [activeTab, setActiveTab] = useState<'sop' | 'quiz'>('sop');

  // SOP State
  const [selectedSection, setSelectedSection] = useState<string>('welcome');
  const [searchTerm, setSearchTerm] = useState('');
  const [sopScope, setSopScope] = useState<SopScope>('all');
  const [sopViewMode, setSopViewMode] = useState<'quick' | 'full'>('quick');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [isMobileCategoryOpen, setIsMobileCategoryOpen] = useState(false);



  // Fetch training lessons
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [contentRes, progressRes] = await Promise.all([
          callApi('GET_TRAINING_CONTENT', {}, { background: true }),
          callApi('GET_TRAINING_PROGRESS', { username: currentUser!.username }, { background: true })
        ]);
        if (contentRes?.ok) setLessons(contentRes.data || []);
        if (progressRes?.ok) {
          const ids = new Set<string>((progressRes.data || []).map((c: CompletedLesson) => c.lessonId));
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

  const handleSubmitQuiz = async (lesson: Lesson) => {
    let correct = 0;
    lesson.quiz.forEach((q, idx) => {
      if (answers[idx] === q.answer) correct++;
    });
    const score = Math.round((correct / lesson.quiz.length) * 100);

    if (score < 70) {
      Swal.fire({
        title: '😕 Chưa đạt',
        html: `Bạn trả lời đúng <b>${correct}/${lesson.quiz.length}</b> câu (${score}%).<br/>Cần đạt tối thiểu 70% để hoàn thành.`,
        icon: 'error',
        confirmButtonText: 'Thử lại',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    const res = await callApi('SUBMIT_TRAINING_QUIZ', {
      username: currentUser!.username,
      fullname: currentUser!.fullname,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      score,
      points: lesson.points
    });

    if (res?.ok) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f59e0b', '#22c55e', '#3b82f6'] });
      setCompletedIds(prev => new Set([...prev, lesson.id]));
      setQuizMode(null);
      setAnswers({});
      Swal.fire({
        title: '🎉 Xuất sắc!',
        html: `Điểm: <b>${score}%</b> (${correct}/${lesson.quiz.length})<br/>+${lesson.points} 🪙 King Coins đã được cộng!`,
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

  useEffect(() => {
    if (visibleSopSections.length > 0 && !visibleSopSections.some(section => section.id === selectedSection)) {
      setSelectedSection(visibleSopSections[0].id);
    }
  }, [selectedSection, visibleSopSections]);

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
        .sop-content-details li i {
          flex-shrink: 0;
          width: 1.25rem;
          margin-right: 0.75rem;
          margin-top: 5px;
          color: #2563eb;
          text-align: center;
        }
        .dark .sop-content-details li i {
          color: #818cf8;
        }
        .sop-content-details strong {
          color: inherit;
          font-weight: 700;
        }
        .sop-content-details a {
          color: #2563eb;
          font-weight: 600;
          text-decoration: underline;
        }
        .sop-content-details a:hover {
          opacity: 0.8;
        }
        .sop-content-details li.icon-tip i { color: #0891b2 !important; }
        .sop-content-details li.icon-note i { color: #ca8a04 !important; }
        .sop-content-details li.icon-danger i { color: #dc2626 !important; }
        .sop-content-details li.icon-script i { color: #6b7280 !important; }
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
        features={[`${completedCount}/${totalLessons} bài hoàn thành`]}
      />

      {/* Tab Buttons */}
      <div className="flex gap-2.5 mb-6 p-2 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-sm">
          <button
            onClick={() => setActiveTab('sop')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              activeTab === 'sop'
                ? 'bg-[var(--kg-primary)] text-white shadow-sm'
                : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
            }`}
          >
            <BookMarked size={14} /> Tra cứu SOP
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 relative ${
              activeTab === 'quiz'
                ? 'bg-[var(--kg-primary)] text-white shadow-sm'
                : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
            }`}
          >
            <UserCheck size={14} /> Kiểm tra năng lực
            {totalLessons > 0 && completedCount < totalLessons && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
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
              className="bg-gradient-to-r from-violet-600 to-indigo-600 border-none text-white hover:from-violet-700 hover:to-indigo-700 h-[44px]"
            >
              King&apos;s Grill AI Assistant
            </KgButton>
          </div>

          <KgCard className="p-3 md:p-4 space-y-4 bg-gradient-to-br from-white to-blue-50/60 dark:from-[var(--kg-surface)] dark:to-blue-950/20">
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Zap size={15} className="text-amber-500" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text)]">
                  Tra cứu nhanh theo tình huống
                </h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {QUICK_SOP_QUERIES.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setSearchTerm(item.query);
                      setSopScope('all');
                    }}
                    className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                      searchTerm === item.query
                        ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)] shadow-md'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:border-[var(--kg-primary)]'
                    }`}
                  >
                    <i className={item.icon} />
                    {item.label}
                  </button>
                ))}
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
                              <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-indigo-400 tracking-wider">
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
                          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium sop-content-details">
                            <div dangerouslySetInnerHTML={{ __html: item.details }} />
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
                  className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm active:scale-[0.99] transition-all font-bold text-sm text-slate-850 dark:text-white"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {activeSopSection && <i className={`${activeSopSection.icon} text-blue-600 dark:text-indigo-400 text-sm flex-shrink-0`} />}
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
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <i className={`${section.icon} w-4 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
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
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <i className={`${section.icon} w-4 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span className="truncate">{section.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </KgCard>
              </div>

              {/* Right Column: Active section details */}
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center gap-2 mb-1 px-1">
                  {activeSopSection && (
                    <>
                      <i className={`${activeSopSection.icon} text-lg text-blue-600 dark:text-indigo-400`} />
                      <h3 className="text-base font-extrabold text-slate-850 dark:text-white Truculenta">
                        {activeSopSection.title}
                      </h3>
                    </>
                  )}
                </div>

                {activeSopItems.map((item, idx) => {
                  const isOpen = sopViewMode === 'full' || (openAccordions[item.subtitle] ?? (idx === 0));
                  return (
                    <KgCard key={idx} className="overflow-hidden p-0 border border-slate-100 dark:border-slate-800 animate-fade-in">
                      <button
                        onClick={() => toggleAccordion(item.subtitle)}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.icon && <i className={`${item.icon} text-sm text-blue-600 dark:text-indigo-400 flex-shrink-0`} />}
                          <h4 className="font-extrabold text-slate-800 dark:text-white text-sm truncate">{item.subtitle}</h4>
                        </div>
                        {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="p-4 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium sop-content-details">
                          <div dangerouslySetInnerHTML={{ __html: item.details }} />
                        </div>
                      )}
                      {!isOpen && sopViewMode === 'quick' && (
                        <button
                          type="button"
                          onClick={() => toggleAccordion(item.subtitle)}
                          className="w-full px-5 py-3 text-left bg-slate-50/50 dark:bg-slate-800/25 border-t border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="space-y-1">
                            {getQuickSopList(item.details).map((text, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs font-semibold text-slate-650 dark:text-[#9AA1AA] leading-relaxed">
                                <span className="text-blue-500 dark:text-indigo-400 select-none flex-shrink-0">•</span>
                                <span className="line-clamp-1">{text}</span>
                              </div>
                            ))}
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-indigo-400 font-extrabold mt-1.5 hover:underline">
                              <span>Xem đầy đủ</span>
                              <ChevronDown size={11} className="animate-pulse" />
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
          <KgCard className="p-4 shadow-sm border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tiến độ bài học kiểm tra</span>
              <span className="text-sm font-black text-blue-600 dark:text-indigo-400">{completedCount}/{totalLessons} bài</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-right text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-bold">{progressPct}% Hoàn thành</p>
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
                            ? 'bg-emerald-50 text-emerald-650 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                        }`}>
                          {isCompleted ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-slate-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {isCompleted ? '✅ Đã hoàn thành' : `📝 ${lesson.quiz.length} câu hỏi • +${lesson.points} 🪙`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className={`text-gray-450 transition-transform flex-shrink-0 ${isActive ? 'rotate-90' : ''}`} />
                    </button>

                    {/* Lesson Content */}
                    {isActive && !isQuiz && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4"
                      >
                        <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed mb-4 font-medium">
                          {lesson.content}
                        </div>
                        {!isCompleted && lesson.quiz.length > 0 && (
                          <KgButton
                            onClick={() => {
                              setQuizMode(lesson.id);
                              setAnswers({});
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-750 text-white"
                            icon={Award}
                          >
                            Làm bài kiểm tra (+{lesson.points} 🪙)
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
                        <div className="flex items-center gap-2 mb-4">
                          <Award size={18} className="text-amber-500" />
                          <h4 className="font-extrabold text-slate-850 dark:text-white text-sm">Trắc nghiệm: {lesson.title}</h4>
                        </div>

                        <div className="space-y-5">
                          {lesson.quiz.map((q, qIdx) => (
                            <div key={qIdx}>
                              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                Câu {qIdx + 1}: {q.q}
                              </p>
                              <div className="space-y-2">
                                {q.options.map((opt, oIdx) => (
                                  <label
                                    key={oIdx}
                                    className={`flex items-center p-3 border rounded-xl cursor-pointer transition-all ${
                                      answers[qIdx] === oIdx
                                        ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/15 dark:border-amber-600'
                                        : 'border-gray-200 dark:border-gray-850 hover:border-gray-350'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`q${lesson.id}_${qIdx}`}
                                      checked={answers[qIdx] === oIdx}
                                      onChange={() => setAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                                      className="text-amber-500 mr-3 focus:ring-amber-500 focus:ring-offset-0"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{opt}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-3 mt-5">
                          <KgButton
                            variant="secondary"
                            onClick={() => {
                              setQuizMode(null);
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
                            Nộp bài 🎯
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
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-105 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <i className={`${section.icon} w-5 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
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
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-105 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <i className={`${section.icon} w-5 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="truncate">{section.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </KgBottomSheet>
    </div>
  );
}
