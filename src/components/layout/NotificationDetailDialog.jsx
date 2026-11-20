import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowSquareOut, ChatSlash, Trash, X } from '@phosphor-icons/react';
import { useLanguage } from '../../context/LanguageContext';
import { formatRelativeTime } from '../../utils/relativeTime';
import { localeTagOf } from '../../utils/locale';

/**
 * Hộp thoại CHI TIẾT một thông báo (20/11/2026 — "nhấn vào 1 thông báo cụ thể thì phải ra 1 hộp
 * thoại không thể rep, có chứa tiêu đề, nội dung…"). Trước đây bấm một thông báo là nhảy thẳng tới
 * liên kết của nó, nên nội dung dài (bị cắt còn 3 dòng trong danh sách) không bao giờ đọc hết.
 *
 * Chỉ để ĐỌC: không có ô trả lời — thông báo là tin tự động của hệ thống, ghi rõ điều đó ở chân.
 * Có liên kết nội bộ thì có nút "Mở" (hành vi cũ khi bấm vào hàng); kèm "Xoá" và "Đóng".
 *
 * Render qua portal vào <body>: chuông nằm trong header, mà menu / modal `fixed` trong header phải
 * tránh mọi khối chứa có transform (hoạt ảnh của header) và z-index của vùng nội dung.
 *
 * @param {{
 *   notification: {id: string, type: string, title: string, message: string, linkUrl: string|null, createdAt: string},
 *   Icon: import('react').ComponentType<any>,
 *   tone: string,
 *   canOpen: boolean,
 *   onOpen: () => void,
 *   onDelete: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function NotificationDetailDialog({ notification: n, Icon, tone, canOpen, onOpen, onDelete, onClose }) {
    const { t, language } = useLanguage();
    const locale = localeTagOf(language);
    const titleId = useId();
    const bodyId = useId();
    const closeRef = useRef(null);

    // Esc đóng; khoá cuộn trang phía sau; đưa focus vào hộp thoại (nút Đóng) và trả focus về chỗ cũ
    // (hàng thông báo / chuông) khi đóng.
    useEffect(() => {
        const previous = document.activeElement;
        closeRef.current?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.body.style.overflow = prevOverflow;
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, [onClose]);

    // Ngày và giờ định dạng RIÊNG rồi ghép bằng câu dịch: `dateStyle + timeStyle` của Intl tiếng Việt
    // tự chèn "lúc" ("lúc 15:35 Thứ Sáu…") nên ghép với "Nhận lúc" thành "Nhận lúc lúc".
    const created = new Date(n.createdAt);
    const valid = !Number.isNaN(created.getTime());
    const absolute = valid
        ? t('notifications.detail.receivedAt', {
            time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(created),
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(created),
        })
        : '';
    const typeKey = `notifications.type.${n.type}`;
    const typeLabel = t(typeKey) === typeKey ? t('notifications.type.INFO') : t(typeKey);

    return createPortal(
        <div
            className="fixed inset-0 z-[70] glass-overlay flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                className="glass-strong relative w-full max-w-md max-h-[min(36rem,calc(100dvh-2rem))] flex flex-col rounded-[28px] overflow-hidden animate-glass-in cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Đầu: icon theo loại + nhãn loại + thời điểm, nút đóng */}
                <div className="flex items-start gap-3 px-6 pt-5 pb-4">
                    <span className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center ${tone}`}>
                        <Icon className="w-5 h-5" weight="duotone" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-subtle)]">
                            {typeLabel}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                            {absolute}
                            <span className="text-[var(--ink-subtle)]"> · {formatRelativeTime(n.createdAt, t, locale)}</span>
                        </p>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        title={t('common.close')}
                        aria-label={t('common.close')}
                        className="shrink-0 -mr-2 -mt-1 inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--row-selected)] transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" weight="bold" />
                    </button>
                </div>

                {/* Thân: tiêu đề + toàn bộ nội dung (không cắt dòng như trong danh sách) */}
                <div className="px-6 pb-5 overflow-y-auto custom-scrollbar">
                    <h2 id={titleId} className="text-lg font-bold leading-snug text-[var(--ink)] break-words">
                        {n.title}
                    </h2>
                    <p
                        id={bodyId}
                        className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)] whitespace-pre-line break-words select-text"
                    >
                        {n.message}
                    </p>
                </div>

                {/* Chân: ghi chú không thể trả lời + thao tác */}
                <div className="px-6 py-4 border-t border-glass-divider space-y-3">
                    <p className="flex items-center gap-2 text-xs text-[var(--ink-subtle)]">
                        <ChatSlash className="w-4 h-4 shrink-0" />
                        <span>{t('notifications.detail.noReply')}</span>
                    </p>
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={onDelete}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-[var(--tone-danger)] hover:bg-[var(--tone-danger-soft)] transition-colors cursor-pointer"
                        >
                            <Trash className="w-4 h-4" />
                            {t('notifications.delete')}
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-full text-sm font-semibold glass-soft text-[var(--ink)] cursor-pointer"
                            >
                                {t('common.close')}
                            </button>
                            {canOpen && (
                                <button
                                    type="button"
                                    onClick={onOpen}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold btn-accent cursor-pointer"
                                >
                                    {t('notifications.detail.open')}
                                    <ArrowSquareOut className="w-4 h-4" weight="bold" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
