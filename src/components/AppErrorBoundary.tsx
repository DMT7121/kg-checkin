import React from 'react';

interface Props {
  children: React.ReactNode;
  resetKey?: string;
  onRecover?: () => void;
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
    if (CHUNK_ERROR_RE.test(message)) {
      sessionStorage.removeItem('kg_chunk_reload_done');
      window.location.reload();
      return;
    }

    window.setTimeout(() => {
      this.props.onRecover?.();
      this.setState({ error: null });
    }, 0);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}
