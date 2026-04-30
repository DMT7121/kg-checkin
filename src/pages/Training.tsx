import { useState } from 'react';
import { GraduationCap, BookOpen, Coffee, Award, PlayCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';

export default function Training() {
  const [activeLesson, setActiveLesson] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  
  const lessons = [
    {
      id: 1,
      title: 'Menu Đồ Uống Mùa Hè 2024',
      icon: Coffee,
      content: '1. Trà Đào Cam Sả: 40ml syrup đào, 2 lát cam, 1 nhánh sả, 100ml trà xanh.\n2. Trà Vải Hoa Hồng: 30ml syrup vải, nụ hoa hồng khô, 100ml trà oolong.\n3. Cà phê Muối: 30ml espresso, 20ml sữa đặc, 30ml kem mặn.',
    },
    {
      id: 2,
      title: 'Quy trình đón khách (Tiêu chuẩn 5 sao)',
      icon: BookOpen,
      content: '1. Mỉm cười chào khách trong vòng 3 giây đầu.\n2. Hỏi số lượng người và hướng dẫn vị trí ngồi.\n3. Đưa menu bằng 2 tay và giới thiệu món đặc biệt trong ngày.\n4. Rót nước lọc mời khách.',
    }
  ];

  const handleSubmitQuiz = () => {
    // Mock exact correct answers
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setQuizScore(100);
    Swal.fire({
      title: 'Tuyệt vời!',
      text: 'Bạn đã đạt điểm tối đa. +50 King Coins đã được cộng vào tài khoản!',
      icon: 'success',
      confirmButtonText: 'Nhận quà'
    });
  };

  return (
    <div className="p-4 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
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
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-amber-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      <h3 className="font-bold text-gray-800 dark:text-white mb-4 text-lg">📚 Tài liệu nội bộ</h3>
      <div className="space-y-4 mb-8">
        {lessons.map(lesson => (
          <div key={lesson.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setActiveLesson(activeLesson === lesson.id ? null : lesson.id)} className="w-full flex items-center justify-between p-4 focus:outline-none">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/50 text-orange-600 flex items-center justify-center mr-3">
                  <lesson.icon size={20} />
                </div>
                <h4 className="font-bold text-gray-800 dark:text-white text-sm text-left">{lesson.title}</h4>
              </div>
              <PlayCircle size={20} className={`text-orange-500 transition-transform ${activeLesson === lesson.id ? 'rotate-90' : ''}`} />
            </button>
            {activeLesson === lesson.id && (
              <div className="px-4 pb-4 animate-slide-up text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line border-t border-gray-50 dark:border-gray-700 pt-4">
                {lesson.content}
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 className="font-bold text-gray-800 dark:text-white mb-4 text-lg">📝 Trắc nghiệm Mini (Quiz)</h3>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-900/50 p-5">
        <div className="flex items-center mb-4">
          <Award size={24} className="text-amber-500 mr-2" />
          <h4 className="font-bold text-gray-800 dark:text-white">Bài test Tuần 2, Tháng 5</h4>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Câu 1: Trà Đào Cam Sả dùng bao nhiêu ml syrup đào?</p>
            <div className="space-y-2">
              <label className="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 cursor-pointer">
                <input type="radio" name="q1" className="text-orange-500 mr-3" />
                <span className="text-sm text-gray-700 dark:text-gray-300">30ml</span>
              </label>
              <label className="flex items-center p-3 border border-orange-200 dark:border-orange-800 rounded-xl bg-orange-50 dark:bg-orange-900/20 cursor-pointer">
                <input type="radio" name="q1" className="text-orange-500 mr-3" defaultChecked />
                <span className="text-sm text-gray-700 dark:text-gray-300">40ml</span>
              </label>
            </div>
          </div>
        </div>

        {quizScore === null ? (
          <button onClick={handleSubmitQuiz} className="w-full mt-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-orange-500/50 transition-transform active:scale-95">
            NỘP BÀI NHẬN THƯỞNG
          </button>
        ) : (
          <div className="mt-6 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold text-center rounded-xl border border-green-200 dark:border-green-800">
            Bạn đã vượt qua bài test! 🎉
          </div>
        )}
      </div>
    </div>
  );
}
