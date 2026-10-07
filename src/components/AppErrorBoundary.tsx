import React from 'react';

interface Props {
  children: React.ReactNode;
  resetKey?: string;
  fallback?: React.ReactNode | ((props: { error: Error; reset: () => void }) => React.ReactNode);
}

interface State {
  error: Error | null;
}

const CHUNK_ERROR_RE = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i;

function getBuildReloadKey() {
  const scriptSrc = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src || location.href;
  return `kg_chunk_reload_done:${scriptSrc}`;
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught render error in module:', error, errorInfo);
    const message = error?.message || '';
    if (CHUNK_ERROR_RE.test(message)) {
      const reloadKey = getBuildReloadKey();
      if (sessionStorage.getItem(reloadKey) !== 'true') {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
      return;
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({ error: this.state.error, reset: this.handleReset });
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
