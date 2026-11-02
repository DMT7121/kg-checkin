import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, Loader2, Maximize2, Minimize2, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { fetchWithRetry } from '../utils/helpers';
import { escapeHtml } from '../utils/security';
import { callApi } from '../services/api';
import { sopData } from '../pages/sopData';

const ASSISTIVE_POS_KEY = 'kg_ai_assistive_pos_v4';

interface AssistivePos {
  side: 'left' | 'right';
  yRatio: number; // clamped [0.14, 0.78] so it stays clear of topbar & bottom dock
}

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function AIAssistant() {
  const currentUser = useAppStore((s) => s.currentUser);
  const groqKeys = useAppStore((s) => s.groqKeys);
  const chatHistory = useAppStore((s) => s.chatHistory);
  const isAiOpen = useAppStore((s) => s.isAiOpen);
  const setAiOpen = useAppStore((s) => s.setAiOpen);
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Chào bạn! Mình là King's Grill AI Assistant. Mình có thể giúp bạn kiểm tra lịch làm việc, hướng dẫn Checklist, tra cứu quy trình vận hành (SOP) và trả lời các câu hỏi về nhà hàng. Mình có thể giúp gì cho bạn hôm nay?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyLoaded = useRef(false);

  // Check if a lightbox/guideline is open without observing every subtree mutation
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // AssistiveTouch Virtual Home button state (free drag + magnetic edge snap + auto-tuck)
  const [pos, setPos] = useState<AssistivePos>(() => {
    try {
      const raw = localStorage.getItem(ASSISTIVE_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AssistivePos>;
        const side = parsed.side === 'left' ? 'left' : 'right';
        const yRatio = typeof parsed.yRatio === 'number' && Number.isFinite(parsed.yRatio)
          ? Math.min(0.75, Math.max(0.15, parsed.yRatio))
          : 0.68;
        return { side, yRatio };
      }
    } catch {
      // ignore storage errors
    }
    return { side: 'right', yRatio: 0.68 };
  });
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);
  const [isTucked, setIsTucked] = useState(true);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const scheduleAutoTuck = useCallback((delayMs = 2800) => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      setIsTucked(true);
    }, delayMs);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const handleAssistivePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
    }
  };

  const handleAssistivePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    if (!session.moved && Math.hypot(dx, dy) < 7) return;

    session.moved = true;
    setIsTucked(false);
    const minTop = 72;
    const maxTop = Math.max(minTop, viewport.h - (viewport.w < 768 ? 156 : 96));
    const clampedX = Math.min(Math.max(6, e.clientX - 22), Math.max(6, viewport.w - 50));
    const clampedY = Math.min(Math.max(minTop, e.clientY - 22), maxTop);
    setDragCoords({ x: clampedX, y: clampedY });
  };

  const handleAssistivePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    dragSessionRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if capture already released
    }

    if (!session.moved) {
      setDragCoords(null);
      setIsTucked(false);
      setAiOpen(true);
      return;
    }

    const minTop = 72;
    const maxTop = Math.max(minTop, viewport.h - (viewport.w < 768 ? 156 : 96));
    const finalTop = Math.min(Math.max(minTop, e.clientY - 22), maxTop);
    const nextSide: 'left' | 'right' = e.clientX < viewport.w / 2 ? 'left' : 'right';
    const nextRatio = Math.min(0.75, Math.max(0.15, finalTop / Math.max(viewport.h, 400)));
    const nextPos: AssistivePos = { side: nextSide, yRatio: nextRatio };

    setPos(nextPos);
    setDragCoords(null);
    try {
      localStorage.setItem(ASSISTIVE_POS_KEY, JSON.stringify(nextPos));
    } catch {
      // ignore storage errors
    }
    scheduleAutoTuck(2400);
  };

  useEffect(() => {
    const checkOverlay = () => {
      const open = document.getElementById('cukcuk-lightbox') !== null;
      setIsLightboxOpen((prev) => (prev === open ? prev : open));
    };

    checkOverlay();

    // Only observe direct children of document.body (where lightboxes/modals mount)
    const observer = new MutationObserver(checkOverlay);
    observer.observe(document.body, { childList: true, subtree: false });

    return () => {
      observer.disconnect();
    };
  }, []);

  const nonGeminiGroqKeys = groqKeys.filter((k) => k.key && !k.key.startsWith('AIza'));
  const useGeminiFallback = nonGeminiGroqKeys.length === 0;

  // Auto load history
  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && !historyLoaded.current) {
      historyLoaded.current = true;
      const historyMessages: Message[] = chatHistory.map((h, i) => ({
        id: `hist_${i}`,
        role: h.role as 'user' | 'assistant',
        content: h.content
      }));
      setMessages(prev => [prev[0], ...historyMessages]); // Keep welcome message
    }
  }, [chatHistory]);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const findRelevantSopContext = (query: string) => {
    if (!query) return '';
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

    return context;
  };

  const generateSystemPrompt = (userQuery?: string) => {
    const {
      logs,
      shiftData,
      checklistItems,
      adminSchedules,
      aiPrompts,
      payrollData,
      checklistLogs,
      approvedShifts,
      currentWeekApprovedShifts,
      shiftName,
    } = useAppStore.getState();

    const today = new Date().toLocaleDateString('vi-VN');
    let prompt = `Bạn là King's Grill AI Assistant - Trợ lý AI chuyên nghiệp của nhà hàng King's Grill. Hôm nay là ngày ${today}, đang là ${shiftName}.
Nhiệm vụ của bạn là hỗ trợ nhân sự (${currentUser?.fullname || 'Ẩn danh'}, vai trò: ${currentUser?.role || 'Nhân viên'}, chức vụ: ${currentUser?.position || 'Phục vụ'}) trong công việc.

[NGỮ CẢNH DỮ LIỆU HIỆN TẠI TỪ HỆ THỐNG HR]
`;
    // Add Schedule context
    if (currentUser?.role === 'admin') {
      prompt += `- Lịch làm tổng quan: Cửa hàng hiện có ${adminSchedules.length} nhân sự đăng ký lịch.\n`;
    } else {
      const todayDay = new Date().getDay();
      const dayIdx = todayDay === 0 ? 6 : todayDay - 1; 
      const activeShiftsForToday = currentWeekApprovedShifts ?? approvedShifts;
      const todayShift = activeShiftsForToday ? activeShiftsForToday[dayIdx] : 'Chưa xếp ca';
      prompt += `- Lịch làm hôm nay của ${currentUser?.fullname}: ${todayShift}.\n`;
      const activeShifts = Object.entries(shiftData).filter(([_, v]) => v && v !== 'OFF').map(([k, v]) => `${k}: ${v}`);
      prompt += `- Lịch nguyên tuần: ${activeShifts.length > 0 ? activeShifts.join(', ') : 'Chưa có'}.\n`;
    }

    // Add Payroll/Hours context
    if (payrollData) {
      const userPayroll = payrollData.find(p => p.fullname === currentUser?.fullname);
      if (userPayroll) {
        prompt += `- Tổng số giờ công tích lũy: ${userPayroll.totalHours} giờ. Thu nhập cơ bản tạm tính: ${userPayroll.totalBaseSalary.toLocaleString()} VNĐ.\n`;
      }
    } else {
      prompt += `- Tổng số giờ công: Chưa có dữ liệu bộ nhớ đệm (Hãy hướng dẫn người dùng tự mở tab Bảng Công để xem).\n`;
    }

    // Add Logs / Punctuality context
    if (logs && logs.length > 0) {
      const userLogs = logs.filter(l => l.fullname === currentUser?.fullname);
      const validCount = userLogs.filter(l => l.status && l.status.includes('Hợp lệ')).length;
      const lateCount = userLogs.filter(l => l.status && (l.status.includes('Trễ') || l.status.includes('Vi phạm'))).length;
      prompt += `- Tình trạng chấm công gần đây (cá nhân): Có ${validCount} lần hợp lệ, ${lateCount} lần đi trễ/vi phạm.\n`;
      const recentLogs = userLogs.slice(0, 3).map(l => `${l.type} lúc ${l.time} (${l.status})`);
      if (recentLogs.length > 0) prompt += `- Lịch sử log gần nhất: ${recentLogs.join(' | ')}.\n`;
    } else {
      prompt += `- Tình trạng chấm công: Chưa có dữ liệu.\n`;
    }

    // Add Checklist context
    if (checklistItems && checklistItems.length > 0) {
      const role = currentUser?.position || 'Phục vụ';
      const applicableTasks = checklistItems.filter(c => 
        c.isActive && 
        c.isRequired && 
        (c.targetPosition === 'Tất cả' || c.targetPosition.includes(role)) &&
        (c.targetShift === 'Tất cả' || shiftName.includes(c.targetShift))
      );
      
      const todayStr = new Date().toISOString().split('T')[0];
      const logForShift = checklistLogs?.find(l => l.date === todayStr && l.username === currentUser?.username && shiftName.includes(l.shift));
      
      if (applicableTasks.length > 0) {
        const completedIds = logForShift ? logForShift.checkedTasks : [];
        const pendingTasks = applicableTasks.filter(t => !completedIds.includes(t.id));
        
        if (pendingTasks.length > 0) {
          prompt += `- Checklist tồn đọng (chưa hoàn thành trong ca này): ${pendingTasks.map(t => t.taskName).join('; ')}.\n`;
        } else {
          prompt += `- Checklist: Đã hoàn thành 100% công việc trong ca này. Rất tốt!\n`;
        }
      } else {
        prompt += `- Checklist: Hiện tại không có hạng mục nào bắt buộc cho vị trí này trong ca này.\n`;
      }
    } else {
      prompt += `- Checklist: Chưa có dữ liệu bộ nhớ đệm (Hãy hướng dẫn người dùng tự mở tab Checklist để đồng bộ).\n`;
    }

    // Add active Custom AI Prompts
    if (aiPrompts && aiPrompts.length > 0) {
      const activePrompts = aiPrompts.filter(p => p.isActive);
      if (activePrompts.length > 0) {
        prompt += `\n\n[CÁC QUY TẮC BỔ SUNG ĐƯỢC ADMIN CẤU HÌNH]\n`;
        activePrompts.forEach(p => {
          prompt += `- ${p.name}: ${p.content}\n`;
        });
      }
    }

    // Add SOP Context if query is about operations
    if (userQuery) {
      const sopContext = findRelevantSopContext(userQuery);
      if (sopContext) {
        prompt += `\n\n[BỐI CẢNH QUY TRÌNH/SOP TỪ SỔ TAY VẬN HÀNH]\n${sopContext}\n`;
      }
    }

    prompt += `
[HƯỚNG DẪN TRẢ LỜI]
- Bạn có khả năng phân tích lịch làm, đọc công việc checklist, quy trình vận hành SOP và đào tạo nghiệp vụ.
- Nếu bối cảnh [BỐI CẢNH QUY TRÌNH/SOP TỪ SỔ TAY VẬN HÀNH] được cung cấp, hãy ưu tiên dùng thông tin đó để trả lời câu hỏi chuyên môn của nhân viên.
- Nếu người dùng yêu cầu "tạo bộ checklist", hãy liệt kê dưới dạng danh sách chuyên nghiệp (bullet points).
- Luôn trả lời bằng tiếng Việt, thân thiện, ngắn gọn, súc tích (không quá dài dòng), có thể dùng emoji để thân thiện hơn.
- KHÔNG BỊA ĐẶT DỮ LIỆU nếu không có trong ngữ cảnh.`;

    return prompt;
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const systemPrompt = generateSystemPrompt(userMessage.content);

    try {
      let aiText = '';
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage.content }
      ];

      // 1. Primary secure path: Server-side AI_CHAT proxy (Edge Groq or GAS Groq, never requires exposing keys to staff)
      const proxyRes = await callApi('AI_CHAT', {
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        temperature: 0.6,
        max_tokens: 1024,
      }, { background: true, cacheTtlMs: 0 });

      if (proxyRes?.ok && (proxyRes.data?.reply || proxyRes.data?.content)) {
        aiText = proxyRes.data.reply || proxyRes.data.content;
      } else if (!useGeminiFallback) {
        // 2. Fallback: Admin local Groq keys (when running before GAS deployment update)
        const selectedKey = nonGeminiGroqKeys[Math.floor(Math.random() * nonGeminiGroqKeys.length)];
        const apiKey = selectedKey ? selectedKey.key : null;
        if (!apiKey) throw new Error('No Groq API key available');

        const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: apiMessages,
            temperature: 0.6,
            max_tokens: 1024
          })
        });

        aiText = result.choices?.[0]?.message?.content || 'Xin lỗi, mình đang gặp sự cố khi xử lý dữ liệu. Bạn thử lại nhé!';
      } else {
        // 3. Fallback: Gemini key if configured
        const configuredGeminiKey = groqKeys.find((k) => k.key?.startsWith('AIza'))?.key;
        const apiKey =
          import.meta.env.VITE_GEMINI_API_KEY ||
          configuredGeminiKey ||
          localStorage.getItem('kg_gemini_api_key') ||
          '';
        if (!apiKey) {
          throw new Error(proxyRes?.message || 'Missing AI API key');
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const chatContents = [
          ...messages.slice(-5).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          {
            role: 'user',
            parts: [{ text: userMessage.content }]
          }
        ];

        const payload = {
          contents: chatContents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            temperature: 0.6,
            topP: 0.9,
          }
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Gemini API request failed');
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];
        aiText = candidate?.content?.parts?.[0]?.text || 'Xin lỗi, mình gặp sự cố khi tải câu trả lời từ máy chủ Gemini.';
      }

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: aiText
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Bắn API lưu lịch sử ngầm
      callApi('SAVE_CHAT_LOG', {
        fullname: currentUser?.fullname,
        messages: [
          { role: 'user', content: userMessage.content },
          { role: 'assistant', content: aiText }
        ]
      }, { background: true });

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Xin lỗi, máy chủ AI đang quá tải hoặc mất kết nối. Vui lòng kiểm tra lại mạng hoặc API Key.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Hàm render Markdown cơ bản (đã escape HTML chống XSS)
  const renderFormattedText = (text: string) => {
    const safeText = escapeHtml(text);
    const html = safeText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/\n/g, '<br />') // Newlines
      .replace(/- (.*?)<br \/>/g, '<li>$1</li>') // Simple lists
      .replace(/<li>(.*?)<\/li>/g, '<ul class="list-disc pl-4 space-y-1 mb-2"><li>$1</li></ul>') // Wrap lists
      .replace(/<\/ul><ul class="list-disc pl-4 space-y-1 mb-2">/g, ''); // Merge adjacent lists

    return <div dangerouslySetInnerHTML={{ __html: html }} className="text-sm space-y-2 leading-relaxed" />;
  };

  if (!currentUser) return null; // Chỉ hiện khi đã đăng nhập

  const minSafeTop = 72;
  const maxSafeTop = Math.max(minSafeTop, viewport.h - (viewport.w < 768 ? 156 : 96));
  const snappedTop = Math.min(Math.max(minSafeTop, Math.round(viewport.h * pos.yRatio)), maxSafeTop);
  const isActivelyMoved = dragCoords !== null;

  return (
    <>
      {/* AssistiveTouch Virtual Home AI Button (Free Drag + Edge Snap + Auto-Tuck into Corner/Edge) */}
      {!isAiOpen && (
        <div
          className={`fixed inset-0 pointer-events-none overflow-hidden ${
            isLightboxOpen ? 'z-40' : 'z-[85]'
          }`}
        >
          <button
            type="button"
            onPointerDown={handleAssistivePointerDown}
            onPointerMove={handleAssistivePointerMove}
            onPointerUp={handleAssistivePointerEnd}
            onPointerCancel={handleAssistivePointerEnd}
            onMouseEnter={() => {
              setIsTucked(false);
              if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
            }}
            onMouseLeave={() => {
              if (!isActivelyMoved) scheduleAutoTuck(1800);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setAiOpen(true);
              }
            }}
            style={
              dragCoords
                ? {
                    left: `${dragCoords.x}px`,
                    top: `${dragCoords.y}px`,
                  }
                : {
                    top: `${snappedTop}px`,
                    ...(pos.side === 'left' ? { left: '0px' } : { right: '0px' }),
                    transition: 'top 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }
            }
            className="fixed w-11 h-11 pointer-events-auto touch-none select-none flex items-center justify-center focus-visible:outline-none cursor-grab active:cursor-grabbing group"
            title="Trợ lý AI King's Grill (Giữ & kéo như nút Home ảo, thả tay tự ẩn vào mép)"
            aria-label="Mở Trợ lý AI King's Grill (có thể giữ kéo di chuyển)"
          >
            <span
              className={`w-11 h-11 rounded-[15px] bg-[#0B253C]/95 dark:bg-[#1B2230]/95 backdrop-blur-md border border-white/25 shadow-lg flex items-center justify-center relative transition-all duration-200 ${
                isActivelyMoved
                  ? 'scale-110 ring-2 ring-[#C8432B]/70 opacity-100'
                  : isTucked
                    ? pos.side === 'right'
                      ? 'translate-x-[18px] opacity-85 group-hover:translate-x-[-4px] group-hover:opacity-100'
                      : '-translate-x-[18px] opacity-85 group-hover:translate-x-[4px] group-hover:opacity-100'
                    : pos.side === 'right'
                      ? '-translate-x-1.5 opacity-95'
                      : 'translate-x-1.5 opacity-95'
              }`}
            >
              {/* AssistiveTouch Inner Tactile Ring */}
              <span className="w-7 h-7 rounded-[10px] bg-white/15 border border-white/25 flex items-center justify-center">
                <Sparkles size={15} className="text-amber-300" />
              </span>

              {/* Subtle Edge Peek Indicator when Tucked */}
              {isTucked && !isActivelyMoved && (
                <span
                  aria-hidden="true"
                  className={`absolute top-1/2 -translate-y-1/2 text-white/80 ${
                    pos.side === 'right' ? 'left-0.5' : 'right-0.5'
                  }`}
                >
                  {pos.side === 'right' ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
                </span>
              )}

              {/* Ember Status Dot */}
              <span
                aria-hidden="true"
                className={`absolute -top-0.5 ${
                  pos.side === 'right' ? 'left-0.5' : 'right-0.5'
                } w-2.5 h-2.5 rounded-full bg-[#C8432B] border border-white`}
              />
            </span>
          </button>
        </div>
      )}

      {/* Chat Window (Mobile Bottom-Sheet + Desktop Floating Atelier Panel) */}
      {isAiOpen && (
        <div
          className={`fixed inset-x-0 md:inset-x-auto bottom-0 md:bottom-6 ${
            pos.side === 'left' ? 'md:left-24' : 'md:right-6'
          } bg-[var(--kg-surface)] text-[var(--kg-text)] shadow-2xl ${
            isLightboxOpen ? 'z-40' : 'z-[10060]'
          } flex flex-col transition-all duration-200 ease-out border border-[var(--kg-border)] ${
            isExpanded
              ? 'w-full md:w-[600px] h-[92dvh] md:h-[80vh] rounded-t-3xl md:rounded-2xl'
              : 'w-full md:w-[390px] h-[78dvh] md:h-[560px] rounded-t-3xl md:rounded-2xl'
          }`}
        >
          {/* Header */}
          <div className="bg-[#0B253C] dark:bg-[#151B26] px-4 py-3.5 flex items-center justify-between text-white rounded-t-3xl md:rounded-t-2xl border-b border-white/10 shadow-xs z-10 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-[#C8432B] rounded-xl flex items-center justify-center shadow-xs flex-shrink-0">
                <Bot size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm truncate">King&apos;s Grill AI Assistant</h3>
                <p className="text-[10.5px] text-white/80 flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse flex-shrink-0" />
                  <span className="truncate">
                    {useGeminiFallback ? 'Gemini Flash • Nút Home ảo tự ẩn' : `Groq LPU (${groqKeys.length} keys) • Nút Home ảo`}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-10 h-10 hover:bg-white/15 rounded-xl transition hidden md:flex items-center justify-center"
                title={isExpanded ? 'Thu nhỏ khung chat' : 'Mở rộng khung chat'}
                aria-label={isExpanded ? 'Thu nhỏ khung chat' : 'Mở rộng khung chat'}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiOpen(false);
                  setIsTucked(true);
                }}
                className="w-10 h-10 hover:bg-white/15 rounded-xl transition flex items-center justify-center"
                title="Đóng & ẩn gọn vào mép màn hình"
                aria-label="Đóng khung chat AI"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[var(--kg-bg)]/60">
            {useGeminiFallback && (
              <div className="bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/20 text-[var(--kg-text)] rounded-xl p-3 text-[11.5px] flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-[var(--kg-accent-ink)]" />
                <p>
                  Mẹo thao tác: Nút AI hoạt động như <strong>nút Home ảo</strong> — bạn có thể nhấn giữ để kéo sang mép trái/phải tùy ý, thả tay nút sẽ tự thu gọn vào cạnh màn hình để không che bảng số liệu.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[86%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[var(--kg-primary)] text-white rounded-tr-sm shadow-xs'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] rounded-tl-sm shadow-xs'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    renderFormattedText(msg.content)
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-xs">
                  <Loader2 size={16} className="animate-spin text-[var(--kg-accent-ink)]" />
                  <span className="text-xs text-[var(--kg-text-muted)] font-medium tracking-wide">AI đang suy nghĩ...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-[var(--kg-surface)] border-t border-[var(--kg-border)] md:rounded-b-2xl">
            <div className="flex items-end gap-2 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Hỏi AI về lịch làm, checklist, quy trình SOP..."
                className="flex-1 max-h-32 min-h-[44px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] focus:border-[var(--kg-primary)] focus:bg-[var(--kg-surface)] rounded-xl px-3.5 py-2.5 text-sm resize-none transition-all text-[var(--kg-text)]"
                rows={1}
                disabled={isTyping}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                aria-label="Gửi tin nhắn"
                className="w-11 h-11 bg-[var(--kg-accent)] text-white rounded-xl flex items-center justify-center hover:brightness-95 transition disabled:opacity-50 flex-shrink-0 shadow-xs"
              >
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
            <div className="text-center mt-1.5">
              <span className="text-[10px] text-[var(--kg-text-muted)] font-medium">
                King&apos;s Grill AI • Llama 3.3 70B &amp; Gemini 2.5 Flash
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
