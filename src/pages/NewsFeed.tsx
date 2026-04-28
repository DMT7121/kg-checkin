import { useState } from 'react';
import { Newspaper, Heart, MessageSquare, CheckCircle } from 'lucide-react';
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
    }
  ]);

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

  return (
    <div className="p-4 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <Newspaper size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Bảng Tin</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10">Cập nhật thông tin nhanh nhất</p>
      </div>

      <div className="space-y-5">
        {posts.map(post => (
          <div key={post.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in">
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
            <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-700/50 flex justify-between text-[11px] text-gray-500 font-medium">
              <span>{post.likes} lượt thích</span>
              <span>{post.readBy} người đã xem</span>
            </div>

            {/* Actions */}
            <div className="flex px-2 py-2 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => toggleLike(post.id)} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${post.hasLiked ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <Heart size={16} className={`mr-1.5 ${post.hasLiked ? 'fill-current' : ''}`} /> Thích
              </button>
              <button className="flex-1 flex justify-center items-center py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all">
                <MessageSquare size={16} className="mr-1.5" /> Bình luận
              </button>
              <button onClick={() => markAsRead(post.id)} disabled={post.hasRead} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${post.hasRead ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}>
                <CheckCircle size={16} className="mr-1.5" /> {post.hasRead ? 'Đã xem' : 'Đã đọc'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
