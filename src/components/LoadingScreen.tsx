import { Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function LoadingScreen() {
  const { loading, loadingText } = useAppStore();
  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-gray-100 dark:border-gray-700">
        <Loader2 className="animate-spin h-14 w-14 text-ocean-600 mb-4" />
        <p className="text-lg font-semibold animate-pulse text-ocean-700 dark:text-ocean-400">
          {loadingText}
        </p>
      </div>
    </div>
  );
}
