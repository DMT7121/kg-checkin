import { useState } from 'react';
import { Newspaper, Heart, MessageSquare, CheckCircle, Send } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import Swal from 'sweetalert2';

export default function NewsFeed() {
  const { currentUser } = useAppStore();
  
  const [posts, setPosts] = useState([
    {
      id: 1,
      author: 'Quản lý',
      role: 'Admin',
      time: '2 giờ trước',
      content: 'Chào buổi sáng cả nhà! Từ thứ 2 tuần sau, quán chúng ta sẽ áp dụng Menu mới mùa Hè. Các bạn vào tab "Đào Tạo" để cập nhật công thức mới nhé! Đừng quên lịch họp team vào tối Chủ Nhật này.',
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=800',
      likes: 5,
      readBy: 8,
      hasLiked: false,
      hasRead: false,
      comments: [
        { id: 101, author: 'Hương Nguyễn', content: 'Dạ vâng sếp ạ! Món mới có khó làm không ạ?', time: '1 giờ trước' },
        { id: 102, author: 'Quản lý', content: 'Không em nhé, có video hướng dẫn cụ thể trên tab Đào tạo rồi.', time: '45 phút trước' }
      ]
    },
    {
      id: 2,
      author: 'Hệ thống King Grill',
      role: 'System',
      time: 'Hôm qua',
      content: 'Tuyên dương bạn @TuanAnh vì đã dọn dẹp rất sạch sẽ sau ca tối hôm qua. Tháng này bạn sẽ được cộng thêm 50 King Coins!',
      likes: 12,
      readBy: 15,
      hasLiked: true,
      hasRead: true,
      comments: [
        { id: 201, author: 'Tuấn Anh', content: 'Em cảm ơn hệ thống ạ hihi', time: 'Hôm qua' },
        { id: 202, author: 'Hương Nguyễn', content: 'Đỉnh quá Tuấn Anh ơiii', time: 'Hôm qua' }
      ]
    }
  ]);

  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');

  const toggleLike = (id: number) => {
    setPosts(posts.map(p => {
      if (p.id === id) {
        return { ...p, hasLiked: !p.hasLiked, likes: p.hasLiked ? p.likes - 1 : p.likes + 1 };
      }
      return p;
    }));
  };

  const markAsRead = (id: number) => {
    setPosts(posts.map(p => {
      if (p.id === id && !p.hasRead) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã xác nhận đọc thông báo', showConfirmButton: false, timer: 2000 });
        return { ...p, hasRead: true, readBy: p.readBy + 1 };
      }
      return p;
    }));
  };

  const handleAddComment = (postId: number) => {
    if (!commentInput.trim()) return;
    
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [...p.comments, {
            id: Date.now(),
            author: currentUser?.fullname || 'Bạn',
            content: commentInput.trim(),
            time: 'Vừa xong'
          }]
        };
      }
      return p;
    }));
    
    setCommentInput('');
  };

  return (
    <div className="p-4 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <Newspaper size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Bảng Tin</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10">Tương tác và nhận thông báo mới</p>
      </div>

      <div className="space-y-6">
        {posts.map(post => (
          <div key={post.id} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in">
            {/* Author */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 flex items-center justify-center font-bold text-lg mr-3 shadow-sm border border-indigo-200 dark:border-indigo-800">
                  {post.author.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center">
                    {post.author} 
                    {post.role === 'Admin' && <span className="ml-2 bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-full font-extrabold">ADMIN</span>}
                    {post.role === 'System' && <span className="ml-2 bg-blue-100 text-blue-600 text-[9px] px-2 py-0.5 rounded-full font-extrabold">SYSTEM</span>}
                  </h4>
                  <p className="text-[10px] text-gray-500">{post.time}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-4 pb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                {post.content}
              </p>
            </div>

            {/* Image */}
            {post.image && (
              <div className="w-full h-48 bg-gray-100 dark:bg-gray-900">
                <img src={post.image} alt="Post cover" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Stats */}
            <div className="px-4 py-2 flex justify-between text-[11px] text-gray-500 font-medium">
              <div className="flex items-center space-x-3">
                <span className="flex items-center"><Heart size={12} className="mr-1 text-pink-500 fill-current" /> {post.likes}</span>
                <span className="flex items-center"><MessageSquare size={12} className="mr-1 text-blue-500" /> {post.comments.length}</span>
              </div>
              <span>{post.readBy} người đã xem</span>
            </div>

            {/* Actions */}
            <div className="flex px-2 py-1.5 border-y border-gray-100 dark:border-gray-700">
              <button onClick={() => toggleLike(post.id)} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${post.hasLiked ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <Heart size={16} className={`mr-1.5 ${post.hasLiked ? 'fill-current' : ''}`} /> Thích
              </button>
              <button onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${activeCommentPostId === post.id ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <MessageSquare size={16} className="mr-1.5" /> Bình luận
              </button>
              <button onClick={() => markAsRead(post.id)} disabled={post.hasRead} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${post.hasRead ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}>
                <CheckCircle size={16} className="mr-1.5" /> {post.hasRead ? 'Đã xem' : 'Đã đọc'}
              </button>
            </div>

            {/* Comments Section */}
            {activeCommentPostId === post.id && (
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 animate-fade-in">
                <div className="space-y-4 mb-4 max-h-[250px] overflow-y-auto hide-scrollbar pr-1">
                  {post.comments.map(comment => (
                    <div key={comment.id} className="flex space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                        {comment.author.charAt(0)}
                      </div>
                      <div className="flex-1 bg-white dark:bg-gray-700 rounded-2xl rounded-tl-none p-3 shadow-sm border border-gray-100 dark:border-gray-600">
                        <h5 className="text-xs font-bold text-gray-800 dark:text-white mb-0.5">{comment.author}</h5>
                        <p className="text-sm text-gray-700 dark:text-gray-200">{comment.content}</p>
                        <p className="text-[9px] text-gray-400 mt-1">{comment.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Add Comment Input */}
                <div className="flex items-center space-x-2 mt-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex-shrink-0 flex items-center justify-center text-indigo-600 text-xs font-bold">
                    {currentUser?.fullname.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                      placeholder="Viết bình luận..." 
                      className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-white"
                    />
                    <button 
                      onClick={() => handleAddComment(post.id)}
                      disabled={!commentInput.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:bg-gray-400"
                    >
                      <Send size={12} className="ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
