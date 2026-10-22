import { Component } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Home } from 'lucide-react';
import { readSavedLanguage, translate } from '../../utils/translate';
import { isChunkLoadError, reloadOnceForNewVersion } from '../../utils/chunkReload';

/**
 * Lưới an toàn cho lỗi render.
 *
 * React 19 gỡ TOÀN BỘ cây khi một lỗi render không có boundary nào bắt — tức một lỗi
 * nhỏ trong khung xem trước là cả app thành trang trắng, không nút nào để bấm. Trước
 * 02/10/2026 frontend không có boundary nào (ledger ##64).
 *
 * Lỗi "không tải được chunk" (tab đang chạy bản build cũ sau một lần deploy) thì tự tải
 * lại trang MỘT lần — xem `utils/chunkReload.js`. Mọi lỗi khác hiện khung báo lỗi với
 * nút "Thử lại" (dựng lại phần hỏng) và "Tải lại trang".
 *
 * Props:
 *  • `resetKey`  — đổi giá trị (vd. đường dẫn) thì tự xoá trạng thái lỗi: người dùng
 *                  bấm sang trang khác là thoát được trang hỏng mà không cần F5.
 *  • `fallback`  — `({ error, reset }) => node` để nơi gọi tự vẽ (vd. modal).
 *  • `variant`   — 'page' (chiếm cả màn hình) | 'inline' (nằm trong khung app).
 *
 * Câu chữ đi qua `translate()` chứ không qua `useLanguage()`: boundary ngoài cùng nằm
 * NGOÀI `LanguageProvider`, và chính provider cũng có thể là thứ vừa hỏng.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error) && reloadOnceForNewVersion()) return;
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback, variant = 'page' } = this.props;
    if (typeof fallback === 'function') return fallback({ error, reset: this.reset });
    return <ErrorFallback error={error} onRetry={this.reset} variant={variant} />;
  }
}

export function ErrorFallback({ error, onRetry, onClose, variant = 'page' }) {
  const t = (key) => translate(readSavedLanguage(), key);
  const chunk = isChunkLoadError(error);

  const box = (
    <div className="glass-strong relative w-full max-w-md rounded-[28px] p-6 text-center text-gray-900 dark:text-gray-100">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        {chunk ? <RefreshCw className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
      </div>
      <h2 className="mb-2 text-lg font-extrabold">{t(chunk ? 'crash.newVersionTitle' : 'crash.title')}</h2>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">{t(chunk ? 'crash.newVersionBody' : 'crash.body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-2xl btn-accent px-5 py-2.5 text-sm font-bold transition hover:brightness-105 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" /> {t('crash.reload')}
        </button>
        {!chunk && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-2xl glass-soft px-5 py-2.5 text-sm font-bold text-gray-800 dark:text-gray-100 transition-all hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> {t('crash.retry')}
          </button>
        )}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl glass-soft px-5 py-2.5 text-sm font-bold text-gray-800 dark:text-gray-100 transition-all hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer"
          >
            {t('common.close')}
          </button>
        ) : (
          variant === 'page' && (
            <a
              href="/app"
              className="flex items-center gap-2 rounded-2xl glass-soft px-5 py-2.5 text-sm font-bold text-gray-800 dark:text-gray-100 transition-all hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer"
            >
              <Home className="h-4 w-4" /> {t('crash.home')}
            </a>
          )
        )}
      </div>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 glass-overlay z-[200] flex items-center justify-center p-4">{box}</div>
    );
  }
  if (variant === 'inline') {
    return <div className="flex flex-1 items-center justify-center p-6">{box}</div>;
  }
  return <div className="flex min-h-screen items-center justify-center p-6">{box}</div>;
}
