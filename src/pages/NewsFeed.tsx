import { useState, useEffect } from 'react';
import { Newspaper, Heart, MessageSquare, CheckCircle, Send, Edit3, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';

export default function NewsFeed() {
  const { currentUser, posts, setPosts } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // Lấy dữ liệu bài đăng thực tế khi mở tab
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      const res = await callApi('GET_POSTS', {});
      if (res?.ok && res.data) {
        setPosts(res.data);
      } else {
        // Fallback mock nếu chưa setup Backend (Trải nghiệm mượt mà)
        if (posts.length === 0) {
          setPosts([
            {
              id: 1, author: 'Hệ thống King Grill', role: 'System', time: 'Vừa xong',
              content: 'Chào mừng bạn đến với Bảng tin phiên bản Mới! Hiện tại chưa có dữ liệu từ máy chủ. Admin hãy đăng bài đầu tiên nhé!',
              likes: [], comments: []
            }
          ]);
        }
      }
      setLoading(false);
    };
    fetchPosts();
  }, []);

  const toggleLike = async (id: number) => {
    // Optimistic Update
    const currentUsername = currentUser?.username || 'Guest';
    let isLiking = true;
    
    setPosts(posts.map(p => {
      if (p.id === id) {
        const hasLiked = p.likes.includes(currentUsername);
        isLiking = !hasLiked;
        return { 
          ...p, 
          likes: hasLiked ? p.likes.filter(u => u !== currentUsername) : [...p.likes, currentUsername] 
        };
      }
      return p;
    }));

    // Gửi lên Backend ngầm
    callApi('INTERACT_POST', { postId: id, action: 'LIKE', username: currentUsername }, { background: true });
  };

  const handleAddComment = async (postId: number) => {
    if (!commentInput.trim()) return;
    const content = commentInput.trim();
    setCommentInput('');
    
    // Optimistic Update
    setPosts(posts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [...p.comments, {
            id: Date.now(),
            author: currentUser?.fullname || 'Bạn',
            content,
            time: 'Vừa xong'
          }]
        };
      }
      return p;
    }));
    
    // Gửi lên Backend ngầm
    callApi('INTERACT_POST', { 
      postId, 
      action: 'COMMENT', 
      author: currentUser?.fullname || 'Ẩn danh',
      content
    }, { background: true });
  };

  const handleAddPost = async () => {
    if (!newPostContent.trim()) return;
    setIsPosting(true);
    
    const content = newPostContent.trim();
    
    // Gọi API
    const res = await callApi('ADD_POST', {
      author: currentUser?.fullname || 'Admin',
      content
    });

    if (res?.ok) {
      setNewPostContent('');
      // Tải lại bài đăng để lấy ID chuẩn từ DB
      const reloadRes = await callApi('GET_POSTS', {});
      if (reloadRes?.ok) setPosts(reloadRes.data);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã đăng bài lên Bảng tin', showConfirmButton: false, timer: 2000 });
    } else {
      Swal.fire('Lỗi', 'Không thể đăng bài. Vui lòng kiểm tra lại Google Apps Script!', 'error');
    }
    
    setIsPosting(false);
  };

  return (
    <div className="p-4 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <Newspaper size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Bảng Tin Thực Tế</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10">Kết nối trực tiếp vào Database</p>
      </div>

      {/* Admin Post Box */}
      {currentUser?.role === 'admin' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-indigo-100 dark:border-indigo-900/50 overflow-hidden mb-6 p-4">
          <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center text-sm">
            <Edit3 size={16} className="mr-2 text-indigo-500" /> Tạo thông báo mới
          </h3>
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            rows={3}
            placeholder="Bạn muốn thông báo điều gì cho toàn bộ quán?"
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-white resize-none"
          />
          <div className="flex justify-end mt-3">
            <button 
              onClick={handleAddPost}
              disabled={isPosting || !newPostContent.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-xl transition flex items-center disabled:opacity-50"
            >
              {isPosting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Send size={16} className="mr-2" />}
              Đăng bài
            </button>
          </div>
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map(post => {
            const hasLiked = post.likes.includes(currentUser?.username || 'Guest');
            
            return (
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
                        {(post.author === 'Admin' || post.role === 'Admin') && <span className="ml-2 bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-full font-extrabold">ADMIN</span>}
                        {post.role === 'System' && <span className="ml-2 bg-blue-100 text-blue-600 text-[9px] px-2 py-0.5 rounded-full font-extrabold">SYSTEM</span>}
                      </h4>
                      <p className="text-[10px] text-gray-500">{post.time || 'Gần đây'}</p>
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
                    <span className="flex items-center"><Heart size={12} className="mr-1 text-pink-500 fill-current" /> {post.likes.length}</span>
                    <span className="flex items-center"><MessageSquare size={12} className="mr-1 text-blue-500" /> {post.comments.length}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex px-2 py-1.5 border-y border-gray-100 dark:border-gray-700">
                  <button onClick={() => toggleLike(post.id)} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${hasLiked ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Heart size={16} className={`mr-1.5 ${hasLiked ? 'fill-current' : ''}`} /> Thích
                  </button>
                  <button onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)} className={`flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-xl transition-all ${activeCommentPostId === post.id ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <MessageSquare size={16} className="mr-1.5" /> Bình luận
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
                      {post.comments.length === 0 && (
                        <p className="text-xs text-center text-gray-500 py-2">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                      )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
