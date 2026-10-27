import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getDialogQueue, settleDialog, subscribeDialogs } from '../../utils/dialog';

function DialogCard({ dialog }) {
    const { t } = useLanguage();
    const { id, kind, title, message, danger, placeholder } = dialog;
    const [value, setValue] = useState(dialog.defaultValue ?? '');
    const inputRef = useRef(null);
    const confirmRef = useRef(null);
    const cardRef = useRef(null);

    const submit = () => {
        if (kind === 'prompt') {
            if (value.trim()) settleDialog(id, value);
            return;
        }
        settleDialog(id, kind === 'confirm' ? true : undefined);
    };
    const cancel = () => settleDialog(id, kind === 'confirm' ? false : kind === 'prompt' ? null : undefined);

    // Bắt phím ở pha CAPTURE của window và chặn lan: hộp thoại hay mở đè lên một modal khác (xoá
    // nhãn trong hộp quản lý nhãn…) — Esc chỉ đóng hộp thoại chứ không đóng luôn modal bên dưới,
    // và phím tắt toàn cục không chạy xuyên qua. Không mảng phụ thuộc: luôn đọc `value` mới nhất.
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancel();
            } else if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                // Enter trên một NÚT của hộp (Tab tới "Huỷ" rồi Enter) là bấm đúng nút đó — không
                // phải luôn "Đồng ý". Trong ô nhập hay chỗ khác thì Enter = xác nhận.
                const active = document.activeElement;
                if (active instanceof HTMLButtonElement && cardRef.current?.contains(active)) active.click();
                else submit();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    });

    // Focus vào ô nhập (bôi đen sẵn tên mặc định để gõ đè) hoặc nút xác nhận; đóng thì trả focus về
    // chỗ cũ để người dùng bàn phím không bị đẩy về đầu trang.
    useEffect(() => {
        const previous = document.activeElement;
        if (kind === 'prompt') {
            inputRef.current?.focus();
            inputRef.current?.select();
        } else {
            confirmRef.current?.focus();
        }
        return () => previous?.focus?.();
    }, [kind]);

    const confirmLabel = dialog.confirmLabel || (kind === 'alert' ? t('dialog.ok') : t('dialog.confirm'));

    return (
        <div
            className="fixed inset-0 z-[300] glass-overlay flex items-center justify-center p-4 animate-fade-in"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) cancel();
            }}
        >
            <div
                ref={cardRef}
                role={kind === 'alert' ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby={title ? `dialog-title-${id}` : undefined}
                aria-describedby={`dialog-message-${id}`}
                className="glass-strong relative w-full max-w-sm rounded-[24px] p-5 animate-glass-in"
            >
                <div className="flex items-start gap-3">
                    {danger && (
                        <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]">
                            <AlertTriangle className="w-[18px] h-[18px]" />
                        </span>
                    )}
                    <div className="min-w-0 flex-1 pt-0.5">
                        {title && (
                            <h2 id={`dialog-title-${id}`} className="text-[15px] font-semibold text-[var(--ink)] mb-1">
                                {title}
                            </h2>
                        )}
                        <p
                            id={`dialog-message-${id}`}
                            className={`whitespace-pre-line break-words leading-relaxed ${
                                title ? 'text-[13px] text-[var(--ink-muted)]' : 'text-sm text-[var(--ink)]'
                            }`}
                        >
                            {message}
                        </p>
                    </div>
                </div>

                {kind === 'prompt' && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        placeholder={placeholder}
                        onChange={(e) => setValue(e.target.value)}
                        aria-label={typeof message === 'string' ? message : undefined}
                        // 16px trên điện thoại: Safari iOS phóng to cả trang khi chạm ô chữ < 16px.
                        className="glass-input mt-4 w-full rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                    {kind !== 'alert' && (
                        <button
                            type="button"
                            onClick={cancel}
                            className="glass-soft px-4 py-2 rounded-full text-sm font-medium text-[var(--ink)] cursor-pointer"
                        >
                            {dialog.cancelLabel || t('common.cancel')}
                        </button>
                    )}
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={submit}
                        disabled={kind === 'prompt' && !value.trim()}
                        className={`px-4 py-2 rounded-full text-sm font-semibold cursor-pointer disabled:cursor-not-allowed ${
                            danger ? 'btn-danger' : 'btn-accent hover:brightness-105'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Vẽ hộp thoại đang chờ của `utils/dialog.js` (confirmDialog / alertDialog / promptDialog). Đặt MỘT
 * lần ở App.jsx, trong LanguageProvider.
 */
export default function DialogHost() {
    const pending = useSyncExternalStore(subscribeDialogs, getDialogQueue);
    const current = pending[0];
    if (!current) return null;
    // `key`: hộp kế tiếp trong hàng là phiên bản mới (ô nhập, focus) chứ không tái dùng hộp cũ.
    return <DialogCard key={current.id} dialog={current} />;
}
