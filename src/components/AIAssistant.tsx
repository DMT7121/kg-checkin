import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Maximize2, Minimize2, Sparkles, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { fetchWithRetry } from '../utils/helpers';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { sopData } from '../pages/sopData';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function AIAssistant() {
  const store = useAppStore();
  const { groqKeys, currentUser, logs, shiftData, checklistItems, adminSchedules, chatHistory, aiPrompts, payrollData, checklistLogs, approvedShifts, shiftName, isAiOpen, setAiOpen } = store;
  
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

  // Check if a lightbox/guideline is open
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    const checkOverlay = () => {
      const open = document.getElementById('cukcuk-lightbox') !== null;
      setIsLightboxOpen(open);
    };

    checkOverlay();

    const observer = new MutationObserver(checkOverlay);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  const useGeminiFallback = groqKeys.length === 0;

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
      const todayShift = approvedShifts ? approvedShifts[dayIdx] : 'Chưa xếp ca';
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

      if (useGeminiFallback) {
        // Fallback to Gemini 2.5 Flash using hardcoded API key
        const apiKey = "AIzaSyBimS3f8NyESLsYS8bgwThM9scpl5_2WvI";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        // Map roles to gemini model format
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

      } else {
        // Use configured Groq keys
        const selectedKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
        const apiKey = selectedKey ? selectedKey.key : null;
        if (!apiKey) throw new Error('No Groq API key available');

        const apiMessages = [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage.content }
        ];

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

  // Hàm render Markdown cơ bản
  const renderFormattedText = (text: string) => {
    // Chuyển markdown cơ bản thành HTML
    let html = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/\n/g, '<br />') // Newlines
      .replace(/- (.*?)<br \/>/g, '<li>$1</li>') // Simple lists
      .replace(/<li>(.*?)<\/li>/g, '<ul class="list-disc pl-4 space-y-1 mb-2"><li>$1</li></ul>') // Wrap lists
      .replace(/<\/ul><ul class="list-disc pl-4 space-y-1 mb-2">/g, ''); // Merge adjacent lists

    return <div dangerouslySetInnerHTML={{ __html: html }} className="text-sm space-y-2 leading-relaxed" />;
  };

  if (!currentUser) return null; // Chỉ hiện khi đã đăng nhập

  return (
    <>
      {/* Floating Button */}
      {!isAiOpen && (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 w-12 h-12 md:w-14 md:h-14 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform ${isLightboxOpen ? 'z-40' : 'z-[90]'} border-2 border-white/20`}
          title="Trợ lý AI King's Grill"
        >
          <Sparkles size={22} />
          {/* Notification Dot */}
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-ping"></span>
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>
        </button>
      )}

      {/* Chat Window */}
      {isAiOpen && (
        <div 
          className={`fixed right-0 md:right-6 bottom-0 md:bottom-6 soft3d-bg shadow-2xl ${isLightboxOpen ? 'z-40' : 'z-[9999]'} flex flex-col transition-all duration-300 ease-in-out border border-gray-200 dark:border-gray-800 ${
            isExpanded 
              ? 'w-full md:w-[600px] h-full md:h-[80vh] md:rounded-2xl' 
              : 'w-full md:w-[380px] h-[75vh] md:h-[550px] md:rounded-2xl rounded-t-2xl'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between text-white rounded-t-2xl shadow-md z-10 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="font-bold text-sm">King&apos;s Grill AI Assistant</h3>
                <p className="text-[10px] text-indigo-100 flex items-center">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span>
                  {useGeminiFallback ? 'Sẵn sàng (Gemini)' : `Sẵn sàng (${groqKeys.length} Groq Keys)`}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-white/20 rounded-full transition hidden md:block">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setAiOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
            {useGeminiFallback && (
              <div className="bg-blue-50/55 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl p-3 text-[11px] flex items-start space-x-2">
                <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-indigo-500" />
                <p>Trợ lý đang chạy ở chế độ dự phòng bằng Gemini. Liên hệ Admin nạp Groq API Key nếu muốn tăng độ nhạy phản hồi.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3  ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'soft3d-card  text-gray-800 dark:text-gray-200 rounded-tl-sm'
                }`}>
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
                <div className="soft3d-card  rounded-2xl rounded-tl-sm px-4 py-3  flex items-center space-x-2">
                  <Loader2 size={16} className="animate-spin text-indigo-600" />
                  <span className="text-xs text-gray-500 font-medium tracking-wide">AI đang suy nghĩ...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 rounded-b-2xl">
            <div className="flex items-end space-x-2 relative">
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
                className="flex-1 max-h-32 min-h-[44px] paint-layer border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-900 rounded-xl px-4 py-3 text-sm resize-none transition-all dark:text-white"
                rows={1}
                disabled={isTyping}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="w-11 h-11 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition disabled:opacity-50 disabled:hover:bg-indigo-600 flex-shrink-0"
              >
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[9px] text-gray-400 font-medium">Powered by Llama 3.3 70B & Groq LPU™ / Gemini 2.5 Flash</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
