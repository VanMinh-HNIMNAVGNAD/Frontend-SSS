import toast, { Toaster, resolveValue } from 'react-hot-toast';
import { AlertCircle, Check, Info, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/** Icon ở đầu toast: chỉ lỗi mang sắc đỏ dịu, còn lại là mực/xám như phần còn lại của giao diện. */
function ToastIcon({ toast: item }) {
    if (item.type === 'loading') return <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-muted)]" />;
    if (item.type === 'success') return <Check className="w-4 h-4 text-[var(--ink)]" strokeWidth={2.5} />;
    if (item.type === 'error') return <AlertCircle className="w-4 h-4 text-[var(--tone-danger)]" />;
    // `toast(msg, { icon: 'ℹ️' })` ở vài chỗ: emoji màu lạc tông giữa các icon nét — đổi về icon nét.
    if (item.icon && item.icon !== 'ℹ️') return <span className="text-sm leading-none">{item.icon}</span>;
    return <Info className="w-4 h-4 text-[var(--ink-muted)]" />;
}

/**
 * Toast kính (26/10/2026): react-hot-toast chỉ lo hàng đợi/thời gian, phần vẽ là của mình.
 *
 * Bản trước truyền `style` cho toast mặc định: `backdrop-filter` đặt thẳng lên phần tử, icon
 * tròn xanh lục/đỏ đặc của thư viện và không có nút đóng. Nay toast là `glass-strong` như menu
 * (blur ở `::before`), icon nét trong một viên kính nhỏ, có nút ✕, và nằm DƯỚI header (không đè
 * lên chuông thông báo / avatar).
 */
export default function GlassToaster() {
    const { t } = useLanguage();

    return (
        <Toaster
            position="top-right"
            gutter={10}
            containerStyle={{ top: 84, right: 16, left: 16 }}
            toastOptions={{ duration: 3500 }}
        >
            {(item) => (
                <div
                    {...item.ariaProps}
                    className={`glass-strong relative flex items-start gap-2.5 w-max max-w-[min(420px,calc(100vw-2rem))] rounded-[18px] py-2 pl-2 pr-1.5 text-[13px] font-medium leading-snug text-[var(--ink)] pointer-events-auto ${
                        item.visible ? 'animate-toast-in' : 'animate-toast-out opacity-0'
                    }`}
                >
                    <span
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                            item.type === 'error' ? 'bg-[var(--tone-danger-soft)]' : 'bg-[var(--chip-fill)]'
                        }`}
                    >
                        <ToastIcon toast={item} />
                    </span>
                    <div className="min-w-0 flex-1 py-1 break-words">{resolveValue(item.message, item)}</div>
                    {item.type !== 'loading' && (
                        <button
                            type="button"
                            onClick={() => toast.dismiss(item.id)}
                            title={t('common.close')}
                            aria-label={t('common.close')}
                            className="shrink-0 p-1.5 rounded-full text-[var(--ink-subtle)] hover:text-[var(--ink)] cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </Toaster>
    );
}
