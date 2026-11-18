import { useAppStore } from '../store/useAppStore';
import { KgLoadingOverlay } from './KgDesignSystem';

export default function LoadingScreen() {
  const loading = useAppStore((s) => s.loading);
  const loadingText = useAppStore((s) => s.loadingText);
  if (!loading) return null;

  return <KgLoadingOverlay text={loadingText || 'Đang xử lý...'} />;
}
