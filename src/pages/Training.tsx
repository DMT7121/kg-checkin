import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  GraduationCap, BookOpen, Award, CheckCircle2,
  RefreshCw, ChevronRight, Search, Sparkles, Send,
  HelpCircle, Bot, BookMarked, UserCheck, ChevronDown, ChevronUp
} from 'lucide-react';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { sopData, SopSection, SopContentItem } from './sopData';
import {
  KgCard,
  KgButton,
  KgInput,
  KgStatusBadge,
  KgBottomSheet,
  KgAlertCard
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

export default function Training() {
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
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '<strong>Chào bạn,</strong><br><br>Tôi là Trợ Lý Vận Hành AI của King\'s Grill. Tôi có thể giúp bạn giải đáp mọi thắc mắc về Sổ Tay Vận Hành, Quy Trình Bộ Phận hoặc Nội Quy Nhà Hàng.<br><br><strong>Bạn có cần hỗ trợ gì thêm không?</strong>'
    }
  ]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Auto scroll chat to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isSending]);

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
        confirmButtonColor: '#E85D4A'
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

  // Filter SOP content by search term
  const getSearchResults = () => {
    if (!searchTerm.trim()) return [];
    const queryLower = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const results: { sectionTitle: string; sectionId: string; item: SopContentItem }[] = [];

    sopData.forEach(section => {
      section.content.forEach(item => {
        const detailsText = item.details.replace(/<[^>]+>/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const subtitleText = item.subtitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (subtitleText.toLowerCase().includes(queryLower) || detailsText.toLowerCase().includes(queryLower)) {
          results.push({
            sectionTitle: section.title,
            sectionId: section.id,
            item
          });
        }
      });
    });
    return results;
  };

  const searchResults = getSearchResults();

  // Chat helper: Search context
  const findRelevantSopContext = (query: string) => {
    const queryLower = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let context = '';
    let matchCount = 0;
    const MAX_MATCHES = 3;

    sopData.forEach(section => {
      section.content.forEach(item => {
        const detailsText = item.details.replace(/<[^>]+>/g, ' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const subtitleText = item.subtitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (subtitleText.toLowerCase().includes(queryLower) || detailsText.toLowerCase().includes(queryLower)) {
          if (matchCount < MAX_MATCHES) {
            context += `\n\n---Bối cảnh từ mục: ${section.title} - ${item.subtitle}---\n${item.details.replace(/<[^>]+>/g, ' ')}\n---Kết thúc bối cảnh---`;
            matchCount++;
          }
        }
      });
    });

    if (context === '') {
      return 'Không tìm thấy bối cảnh cụ thể nào.';
    }
    return context;
  };

  // Chat helper: Send query to Gemini
  const handleSendChat = async () => {
    if (!chatInput.trim() || isSending) return;

    const userQuery = chatInput.trim();
    const newUserMsg: ChatMessage = {
      id: Date.now().toString() + '_user',
      role: 'user',
      content: userQuery
    };

    setChatMessages(prev => [...prev, newUserMsg]);
    setChatInput('');
    setIsSending(true);

    const relevantContext = findRelevantSopContext(userQuery);
    let systemPrompt = '';
    let promptForAPI = '';
    let temperature = 0.2;

    if (relevantContext.startsWith('Không tìm thấy bối cảnh cụ thể nào.')) {
      systemPrompt = `Bạn là Trợ Lý Vận Hành AI của nhà hàng King's Grill.
Một nhân viên vừa hỏi bạn một câu mà không có trong Sổ Tay Vận Hành.
Nhiệm vụ của bạn là:
1.  **Phân loại câu hỏi:**
    * **Loại A (Nghiêm túc):** Câu hỏi có liên quan đến công việc, ngành nhà hàng, quy trình F&B, dịch vụ khách hàng?
    * **Loại B (Ngoài lề):** Câu hỏi hoàn toàn ngoài lề (thời tiết, kể chuyện cười, bóng đá)?
2.  **Hành động (Quan trọng):**
    * **Nếu là Loại A (Nghiêm túc):**
        * (1) Phải trả lời chuyên nghiệp, hữu ích, đúng trọng tâm.
        * (2) **SAU ĐÓ (Bắt buộc):** Thêm một đường kẻ ngang (dùng thẻ \`<hr>\`).
        * (3) **SAU ĐÓ (Bắt buộc):** Thêm một bình luận dí dỏm, vui nhộn *liên quan đến câu trả lời chuyên môn* ở trên (có thể bắt đầu bằng "Nói vui là...", "Nói đơn giản là...", v.v.).
    * **Nếu là Loại B (Ngoài lề):**
        * Chỉ cần trả lời một cách dí dỏm, vui nhộn. (Không cần <hr>).
3.  **Cấu trúc BẮT BUỘC (cho cả hai loại):**
    * **Lời chào:** Bắt đầu bằng "<strong>Chào bạn,</strong>"
    * **Phần trả lời chính:** (Nội dung trả lời theo phong cách A+funny hoặc B).
    * **Lời chào kết:** Kết thúc bằng "<strong>Bạn có cần hỗ trợ gì thêm không?</strong>"`;
      promptForAPI = userQuery;
      temperature = 0.7;
    } else {
      systemPrompt = `Bạn là Trợ Lý Vận Hành AI của nhà hàng King's Grill. Chỉ được trả lời dựa trên nội dung "Bối cảnh" được cung cấp. Luôn trả lời bằng Tiếng Việt.
                  
Cấu trúc câu trả lời của bạn BẮT BUỘC phải bao gồm 4 phần RÕ RÀNG:
1.  **Lời chào:** Bắt đầu bằng "<strong>Chào bạn,</strong>"
2.  **Phần trả lời chuyên môn:** Trả lời thẳng vào câu hỏi của người dùng, dựa trên bối cảnh. Trình bày rõ ràng, dễ hiểu.
3.  **Góc nhìn vui vẻ (BẮT BUỘC):** Thêm một đường kẻ ngang (dùng thẻ \`<hr>\\`), theo sau là một bình luận dí dỏm, vui nhộn *liên quan đến câu trả lời chuyên môn* ở trên để giúp nhân viên dễ nhớ.
4.  **Lời chào kết:** Kết thúc bằng "<strong>Bạn có cần hỗ trợ gì thêm không?</strong>"

Nếu "Bối cảnh" báo là không tìm thấy, hãy trả lời EXACTLY: "<strong>Chào bạn,</strong><br><br>Rất tiếc, tôi không tìm thấy thông tin chính xác về nội dung này trong Sổ Tay Vận Hành.<br><br><hr><br>*Nói cách khác là... "em bó tay" với câu này trong sổ tay rồi! Bạn thử hỏi Quản lý xem sao.*<br><br><strong>Bạn có cần hỗ trợ gì thêm không?</strong>"`;

      promptForAPI = `Dựa vào bối cảnh sau đây:
${relevantContext}

Hãy trả lời câu hỏi này: "${userQuery}"`;
      temperature = 0.4;
    }

    const apiKey = "AIzaSyBimS3f8NyESLsYS8bgwThM9scpl5_2WvI";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: promptForAPI }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: temperature,
        topP: 0.9,
      }
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const result = await response.json();
      const candidate = result.candidates?.[0];
      let aiText = "<strong>Chào bạn,</strong><br><br>Có lỗi xảy ra khi đang xử lý. Bạn thử lại sau nhé.<br><br><strong>Bạn có cần hỗ trợ gì thêm không?</strong>";

      if (candidate && candidate.content?.parts?.[0]?.text) {
        aiText = candidate.content.parts[0].text;
      }

      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: aiText
      }]);

    } catch (e) {
      console.error(e);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: "<strong>Chào bạn,</strong><br><br>Xin lỗi, đã có lỗi kết nối với trợ lý AI. Vui lòng kiểm tra mạng và thử lại sau.<br><br><strong>Bạn có cần hỗ trợ gì thêm không?</strong>"
      }]);
    } finally {
      setIsSending(false);
    }
  };

  // Pre-load active section content
  const activeSopSection = sopData.find(s => s.id === selectedSection);
  const generalSops = sopData.filter(s => s.group === 'general');
  const departmentSops = sopData.filter(s => s.group === 'department');

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
          color: #062B49;
          text-align: center;
        }
        .dark .sop-content-details li i {
          color: #E85D4A;
        }
        .sop-content-details strong {
          color: inherit;
          font-weight: 700;
        }
        .sop-content-details a {
          color: #E85D4A;
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
      <div className="soft3d-card bg-gradient-to-r from-[#062B49] via-[#0b3e66] to-[#062B49] p-5 md:p-6 text-white relative overflow-hidden flex flex-col border-none shadow-md">
        <div className="flex items-center justify-between relative z-10 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-1.5">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <BookOpen size={20} className="text-[#E85D4A]" />
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight Truculenta text-white">Sổ Tay Vận Hành & Đào Tạo</h2>
            </div>
            <p className="text-[#E8DED1] font-semibold opacity-90 text-xs md:text-sm max-w-lg">
              Tra cứu quy trình chuẩn (SOP), nội quy nhà hàng và làm bài kiểm tra nghiệp vụ tích lũy King Coins.
            </p>
          </div>
          <div className="hidden md:block relative z-10 opacity-70 flex-shrink-0">
            <GraduationCap size={64} strokeWidth={1.2} />
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2.5 mt-5 relative z-10 border-t border-white/15 pt-4">
          <button
            onClick={() => setActiveTab('sop')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'sop'
                ? 'bg-white text-[#062B49] shadow-sm scale-105'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <BookMarked size={14} /> Tra cứu SOP
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
              activeTab === 'quiz'
                ? 'bg-white text-[#062B49] shadow-sm scale-105'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <UserCheck size={14} /> Kiểm tra năng lực
            {totalLessons > 0 && completedCount < totalLessons && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E85D4A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E85D4A]"></span>
              </span>
            )}
          </button>
        </div>

        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/5 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-[#E85D4A]/10 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Tab 1: Tra cứu SOP */}
      {activeTab === 'sop' && (
        <div className="space-y-4">
          {/* Controls: Search & AI Assistant button */}
          <div className="flex flex-col sm:flex-row gap-3 w-full items-stretch sm:items-center">
            <div className="relative flex-1 min-w-0">
              <KgInput
                placeholder="Tìm quy trình, nội quy, nhiệm vụ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={Search}
                className="w-full"
              />
            </div>
            <KgButton
              variant="primary"
              onClick={() => setIsChatOpen(true)}
              icon={Sparkles}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 border-none text-white hover:from-violet-700 hover:to-indigo-700 h-[44px]"
            >
              Trợ lý Bếp Lò AI
            </KgButton>
          </div>

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
                  <p className="text-xs text-gray-500 mt-1">Hãy thử tìm từ khóa khác hoặc bấm Trợ lý Bếp Lò AI để hỏi nhanh nhé.</p>
                </KgCard>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {searchResults.map(({ sectionTitle, sectionId, item }, idx) => {
                    const isOpen = openAccordions[item.subtitle] ?? true;
                    return (
                      <KgCard key={idx} className="overflow-hidden p-0 border border-[#E8DED1] dark:border-[#1E3F57]">
                        <button
                          onClick={() => toggleAccordion(item.subtitle)}
                          className="w-full flex items-center justify-between p-4 bg-[#FBF7F0] dark:bg-[#122F48]/40 border-b border-[#E8DED1] dark:border-[#1E3F57] text-left"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-[#E85D4A] tracking-wider block mb-0.5">
                              {sectionTitle}
                            </span>
                            <h4 className="font-extrabold text-gray-800 dark:text-white text-sm truncate">{item.subtitle}</h4>
                          </div>
                          {isOpen ? <ChevronUp size={16} className="text-[#6F7785]" /> : <ChevronDown size={16} className="text-[#6F7785]" />}
                        </button>
                        {isOpen && (
                          <div className="p-4 bg-white dark:bg-[#0E273C] text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium sop-content-details">
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Category selector list */}
              <div className="lg:col-span-4 space-y-4">
                <KgCard className="p-4 space-y-4">
                  {/* General Category Group */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#6F7785] dark:text-[#9AA1AA] border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2 mb-2">
                      Tiêu chuẩn chung
                    </h3>
                    <div className="space-y-1">
                      {generalSops.map(section => (
                        <button
                          key={section.id}
                          onClick={() => setSelectedSection(section.id)}
                          className={`w-full flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 ${
                            selectedSection === section.id
                              ? 'bg-[#062B49] text-white'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <i className={`${section.icon} w-4 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-[#E85D4A]' : 'text-[#6F7785]'}`} />
                          <span className="truncate">{section.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Department Category Group */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#6F7785] dark:text-[#9AA1AA] border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2 mb-2">
                      Quy trình bộ phận
                    </h3>
                    <div className="space-y-1">
                      {departmentSops.map(section => (
                        <button
                          key={section.id}
                          onClick={() => setSelectedSection(section.id)}
                          className={`w-full flex items-center p-2.5 rounded-xl text-left text-xs font-bold transition-all gap-2.5 ${
                            selectedSection === section.id
                              ? 'bg-[#062B49] text-white'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <i className={`${section.icon} w-4 text-center flex-shrink-0 ${selectedSection === section.id ? 'text-[#E85D4A]' : 'text-[#6F7785]'}`} />
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
                      <i className={`${activeSopSection.icon} text-lg text-[#E85D4A]`} />
                      <h3 className="text-base font-extrabold text-[#062B49] dark:text-white Truculenta">
                        {activeSopSection.title}
                      </h3>
                    </>
                  )}
                </div>

                {activeSopSection?.content.map((item, idx) => {
                  const isOpen = openAccordions[item.subtitle] ?? (idx === 0);
                  return (
                    <KgCard key={idx} className="overflow-hidden p-0 border border-[#E8DED1] dark:border-[#1E3F57]">
                      <button
                        onClick={() => toggleAccordion(item.subtitle)}
                        className="w-full flex items-center justify-between p-4 bg-[#FBF7F0] dark:bg-[#122F48]/40 border-b border-[#E8DED1] dark:border-[#1E3F57] text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.icon && <i className={`${item.icon} text-sm text-[#062B49] dark:text-[#E85D4A] flex-shrink-0`} />}
                          <h4 className="font-extrabold text-gray-800 dark:text-white text-sm truncate">{item.subtitle}</h4>
                        </div>
                        {isOpen ? <ChevronUp size={16} className="text-[#6F7785]" /> : <ChevronDown size={16} className="text-[#6F7785]" />}
                      </button>
                      {isOpen && (
                        <div className="p-4 bg-white dark:bg-[#0E273C] text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium sop-content-details">
                          <div dangerouslySetInnerHTML={{ __html: item.details }} />
                        </div>
                      )}
                    </KgCard>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Kiểm tra năng lực */}
      {activeTab === 'quiz' && (
        <div className="space-y-4">
          {/* Progress Overview */}
          <KgCard className="p-4 shadow-sm border-[#E8DED1] dark:border-[#1E3F57]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-[#6F7785] dark:text-[#A0ABC0] uppercase tracking-wider">Tiến độ bài học kiểm tra</span>
              <span className="text-sm font-black text-[#062B49] dark:text-[#E85D4A]">{completedCount}/{totalLessons} bài</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#D8A23A] to-[#4F8A5B] h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-right text-[10px] text-gray-500 dark:text-[#A0ABC0] mt-1.5 font-bold">{progressPct}% Hoàn thành</p>
          </KgCard>

          {/* Lessons List */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#6F7785]">
              <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải bài học...
            </div>
          ) : lessons.length === 0 ? (
            <KgCard className="p-8 text-center border-dashed border-[#E8DED1] dark:border-[#1E3F57]">
              <GraduationCap size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 font-bold">Chưa có bài học nào được cấu hình trên hệ thống.</p>
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
                            ? 'bg-[#EEF7F0] text-[#4F8A5B]'
                            : 'bg-[#FFF7E4] text-[#D8A23A]'
                        }`}>
                          {isCompleted ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-gray-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
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
                            className="w-full bg-[#062B49] text-white"
                            icon={Award}
                          >
                            Làm bài kiểm tra (+{lesson.points} 🪙)
                          </KgButton>
                        )}
                        {isCompleted && (
                          <div className="p-3 bg-[#EEF7F0] dark:bg-[#5F9D6B]/10 rounded-xl text-[#4F8A5B] dark:text-[#5F9D6B] text-xs font-bold text-center border border-[#EEF7F0] dark:border-[#5F9D6B]/20">
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
                        className="px-4 pb-4 border-t border-orange-100 dark:border-orange-900/30 pt-4 bg-[#FFF7E4]/20 dark:bg-[#E2B24C]/5"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <Award size={18} className="text-[#D8A23A]" />
                          <h4 className="font-extrabold text-gray-800 dark:text-white text-sm">Trắc nghiệm: {lesson.title}</h4>
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
                                        ? 'border-[#D8A23A] bg-[#FFF7E4]/30 dark:bg-[#E2B24C]/15 dark:border-[#E2B24C]'
                                        : 'border-gray-200 dark:border-gray-850 hover:border-gray-300'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`q${lesson.id}_${qIdx}`}
                                      checked={answers[qIdx] === oIdx}
                                      onChange={() => setAnswers(prev => ({ ...prev, [qIdx]: oIdx }))}
                                      className="text-[#D8A23A] mr-3 focus:ring-[#D8A23A]"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{opt}</span>
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
                            className="flex-1 bg-[#D8A23A] border-[#D8A23A] text-white hover:bg-[#C28F2D]"
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

      {/* Tab 1 Chatbot Bottom Sheet (Trợ lý Bếp Lò AI) */}
      <KgBottomSheet
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        title="Trợ lý Bếp Lò AI"
      >
        <div className="flex flex-col h-[70vh] -mx-5 -my-4 overflow-hidden">
          {/* Header Description */}
          <div className="px-5 py-2.5 bg-[#FBF7F0] dark:bg-[#122F48]/35 border-b border-[#E8DED1] dark:border-[#1E3F57] text-[10px] text-gray-500 dark:text-gray-400 font-bold flex items-center gap-1.5 flex-shrink-0">
            <Bot size={13} className="text-[#E85D4A]" />
            Hệ thống trả lời tự động dựa trên Sổ Tay Vận Hành & SOP nhà hàng.
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/10 min-h-0">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-semibold shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#062B49] text-white rounded-tr-sm'
                    : 'bg-white dark:bg-[#122F48] text-gray-800 dark:text-gray-200 border border-[#E8DED1] dark:border-[#1E3F57] rounded-tl-sm chat-bubble-content'
                }`}>
                  <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-[#122F48] border border-[#E8DED1] dark:border-[#1E3F57] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center space-x-2 text-xs font-bold text-gray-500">
                  <RefreshCw size={13} className="animate-spin text-[#E85D4A]" />
                  <span>AI đang tra sổ tay...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 bg-white dark:bg-[#0E273C] border-t border-[#E8DED1] dark:border-[#1E3F57] flex-shrink-0 flex items-center gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder="Quy trình xử lý món sai? Mất vé xe xử lý thế nào?..."
              className="flex-1 max-h-20 min-h-[40px] border border-[#E8DED1] dark:border-[#1E3F57] focus:border-[#062B49] dark:focus:border-[#E85D4A] rounded-xl px-3.5 py-2.5 text-xs font-semibold resize-none focus:outline-none transition-all dark:bg-[#0E273C] dark:text-white"
              rows={1}
              disabled={isSending}
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || isSending}
              className="w-10 h-10 bg-[#062B49] text-white rounded-xl flex items-center justify-center hover:bg-[#0B3A5F] active:scale-95 transition disabled:opacity-50 flex-shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </KgBottomSheet>
    </div>
  );
}
