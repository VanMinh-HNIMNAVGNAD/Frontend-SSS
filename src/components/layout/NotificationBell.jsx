import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    BellOff,
    CalendarClock,
    CheckCheck,
    CreditCard,
    HardDrive,
    Info,
    Loader2,
    MessageSquare,
    Sparkles,
    TriangleAlert,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import { notificationsApi } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { formatRelativeTime } from '../../utils/relativeTime';
import { localeTagOf } from '../../utils/locale';

/**
 * Cái chuông thông báo trên thanh trên cùng (##91).
 *
 * Backend phát thông báo khi: ai đó chia sẻ tệp/thư mục cho bạn, bạn được thêm vào Bộ nhớ
 * dùng chung, có nhận xét mới trên tệp của bạn, thanh toán thành công, gói sắp/đã hết hạn,
 * bộ nhớ hoặc hạn mức AI sắp hết. Câu chữ backend đã dịch theo ngôn ngữ đang chọn.
 *
 * Hỏi SỐ CHƯA ĐỌC định kỳ (một câu COUNT), chỉ kéo danh sách khi mở chuông. Tab bị ẩn thì
 * thôi hỏi — quay lại tab là hỏi ngay một lượt, nên không bao giờ phải chờ trọn chu kỳ.
 */
const POLL_MS = 60_000;
const PAGE_SIZE = 20;

/** Biểu tượng + màu theo loại — loại lạ (bản backend mới hơn) về biểu tượng "thông tin". */
const TYPE_STYLE = {
    FILE_SHARED: { Icon: UserPlus, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
    DRIVE_MEMBER_ADDED: { Icon: Users, tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
    COMMENT: { Icon: MessageSquare, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    PAYMENT_SUCCESS: { Icon: CreditCard, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    PLAN_EXPIRING: { Icon: CalendarClock, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
    PLAN_EXPIRED: { Icon: TriangleAlert, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
    STORAGE_WARNING: { Icon: HardDrive, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
    AI_QUOTA_WARNING: { Icon: Sparkles, tone: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
};
const DEFAULT_STYLE = { Icon: Info, tone: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300' };

/** Chỉ điều hướng trong app — `linkUrl` lạ (http://…, //…) bị bỏ qua chứ không mở ra ngoài. */
const isInternalLink = (url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');

export default function NotificationBell() {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const locale = localeTagOf(language);

    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const buttonRef = useRef(null);

    const refreshCount = useCallback(async () => {
        try {
            const res = await notificationsApi.unreadCount();
            if (typeof res?.count === 'number') setUnread(res.count);
        } catch {
            /* chuông là phụ — lỗi mạng thì giữ con số cũ, lượt sau hỏi lại */
        }
    }, []);

    // Hỏi định kỳ khi tab đang hiện; quay lại tab thì hỏi ngay. setState chỉ chạy SAU `await`
    // (không đồng bộ trong thân effect — `react-hooks/set-state-in-effect`).
    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await notificationsApi.unreadCount();
                if (!cancelled && typeof res?.count === 'number') setUnread(res.count);
            } catch {
                /* chuông là phụ — lỗi mạng thì giữ con số cũ, lượt sau hỏi lại */
            }
        };
        poll();
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') poll();
        }, POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') poll();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    const loadPage = useCallback(async (before) => {
        const res = await notificationsApi.list({
            limit: PAGE_SIZE,
            ...(before ? { before } : {}),
        });
        if (typeof res?.unreadCount === 'number') setUnread(res.unreadCount);
        setHasMore(Boolean(res?.hasMore));
        return Array.isArray(res?.items) ? res.items : [];
    }, []);

    // Mở chuông là kéo trang đầu — luôn mới, vì thông báo có thể vừa tới. Cờ "đang tải" bật ở chỗ
    // bấm mở, không bật ở đây; mọi setState chạy SAU `await` (`react-hooks/set-state-in-effect`).
    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await notificationsApi.list({ limit: PAGE_SIZE });
                if (cancelled) return;
                if (typeof res?.unreadCount === 'number') setUnread(res.unreadCount);
                setHasMore(Boolean(res?.hasMore));
                setItems(Array.isArray(res?.items) ? res.items : []);
            } catch (err) {
                if (!cancelled) setError(err?.message || t('common.unknownError'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, t]);

    // Esc đóng chuông.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const loadMore = async () => {
        const last = items[items.length - 1];
        if (!last || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await loadPage(last.createdAt);
            setItems((prev) => [...prev, ...page.filter((n) => !prev.some((p) => p.id === n.id))]);
        } catch (err) {
            setError(err?.message || t('common.unknownError'));
        } finally {
            setLoadingMore(false);
        }
    };

    const markRead = (id) => {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnread((count) => Math.max(0, count - 1));
        notificationsApi.markRead(id).catch(() => refreshCount());
    };

    const openNotification = (n) => {
        if (!n.isRead) markRead(n.id);
        setOpen(false);
        if (isInternalLink(n.linkUrl)) navigate(n.linkUrl);
    };

    const markAllRead = async () => {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnread(0);
        try {
            await notificationsApi.markAllRead();
        } catch {
            refreshCount();
        }
    };

    const removeOne = async (n) => {
        setItems((prev) => prev.filter((x) => x.id !== n.id));
        if (!n.isRead) setUnread((count) => Math.max(0, count - 1));
        try {
            await notificationsApi.remove(n.id);
        } catch {
            refreshCount();
        }
    };

    const clearRead = async () => {
        setItems((prev) => prev.filter((n) => !n.isRead));
        try {
            await notificationsApi.clearRead();
        } catch {
            /* lượt mở chuông sau sẽ đọc lại danh sách thật */
        }
    };

    const badge = unread > 99 ? '99+' : String(unread);
    const hasRead = items.some((n) => n.isRead);

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    if (!open) {
                        setLoading(true);
                        setError(null);
                    }
                    setOpen(!open);
                }}
                title={t('notifications.title')}
                aria-label={unread > 0 ? t('notifications.unreadAria', { count: unread }) : t('notifications.title')}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative p-2 sm:p-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors cursor-pointer"
            >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-[var(--app-surface)]">
                        {badge}
                    </span>
                )}
            </button>

            {open && (
                <>
                    {/* Lớp trong suốt bắt cú bấm ra ngoài để đóng — cùng cách với menu "⋮". */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        role="dialog"
                        aria-label={t('notifications.title')}
                        className="fixed sm:absolute inset-x-2 sm:inset-x-auto top-16 sm:top-full sm:right-0 sm:mt-2 sm:w-[24rem] z-50 flex flex-col max-h-[min(70vh,560px)] bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl shadow-2xl animate-fade-in overflow-hidden"
                    >
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--app-border)]">
                            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('notifications.title')}</h2>
                            <div className="flex items-center gap-1">
                                {unread > 0 && (
                                    <button
                                        type="button"
                                        onClick={markAllRead}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" />
                                        {t('notifications.markAllRead')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    title={t('common.close')}
                                    aria-label={t('common.close')}
                                    className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading && items.length === 0 ? (
                                <div className="flex items-center justify-center py-10 text-gray-500">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                </div>
                            ) : error && items.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-300">{error}</p>
                            ) : items.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                    <BellOff className="w-8 h-8" />
                                    <p className="text-sm font-medium">{t('notifications.empty')}</p>
                                    <p className="text-xs">{t('notifications.emptyHint')}</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-[var(--app-border)]">
                                    {items.map((n) => {
                                        const { Icon, tone } = TYPE_STYLE[n.type] ?? DEFAULT_STYLE;
                                        return (
                                            <li key={n.id} className="group relative">
                                                <button
                                                    type="button"
                                                    onClick={() => openNotification(n)}
                                                    className={`w-full flex items-start gap-3 px-4 py-3 pr-10 text-left transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 ${
                                                        n.isRead ? '' : 'bg-blue-50/60 dark:bg-blue-500/5'
                                                    }`}
                                                >
                                                    <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${tone}`}>
                                                        <Icon className="w-4 h-4" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className={`block text-[13px] leading-snug ${n.isRead ? 'font-medium text-gray-800 dark:text-gray-200' : 'font-bold text-gray-900 dark:text-gray-100'}`}>
                                                            {n.title}
                                                        </span>
                                                        <span className="block mt-0.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-3 break-words">
                                                            {n.message}
                                                        </span>
                                                        <span className="block mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                                                            {formatRelativeTime(n.createdAt, t, locale)}
                                                        </span>
                                                    </span>
                                                    {!n.isRead && (
                                                        <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-blue-600" aria-label={t('notifications.unread')} />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeOne(n)}
                                                    title={t('notifications.delete')}
                                                    aria-label={t('notifications.delete')}
                                                    className="absolute top-2.5 right-2.5 p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {(hasMore || hasRead) && (
                            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-[var(--app-border)] text-xs">
                                {hasMore ? (
                                    <button
                                        type="button"
                                        onClick={loadMore}
                                        disabled={loadingMore}
                                        className="flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50 cursor-pointer"
                                    >
                                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        {t('notifications.loadMore')}
                                    </button>
                                ) : (
                                    <span />
                                )}
                                {hasRead && (
                                    <button
                                        type="button"
                                        onClick={clearRead}
                                        className="font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:underline cursor-pointer"
                                    >
                                        {t('notifications.clearRead')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
