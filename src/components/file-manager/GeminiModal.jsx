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
    FileVideo,
    FolderSearch,
    Info,
    Gauge,
    Globe,
    History,
    ChevronLeft,
    MessageSquare,
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

/**
 * Bỏ lượt hỏi đang dở khỏi hội thoại: bong bóng trả lời đang chảy (nếu đã kịp hiện)
 * rồi tới bong bóng câu hỏi.
 *
 * Phải bỏ CẢ HAI, và đây là chỗ dễ sai nhất của việc phát theo đoạn: backend chỉ ghi
 * lượt nói vào lịch sử khi câu trả lời hoàn tất, nên để lại một câu trả lời đứt giữa
 * chữ trên màn hình là hứa với người dùng một thứ mà mở lại cuộc trò chuyện sẽ không
 * còn. Bản cũ `slice(0, -1)` bỏ đúng một bong bóng vì hồi đó câu trả lời chỉ xuất
 * hiện khi đã xong.
 */
function dropPendingTurn(prev) {
    const next = [...prev];
    if (next[next.length - 1]?.streaming) next.pop();
    if (next[next.length - 1]?.sender === 'user') next.pop();
    return next;
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

    // ── Lịch sử trò chuyện (bảng ai_conversation, migration 022) ──
    // `conversationId` null = khung chat này chưa được lưu thành cuộc nào. Câu hỏi đầu
    // tiên khiến backend tạo cuộc mới rồi trả id về, các câu sau nối vào đúng id đó.
    const [conversationId, setConversationId] = useState(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    // Đặt tên `historyList` chứ không `history`: trong `send()` đã có biến cục bộ tên
    // `history` (mấy lượt gửi kèm cho Gemini), trùng tên là bẫy đọc nhầm.
    const [historyList, setHistoryList] = useState({ items: [], nextBefore: null });
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    // Cuộc đang mở ra đọc; null = đang ở màn hình danh sách.
    const [viewing, setViewing] = useState(null);

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

                const res = await aiApi.askStream(
                    {
                        itemId: item.id,
                        action,
                        ...(action === 'chat' ? { prompt: text } : {}),
                        ...(history.length ? { history } : {}),
                        ...(conversationId ? { conversationId } : {}),
                        lang: language === 'en' ? 'en' : 'vi',
                    },
                    {
                        signal: controller.signal,
                        // Ngữ cảnh tới TRƯỚC chữ đầu tiên, nên bong bóng của AI ra đời
                        // ở đây — đã có sẵn dòng "AI đọc được gì" ngay từ lúc rỗng,
                        // thay vì dán thêm vào sau khi người dùng đọc xong câu trả lời.
                        onMeta: ({ context, model, grounded }) => {
                            setMessages((prev) => [
                                ...prev,
                                { sender: 'ai', text: '', context, model, grounded, streaming: true },
                            ]);
                        },
                        // NỐI vào phần đã có. `streaming` là cờ nhận dạng bong bóng đang
                        // chảy: không có nó thì một lượt hỏi mới (hoặc một lần dọn lỗi)
                        // có thể ghi chữ vào đúng bong bóng đã hoàn tất của lượt trước.
                        onDelta: (chunk) => {
                            setMessages((prev) => {
                                const last = prev[prev.length - 1];
                                if (!last?.streaming) return prev;
                                return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
                            });
                        },
                    },
                );

                // Chốt bằng `res.answer` — câu trả lời TRỌN VẸN do backend gửi ở sự kiện
                // cuối — chứ không giữ nguyên phần đã nối từ các đoạn. Nhờ vậy một đoạn
                // bị mất hay bị lặp trên đường truyền không để lại bong bóng lệch với
                // chính thứ backend đã ghi vào lịch sử trò chuyện.
                setMessages((prev) => {
                    const bubble = {
                        sender: 'ai',
                        text: res.answer,
                        context: res.context,
                        model: res.model,
                        grounded: res.grounded,
                        tokens: res.quota?.lastRequestTokens,
                    };
                    const last = prev[prev.length - 1];
                    return last?.streaming ? [...prev.slice(0, -1), bubble] : [...prev, bubble];
                });
                if (res.quota) {
                    setQuota(res.quota);
                    setQuotaBlocked(Boolean(res.quota.exhausted));
                }
                // Câu đầu tiên trả về id cuộc vừa được tạo; nhớ lấy để câu sau nối vào
                // cùng một cuộc thay vì sinh ra một cuộc mới cho mỗi câu hỏi. Backend
                // trả null khi ghi lịch sử lỗi — khi đó cứ để null, không ghi đè id cũ.
                if (res.conversationId) setConversationId(res.conversationId);
            } catch (err) {
                // `err.status` là hình dạng lỗi của interceptor axios, `err.response.status`
                // là hình dạng của `askStream` — đọc cả hai để nơi này không phải biết
                // lượt hỏi vừa đi qua đường nào.
                const status = err?.status ?? err?.response?.status;

                if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
                    // Người dùng bấm Dừng: bỏ luôn bong bóng câu hỏi vừa thêm để hội
                    // thoại không còn một câu hỏi treo lơ lửng không có câu trả lời.
                    setMessages(dropPendingTurn);
                } else if (status === 429) {
                    // Hết hạn mức tháng — không phải lỗi kỹ thuật, nên hiện khối nâng cấp
                    // gói thay vì dòng lỗi đỏ kèm nút "thử lại" (thử lại cũng vô ích).
                    setQuota(err?.response?.data?.quota ?? null);
                    setQuotaBlocked(true);
                    setMessages(dropPendingTurn);
                } else {
                    setError(
                        err?.response?.data?.message ||
                            err?.message ||
                            t('ai.error.generic'),
                    );
                    setMessages(dropPendingTurn);
                }
            } finally {
                setIsThinking(false);
                abortRef.current = null;
            }
        },
        [item, isFolder, language, messages, conversationId, t],
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

    /** Một trang danh sách. `before` = null là tải lại từ đầu, khác null là tải thêm. */
    const loadHistory = async (before = null) => {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const res = await aiApi.listConversations({ limit: 30, before: before ?? undefined });
            setHistoryList((prev) => ({
                items: before ? [...prev.items, ...res.items] : res.items,
                nextBefore: res.nextBefore,
            }));
        } catch (err) {
            setHistoryError(err?.response?.data?.message || t('ai.history.loadError'));
        } finally {
            setHistoryLoading(false);
        }
    };

    const openHistory = () => {
        setHistoryOpen(true);
        setViewing(null);
        // Tải lại mỗi lần mở: cuộc trò chuyện có thể vừa được thêm ở tab khác, và danh
        // sách này nhỏ nên không đáng cache để rồi hiện dữ liệu cũ.
        loadHistory();
    };

    const openConversation = async (id) => {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            setViewing(await aiApi.getConversation(id));
        } catch (err) {
            setHistoryError(err?.response?.data?.message || t('ai.history.loadError'));
        } finally {
            setHistoryLoading(false);
        }
    };

    const removeConversation = async (id) => {
        try {
            await aiApi.deleteConversation(id);
            setHistoryList((prev) => ({ ...prev, items: prev.items.filter((c) => c.id !== id) }));
            if (viewing?.id === id) setViewing(null);
            // Vừa xoá đúng cuộc mà khung chat đang nối vào: bỏ liên kết, câu hỏi tiếp
            // theo sẽ mở cuộc mới thay vì ghi vào một id không còn tồn tại.
            if (conversationId === id) setConversationId(null);
        } catch (err) {
            setHistoryError(err?.response?.data?.message || t('ai.history.loadError'));
        }
    };

    /**
     * Nạp cuộc đang đọc vào khung chat để hỏi tiếp.
     *
     * Chỉ cho phép khi cuộc đó nói về ĐÚNG mục đang mở: hỏi tiếp nghĩa là gửi kèm ngữ
     * cảnh của `item` hiện tại, nên nối vào một cuộc về tệp khác sẽ tạo ra hội thoại
     * mà nửa đầu nói về tệp này, nửa sau nói về tệp kia.
     */
    const continueConversation = () => {
        if (!viewing) return;
        setMessages(
            viewing.messages.map((m) => ({
                sender: m.role === 'user' ? 'user' : 'ai',
                text: m.content,
                action: m.action || undefined,
                // Chỉ có `mode`: số ký tự/số mục con không được lưu lại, nên dòng chú
                // thích sẽ dùng bản không kèm số (xem renderContextNote).
                context: m.contextMode ? { mode: m.contextMode } : undefined,
                grounded: m.grounded,
            })),
        );
        setConversationId(viewing.id);
        setHistoryOpen(false);
        setViewing(null);
        setError(null);
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
                // Tin nhắn nạp từ lịch sử không có `chars` (bảng ai_message chỉ lưu
                // `context_mode`). Hiện "Đã đọc 0 ký tự" là nói sai, nên khi thiếu số
                // thì dùng câu không kèm số.
                text:
                    context.chars != null
                        ? t('ai.context.fileText', { chars: context.chars.toLocaleString() })
                        : t('ai.context.fileTextPlain'),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            'file-binary': {
                icon: FileSearch,
                text: t('ai.context.binary'),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            'file-video': {
                icon: FileVideo,
                // Nói rõ AI chỉ xem PHẦN ĐẦU video là bắt buộc, không phải cho đẹp: câu
                // trả lời về một video 40 phút mà chỉ dựa trên 10 phút đầu trông y như
                // câu trả lời sai nếu giao diện không nói ra giới hạn đó. Tin nhắn nạp từ
                // lịch sử không có `seconds` (bảng ai_message chỉ lưu `context_mode`) nên
                // vẫn cần câu không kèm số.
                text:
                    context.seconds != null
                        ? t('ai.context.video', { minutes: Math.round(context.seconds / 60) })
                        : t('ai.context.videoPlain'),
                tone: 'text-emerald-600 dark:text-emerald-400',
            },
            'folder-listing': {
                icon: FolderSearch,
                text:
                    context.childCount != null
                        ? t('ai.context.folder', { count: context.childCount })
                        : t('ai.context.folderPlain'),
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
                className="relative bg-white dark:bg-[#1e1e1e] dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[620px] max-h-[90vh] cursor-default"
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
                        <button
                            onClick={openHistory}
                            title={t('ai.history.open')}
                            aria-label={t('ai.history.open')}
                            className="p-1.5 rounded-full text-gray-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            <History className="w-4 h-4" />
                        </button>
                        {messages.length > 0 && (
                            <button
                                onClick={() => {
                                    setMessages([]);
                                    setError(null);
                                    // Bỏ luôn liên kết cuộc cũ: người dùng vừa dọn sạch
                                    // khung chat thì câu sau là một cuộc mới, chứ không
                                    // âm thầm ghi tiếp vào cuộc đã bị dọn khỏi màn hình.
                                    setConversationId(null);
                                }}
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
                    Hiện PHẦN TRĂM ĐÃ DÙNG, khớp với thanh tiến trình ngay bên dưới:
                    một con số và một thanh nói cùng một điều thì đọc phát hiểu, không
                    phải trừ nhẩm "còn 7 lượt" ra khỏi "thanh đã đầy 80%". Số token thật
                    vẫn có, nằm ở tooltip cho ai cần đối chiếu. */}
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
                                        : t('ai.quota.usedPercent', { percent: usedPercent })}
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

                {/* ── Lịch sử trò chuyện ──
                    Một tấm phủ kín khung, có phần đầu riêng: khỏi phải đoán chiều cao
                    phần đầu của khung chat bằng con số px (con số đó sai ngay khi tên
                    tệp dài xuống hai dòng). Hai màn hình trong cùng tấm này: danh sách
                    mọi cuộc, và nội dung một cuộc khi bấm vào. */}
                {historyOpen && (
                    <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-[#1e1e1e] animate-fade-in">
                        <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10">
                            <div className="flex items-center gap-2 min-w-0">
                                {viewing ? (
                                    <button
                                        onClick={() => setViewing(null)}
                                        title={t('ai.history.back')}
                                        className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <History className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                                        {viewing ? viewing.title : t('ai.history.title')}
                                    </h4>
                                    {viewing?.itemName && (
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                            {viewing.itemType === 'folder'
                                                ? t('ai.subject.folder')
                                                : t('ai.subject.file')}{' '}
                                            {viewing.itemName}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => { setHistoryOpen(false); setViewing(null); }}
                                title={t('ai.history.close')}
                                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-3">
                            {historyError && (
                                <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p className="break-words min-w-0">{historyError}</p>
                                </div>
                            )}

                            {/* Đang tải mà CHƯA có gì để hiện: chỉ lúc này mới chiếm cả
                                khung bằng spinner. Tải thêm trang sau thì danh sách cũ
                                phải ở nguyên đó, không bị thay bằng spinner. */}
                            {historyLoading && !viewing && historyList.items.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                </div>
                            ) : viewing ? (
                                <div className="space-y-3">
                                    {viewing.messages.map((m) => (
                                        <div
                                            key={m.id}
                                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] ${
                                                    m.role === 'user'
                                                        ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white'
                                                        : 'bg-gray-100 dark:bg-[#282a2c] text-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                {m.role === 'user' ? (
                                                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                                                ) : (
                                                    <div
                                                        className="prose prose-sm dark:prose-invert max-w-none break-words"
                                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : historyList.items.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-gray-400 dark:text-gray-500 px-6">
                                    <History className="w-8 h-8" />
                                    <p className="text-xs">{t('ai.history.empty')}</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {historyList.items.map((c) => (
                                        <div
                                            key={c.id}
                                            className="group flex items-center gap-2 rounded-xl hover:bg-gray-100 dark:hover:bg-[#282a2c] transition-colors"
                                        >
                                            <button
                                                onClick={() => openConversation(c.id)}
                                                className="flex-1 min-w-0 text-left px-3 py-2.5 cursor-pointer"
                                            >
                                                <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate">
                                                    {c.title}
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                                                    <span className="truncate">
                                                        {c.itemName || t('ai.history.deletedItem')}
                                                    </span>
                                                    <span className="shrink-0 flex items-center gap-1">
                                                        <MessageSquare className="w-3 h-3" />
                                                        {t('ai.history.messages', { count: c.messageCount })}
                                                    </span>
                                                    <span className="shrink-0 hidden sm:inline">
                                                        {new Date(c.updatedAt).toLocaleDateString(
                                                            language === 'en' ? 'en-GB' : 'vi-VN',
                                                            { day: '2-digit', month: '2-digit', year: 'numeric' },
                                                        )}
                                                    </span>
                                                </p>
                                            </button>
                                            <button
                                                onClick={() => removeConversation(c.id)}
                                                title={t('ai.history.delete')}
                                                aria-label={t('ai.history.delete')}
                                                className="mr-2 p-1.5 rounded-full text-gray-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-white dark:hover:bg-gray-800 transition-colors cursor-pointer shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}

                                    {historyList.nextBefore && (
                                        <button
                                            onClick={() => loadHistory(historyList.nextBefore)}
                                            disabled={historyLoading}
                                            className="w-full mt-1 py-2 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:bg-gray-100 dark:hover:bg-[#282a2c] rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        >
                                            {historyLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {t('ai.history.loadMore')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Hỏi tiếp chỉ mở khi cuộc đó nói về ĐÚNG mục đang mở: hỏi tiếp
                            là gửi kèm ngữ cảnh của `item` hiện tại, nên nối vào cuộc về
                            tệp khác sẽ ra hội thoại nửa đầu nói tệp này, nửa sau tệp kia. */}
                        {viewing && (
                            <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800">
                                {viewing.fileId === item.id ? (
                                    <button
                                        onClick={continueConversation}
                                        className="w-full py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-xs font-medium transition-all cursor-pointer"
                                    >
                                        {t('ai.history.continue')}
                                    </button>
                                ) : (
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center px-2">
                                        {t('ai.history.otherItem', {
                                            name: viewing.itemName || t('ai.history.deletedItem'),
                                        })}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
