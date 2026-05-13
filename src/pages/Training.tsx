import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { GraduationCap, BookOpen, Award, PlayCircle, CheckCircle2, RefreshCw, Lock, ChevronRight } from 'lucide-react';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';

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

export default function Training() {
  const store = useAppStore();
  const { currentUser } = store;
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

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
      } catch (e) { console.error('Training fetch error:', e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  const totalLessons = lessons.length;
  const completedCount = [...completedIds].filter(id => lessons.some(l => l.id === id)).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const handleSubmitQuiz = async (lesson: Lesson) => {
    // Calculate score
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

    // Submit to server
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
        confirmButtonColor: '#10b981'
      });
    } else {
      Swal.fire('Lưu ý', res?.message || 'Không thể ghi nhận kết quả', 'info');
    }
  };

  return (
    <div className="p-4 animate-slide-up pb-10 space-y-4">
      {/* Header Banner */}
      <div className="soft3d-card !bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-6 md:p-8 text-white relative overflow-hidden flex flex-col mb-2 border-opacity-30">
        <div className="flex items-center justify-between relative z-10 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <GraduationCap size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Đào Tạo</h2>
            </div>
            <p className="text-amber-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Cập nhật kiến thức - Tích lũy King Coins.
            </p>
          </div>
          <div className="hidden md:block relative z-10 opacity-80">
            <BookOpen size={80} strokeWidth={1} />
          </div>
        </div>

        {/* Progress */}
        <div className="mt-5 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 relative z-10 w-full shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Tiến độ học tập</span>
            <span className="text-sm font-black">{completedCount}/{totalLessons} bài</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-yellow-300 to-green-400 h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-right text-[10px] text-white/70 mt-1 font-bold">{progressPct}%</p>
        </div>

        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-amber-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Lessons List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải bài học...
        </div>
      ) : lessons.length === 0 ? (
        <div className="soft3d-card p-8 text-center">
          <GraduationCap size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Chưa có bài học nào.</p>
        </div>
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
                transition={{ delay: idx * 0.08 }}
              >
                {/* Lesson Header */}
                <button 
                  onClick={() => {
                    setActiveLesson(isActive ? null : lesson.id);
                    if (isActive) { setQuizMode(null); setAnswers({}); }
                  }} 
                  className="w-full flex items-center justify-between p-4 focus:outline-none"
                >
                  <div className="flex items-center min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 ${
                      isCompleted 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600' 
                        : 'bg-orange-100 dark:bg-orange-900/50 text-orange-600'
                    }`}>
                      {isCompleted ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                    </div>
                    <div className="min-w-0 text-left">
                      <h4 className="font-bold text-gray-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {isCompleted ? '✅ Đã hoàn thành' : `📝 ${lesson.quiz.length} câu hỏi • +${lesson.points} 🪙`}
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
                    className="px-4 pb-4 border-t border-gray-50 dark:border-gray-700 pt-4"
                  >
                    <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed mb-4">
                      {lesson.content}
                    </div>
                    {!isCompleted && lesson.quiz.length > 0 && (
                      <button 
                        onClick={() => { setQuizMode(lesson.id); setAnswers({}); }}
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-orange-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Award size={18} /> Làm bài kiểm tra (+{lesson.points} 🪙)
                      </button>
                    )}
                    {isCompleted && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm font-bold text-center border border-green-200 dark:border-green-800">
                        ✅ Bạn đã hoàn thành bài này!
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Quiz Mode */}
                {isQuiz && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-4 pb-4 border-t border-orange-100 dark:border-orange-900/30 pt-4 bg-orange-50/50 dark:bg-orange-900/10"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Award size={18} className="text-amber-500" />
                      <h4 className="font-bold text-gray-800 dark:text-white text-sm">Trắc nghiệm: {lesson.title}</h4>
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
                                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600' 
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                }`}
                              >
                                <input 
                                  type="radio" 
                                  name={`q${lesson.id}_${qIdx}`} 
                                  checked={answers[qIdx] === oIdx}
                                  onChange={() => setAnswers(prev => ({ ...prev, [qIdx]: oIdx }))} 
                                  className="text-orange-500 mr-3" 
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-5">
                      <button 
                        onClick={() => { setQuizMode(null); setAnswers({}); }}
                        className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                      >
                        Quay lại
                      </button>
                      <button 
                        onClick={() => handleSubmitQuiz(lesson)}
                        disabled={Object.keys(answers).length < lesson.quiz.length}
                        className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                      >
                        Nộp bài 🎯
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
