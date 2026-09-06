import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { marked } from 'marked';
import {
    Sparkles,
    X,
    Send,
    Bot,
    User as UserIcon,
    Copy,
    Check,
    Square,
    RefreshCw,
    AlertTriangle,
    FileText,
    Lightbulb,
    Tags,
    ListChecks,
    Wand2,
    Trash2,
    Loader2,
    FileSearch,
    FolderSearch,
    Info,
    Gauge,
    Globe,
    ArrowUpRight,
} from 'lucide-react';

import { aiApi } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Khung trò chuyện với trợ lý AI cho MỘT tệp/thư mục.
 *
 * Bản trước là giao diện giả: `setTimeout(1000)` rồi ghép một câu mẫu từ
 * `gemini.mockReply`. Bản này gọi thật `POST /ai/ask` (Vertex AI - Gemini), và
 * quan trọng hơn: nó NÓI THẬT về ngữ cảnh. Backend trả về `context.mode` cho biết
 * AI đọc được nội dung tệp, chỉ đọc danh sách thư mục, hay chỉ có mỗi thông tin mô
 * tả — khung chat hiển thị đúng điều đó ngay dưới mỗi câu trả lời, nên người dùng
 * không còn hiểu nhầm là AI đã đọc một tệp .zip mà nó không mở được.
 *
 * Props:
 *  - isOpen        mở/đóng
 *  - item          tệp hoặc thư mục được bấm chuột phải
 *  - initialAction lệnh nhanh chọn từ menu con ('summarize' | 'explain' | ...).
 *                  Có giá trị khác 'chat' thì tự chạy ngay khi mở — đó là điểm
 *                  của menu con: một cú bấm là có câu trả lời, không phải gõ gì.
 *  - onClose
 */

// Các lệnh nhanh hiện thành chip trong khung chat. Trùng danh sách với menu con ở
// ContextMenu.jsx (cùng bộ `id` mà backend hiểu) để hai chỗ không lệch nhau.
const QUICK_ACTIONS = [
    { id: 'summarize', icon: FileText, labelKey: 'ai.action.summarize' },
    { id: 'explain', icon: Lightbulb, labelKey: 'ai.action.explain' },
    { id: 'keywords', icon: Tags, labelKey: 'ai.action.keywords' },
    { id: 'quiz', icon: ListChecks, labelKey: 'ai.action.quiz', fileOnly: true },
    { id: 'improve', icon: Wand2, labelKey: 'ai.action.improve', fileLabelKey: 'ai.action.improveFile' },
];

// Số lượt gửi kèm làm lịch sử. Cắt ở đây chứ không gửi cả hội thoại: backend chặn
// cứng ở 20 lượt (ArrayMaxSize), gửi thừa sẽ ăn 400 giữa cuộc trò chuyện.
const MAX_HISTORY_TURNS = 16;

/**
 * Câu trả lời của model là markdown do máy sinh ra — escape HTML TRƯỚC khi parse.
 * marked không tự dọn HTML thô, mà chuỗi này đi thẳng vào dangerouslySetInnerHTML;
 * escape trước là chặn được thẻ script/onerror mà vẫn giữ nguyên markdown (kể cả
 * các khối code chứa dấu ngoặc nhọn, vì chúng được escape rồi mới bọc trong <code>).
 */
function renderMarkdown(text) {
    const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return marked.parse(escaped, { breaks: true, gfm: true });
}

export default function GeminiModal({ isOpen, item, initialAction = null, onClose }) {
    const { t, language } = useLanguage();

    const [messages, setMessages] = useState([]);
    const [prompt, setPrompt] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState(null);
    // null = chưa hỏi xong; { enabled, model, quota } = đã biết backend có bật AI hay không
    const [status, setStatus] = useState(null);
    // Hạn mức token của tháng. Lấy lần đầu từ `GET /ai/status`, sau đó mỗi câu trả lời
    // trả về hạn mức mới nên thanh còn lại không cần gọi thêm request nào.
    const [quota, setQuota] = useState(null);
    // Hết hạn mức: backend trả 429 kèm nguyên trạng thái hạn mức trong body.
    const [quotaBlocked, setQuotaBlocked] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState(null);

    const abortRef = useRef(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    const isFolder = item?.type === 'folder';

    const quickActions = useMemo(
        () => QUICK_ACTIONS.filter((a) => !(a.fileOnly && isFolder)),
        [isFolder],
    );

    // ── Gửi một câu hỏi ────────────────────────────────────────────────────
    const send = useCallback(
        async ({ action = 'chat', text = '' }) => {
            if (!item) return;
            const controller = new AbortController();
            abortRef.current = controller;

            // Câu hỏi của lệnh nhanh nằm ở backend, nên bong bóng của người dùng
            // hiển thị NHÃN của lệnh (“Tóm tắt nội dung”) chứ không phải câu lệnh thật.
            const label =
                action === 'chat'
                    ? text
                    : t(
                          (!isFolder && QUICK_ACTIONS.find((a) => a.id === action)?.fileLabelKey) ||
                              QUICK_ACTIONS.find((a) => a.id === action)?.labelKey ||
                              'ai.action.summarize',
                      );

            setError(null);
            setIsThinking(true);
            setMessages((prev) => [...prev, { sender: 'user', text: label, action }]);

            try {
                // Lịch sử gửi kèm chỉ gồm những lượt đã hoàn tất; bong bóng vừa thêm
                // ở trên KHÔNG nằm trong đó vì backend tự ghép câu hỏi hiện tại vào cuối.
                const history = messages
                    .slice(-MAX_HISTORY_TURNS)
                    .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

                const res = await aiApi.ask(
                    {
                        itemId: item.id,
                        action,
                        ...(action === 'chat' ? { prompt: text } : {}),
                        ...(history.length ? { history } : {}),
                        lang: language === 'en' ? 'en' : 'vi',
                    },
                    controller.signal,
                );

                setMessages((prev) => [
                    ...prev,
                    {
                        sender: 'ai',
                        text: res.answer,
                        context: res.context,
                        model: res.model,
                        grounded: res.grounded,
                        tokens: res.quota?.lastRequestTokens,
                    },
                ]);
                if (res.quota) {
                    setQuota(res.quota);
                    setQuotaBlocked(Boolean(res.quota.exhausted));
                }
            } catch (err) {
                if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
                    // Người dùng bấm Dừng: bỏ luôn bong bóng câu hỏi vừa thêm để hội
                    // thoại không còn một câu hỏi treo lơ lửng không có câu trả lời.
                    setMessages((prev) => prev.slice(0, -1));
                } else if (err?.response?.status === 429) {
                    // Hết hạn mức tháng — không phải lỗi kỹ thuật, nên hiện khối nâng cấp
                    // gói thay vì dòng lỗi đỏ kèm nút "thử lại" (thử lại cũng vô ích).
                    setQuota(err.response.data?.quota ?? null);
                    setQuotaBlocked(true);
                    setMessages((prev) => prev.slice(0, -1));
                } else {
                    setError(
                        err?.response?.data?.message ||
                            err?.message ||
                            t('ai.error.generic'),
                    );
                    setMessages((prev) => prev.slice(0, -1));
                }
            } finally {
                setIsThinking(false);
                abortRef.current = null;
            }
        },
        [item, isFolder, language, messages, t],
    );

    // `send` đổi tham chiếu sau mỗi lượt trả lời (nó đọc `messages`), nhưng hiệu ứng
    // khởi động bên dưới chỉ chạy đúng một lần lúc mở khung — giữ bản mới nhất qua ref
    // để nó không bắt chết bản closure đầu tiên.
    const sendRef = useRef(send);
    useEffect(() => {
        sendRef.current = send;
    });

    // ── Mở khung: hỏi trạng thái AI rồi chạy lệnh nhanh (nếu có) ───────────
    //
    // Chạy đúng MỘT lần vì component được các trang gắn `key={item.id}` và chỉ dựng
    // khi thật sự mở — mỗi lần mở là một instance mới, state bắt đầu sạch. Nhờ vậy ở
    // đây không cần dòng `setMessages([])` nào để dọn hội thoại của lần mở trước.
    useEffect(() => {
        let cancelled = false;

        const start = (nextStatus) => {
            if (cancelled) return;
            setStatus(nextStatus);
            if (nextStatus?.quota) {
                setQuota(nextStatus.quota);
                setQuotaBlocked(Boolean(nextStatus.quota.exhausted));
                // Hết hạn mức thì KHÔNG tự chạy lệnh nhanh: gửi đi cũng chỉ nhận 429,
                // mà người dùng thì thấy khung chat tự nhấp nháy rồi báo lỗi.
                if (nextStatus.quota.exhausted) return;
            }
            if (nextStatus?.enabled === false) return;
            if (initialAction && initialAction !== 'chat') {
                sendRef.current({ action: initialAction });
            } else {
                inputRef.current?.focus();
            }
        };

        aiApi
            .getStatus()
            .then(start)
            // Không hỏi được trạng thái (mất mạng, backend cũ chưa có endpoint) thì
            // vẫn cho gõ: lỗi thật sẽ hiện ra ở lượt hỏi đầu tiên, đầy đủ nguyên nhân.
            .catch(() => start({ enabled: true }));

        return () => {
            cancelled = true;
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Esc để đóng. Đang chờ trả lời thì Esc DỪNG câu hỏi trước, chưa đóng khung —
    // bấm nhầm Esc mà mất luôn cả hội thoại là khó chịu.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            if (abortRef.current) {
                abortRef.current.abort();
                return;
            }
            onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    // Luôn cuộn xuống câu mới nhất
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isThinking, error]);

    if (!isOpen || !item) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const text = prompt.trim();
        if (!text || isThinking) return;
        setPrompt('');
        send({ action: 'chat', text });
    };

    const handleCopy = async (text, index) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 1500);
        } catch {
            // Trình duyệt chặn clipboard (không phải HTTPS) — im lặng bỏ qua,
            // người dùng vẫn bôi đen chép tay được.
        }
    };

    /** Dòng chú thích "AI đã đọc được gì" dưới mỗi câu trả lời. */
    const renderContextNote = (context, msg) => {
        if (!context) return null;
        const map = {
            'file-text': {
                icon: FileSearch,
                text: t('ai.context.fileText', { chars: (context.chars || 0).toLocaleString() }),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            'file-binary': {
                icon: FileSearch,
                text: t('ai.context.binary'),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            'folder-listing': {
                icon: FolderSearch,
                text: t('ai.context.folder', { count: context.childCount ?? 0 }),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            metadata: {
                icon: Info,
                text: context.reason || t('ai.context.metadata'),
                tone: 'text-amber-600 dark:text-amber-400',
            },
        };
        const entry = map[context.mode];
        if (!entry) return null;
        const Icon = entry.icon;
        return (
            <div className="mt-2 pt-2 border-t border-gray-200/70 dark:border-gray-700/60 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className={`flex items-center gap-1.5 min-w-0 ${entry.tone}`}>
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                        {entry.text}
                        {context.truncated ? ` · ${t('ai.context.truncated')}` : ''}
                    </span>
                </span>
                {msg?.grounded && (
                    <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 shrink-0">
                        <Globe className="w-3 h-3" /> {t('ai.context.grounded')}
                    </span>
                )}
                {/* Token của ĐÚNG lượt này: người dùng thấy ngay câu hỏi nào đắt, thay vì
                    chỉ thấy tổng hạn mức tụt xuống mà không biết vì sao. */}
                {msg?.tokens > 0 && (
                    <span className="text-gray-400 dark:text-gray-500 shrink-0 font-mono">
                        {t('ai.tokensUsed', { tokens: msg.tokens.toLocaleString() })}
                    </span>
                )}
            </div>
        );
    };

    const aiDisabled = status?.enabled === false;
    // Phần trăm ĐÃ DÙNG. `limit` có thể là 0 (gói bị khoá AI) — chia cho 0 ra Infinity
    // nên chặn ở đây, coi như đã dùng hết.
    const usedPercent = quota
        ? quota.limit > 0
            ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
            : 100
        : 0;
    // Ngày cấp lại, hiển thị theo giờ VN vì chu kỳ hạn mức tính theo múi giờ đó.
    const resetLabel = quota?.resetAt
        ? new Date(quota.resetAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              timeZone: 'Asia/Ho_Chi_Minh',
          })
        : null;
    const inputLocked = aiDisabled || quotaBlocked;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#1e1e1e] dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[620px] max-h-[90vh] cursor-default"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={t('ai.title')}
            >
                {/* ── Đầu khung ── */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-md shrink-0">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                {t('ai.title')}
                                {status?.model && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 font-semibold font-mono">
                                        {status.model}
                                    </span>
                                )}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {isFolder ? t('ai.subject.folder') : t('ai.subject.file')}{' '}
                                <span className="font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {messages.length > 0 && (
                            <button
                                onClick={() => { setMessages([]); setError(null); }}
                                title={t('ai.clear')}
                                className="p-1.5 rounded-full text-gray-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* ── Hạn mức AI của tháng ──
                    Hiện SỐ LƯỢT PHÂN TÍCH CÒN LẠI chứ không phải số token: "còn 7 lượt"
                    là thứ người dùng hình dung được, còn "còn 213.480 token" thì không.
                    Số token thật vẫn có, nằm ở tooltip cho ai cần đối chiếu. */}
                {quota && !aiDisabled && (
                    <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e1e]">
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                            <span
                                className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 min-w-0"
                                title={t('ai.quota.tooltip', {
                                    used: quota.used.toLocaleString(),
                                    limit: quota.limit.toLocaleString(),
                                })}
                            >
                                <Gauge className="w-3.5 h-3.5 shrink-0 text-purple-500" />
                                <span className="truncate">
                                    {quotaBlocked
                                        ? t('ai.quota.empty')
                                        : t('ai.quota.left', { count: quota.analysesLeft })}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 truncate hidden sm:inline">
                                    · {quota.planName}
                                </span>
                            </span>
                            {resetLabel && (
                                <span className="text-gray-400 dark:text-gray-500 shrink-0">
                                    {t('ai.quota.reset', { date: resetLabel })}
                                </span>
                            )}
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    usedPercent >= 100
                                        ? 'bg-rose-500'
                                        : usedPercent >= 80
                                          ? 'bg-amber-500'
                                          : 'bg-gradient-to-r from-blue-500 to-purple-500'
                                }`}
                                style={{ width: `${usedPercent}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* ── Khu hội thoại ── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/60 dark:bg-[#18191a]">
                    {aiDisabled ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                            <p className="font-semibold text-gray-800 dark:text-gray-200">{t('ai.disabled.title')}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{t('ai.disabled.desc')}</p>
                        </div>
                    ) : quotaBlocked && messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
                            <div className="p-3 rounded-2xl bg-amber-100 dark:bg-amber-500/15">
                                <Gauge className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">{t('ai.quota.blockedTitle')}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                                {t('ai.quota.blockedDesc', {
                                    plan: quota?.planName ?? '',
                                    date: resetLabel ?? '',
                                })}
                            </p>
                        </div>
                    ) : messages.length === 0 && !isThinking ? (
                        // Màn hình trống có ích: nói rõ AI sẽ đọc được gì ở mục này và
                        // mời chọn một lệnh, thay vì một lời chào không mang thông tin.
                        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
                            <div className="p-3 rounded-2xl bg-purple-100 dark:bg-purple-500/15">
                                <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                                {isFolder ? t('ai.empty.folder') : t('ai.empty.file')}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{t('ai.empty.hint')}</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender === 'ai' && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                )}
                                <div
                                    className={`group max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                                        msg.sender === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-none shadow-xs'
                                            : 'bg-white dark:bg-[#282a2c] text-gray-800 dark:text-gray-200 border border-gray-200/80 dark:border-gray-700 rounded-bl-none shadow-xs'
                                    }`}
                                >
                                    {msg.sender === 'ai' ? (
                                        <>
                                            <div
                                                className="prose-ai"
                                                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                                            />
                                            {renderContextNote(msg.context, msg)}
                                            <button
                                                onClick={() => handleCopy(msg.text, idx)}
                                                className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                            >
                                                {copiedIndex === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedIndex === idx ? t('ai.copied') : t('ai.copy')}
                                            </button>
                                        </>
                                    ) : (
                                        <span className="whitespace-pre-wrap">{msg.text}</span>
                                    )}
                                </div>
                                {msg.sender === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center shrink-0">
                                        <UserIcon className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium py-2 pl-1">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('ai.thinking')}
                            <button
                                onClick={() => abortRef.current?.abort()}
                                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            >
                                <Square className="w-3 h-3" /> {t('ai.stop')}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 rounded-xl px-3 py-2.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                            <div className="min-w-0">
                                <p className="break-words">{error}</p>
                                <button
                                    onClick={() => { setError(null); inputRef.current?.focus(); }}
                                    className="mt-1 inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
                                >
                                    <RefreshCw className="w-3 h-3" /> {t('ai.retry')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Lệnh nhanh ── */}
                {!inputLocked && (
                    <div className="px-3 py-2 bg-white dark:bg-[#1e1e1e] border-t border-gray-100 dark:border-gray-800 flex gap-2 overflow-x-auto text-xs">
                        {quickActions.map((action) => {
                            const Icon = action.icon;
                            const labelKey = !isFolder && action.fileLabelKey ? action.fileLabelKey : action.labelKey;
                            return (
                                <button
                                    key={action.id}
                                    disabled={isThinking}
                                    onClick={() => send({ action: action.id })}
                                    className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-700 dark:text-gray-300 rounded-full shrink-0 transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon className="w-3.5 h-3.5 text-purple-500" />
                                    {t(labelKey)}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Hết hạn mức: mời nâng cấp thay vì để một ô nhập bấm vào chỉ ra lỗi ── */}
                {quotaBlocked && !aiDisabled && (
                    <div className="p-3 bg-white dark:bg-[#1e1e1e] border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                            {t('ai.quota.upgradeHint')}
                        </p>
                        <Link
                            to="/app/billing"
                            onClick={onClose}
                            className="shrink-0 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium text-xs shadow-xs transition-all flex items-center gap-1.5"
                        >
                            {t('ai.quota.upgradeCta')}
                            <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                )}

                {/* ── Ô nhập ── */}
                <form
                    onSubmit={handleSubmit}
                    hidden={quotaBlocked && !aiDisabled}
                    className="p-3 bg-white dark:bg-[#1e1e1e] border-t border-gray-100 dark:border-gray-800"
                >
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={prompt}
                            disabled={inputLocked}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={isFolder ? t('ai.placeholder.folder') : t('ai.placeholder.file')}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none text-[13px] disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!prompt.trim() || isThinking || inputLocked}
                            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1 text-xs cursor-pointer"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="mt-1.5 px-1 text-[11px] text-gray-400 dark:text-gray-500">{t('ai.disclaimer')}</p>
                </form>
            </div>
        </div>
    );
}
