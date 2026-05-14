import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  resetKey?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

const CHUNK_ERROR_RE = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i;

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    const message = error?.message || '';
    if (CHUNK_ERROR_RE.test(message) && sessionStorage.getItem('kg_chunk_reload_done') !== 'true') {
      sessionStorage.setItem('kg_chunk_reload_done', 'true');
      window.location.reload();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="p-4 md:p-6">
        <div className="soft3d-card p-6 md:p-8 text-center max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">
            Màn hình này vừa gặp lỗi tải dữ liệu giao diện
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
            App vẫn đang chạy. Bạn có thể thử mở lại màn hình hoặc làm mới trang để lấy bản build mới nhất.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => this.setState({ error: null })}
              className="soft3d-btn-primary px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} /> Thử lại
            </button>
            <button
              onClick={() => window.location.reload()}
              className="soft3d-btn px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 text-slate-700 dark:text-slate-200"
            >
              <RefreshCw size={16} /> Tải lại trang
            </button>
          </div>
        </div>
      </div>
    );
  }
}
