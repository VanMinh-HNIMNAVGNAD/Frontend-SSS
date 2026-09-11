import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { marked } from 'marked';
import {
    Sparkles,
    X,
    Send,
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
 * Giây → "45 giây" / "10 phút" / "1 giờ 2 phút" (hoặc bản tiếng Anh).
 *
 * Không làm tròn về phút vô điều kiện như bản cũ: `Math.round(30 / 60)` cho ra 1, tức một
 * clip 30 giây bị hiện thành "1 phút" — sai, và sai ở đúng chỗ giao diện đang cố nói cho
 * người dùng biết AI thật sự xem được bao nhiêu.
 *
 * Đơn vị nằm ở đây chứ không trong `locales/*.js` vì nó là một chuỗi ĐƯỢC GHÉP (số + đơn
 * vị + có thể hai cụm), không phải một câu dịch được; để trong locale thì phải bày ra sáu
 * khoá chỉ để nói "phút".
 */
function formatClock(seconds, language) {
    const en = language === 'en';
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total < 60) return en ? `${total} sec` : `${total} giây`;
    const minutes = Math.round(total / 60);
    if (minutes < 60) return en ? `${minutes} min` : `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!rest) return en ? `${hours} h` : `${hours} giờ`;
    return en ? `${hours} h ${rest} min` : `${hours} giờ ${rest} phút`;
}

/**
 * Widget "Search Suggestions" của Google, dựng trong SHADOW DOM.
 *
 * Vì sao phải hiện: đó là điều khoản sử dụng của Grounding with Google Search — dùng
 * grounding thì phải hiện các chip gợi ý tìm kiếm của Google kèm liên kết.
 *
 * Vì sao shadow DOM chứ không phải `dangerouslySetInnerHTML` như phần markdown: HTML này
 * mang theo một khối `<style>` KHÔNG có phạm vi, khai các tên class rất chung —
 * `.container`, `.chip`, `.carousel`, `.headline`, `.gradient`. Nhét thẳng vào trang là
 * những luật đó áp lên MỌI phần tử khác cùng tên class ở bất kỳ đâu trong ứng dụng. Đã dò
 * ngày 10/09/2026: hiện không có chỗ nào trùng — nhưng `container` là một utility của
 * Tailwind, nên "không trùng" là may mắn của hôm nay chứ không phải một bảo đảm. Shadow
 * DOM biến việc cách ly thành chuyện cấu trúc: style bên trong không thoát ra, style bên
 * ngoài không lọt vào, và widget trông đúng như Google thiết kế.
 *
 * Nội dung đã kiểm trên phản hồi thật: chỉ `<style> <div> <a> <svg> <path> <circle>`,
 * KHÔNG có `<script>`, không có handler `on*`. Nguồn của nó là phản hồi Vertex qua backend
 * của mình, không phải nội dung tệp người dùng tải lên — nên nó không nằm trong đường tiêm
 * lệnh mà luật AN TOÀN đang chặn.
 *
 * Việc duy nhất mình sửa sau khi dựng: thêm `target="_blank"` cho mấy thẻ `<a>`. Google
 * không đặt sẵn, mà panel này thường mở đè lên cửa sổ xem trước — bấm một chip mà điều
 * hướng cả trang thì người dùng mất luôn tài liệu đang đọc và cả hội thoại.
 */
function SearchSuggestions({ html }) {
    const hostRef = useRef(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !html) return;

        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        root.innerHTML = html;
        root.querySelectorAll('a').forEach((a) => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });

        return () => {
            // Dọn khi bong bóng bị thay (dọn hội thoại, mở cuộc khác): shadow root gắn với
            // phần tử host nên React không tự dọn giúp phần bên trong nó.
            root.innerHTML = '';
        };
    }, [html]);

    if (!html) return null;
    return <div ref={hostRef} className="mt-2" />;
}

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
    // `runId` của lượt đang chạy. Từ bản sửa "chuyển tab là dính error", đóng socket
    // KHÔNG còn huỷ lượt gọi Vertex — đó là điều kiện để nối lại được sau khi app vào
    // đa nhiệm. Nên nút Dừng phải nói ra ý định đó bằng một request riêng.
    const runIdRef = useRef(null);
    const [reconnecting, setReconnecting] = useState(false);
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
                        // Về TRƯỚC `meta` (backend phát ngay khi mở dòng), nên kể cả lượt
                        // hỏi video — nơi phần dựng ngữ cảnh mất 2-3 phút — vẫn nối lại
                        // được nếu mạng đứt trong lúc chờ.
                        onRun: (runId) => {
                            runIdRef.current = runId;
                        },
                        // Đang nối lại: nói ra thay vì để con trỏ nhấp nháy im lặng. Đây
                        // chính là khoảnh khắc người dùng vừa mở lại app từ đa nhiệm.
                        onResume: () => setReconnecting(true),
                        // Nối lại XONG. Phải tắt ở đây chứ không đợi `onDelta`: với lượt
                        // hỏi video, phần dựng ngữ cảnh mất 2–3 phút nên giữa lúc nối lại
                        // xong và đoạn chữ đầu tiên có thể là vài phút — bản trước giữ
                        // dòng "Mất kết nối" suốt khoảng đó, nên một cú đứt mạng chỉ một
                        // giây đọc ra thành mất kết nối cả phút, và người dùng kết luận
                        // đúng rằng nó đang hỏng.
                        onAlive: () => setReconnecting(false),
                        // Ngữ cảnh tới TRƯỚC chữ đầu tiên, nên bong bóng của AI ra đời
                        // ở đây — đã có sẵn dòng "AI đọc được gì" ngay từ lúc rỗng,
                        // thay vì dán thêm vào sau khi người dùng đọc xong câu trả lời.
                        // `meta` KHÔNG mang tin về việc tra cứu web: Vertex chỉ trả
                        // `groundingMetadata` ở một chunk gần cuối, nên sự thật đó chỉ có
                        // ở sự kiện `done`. Bản cũ gán thẳng cờ "đã bật công cụ" vào bong
                        // bóng ngay tại đây, và đó là gốc của cái chip "Tra cứu web" hiện
                        // trên mọi câu trả lời kể cả lượt không hề search.
                        onMeta: ({ context, model }) => {
                            setMessages((prev) => [
                                ...prev,
                                { sender: 'ai', text: '', context, model, streaming: true },
                            ]);
                        },
                        // Tóm tắt suy luận: về ở 3,1–4,5s, tức hàng chục giây TRƯỚC chữ
                        // đầu tiên của câu trả lời (9,6–15,0s, đo 10/09/2026). Đây là thứ
                        // lấp khoảng im lặng mà người dùng phàn nàn — nhưng nó KHÔNG phải
                        // câu trả lời, nên nằm ở trường riêng `thought`, không nối vào
                        // `text` và không đi vào bong bóng chốt ở cuối.
                        onThought: (chunk) => {
                            setMessages((prev) => {
                                const last = prev[prev.length - 1];
                                if (!last?.streaming) return prev;
                                return [
                                    ...prev.slice(0, -1),
                                    { ...last, thought: (last.thought ?? '') + chunk },
                                ];
                            });
                        },
                        // NỐI vào phần đã có. `streaming` là cờ nhận dạng bong bóng đang
                        // chảy: không có nó thì một lượt hỏi mới (hoặc một lần dọn lỗi)
                        // có thể ghi chữ vào đúng bong bóng đã hoàn tất của lượt trước.
                        onDelta: (chunk) => {
                            setReconnecting(false);
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
                        webSearch: res.webSearch,
                        tokens: res.quota?.lastRequestTokens,
                        // Câu trả lời chạm trần `maxOutputTokens` thì nó đứt giữa câu, và
                        // trong chuỗi chữ không có gì nói ra điều đó. Backend biết
                        // (`finishReason`), nên nó nói — xem `truncated` ở `settle()`.
                        truncated: res.truncated,
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
                setReconnecting(false);
                abortRef.current = null;
                runIdRef.current = null;
            }
        },
        [item, isFolder, language, messages, conversationId, t],
    );

    /**
     * Người dùng bấm Dừng (hoặc Esc).
     *
     * Phải BÁO BACKEND, không chỉ `abort()` cái fetch: từ bản sửa "chuyển tab là dính
     * error", socket đóng không còn là lệnh huỷ — đó chính là thứ cho phép nối lại sau
     * khi app vào đa nhiệm. Thiếu request này thì Dừng chỉ tắt giao diện còn dyno vẫn
     * sinh tiếp tới hết.
     *
     * Không `await`: người dùng đã bấm Dừng thì giao diện phải dừng ngay, không chờ một
     * vòng mạng. Lỗi của chính lượt huỷ cũng không có gì để nói với họ.
     */
    const stopRun = useCallback(() => {
        const runId = runIdRef.current;
        if (runId) aiApi.cancelRun(runId).catch(() => {});
        abortRef.current?.abort();
    }, []);

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
                stopRun();
                return;
            }
            onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose, stopRun]);

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
                tone: 'text-gray-500 dark:text-gray-400',
            },
            'file-binary': {
                icon: FileSearch,
                text: t('ai.context.binary'),
                tone: 'text-gray-500 dark:text-gray-400',
            },
            'file-video': {
                icon: FileVideo,
                // Nói rõ AI chỉ xem PHẦN ĐẦU video là bắt buộc, không phải cho đẹp: câu
                // trả lời về một video 40 phút mà chỉ dựa trên 10 phút đầu trông y như
                // câu trả lời sai nếu giao diện không nói ra giới hạn đó. Tin nhắn nạp từ
                // lịch sử không có `seconds` (bảng ai_message chỉ lưu `context_mode`) nên
                // vẫn cần câu không kèm số.
                //
                // Ba câu chứ không phải một, vì `seconds` giờ nói đúng phần HÌNH và có
                // thể nhỏ hơn 60 (clip ngắn):
                //  • cả video nằm trong cửa sổ → "đã xem toàn bộ", đừng nói "phần đầu"
                //    cho một clip 30 giây mà AI đã xem hết.
                //  • video dài hơn cửa sổ → phải nói CẢ hai số (xem 10 phút của 62
                //    phút), vì thiếu số thứ hai thì người dùng không biết mình đang đọc
                //    một câu trả lời dựa trên một phần sáu tài liệu. Và phải nói phần
                //    tiếng có thể vượt ra ngoài cửa sổ hình: AI trả lời được về phút thứ
                //    40 nhờ nghe, không nói ra thì câu đó trông như bịa.
                //  • không đo được thời lượng → chỉ có một số, câu cũ.
                text: (() => {
                    const seen = context.seconds;
                    const total = context.durationSeconds;
                    if (seen == null) return t('ai.context.videoPlain');
                    if (total != null && total <= seen) {
                        return t('ai.context.videoWhole', { duration: formatClock(total, language) });
                    }
                    if (total != null) {
                        return t('ai.context.videoWindow', {
                            seen: formatClock(seen, language),
                            total: formatClock(total, language),
                        });
                    }
                    return t('ai.context.video', { minutes: Math.round(seen / 60) });
                })(),
                tone: 'text-gray-500 dark:text-gray-400',
            },
            'folder-listing': {
                icon: FolderSearch,
                text:
                    context.childCount != null
                        ? t('ai.context.folder', { count: context.childCount })
                        : t('ai.context.folderPlain'),
                tone: 'text-gray-500 dark:text-gray-400',
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
        const sourceCount = msg?.webSearch?.sources?.length ?? 0;
        return (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className={`flex items-center gap-1.5 min-w-0 ${entry.tone}`}>
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                        {entry.text}
                        {context.truncated ? ` · ${t('ai.context.truncated')}` : ''}
                    </span>
                </span>
                {/* Chỉ hiện khi lượt này THẬT SỰ tra cứu (backend đọc `groundingMetadata`
                    rồi mới bật cờ), và kèm số nguồn để nó là một con số kiểm lại được chứ
                    không phải một cái nhãn.
                    Lưu ý: câu trả lời cũ trong lịch sử được ghi từ trước bản sửa này mang
                    cờ theo nghĩa cũ ("đã bật"), nên chip ở đó vẫn có thể hiện sai — dữ
                    liệu đã ghi thì không sửa lại được. */}
                {msg?.grounded && (
                    <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 shrink-0">
                        <Globe className="w-3 h-3" />
                        {sourceCount > 0
                            ? t('ai.context.groundedCount', { count: sourceCount })
                            : t('ai.context.grounded')}
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

    /**
     * Nguồn web mà Gemini THẬT SỰ đọc cho câu trả lời này.
     *
     * Đây là phần khiến việc tra cứu kiểm chứng được. Trước đây giao diện chỉ có một chip
     * "Tra cứu web" lấy từ cờ "đã bật công cụ" — không truy vấn, không nguồn, hiện trên cả
     * những lượt mô hình không hề search. Người dùng không thể phân biệt thật với bịa, nên
     * kết luận rằng nó bịa; và họ đúng ở chỗ cái chip đó không chứng minh được gì.
     *
     * Hiện cả CÂU TRUY VẤN chứ không chỉ danh sách nguồn: truy vấn là thứ cho biết mô hình
     * đã hiểu vấn đề theo hướng nào, và là thứ người dùng tự gõ lại vào Google được để đối
     * chiếu. Liên kết mở tab mới kèm `noreferrer` — đây là URL từ bên thứ ba.
     */
    const renderWebSources = (msg) => {
        const sources = msg?.webSearch?.sources ?? [];
        const queries = msg?.webSearch?.queries ?? [];
        const suggestionsHtml = msg?.webSearch?.suggestionsHtml ?? null;
        // `suggestionsHtml` phải nằm trong điều kiện này. Thiếu nó thì một lượt có widget
        // mà (vì lý do nào đó) không có truy vấn lẫn nguồn sẽ bị chặn ở đây, và mình bỏ
        // qua đúng cái thứ Google BẮT BUỘC phải hiện.
        if (sources.length === 0 && queries.length === 0 && !suggestionsHtml) return null;

        return (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    <Globe className="w-3 h-3 shrink-0" />
                    {t('ai.sources.title')}
                </p>

                {queries.length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 break-words">
                        {t('ai.sources.queries')}{' '}
                        {queries.map((q, i) => (
                            <span key={q}>
                                {i > 0 && ' · '}
                                <span className="italic">“{q}”</span>
                            </span>
                        ))}
                    </p>
                )}

                {/* Bắt buộc theo điều khoản của Google, đặt ngay dưới danh sách nguồn. */}
                <SearchSuggestions html={suggestionsHtml} />

                {sources.length > 0 && (
                    <ol className="mt-1 space-y-0.5">
                        {sources.map((src, i) => (
                            <li key={src.uri} className="flex gap-1.5 text-[11px] min-w-0">
                                <span className="text-gray-400 dark:text-gray-500 shrink-0">{i + 1}.</span>
                                <a
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={src.uri}
                                    className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                                >
                                    {src.title}
                                </a>
                            </li>
                        ))}
                    </ol>
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
        // Hai hình dạng trong MỘT cây DOM, đổi bằng breakpoint chứ không bằng JS:
        //
        //  • Từ `sm` trở lên — CỘT PHẢI. Vỏ ngoài chỉ chiếm dải bên phải (`sm:left-auto`)
        //    nên phần màn hình còn lại vẫn bấm được: đó là điều kiện để vừa đọc câu trả
        //    lời vừa cuộn tài liệu trong cửa sổ xem trước phía dưới. Cũng vì thế mà KHÔNG
        //    có lớp phủ tối ở đây — phủ lên thì chính thứ người dùng đang hỏi bị che.
        //  • Dưới `sm` — GIỮA MÀN HÌNH. Màn 360px mà cắt ra một cột 420px thì không còn
        //    chỗ cho tài liệu lẫn câu trả lời, nên trên điện thoại nó quay lại làm hộp
        //    thoại có lớp phủ như cũ.
        //
        // `z-[60]` chứ không phải `z-50`: cửa sổ xem trước đang ở `z-50`, và panel này
        // phải nằm TRÊN nó mới mở được từ trong đó.
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:left-auto sm:inset-y-0 sm:right-0 sm:p-0 sm:items-stretch sm:justify-end">
            {/* Lớp phủ CHỈ trên điện thoại. `sm:hidden` chứ không phải đổi màu: ở cột phải
                nó vẫn sẽ ăn mọi cú bấm ra ngoài panel. */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-fade-in cursor-pointer sm:hidden"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className="relative flex flex-col overflow-hidden cursor-default bg-white dark:bg-[#1e1e1e] dark:text-gray-100
                           w-full max-w-lg h-[85vh] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl animate-fade-in
                           sm:h-full sm:max-w-none sm:w-[26rem] lg:w-[30rem] sm:rounded-none sm:border-y-0 sm:border-r-0 sm:animate-slide-left"
                role="dialog"
                aria-modal="false"
                aria-label={t('ai.title')}
            >
                {/* ── Đầu khung ──
                    Một dòng, chữ xám, không nền gradient. Panel rộng 416px thì mỗi thứ
                    trang trí đều lấy chỗ của nội dung; và ba nút biểu tượng cạnh nhau mà
                    mỗi nút một màu hover khác nhau thì trông như ba mức nguy hiểm khác
                    nhau, trong khi chúng chỉ là ba việc bình thường. */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                                {t('ai.title')}
                            </h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate" title={item.name}>
                                {item.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={openHistory}
                            title={t('ai.history.open')}
                            aria-label={t('ai.history.open')}
                            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
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
                                aria-label={t('ai.clear')}
                                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            title={t('common.close')}
                            aria-label={t('common.close')}
                            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Hạn mức AI của tháng ──
                    Hiện PHẦN TRĂM ĐÃ DÙNG, khớp với thanh tiến trình ngay bên dưới:
                    một con số và một thanh nói cùng một điều thì đọc phát hiểu, không
                    phải trừ nhẩm "còn 7 lượt" ra khỏi "thanh đã đầy 80%". Số token thật
                    vẫn có, nằm ở tooltip cho ai cần đối chiếu. */}
                {quota && !aiDisabled && (
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                            <span
                                className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 min-w-0"
                                title={t('ai.quota.tooltip', {
                                    used: quota.used.toLocaleString(),
                                    limit: quota.limit.toLocaleString(),
                                })}
                            >
                                <Gauge className="w-3.5 h-3.5 shrink-0" />
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
                                          : 'bg-gray-400 dark:bg-gray-500'
                                }`}
                                style={{ width: `${usedPercent}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* ── Khu hội thoại ── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {aiDisabled ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                            <p className="font-semibold text-gray-800 dark:text-gray-200">{t('ai.disabled.title')}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{t('ai.disabled.desc')}</p>
                        </div>
                    ) : quotaBlocked && messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-3">
                            <Gauge className="w-6 h-6 text-amber-600 dark:text-amber-400" />
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
                        <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2.5">
                            <Sparkles className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                                {isFolder ? t('ai.empty.folder') : t('ai.empty.file')}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{t('ai.empty.hint')}</p>
                        </div>
                    ) : (
                        // Không còn avatar hai bên. Trong một cột rộng 416px, hai vòng
                        // tròn 32px cộng khoảng cách ăn mất một phần tám bề ngang mà chẳng
                        // nói thêm điều gì: vị trí trái/phải và nền bong bóng đã đủ để biết
                        // ai đang nói. Câu trả lời của AI cũng bỏ luôn khung bong bóng —
                        // nó là đoạn văn dài, đóng khung lại thì thành hộp trong hộp.
                        messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender === 'ai' ? (
                                    <div className="group w-full text-[13px] leading-relaxed text-gray-800 dark:text-gray-200">
                                        {/* Suy luận đang chảy — chỉ hiện KHI CHƯA có chữ nào
                                            của câu trả lời. Nó lấp đúng khoảng im lặng dài
                                            nhất (9,6–15,0s) bằng nội dung thật, rồi nhường
                                            chỗ cho câu trả lời ngay khi chữ đầu tiên tới.

                                            Không có nút mở lại, và đó là chủ ý: bong bóng
                                            chốt ở cuối lượt KHÔNG mang `thought`, nên phần
                                            nháp này không được lưu vào lịch sử trò chuyện —
                                            giữ một nút mở lại thứ đã không còn tồn tại chỉ
                                            là một nút hỏng.

                                            `flex-col-reverse` cho khối tự trôi theo dòng mới
                                            nhất mà không cần một `useRef` + `scrollTop` nào:
                                            con cao hơn khung thì phần TRÊN bị cắt, phần dưới
                                            luôn nằm trong tầm mắt. */}
                                        {msg.streaming && !msg.text && msg.thought && (
                                            <div className="mb-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 px-2.5 py-2">
                                                <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                                    {t('ai.reasoning')}
                                                </p>
                                                <div className="mt-1 max-h-24 overflow-hidden flex flex-col-reverse">
                                                    <p className="whitespace-pre-wrap text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                                                        {msg.thought}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            className="prose-ai"
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                                        />
                                        {/* Câu trả lời bị cắt vì chạm trần: nói ra ngay dưới
                                            chỗ nó đứt. Không nói thì người đọc tưởng AI kết
                                            luận như vậy, trong khi nó mới đang nói dở. */}
                                        {msg.truncated && (
                                            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                                <span>{t('ai.truncated')}</span>
                                            </p>
                                        )}
                                        {renderWebSources(msg)}
                                        {renderContextNote(msg.context, msg)}
                                        <button
                                            onClick={() => handleCopy(msg.text, idx)}
                                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                        >
                                            {copiedIndex === idx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copiedIndex === idx ? t('ai.copied') : t('ai.copy')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-blue-600 text-white text-[13px] leading-relaxed">
                                        <span className="whitespace-pre-wrap">{msg.text}</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Khoảng im lặng trước chữ đầu tiên dài hơn trước, vì ngân sách suy
                        luận giờ là ĐỘNG (đo được 1.200-1.800 token suy luận, tức 6-10 giây
                        chưa có chữ nào). Nên dòng này phải nói đúng việc đang diễn ra —
                        "đang suy luận" — chứ không phải một spinner trống làm người dùng
                        tưởng máy treo. */}
                    {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {reconnecting ? t('ai.reconnecting') : t('ai.thinking')}
                            <button
                                onClick={stopRun}
                                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            >
                                <Square className="w-3 h-3" /> {t('ai.stop')}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/60 rounded-lg px-3 py-2.5">
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
                    <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-800 flex gap-2 overflow-x-auto text-xs">
                        {quickActions.map((action) => {
                            const Icon = action.icon;
                            const labelKey = !isFolder && action.fileLabelKey ? action.fileLabelKey : action.labelKey;
                            return (
                                <button
                                    key={action.id}
                                    disabled={isThinking}
                                    onClick={() => send({ action: action.id })}
                                    className="px-2.5 py-1.5 text-gray-700 dark:text-gray-300 rounded-lg shrink-0 transition-colors border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                    {t(labelKey)}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Hết hạn mức: mời nâng cấp thay vì để một ô nhập bấm vào chỉ ra lỗi ── */}
                {quotaBlocked && !aiDisabled && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                            {t('ai.quota.upgradeHint')}
                        </p>
                        <Link
                            to="/app/billing"
                            onClick={onClose}
                            className="shrink-0 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
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
                    className="px-4 py-3 border-t border-gray-200 dark:border-gray-800"
                >
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={prompt}
                            disabled={inputLocked}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={isFolder ? t('ai.placeholder.folder') : t('ai.placeholder.file')}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-[13px] disabled:opacity-50"
                        />
                        {/* Nút gửi là chỗ DUY NHẤT trong panel dùng màu đặc. Mọi nút khác để
                            xám: một màn hình mà nút nào cũng nổi thì không nút nào nổi, và
                            người dùng phải đọc từng cái mới biết đâu là việc chính. */}
                        <button
                            type="submit"
                            disabled={!prompt.trim() || isThinking || inputLocked}
                            title={t('ai.send')}
                            aria-label={t('ai.send')}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center cursor-pointer"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Tên model về đây thay vì đứng thành một chip màu trên đầu khung: nó
                        là chú thích, không phải nhan đề. */}
                    <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 truncate">
                        {t('ai.disclaimer')}
                        {status?.model && <span className="font-mono"> · {status.model}</span>}
                    </p>
                </form>

                {/* ── Lịch sử trò chuyện ──
                    Một tấm phủ kín khung, có phần đầu riêng: khỏi phải đoán chiều cao
                    phần đầu của khung chat bằng con số px (con số đó sai ngay khi tên
                    tệp dài xuống hai dòng). Hai màn hình trong cùng tấm này: danh sách
                    mọi cuộc, và nội dung một cuộc khi bấm vào. */}
                {historyOpen && (
                    <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-[#1e1e1e] animate-fade-in">
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
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
                                    <History className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
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
                                                        ? 'bg-blue-600 text-white'
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
                                            className="w-full mt-1 py-2 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#282a2c] rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                                        className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer"
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
