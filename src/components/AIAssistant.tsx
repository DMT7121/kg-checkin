import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Maximize2, Minimize2, Sparkles, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { fetchWithRetry } from '../utils/helpers';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function AIAssistant() {
  const store = useAppStore();
  const { groqKeys, currentUser, logs, shiftData, checklistItems, adminSchedules, chatHistory, aiPrompts, payrollData, checklistLogs, approvedShifts, shiftName } = store;
  
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Chào bạn! Mình là Trợ lý AI của King's Grill. Mình có thể giúp bạn kiểm tra lịch làm việc, hướng dẫn các hạng mục Checklist, hỗ trợ đào tạo nghiệp vụ và trả lời các câu hỏi về quán. Mình có thể giúp gì cho bạn hôm nay?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyLoaded = useRef(false);

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

  const generateSystemPrompt = () => {
    const today = new Date().toLocaleDateString('vi-VN');
    let prompt = `Bạn là Trợ lý AI chuyên nghiệp của nhà hàng King's Grill. Hôm nay là ngày ${today}, đang là ${shiftName}.
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

    prompt += `
[HƯỚNG DẪN TRẢ LỜI]
- Bạn có khả năng phân tích lịch làm, đọc công việc checklist, và đào tạo nghiệp vụ.
- Nếu người dùng yêu cầu "tạo bộ checklist", hãy liệt kê dưới dạng danh sách chuyên nghiệp (bullet points).
- Luôn trả lời bằng tiếng Việt, thân thiện, ngắn gọn, súc tích (không quá dài dòng), có thể dùng emoji để thân thiện hơn.
- KHÔNG BỊA ĐẶT DỮ LIỆU nếu không có trong ngữ cảnh.`;

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

    return prompt;
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    if (groqKeys.length === 0) {
      Swal.fire('Cảnh báo', 'Hệ thống chưa được nạp Groq API Key. Vui lòng liên hệ Admin!', 'warning');
      return;
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const selectedKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
      const apiKey = selectedKey ? selectedKey.key : null;
      if (!apiKey) throw new Error('No API key available');

      const systemPrompt = generateSystemPrompt();

      // Chỉ gửi 5 tin nhắn gần nhất + system prompt để tiết kiệm token
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

      const aiText = result.choices?.[0]?.message?.content || 'Xin lỗi, mình đang gặp sự cố khi xử lý dữ liệu. Bạn thử lại nhé!';
      
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
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform z-[9999] animate-bounce hover:animate-none border-2 border-white/20"
        >
          <Sparkles size={24} />
          {/* Notification Dot */}
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-ping"></span>
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`fixed right-0 md:right-6 bottom-0 md:bottom-6 bg-white dark:bg-gray-900 shadow-2xl z-[9999] flex flex-col transition-all duration-300 ease-in-out border border-gray-200 dark:border-gray-800 ${
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
                <h3 className="font-bold text-sm">Trợ lý AI King&apos;s Grill</h3>
                <p className="text-[10px] text-indigo-100 flex items-center"><span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></span> Sẵn sàng ({groqKeys.length} Keys)</p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-white/20 rounded-full transition hidden md:block">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
            {groqKeys.length === 0 && (
              <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-3 text-xs flex items-start space-x-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <p>Hệ thống chưa có Groq API Key nào! Hãy nhờ Quản lý vào mục "Cấu hình hệ thống" để nạp bộ Key mới dùng được tính năng này nhé.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-sm'
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
                <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center space-x-2">
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
                placeholder="Hỏi AI về lịch làm, checklist, hướng dẫn nghiệp vụ..."
                className="flex-1 max-h-32 min-h-[44px] bg-gray-100 dark:bg-gray-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-900 rounded-xl px-4 py-3 text-sm resize-none transition-all dark:text-white"
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
              <span className="text-[9px] text-gray-400 font-medium">Powered by Llama 3.3 70B & Groq LPU™</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
