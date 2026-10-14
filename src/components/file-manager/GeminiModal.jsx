import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { renderAiMarkdownSafe, safeHref, sanitizeSearchWidgetHtml } from '../../utils/safeMarkdown';
import toast from 'react-hot-toast';
import {
    Sparkles,
    X,
    Send,
    Copy,
    Check,
    Square,
    RefreshCw,
    AlertTriangle,
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
    Paperclip,
    HardDrive,
    Upload,
    MoreVertical,
    Minus,
    Eraser,
} from 'lucide-react';

import AiBubble from './AiBubble';
import { aiApi } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { displayPlanName } from '../../utils/planName';
import { monthsTermKey } from '../../constants/billing';
import { localeTagOf } from '../../utils/locale';

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
 *  - item          tệp hoặc thư mục được bấm chuột phải. CÓ THỂ null — nút AI trên thanh
 *                  điều hướng mở panel khi chưa chọn gì, người dùng tự đính tệp từ máy
 *                  ngay trong panel. Xem `contextSources` để biết ngữ cảnh thật của một
 *                  lượt hỏi được gộp từ đâu.
 *  - initialAction lệnh nhanh chọn từ menu con ('summarize' | 'explain' | ...).
 *                  Có giá trị khác 'chat' thì tự chạy ngay khi mở — đó là điểm
 *                  của menu con: một cú bấm là có câu trả lời, không phải gõ gì.
 *  - minimized     panel đang thu lại thành bong bóng: component vẽ ra `AiBubble` — một
 *                  nút tròn kéo được quanh bốn cạnh — thay cho cả khung. KHÔNG unmount (xem `AiPanelContext`) —
 *                  cùng một instance, nên hội thoại, tệp đang đính kèm và cả lượt trả
 *                  lời đang chảy đều sống nguyên qua một lần thu nhỏ.
 *  - onMinimize / onRestore  đổi trạng thái trên, do `AiPanelContext` giữ.
 *  - onClose
 */

// Nhãn của các lệnh nhanh — cho bong bóng câu hỏi khi một lệnh chạy từ menu chuột phải
// (`initialAction`). `id` phải nằm trong `AI_ACTIONS` của backend (`dto/ask-ai.dto.ts`) —
// câu lệnh thật nằm ở backend, đây chỉ là cái nhãn.
//
// Khung chat KHÔNG còn bày các lệnh này thành nút (bỏ 29/09/2026 theo yêu cầu chủ hệ
// thống): màn hình trống để trống, và chỗ dưới ô nhập nhường cho nút chọn model. Menu
// chuột phải vẫn gọi được chúng như cũ.
const QUICK_ACTIONS = [
    { id: 'document', labelKey: 'ai.action.document' },
    { id: 'image', labelKey: 'ai.action.image' },
    { id: 'video', labelKey: 'ai.action.video' },
    { id: 'improve', labelKey: 'ai.action.improve', fileLabelKey: 'ai.action.improveFile' },
    { id: 'summarize', labelKey: 'ai.action.summarize' },
];

/**
 * Model đã chọn lần trước, nhớ theo trình duyệt. Chỉ là GỢI Ý: danh sách thật nằm ở
 * `GET /ai/status`, và id không còn trong đó thì về model mặc định (xem `selectedModel`).
 * Bọc try vì `localStorage` ném lỗi ở chế độ riêng tư của vài trình duyệt.
 */
const MODEL_STORAGE_KEY = 'driver:aiModel';
const readStoredModel = () => {
    try {
        return localStorage.getItem(MODEL_STORAGE_KEY);
    } catch {
        return null;
    }
};

/**
 * Model sẽ gửi đi, từ danh sách của `GET /ai/status` và lựa chọn đã nhớ. `null` = backend
 * cũ chưa có trường `models` — khi đó KHÔNG gửi `model`: backend bật `forbidNonWhitelisted`,
 * và một trường lạ làm MỌI lượt hỏi ăn 400 trong khoảng giữa hai lần deploy.
 */
const resolveModelChoice = (models, picked) => {
    if (!Array.isArray(models) || !models.length) return null;
    return (models.find((m) => m.id === picked) ?? models[0]).id;
};

/**
 * Trần nguồn ngữ cảnh mỗi lượt hỏi — mục Drive và tệp tải từ máy CỘNG LẠI.
 *
 * Phải khớp `MAX_CONTEXT_SOURCES` ở `backend/src/ai/dto/ask-ai.dto.ts`. Lệch thì giao
 * diện cho chọn nhiều hơn backend nhận, và người dùng chọn xong mới ăn 400 — mất công
 * chọn, không hiểu vì sao. Hai con số này không tự đồng bộ được (hai repo git riêng),
 * nên đổi một cái là phải đổi cái kia trong CÙNG một lần deploy.
 */
const MAX_SOURCES_PER_TURN = 3;

/** Khớp `AiAttachmentService.MAX_ATTACHMENT_BYTES` (25MB). Cùng lưu ý đồng bộ như trên. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Byte → "1,4 MB". Dùng `Intl` chứ không `toFixed`: dấu thập phân của tiếng Việt là dấu
 * phẩy, và một dòng "1.4 MB" giữa giao diện tiếng Việt đọc ra thành "một nghìn tư".
 */
function formatBytes(bytes, locale) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let scaled = value / 1024;
    let unit = 0;
    while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024;
        unit += 1;
    }
    return `${scaled.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[unit]}`;
}

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
 * KHÔNG có `<script>`, không có handler `on*` — vẫn lọc qua `sanitizeSearchWidgetHtml`
 * vì shadow DOM KHÔNG chặn script (##74). Nguồn của nó là phản hồi Vertex qua backend
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
        // Shadow DOM không chặn được handler `on*` — lọc trước khi đổ vào.
        root.innerHTML = sanitizeSearchWidgetHtml(html);
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
 * Câu trả lời của model là markdown do máy sinh ra — lọc bằng `renderAiMarkdownSafe`
 * (escape HTML thô, chỉ cho link http(s)/mailto, bỏ ảnh ngoài). Xem chú thích ở đó.
 */
function renderMarkdown(text) {
    return renderAiMarkdownSafe(text);
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

export default function GeminiModal({
    isOpen,
    item,
    initialAction = null,
    minimized = false,
    onMinimize,
    onRestore,
    onClose,
}) {
    const { t, language } = useLanguage();
    // Một chỗ duy nhất quyết định thẻ BCP-47, thay cho `language === 'en' ? ... : ...`
    // rải rác: hai nhánh đó đã trôi khỏi `localeTagOf` (en-GB thay vì en-US) và sẽ còn
    // trôi tiếp mỗi lần thêm ngôn ngữ.
    const locale = localeTagOf(language);

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

    // ── Xác nhận hai bước cho hai nút phá huỷ ──
    // Cả "dọn hội thoại" lẫn "xoá một cuộc trong lịch sử" trước đây là MỘT cú bấm, không
    // hỏi lại, không hoàn tác được. Hai nút đó lại nằm cạnh những nút vô hại (Lịch sử,
    // Đóng) và cùng một cỡ, cùng một màu xám — bấm trượt một ô là mất cả cuộc trò chuyện.
    // Dùng bước xác nhận NGAY TRÊN NÚT thay vì một hộp thoại: panel này rộng 416px và
    // thường mở đè lên cửa sổ xem trước, chồng thêm một lớp modal nữa là che nốt phần
    // còn lại của màn hình.
    const [confirmClear, setConfirmClear] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    // Xoá SẠCH mọi cuộc trò chuyện đã lưu. Tách khỏi `confirmClear` vì hai việc khác hẳn
    // nhau về hậu quả: `confirmClear` chỉ dọn khung đang hiện (cuộc vẫn nằm trong lịch
    // sử, mở lại đọc được), còn cái này xoá vĩnh viễn mọi cuộc trên máy chủ. Dùng chung
    // một cờ thì một cú bấm "Xoá?" còn treo của việc nhẹ sẽ xác nhận cho việc nặng.
    const [confirmWipe, setConfirmWipe] = useState(false);
    const [wiping, setWiping] = useState(false);

    // Menu ba chấm ở đầu khung — gom Lịch sử + hai lệnh xoá. Trước đây chúng là hai nút
    // biểu tượng nằm cạnh nút Đóng: ba ô vuông xám giống hệt nhau, trong đó một ô xoá
    // hội thoại. Gom vào menu thì hàng đầu khung chỉ còn việc thường dùng, và mỗi lệnh
    // xoá được đọc bằng CHỮ trước khi bấm thay vì đoán qua hình cái thùng rác.
    const [menuOpen, setMenuOpen] = useState(false);

    // Có câu trả lời mới về trong lúc panel đang thu nhỏ — chấm báo trên bong bóng.
    // Không có nó thì thu nhỏ giữa một lượt hỏi dài là mất dấu: bong bóng nằm im y hệt
    // lúc chưa xong, và người dùng phải mở ra kiểm tra từng lúc.
    const [unseenReply, setUnseenReply] = useState(false);

    // Model người dùng bấm chọn dưới ô nhập (id Vertex, ví dụ 'gemini-2.5-flash').
    const [pickedModel, setPickedModel] = useState(readStoredModel);
    // Danh sách cuộc trò chuyện của khung "Lịch sử" (không phải lịch sử gửi cho Gemini —
    // phần đó backend tự nạp từ DB theo `conversationId`).
    const [historyList, setHistoryList] = useState({ items: [], nextBefore: null });
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    // Cuộc đang mở ra đọc; null = đang ở màn hình danh sách.
    const [viewing, setViewing] = useState(null);

    const abortRef = useRef(null);
    // Lượt hỏi gần nhất, để nút "Thử lại" gửi lại được ĐÚNG câu đó. Nút đó trước đây chỉ
    // gọi `setError(null)` rồi focus vào ô nhập — mà `dropPendingTurn` đã bỏ bong bóng câu
    // hỏi khỏi màn hình rồi, nên "thử lại" thực chất là "xoá dòng đỏ đi và tự gõ lại từ
    // đầu". Với một lệnh nhanh thì còn tệ hơn: câu lệnh thật nằm ở backend, người dùng
    // không có cách nào gõ lại nó.
    const lastRequestRef = useRef(null);
    // `runId` của lượt đang chạy. Từ bản sửa "chuyển tab là dính error", đóng socket
    // KHÔNG còn huỷ lượt gọi Vertex — đó là điều kiện để nối lại được sau khi app vào
    // đa nhiệm. Nên nút Dừng phải nói ra ý định đó bằng một request riêng.
    const runIdRef = useRef(null);
    const [reconnecting, setReconnecting] = useState(false);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    // Khung chat THẬT (không phải lớp vỏ `fixed inset-0`): mốc để biết một cú bấm là
    // trong hay ngoài panel. Phải là khung trong, vì lớp vỏ phủ kín màn hình ở khổ điện
    // thoại nên `contains()` trên nó luôn đúng và không cú bấm nào tính là "ra ngoài".
    const panelRef = useRef(null);
    const menuRef = useRef(null);

    // ── Tệp đính kèm tải từ máy ──────────────────────────────────────────
    //
    // Mỗi phần tử: { key, name, sizeBytes, mimeType, status, progress, id?, error? }
    //   • `key`    id tạm sinh ở client — cần vì tệp CHƯA lên tới nơi thì chưa có `id`
    //              của server, mà React vẫn phải khoá được từng chip để vẽ tiến trình.
    //   • `status` 'uploading' | 'ready' | 'error'. Chỉ 'ready' mới có `id` và chỉ
    //              những cái đó mới được gửi kèm lượt hỏi.
    //
    // Giữ cả tệp LỖI trong danh sách thay vì bỏ đi im lặng: người dùng chọn 3 tệp mà một
    // cái hỏng thì họ cần thấy CÁI NÀO hỏng và vì sao, chứ không phải đếm lại xem còn
    // mấy chip.
    const [attachments, setAttachments] = useState([]);
    // Hạn mức SỐ TỆP của tháng (`storage_plans.ai_file_quota`) — khác hẳn hạn mức token
    // ở `quota`: cái kia tiêu theo lượt hỏi, cái này tiêu theo lượt tải lên.
    const [fileQuota, setFileQuota] = useState(null);
    // Lỗi của riêng khu đính kèm (quá 3 tệp, hết hạn mức, định dạng lạ). Tách khỏi
    // `error` của lượt hỏi: hai thứ này xuất hiện ở hai chỗ khác nhau trên màn hình và
    // gộp chung thì một lỗi chọn tệp sẽ xoá mất thông báo lỗi của câu trả lời đang đọc.
    const [attachError, setAttachError] = useState(null);
    const fileInputRef = useRef(null);

    const isFolder = item?.type === 'folder';

    // Danh sách model backend cho chọn (mặc định đứng đầu) và model đang chọn.
    const modelOptions = Array.isArray(status?.models) && status.models.length ? status.models : null;
    const selectedModel = resolveModelChoice(modelOptions, pickedModel);
    const pickModel = (id) => {
        setPickedModel(id);
        try {
            localStorage.setItem(MODEL_STORAGE_KEY, id);
        } catch {
            // Không nhớ được thì lần sau về mặc định — không có gì để báo.
        }
    };

    /**
     * Ngữ cảnh THẬT của lượt hỏi kế tiếp, gộp từ hai nguồn.
     *
     * Đây là thứ duy nhất giao diện được phép hiện ra như "AI sẽ đọc gì": trước bản này
     * chỉ có `item`, nên mọi chỗ đọc thẳng `item.name`. Nay một lượt hỏi có thể gồm mục
     * trong Drive CỘNG tệp vừa tải lên, và mọi chỗ đó phải đọc qua đây — nếu không sẽ có
     * chỗ nói "đang hỏi về a.txt" trong khi thật ra gửi cả ba tệp.
     *
     * Tệp đang tải dở VẪN nằm trong danh sách (để hiện thanh tiến trình) nhưng không
     * `ready`, nên `readyAttachmentIds` bên dưới mới là thứ đi vào request.
     */
    const contextSources = useMemo(() => {
        const list = [];
        if (item) {
            list.push({
                key: `drive:${item.id}`,
                origin: 'drive',
                name: item.name,
                sizeBytes: Number(item.sizeBytes) || 0,
                isFolder: item.type === 'folder',
                status: 'ready',
            });
        }
        for (const a of attachments) {
            list.push({ ...a, key: a.key, origin: 'upload', isFolder: false });
        }
        return list;
    }, [item, attachments]);

    const readyAttachmentIds = useMemo(
        () => attachments.filter((a) => a.status === 'ready' && a.id).map((a) => a.id),
        [attachments],
    );

    // Số suất còn trống trong MỘT lượt: mục Drive (nếu có) cũng ăn một suất, vì backend
    // tính trần 3 trên TỔNG hai loại (`MAX_CONTEXT_SOURCES` ở `ask-ai.dto.ts`).
    const slotsLeft = Math.max(0, MAX_SOURCES_PER_TURN - contextSources.length);
    const uploading = attachments.some((a) => a.status === 'uploading');
    // Hết hạn mức TỆP của tháng — khác hẳn `quotaBlocked` (hạn mức TOKEN). Hai thứ này độc
    // lập: hết token thì không hỏi được câu nào, còn hết suất tệp thì vẫn hỏi bình thường
    // về mọi thứ đã có trong Drive, chỉ không đính thêm tệp mới từ máy được.
    //
    // `fileQuota` là `null` khi backend chưa deploy bản có trường này — khi đó KHÔNG khoá
    // nút: để người dùng thử và nhận lỗi thật từ server, thay vì khoá vì một trường vắng mặt.
    const fileQuotaOut = fileQuota ? fileQuota.remaining <= 0 : false;

    /**
     * Người dùng chọn tệp từ máy.
     *
     * Ba thứ được kiểm NGAY ở client, và không cái nào thay cho phần kiểm ở backend — đây
     * chỉ là để người dùng biết ngay thay vì chờ một vòng mạng rồi nhận lỗi:
     *   1. còn chỗ trong lượt này không (trần 3 tính cả mục Drive);
     *   2. còn hạn mức tháng không;
     *   3. tệp có quá nặng không.
     *
     * Tải TUẦN TỰ từng tệp chứ không song song: ba request 25MB cùng lúc trên mạng di
     * động thì cả ba cùng chậm và thanh tiến trình của cả ba cùng bò, trong khi tuần tự
     * thì tệp đầu xong sớm và người dùng thấy tiến triển thật.
     */
    const pickFiles = useCallback(
        async (fileList) => {
            const files = Array.from(fileList || []);
            if (!files.length) return;
            setAttachError(null);

            if (files.length > slotsLeft) {
                setAttachError(
                    t('ai.attach.tooMany', { max: MAX_SOURCES_PER_TURN, left: slotsLeft }),
                );
                if (slotsLeft === 0) return;
            }

            for (const file of files.slice(0, slotsLeft)) {
                if (file.size > MAX_ATTACHMENT_BYTES) {
                    setAttachError(
                        t('ai.attach.tooBig', {
                            name: file.name,
                            max: formatBytes(MAX_ATTACHMENT_BYTES, locale),
                        }),
                    );
                    continue;
                }

                const key = `up:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                setAttachments((prev) => [
                    ...prev,
                    {
                        key,
                        name: file.name,
                        sizeBytes: file.size,
                        mimeType: file.type,
                        status: 'uploading',
                        progress: 0,
                    },
                ]);

                try {
                    const res = await aiApi.uploadAttachment(file, {
                        conversationId,
                        onProgress: (progress) =>
                            setAttachments((prev) =>
                                prev.map((a) => (a.key === key ? { ...a, progress } : a)),
                            ),
                    });
                    setAttachments((prev) =>
                        prev.map((a) =>
                            a.key === key
                                ? { ...a, status: 'ready', id: res.id, progress: 100 }
                                : a,
                        ),
                    );
                    // Hạn mức mới về kèm mỗi lượt tải — không phải gọi thêm request nào.
                    if (res.quota) setFileQuota(res.quota);
                } catch (err) {
                    const message = err?.message || t('ai.attach.failed');
                    setAttachments((prev) =>
                        prev.map((a) => (a.key === key ? { ...a, status: 'error', error: message } : a)),
                    );
                    // Hết hạn mức thì mọi tệp còn lại trong lượt chọn này cũng sẽ hỏng y
                    // hệt — dừng luôn thay vì bắt người dùng xem ba thông báo giống nhau.
                    // Lỗi đã qua interceptor axios: mã nằm ở `err.errorCode`, hạn mức ở
                    // `err.details` — không còn `err.response`.
                    if (err?.errorCode === 'AI_FILE_QUOTA_EXCEEDED') {
                        setAttachError(message);
                        if (err.details?.quota) setFileQuota(err.details.quota);
                        break;
                    }
                }
            }
        },
        [slotsLeft, conversationId, t, locale],
    );

    /**
     * Bỏ một tệp khỏi lượt hỏi.
     *
     * Chỉ gỡ khỏi giao diện, KHÔNG gọi `DELETE /ai/attachments/:id`: suất hạn mức đã bị
     * trừ lúc tải lên và không hoàn lại được, nên xoá hẳn trên server chẳng trả lại gì cho
     * người dùng mà lại làm mất tệp khỏi các cuộc trò chuyện cũ đang trỏ tới nó. Tệp tự
     * hết hạn sau 30 ngày.
     */
    const removeAttachment = useCallback((key) => {
        setAttachments((prev) => prev.filter((a) => a.key !== key));
        setAttachError(null);
    }, []);

    // ── Gửi một câu hỏi ────────────────────────────────────────────────────
    const send = useCallback(
        // `model` truyền tay chỉ ở lượt tự chạy lúc mở khung: lúc đó `status` vừa được đặt
        // nhưng closure này vẫn là của lần render trước, nên `selectedModel` còn `null`.
        async ({ action = 'chat', text = '', model = selectedModel }) => {
            // Bản trước `if (!item) return` — tức không có mục là không hỏi được gì. Nay
            // điều kiện là "có CÁI GÌ ĐÓ để gửi": một mục Drive, một tệp vừa đính, hoặc
            // một câu hỏi gõ tay (hỏi chay về chính driveR vẫn trả lời được — xem ghi chú
            // tình huống 'none' ở `ai-rules.ts`).
            if (!item && !readyAttachmentIds.length && action === 'chat' && !text.trim()) return;
            // Còn tệp đang tải dở thì chờ: gửi lúc này là gửi thiếu đúng cái tệp người
            // dùng vừa chọn, và câu trả lời sẽ nói về hai tệp trong khi họ đính ba.
            if (uploading) return;
            lastRequestRef.current = { action, text };
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
                // KHÔNG gửi `history` (##83). Backend đã thôi đọc trường này từ 07/09/2026 — nó
                // tự nạp lịch sử từ DB theo `conversationId` — mà bản trước vẫn gửi NGUYÊN VĂN
                // 16 tin gần nhất, trong khi DTO chặn mỗi tin > 8.000 ký tự: một câu trả lời dài
                // (tóm tắt chi tiết, phân tích tài liệu) là mọi câu hỏi tiếp theo trong khung
                // chat ăn 400 "text must be shorter than or equal to 8000 characters", kể cả khi
                // mở lại cuộc đó từ Lịch sử. Mạch hội thoại giữ bằng `conversationId`.
                const res = await aiApi.askStream(
                    {
                        // `itemId` (số ít) chứ không gộp vào `itemIds`: menu chuột phải là
                        // đường phổ biến nhất và backend nhận cả hai, nên giữ nguyên hình
                        // dạng cũ cho đường cũ là ít rủi ro nhất.
                        ...(item ? { itemId: item.id } : {}),
                        ...(readyAttachmentIds.length ? { attachmentIds: readyAttachmentIds } : {}),
                        action,
                        ...(action === 'chat' ? { prompt: text } : {}),
                        ...(conversationId ? { conversationId } : {}),
                        ...(model ? { model } : {}),
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
                        // Lượt bị bắt vì nội dung bạo lực: `answer` đã là câu cảnh báo do
                        // backend viết, ở đây chỉ để tô khối cho khác câu trả lời thường.
                        moderation: res.moderation ?? null,
                    };
                    const last = prev[prev.length - 1];
                    return last?.streaming ? [...prev.slice(0, -1), bubble] : [...prev, bubble];
                });
                // Câu trả lời về trong lúc panel đang thu nhỏ: bật chấm báo trên bong
                // bóng. Đặt ở ĐÂY chứ không trong một effect theo dõi `messages`, vì mỗi
                // đoạn chữ chảy về đều thay bong bóng cuối — bắt theo nội dung thì chấm
                // sáng ngay từ chữ đầu tiên, lúc chưa có gì để đọc. Chỉ chỗ này mới biết
                // lượt hỏi đã HOÀN TẤT.
                if (minimized) setUnseenReply(true);
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
        [
            item,
            isFolder,
            language,
            conversationId,
            t,
            readyAttachmentIds,
            uploading,
            minimized,
            selectedModel,
        ],
    );

    /**
     * Đóng menu ba chấm VÀ dọn mọi bước xác nhận đang treo trong nó.
     *
     * Hai việc này không tách rời được: mở lại menu mà thấy sẵn dòng "Bấm lần nữa để
     * xoá" thì cú bấm đầu tiên của lần sau đã là cú thứ hai, tức bước xác nhận biến mất
     * đúng lúc nó cần có nhất.
     *
     * `useCallback` không deps: cả ba đều là hàm `setState`, React bảo đảm chúng không
     * đổi. Nhờ vậy hai effect nghe `pointerdown`/`keydown` bên dưới kê được nó vào danh
     * sách phụ thuộc mà không đăng ký lại listener sau mỗi lần render.
     */
    const closeMenu = useCallback(() => {
        setMenuOpen(false);
        setConfirmClear(false);
        setConfirmWipe(false);
    }, []);

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
            // Backend cũ (chưa deploy bản này) không có trường `fileQuota` — khi đó khu
            // đính kèm vẫn hiện, chỉ không có dòng "còn N tệp tháng này". Lỗi thật (nếu
            // gói này chưa bật) sẽ hiện ra ở lượt tải đầu tiên, kèm nguyên nhân.
            if (nextStatus?.fileQuota) setFileQuota(nextStatus.fileQuota);
            if (nextStatus?.quota) {
                setQuota(nextStatus.quota);
                setQuotaBlocked(Boolean(nextStatus.quota.exhausted));
                // Hết hạn mức thì KHÔNG tự chạy lệnh nhanh: gửi đi cũng chỉ nhận 429,
                // mà người dùng thì thấy khung chat tự nhấp nháy rồi báo lỗi.
                if (nextStatus.quota.exhausted) return;
            }
            if (nextStatus?.enabled === false) return;
            if (initialAction && initialAction !== 'chat') {
                sendRef.current({
                    action: initialAction,
                    model: resolveModelChoice(nextStatus?.models, readStoredModel()),
                });
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
    //
    // Đang thu nhỏ thì Esc KHÔNG đóng: lúc đó trên màn hình chỉ còn một bong bóng bé ở
    // mép phải, người dùng gần như chắc chắn đang gõ Esc cho một thứ khác (đóng menu,
    // thoát ô tìm kiếm) — và cái giá của việc đoán sai là mất cả hội thoại họ vừa cố ý
    // giữ lại. Menu ba chấm đang mở thì Esc đóng menu trước, cùng một logic nhường bậc
    // với nút Dừng.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            if (minimized) return;
            if (menuOpen) {
                closeMenu();
                return;
            }
            if (abortRef.current) {
                stopRun();
                return;
            }
            onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, minimized, menuOpen, closeMenu, onClose, stopRun]);

    /**
     * Bấm ra ngoài khung chat → THU NHỎ, không đóng.
     *
     * `pointerdown` ở pha BẮT (capture) chứ không phải `click` ở pha nổi bọt: nhiều chỗ
     * trong app (menu chuột phải, các dropdown) tự gỡ mình khỏi DOM ngay trong handler
     * của chúng, nên tới lượt `click` nổi lên tới `document` thì `e.target` đã mồ côi và
     * `contains()` trả về false — tức bấm vào một cái menu trong panel cũng bị tính là
     * bấm ra ngoài.
     *
     * Nhờ đối chiếu với `panelRef`, nội dung trong shadow DOM (widget gợi ý tìm kiếm của
     * Google) vẫn tính là bên trong: sự kiện từ shadow root được trình duyệt gán lại về
     * chính phần tử host khi nhìn từ ngoài cây đó.
     *
     * KHÔNG chạy khi đang thu nhỏ — lúc đó mọi cú bấm đều là "ngoài panel", và bong bóng
     * thì có handler riêng của nó.
     */
    useEffect(() => {
        if (!isOpen || minimized) return undefined;
        const onPointerDown = (e) => {
            if (panelRef.current?.contains(e.target)) return;
            onMinimize?.();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [isOpen, minimized, onMinimize]);

    // Bấm ra ngoài MENU ba chấm (nhưng vẫn trong panel) thì đóng menu. Hai listener chứ
    // không một: cái ở trên đã bỏ qua mọi cú bấm trong panel, mà menu thì cần đóng đúng
    // ở những cú bấm đó.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onPointerDown = (e) => {
            if (menuRef.current?.contains(e.target)) return;
            closeMenu();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [menuOpen, closeMenu]);


    // Bước xác nhận tự huỷ sau 4 giây. Không có nó thì một nút đang ở trạng thái "Xoá?"
    // sẽ nằm im như vậy vô thời hạn, và cú bấm vô tình nào sau đó cũng thành cú thứ hai.
    useEffect(() => {
        if (!confirmClear) return undefined;
        const timer = setTimeout(() => setConfirmClear(false), 4000);
        return () => clearTimeout(timer);
    }, [confirmClear]);

    useEffect(() => {
        if (!confirmDeleteId) return undefined;
        const timer = setTimeout(() => setConfirmDeleteId(null), 4000);
        return () => clearTimeout(timer);
    }, [confirmDeleteId]);

    useEffect(() => {
        if (!confirmWipe) return undefined;
        const timer = setTimeout(() => setConfirmWipe(false), 4000);
        return () => clearTimeout(timer);
    }, [confirmWipe]);

    // Luôn cuộn xuống câu mới nhất
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isThinking, error]);

    // `!item` KHÔNG còn là điều kiện đóng. Đó là nguyên nhân của "bấm nút AI trên thanh
    // điều hướng thì không có gì xảy ra": `AiPanelContext.openAi(null)` đã bỏ chặn và đã
    // mount panel này với `item = null`, nhưng dòng này trả về null nên không có gì được
    // vẽ ra — cái nút bấm vào đúng một khoảng trắng. Mọi thứ bên dưới đã đọc `item` qua
    // `item?.` và qua `contextSources`, nên bỏ vế đó ra là đủ.
    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const text = prompt.trim();
        if (!text || isThinking) return;
        setPrompt('');
        send({ action: 'chat', text });
    };

    /** Gửi LẠI đúng lượt vừa hỏng, kể cả khi đó là một lệnh nhanh không gõ lại được. */
    const retryLast = () => {
        setError(null);
        const last = lastRequestRef.current;
        if (!last || isThinking) {
            inputRef.current?.focus();
            return;
        }
        send(last);
    };

    /** Dọn khung chat. Chỉ chạy ở cú bấm THỨ HAI — xem `confirmClear`. */
    const clearConversation = () => {
        if (!confirmClear) {
            setConfirmClear(true);
            return;
        }
        closeMenu();
        setMessages([]);
        setError(null);
        // Bỏ luôn liên kết cuộc cũ: người dùng vừa dọn sạch khung chat thì câu sau là một
        // cuộc mới, chứ không âm thầm ghi tiếp vào cuộc đã bị dọn khỏi màn hình.
        setConversationId(null);
        lastRequestRef.current = null;
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
        closeMenu();
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
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id);
            return;
        }
        setConfirmDeleteId(null);
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
     * Xoá VĨNH VIỄN mọi cuộc trò chuyện đã lưu. Cú bấm thứ hai — xem `confirmWipe`.
     *
     * Không đụng tới hội thoại đang hiện trên màn hình, và đó là chủ ý: người dùng có thể
     * đang đọc dở một câu trả lời vừa nhận, xoá nó khỏi màn hình là lấy đi thứ họ không
     * yêu cầu xoá. Nhưng `conversationId` thì PHẢI bỏ — dòng tương ứng trên máy chủ đã
     * biến mất, để nguyên thì câu hỏi tiếp theo ghi vào một id không còn tồn tại.
     *
     * Sổ token (`ai_usage_log`) không nằm trong phạm vi xoá: hạn mức đã dùng của tháng
     * không phải lịch sử trò chuyện, và xoá chat để lấy lại hạn mức thì thành một đường
     * lách hạn mức.
     */
    const wipeHistory = async () => {
        if (!confirmWipe) {
            setConfirmWipe(true);
            return;
        }
        setConfirmWipe(false);
        setWiping(true);
        setHistoryError(null);
        try {
            const res = await aiApi.deleteAllConversations();
            setHistoryList({ items: [], nextBefore: null });
            setViewing(null);
            setConversationId(null);
            closeMenu();
            toast.success(
                res?.deleted > 0
                    ? t('ai.history.wipe.done', { count: res.deleted })
                    : t('ai.history.wipe.empty'),
            );
        } catch (err) {
            const message = err?.response?.data?.message || t('ai.history.wipe.failed');
            // Lỗi hiện ở CẢ hai chỗ: toast cho người đang đứng ở khung chat (menu vừa
            // đóng, không còn gì để đọc ở đó), và dòng đỏ trong tấm lịch sử cho người
            // đang mở nó — họ nhìn vào danh sách chứ không nhìn góc màn hình.
            setHistoryError(message);
            toast.error(message);
        } finally {
            setWiping(false);
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
            // Trình duyệt chặn clipboard (trang không phải HTTPS, hoặc quyền bị từ chối).
            // Bản trước nuốt lỗi im lặng: người dùng bấm Sao chép, không có gì đổi, rồi
            // dán ra thứ họ chép từ lúc nào đó trước đó — tưởng là đã chép được. Nói ra
            // bằng chính cái nút đó, và gợi ý đường còn lại (bôi đen + Ctrl+C).
            setCopiedIndex(`failed:${index}`);
            setTimeout(() => setCopiedIndex(null), 2500);
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
                        ? t('ai.context.fileText', { chars: context.chars.toLocaleString(locale) })
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
                        {t('ai.tokensUsed', { tokens: msg.tokens.toLocaleString(locale) })}
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
                                    href={safeHref(src.uri) ?? undefined}
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
    // Ngày cấp lại, hiển thị theo giờ VN. Chu kỳ là 30 ngày tính từ ngày mua gói (không
    // còn là tháng dương lịch), nên câu chữ phải nói NGÀY cụ thể chứ không nói "đầu tháng".
    const formatResetDate = (value) =>
        value
            ? new Date(value).toLocaleDateString(locale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  timeZone: 'Asia/Ho_Chi_Minh',
              })
            : null;
    const resetLabel = formatResetDate(quota?.resetAt);
    const fileResetLabel = formatResetDate(fileQuota?.resetAt) ?? resetLabel ?? '—';
    // Gói trả phí: MỘT hạn mức cho trọn kỳ đã mua, hết hạn cùng ngày với gói (##87) — `resetAt`
    // khi đó là ngày GÓI hết hạn, không phải ngày "cấp lại". Gói Miễn phí (và backend cũ chưa có
    // `periodMonths`) vẫn là chu kỳ 30 ngày cấp lại.
    const planTerm = Boolean(quota?.periodMonths);
    // "6 tháng" / "6 months" / "1 month" — chèn vào các câu hạn mức của gói trả phí.
    const quotaTermLabel = planTerm ? t(monthsTermKey(quota.periodMonths), { count: quota.periodMonths }) : '';
    const fileTerm = Boolean(fileQuota?.periodMonths ?? quota?.periodMonths);
    const inputLocked = aiDisabled || quotaBlocked;

    /**
     * Bong bóng của trạng thái thu nhỏ.
     *
     * Vị trí mặc định là MÉP PHẢI, giữa chiều cao — không phải góc dưới-phải như một
     * widget chat thông thường. Hai lý do, và lý do thứ hai mới là lý do bắt buộc:
     *  • panel này vốn là một CỘT BÊN PHẢI trượt vào; thu về đúng cạnh đó thì cú bấm mở
     *    lại nằm ngay chỗ khung sẽ bung ra.
     *  • góc dưới-phải đã có chủ: `UploadProgress` là một thẻ rộng 360px đóng đinh ở
     *    `bottom-6 right-6`. Đặt bong bóng vào đó thì trong lúc tải tệp nó nằm khuất hoàn
     *    toàn dưới thẻ tải lên, và người dùng kết luận là bong bóng biến mất.
     *
     * Nhưng mặc định chỉ là mặc định: từ nay bong bóng KÉO ĐƯỢC sang cả bốn cạnh và nhớ
     * chỗ người dùng đã thả (xem `AiBubble`) — vì chỗ nào cũng có lúc che mất đúng thứ
     * đang cần nhìn, và chỉ người dùng mới biết lúc đó là chỗ nào.
     */
    if (minimized) {
        return (
            <AiBubble
                isThinking={isThinking}
                unseenReply={unseenReply}
                label={t('ai.restore')}
                onRestore={() => {
                    setUnseenReply(false);
                    onRestore?.();
                }}
            />
        );
    }

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
                nó vẫn sẽ ăn mọi cú bấm ra ngoài panel.

                Bấm vào đây THU NHỎ chứ không đóng, cho khớp với cú bấm ra ngoài ở khổ màn
                hình lớn: cùng một động tác thì phải cho cùng một kết quả, nếu không thì
                trên điện thoại người dùng mất hội thoại ở đúng thao tác mà trên máy tính
                chỉ cất nó đi. */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-fade-in cursor-pointer sm:hidden"
                onClick={onMinimize}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
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
                            {/* Dòng phụ nói ĐÚNG ngữ cảnh của lượt hỏi kế tiếp, không
                                phải mỗi tên mục Drive: từ khi đính kèm được tệp từ máy,
                                "đang hỏi về a.txt" là một câu sai khi người dùng vừa thả
                                thêm hai tệp nữa vào. Nhiều nguồn thì đếm; chưa có nguồn
                                nào thì mời đính kèm chứ không để trống một dòng. */}
                            <p
                                className="text-[11px] text-gray-500 dark:text-gray-400 truncate"
                                title={contextSources.map((c) => c.name).join(', ')}
                            >
                                {contextSources.length === 0
                                    ? t('ai.context.none')
                                    : contextSources.length === 1
                                      ? contextSources[0].name
                                      : t('ai.context.count', { count: contextSources.length })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {/* ── Menu ba chấm ──
                            Thay cho hai nút biểu tượng cũ (Lịch sử + Thùng rác). Chúng
                            từng đứng cạnh nút Đóng thành ba ô vuông xám cùng cỡ cùng màu,
                            mà một trong ba xoá cả hội thoại — bấm trượt một ô là mất. Ở
                            đây mỗi lệnh có CHỮ đọc được trước khi bấm, và lệnh xoá nằm
                            dưới một lớp phải mở ra chứ không chờ sẵn dưới con trỏ.

                            Hai bước xác nhận vẫn giữ nguyên, ngay tại dòng menu: cú bấm
                            đầu đổi dòng đó sang màu cảnh báo và đổi chữ, cú thứ hai mới
                            thật sự xoá. */}
                        <div ref={menuRef} className="relative">
                            <button
                                onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
                                title={t('ai.more')}
                                aria-label={t('ai.more')}
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                    menuOpen
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                                }`}
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {menuOpen && (
                                <div
                                    role="menu"
                                    className="absolute right-0 top-full mt-1 z-20 w-60 py-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#282a2c] shadow-xl animate-fade-in"
                                >
                                    <button
                                        role="menuitem"
                                        onClick={openHistory}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    >
                                        <History className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                        {t('ai.history.open')}
                                    </button>

                                    {/* Chỉ có gì để dọn thì mới mời dọn. */}
                                    {messages.length > 0 && (
                                        <button
                                            role="menuitem"
                                            onClick={clearConversation}
                                            title={confirmClear ? t('ai.clear.confirmHint') : undefined}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors cursor-pointer ${
                                                confirmClear
                                                    ? 'font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30'
                                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <Eraser
                                                className={`w-4 h-4 shrink-0 ${
                                                    confirmClear ? '' : 'text-gray-400 dark:text-gray-500'
                                                }`}
                                            />
                                            {confirmClear ? t('ai.clear.confirmHint') : t('ai.clear')}
                                        </button>
                                    )}

                                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                                    {/* Xoá SẠCH lịch sử trên máy chủ — nặng hơn hẳn hai
                                        lệnh trên, nên nằm sau một đường kẻ và mang màu
                                        cảnh báo ngay từ trạng thái nghỉ. */}
                                    <button
                                        role="menuitem"
                                        onClick={wipeHistory}
                                        disabled={wiping}
                                        title={confirmWipe ? t('ai.history.wipe.confirmHint') : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                            confirmWipe
                                                ? 'font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30'
                                                : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                        }`}
                                    >
                                        {wiping ? (
                                            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4 shrink-0" />
                                        )}
                                        <span className="min-w-0">
                                            {confirmWipe
                                                ? t('ai.history.wipe.confirmHint')
                                                : t('ai.history.wipe')}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Thu nhỏ. Bấm ra ngoài khung cũng làm đúng việc này, nhưng trên
                            điện thoại "ngoài khung" là một dải hẹp quanh mép, nên vẫn cần
                            một cái nút bấm trúng được. */}
                        <button
                            onClick={onMinimize}
                            title={t('ai.minimize')}
                            aria-label={t('ai.minimize')}
                            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
                        >
                            <Minus className="w-4 h-4" />
                        </button>

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
                                title={
                                    planTerm
                                        ? t('ai.quota.tooltipPlan', {
                                              used: quota.used.toLocaleString(locale),
                                              limit: quota.limit.toLocaleString(locale),
                                              term: quotaTermLabel,
                                              date: resetLabel ?? '—',
                                          })
                                        : t('ai.quota.tooltip', {
                                              used: quota.used.toLocaleString(locale),
                                              limit: quota.limit.toLocaleString(locale),
                                          })
                                }
                            >
                                <Gauge className="w-3.5 h-3.5 shrink-0" />
                                {/* `sm:shrink-0`: từ sm tên gói hiện bên cạnh và CHỈ nó co lại khi thiếu chỗ.
                                    Để cả hai cùng co thì Chrome cắt "…" ở con số đã dùng chỉ vì lệch phần lẻ
                                    pixel (đo trên bản build: hai phần cùng co là "Đã dùng 5% hạn mức AI của g…").
                                    Màn hẹp hơn sm không có tên gói nên dòng này vẫn co + "…" như cũ. */}
                                <span className="truncate sm:shrink-0">
                                    {/* Gói trả phí nói luôn KỲ của hạn mức ("hạn mức AI 6 tháng") ngay trong câu
                                        chính — phần tên gói bên cạnh có thể bị cắt khi khung hẹp. */}
                                    {quotaBlocked
                                        ? planTerm
                                            ? t('ai.quota.emptyPlan', { term: quotaTermLabel })
                                            : t('ai.quota.empty')
                                        : planTerm
                                          ? t('ai.quota.usedPercentPlan', { percent: usedPercent, term: quotaTermLabel })
                                          : t('ai.quota.usedPercent', { percent: usedPercent })}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 truncate hidden sm:inline">
                                    · {displayPlanName(quota.planName, language)}
                                </span>
                            </span>
                            {resetLabel && (
                                <span className="text-gray-400 dark:text-gray-500 shrink-0">
                                    {t(planTerm ? 'ai.quota.until' : 'ai.quota.reset', { date: resetLabel })}
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
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                                {t(planTerm ? 'ai.quota.blockedTitlePlan' : 'ai.quota.blockedTitle')}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                                {planTerm
                                    ? t('ai.quota.blockedDescPlan', {
                                          plan: displayPlanName(quota?.planName, language) ?? '',
                                          term: quotaTermLabel,
                                          date: resetLabel ?? '',
                                      })
                                    : t('ai.quota.blockedDesc', {
                                          plan: displayPlanName(quota?.planName, language) ?? '',
                                          date: resetLabel ?? '',
                                      })}
                            </p>
                        </div>
                    ) : messages.length === 0 && !isThinking ? (
                        // Màn hình trống để TRỐNG (29/09/2026). Bản trước bày một dòng chào,
                        // một đoạn hướng dẫn, nút đính tệp và lưới lệnh nhanh; chủ hệ thống
                        // thấy đó là chữ thừa. Ô nhập, kẹp giấy và nút chọn model bên dưới đã
                        // đủ để bắt đầu.
                        null
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
                                        <div
                                            className={
                                                msg.moderation
                                                    ? `prose-ai rounded-lg border px-3 py-2.5 ${
                                                          msg.moderation.banned
                                                              ? 'border-rose-300 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100'
                                                              : 'border-amber-300 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
                                                      }`
                                                    : 'prose-ai'
                                            }
                                            role={msg.moderation ? 'alert' : undefined}
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
                                        {/* LUÔN hiện, không còn `opacity-0 group-hover`.
                                            Trên màn cảm ứng không có trạng thái rê chuột,
                                            nên nút ẩn theo hover là nút KHÔNG TỒN TẠI với
                                            người dùng điện thoại — mà panel này có hẳn một
                                            bố cục riêng cho khổ màn hình đó. */}
                                        <button
                                            onClick={() => handleCopy(msg.text, idx)}
                                            className={`mt-2 inline-flex items-center gap-1 text-[11px] transition-colors cursor-pointer ${
                                                copiedIndex === `failed:${idx}`
                                                    ? 'text-rose-600 dark:text-rose-400'
                                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                                            }`}
                                        >
                                            {copiedIndex === `failed:${idx}` ? (
                                                <AlertTriangle className="w-3 h-3" />
                                            ) : copiedIndex === idx ? (
                                                <Check className="w-3 h-3" />
                                            ) : (
                                                <Copy className="w-3 h-3" />
                                            )}
                                            {copiedIndex === `failed:${idx}`
                                                ? t('ai.copyFailed')
                                                : copiedIndex === idx
                                                  ? t('ai.copied')
                                                  : t('ai.copy')}
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
                        chưa có chữ nào). Nên dòng này phải nói đúng việc đang diễn ra chứ
                        không phải một spinner trống làm người dùng tưởng máy treo.

                        Đây là chỉ báo DUY NHẤT trong lúc chờ (29/09/2026). Bản trước còn in
                        cả tóm tắt suy luận của Gemini vào bong bóng, và nó toàn là tường
                        thuật "tôi đã nhận được tệp…, tôi đã đọc…" — người dùng phải ngồi đọc
                        chữ thừa. Backend giờ không phát sự kiện `thought` nữa. */}
                    {/* Chỉ còn dòng trạng thái. Nút Dừng đã chuyển xuống ô nhập: ở đây nó
                        nằm trong vùng CUỘN, nên chỉ cần người dùng kéo lên đọc lại đoạn
                        trước là nút biến khỏi màn hình — đúng lúc câu trả lời đang dài ra
                        và họ muốn dừng nhất. Ô nhập thì luôn đứng yên ở đáy panel. */}
                    {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {reconnecting ? t('ai.reconnecting') : t('ai.thinking')}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/60 rounded-lg px-3 py-2.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                            <div className="min-w-0">
                                <p className="break-words">{error}</p>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <button
                                        onClick={retryLast}
                                        disabled={isThinking}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw className="w-3 h-3" /> {t('ai.retry')}
                                    </button>
                                    {/* Đường ra thứ hai. Trước đây chỉ có một nút, và nó
                                        vừa mang nhãn "Thử lại" vừa làm việc đóng dòng lỗi —
                                        người muốn bỏ qua không có nút nào để bấm, người
                                        muốn thử lại thì bấm xong chẳng có gì được gửi. */}
                                    <button
                                        onClick={() => { setError(null); inputRef.current?.focus(); }}
                                        className="font-medium hover:underline cursor-pointer"
                                    >
                                        {t('ai.dismiss')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Hết hạn mức: mời nâng cấp thay vì để một ô nhập bấm vào chỉ ra lỗi ── */}
                {quotaBlocked && !aiDisabled && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                            {t(planTerm ? 'ai.quota.upgradeHintPlan' : 'ai.quota.upgradeHint')}
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

                {/* ── Chip ngữ cảnh: những gì AI sẽ đọc ở lượt hỏi kế tiếp ──
                    Nằm NGAY TRÊN ô nhập, không nằm ở đầu khung: đây là thứ người dùng
                    phải liếc thấy đúng lúc sắp bấm Gửi. Đặt ở đầu khung thì trong một
                    cuộc trò chuyện dài nó cuộn khuất, và người ta gửi mà không biết đang
                    gửi kèm những gì.

                    Hiện CẢ tệp đang tải dở và tệp lỗi — xem `attachments`: giấu đi thì
                    người dùng đếm lại chip và không hiểu tệp thứ ba đi đâu mất. */}
                {!aiDisabled && !quotaBlocked && (contextSources.length > 0 || attachError) && (
                    <div className="px-4 pt-2.5">
                        {contextSources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {contextSources.map((src) => {
                                    const failed = src.status === 'error';
                                    const busy = src.status === 'uploading';
                                    const Icon = src.origin === 'drive'
                                        ? (src.isFolder ? FolderSearch : HardDrive)
                                        : Upload;
                                    return (
                                        <span
                                            key={src.key}
                                            title={
                                                failed
                                                    ? src.error
                                                    : `${src.name}${src.sizeBytes ? ` · ${formatBytes(src.sizeBytes, locale)}` : ''}`
                                            }
                                            className={`group relative inline-flex items-center gap-1.5 max-w-[14rem] pl-2 pr-1.5 py-1 rounded-lg border text-[11px] overflow-hidden ${
                                                failed
                                                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#282a2c] text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {/* Thanh tiến trình vẽ NGAY TRONG chip thay vì
                                                một thanh riêng: chip là thứ đại diện cho
                                                tệp đó, nên tiến trình của nó phải nằm trên
                                                chính nó — ba tệp ba thanh rời thì không
                                                biết thanh nào của tệp nào. */}
                                            {busy && (
                                                <span
                                                    className="absolute inset-y-0 left-0 bg-blue-500/15 transition-all"
                                                    style={{ width: `${src.progress ?? 0}%` }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="relative flex items-center gap-1.5 min-w-0">
                                                {busy ? (
                                                    <Loader2 className="w-3 h-3 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
                                                ) : failed ? (
                                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                                ) : (
                                                    <Icon className="w-3 h-3 shrink-0 text-gray-400 dark:text-gray-500" />
                                                )}
                                                <span className="truncate">{src.name}</span>
                                            </span>
                                            {/* Mục Drive KHÔNG có nút gỡ: nó là thứ người
                                                dùng bấm chuột phải để mở panel này, gỡ nó
                                                ra thì panel còn lại là gì? Đóng khung rồi
                                                mở lại từ tệp khác là thao tác đúng, và nó
                                                cũng dựng lại hội thoại cho sạch. */}
                                            {src.origin === 'upload' && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachment(src.key)}
                                                    title={t('ai.attach.remove')}
                                                    aria-label={t('ai.attach.remove', { name: src.name })}
                                                    className="relative shrink-0 p-0.5 rounded text-gray-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-white dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {attachError && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="min-w-0 break-words">{attachError}</span>
                            </p>
                        )}
                    </div>
                )}

                {/* ── Ô nhập ── */}
                <form
                    onSubmit={handleSubmit}
                    hidden={quotaBlocked && !aiDisabled}
                    className="px-4 py-3 border-t border-gray-200 dark:border-gray-800"
                >
                    <div className="flex gap-2 items-center">
                        {/* Đính tệp từ máy. `multiple` nhưng vẫn chặn ở `slotsLeft` —
                            trình duyệt không có cách nào giới hạn số tệp trong hộp chọn,
                            nên chọn 10 tệp là chuyện bình thường và `pickFiles` phải xử lý
                            được. `accept` nêu đúng bộ định dạng backend nhận
                            (`classifyAiMedia`), để hộp chọn tệp làm mờ sẵn thứ chắc chắn
                            bị từ chối thay vì để người dùng chọn rồi mới biết. */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="text/*,image/*,video/*,.pdf,.docx,.pptx,.xlsx,.mp3,.wav,.m4a,.aac,.flac,.opus,.md,.csv,.json,.xml,.yml,.yaml,.log,.sql,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.sh"
                            className="hidden"
                            onChange={(e) => {
                                pickFiles(e.target.files);
                                // Dọn `value`: chọn LẠI đúng tệp vừa gỡ ra sẽ không bắn sự
                                // kiện `change` nếu giá trị không đổi, và người dùng bấm
                                // mãi không thấy gì xảy ra.
                                e.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={inputLocked || slotsLeft === 0 || uploading || fileQuotaOut}
                            title={
                                fileQuotaOut
                                    ? t(fileTerm ? 'ai.attach.quotaOutPlan' : 'ai.attach.quotaOut', {
                                          limit: fileQuota?.limit ?? 0,
                                          date: fileResetLabel,
                                      })
                                    : slotsLeft === 0
                                      ? t('ai.attach.full', { max: MAX_SOURCES_PER_TURN })
                                      : t('ai.attach.add', { left: slotsLeft })
                            }
                            aria-label={t('ai.attach.add', { left: slotsLeft })}
                            className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Paperclip className="w-4 h-4" />
                            )}
                        </button>

                        <input
                            ref={inputRef}
                            type="text"
                            value={prompt}
                            disabled={inputLocked}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                                contextSources.length === 0
                                    ? t('ai.placeholder.empty')
                                    : isFolder
                                      ? t('ai.placeholder.folder')
                                      : t('ai.placeholder.file')
                            }
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-[13px] disabled:opacity-50"
                        />

                        {/* MỘT nút ở vị trí này, hai vai trò loại trừ nhau: đang rảnh thì
                            Gửi, đang chạy thì Dừng. Bản trước để nút Gửi mờ đi trong suốt
                            lượt trả lời còn nút Dừng thì nằm lẫn trong vùng cuộn — nên ở
                            đúng khoảnh khắc duy nhất người dùng muốn bấm một cái gì đó,
                            chỗ họ nhìn vào lại là một nút đã tắt.

                            Vẫn là chỗ DUY NHẤT trong panel dùng màu đặc: một màn hình mà
                            nút nào cũng nổi thì không nút nào nổi. */}
                        {isThinking ? (
                            <button
                                type="button"
                                onClick={stopRun}
                                title={t('ai.stop')}
                                aria-label={t('ai.stop')}
                                className="shrink-0 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-[13px] font-medium cursor-pointer"
                            >
                                <Square className="w-3.5 h-3.5" />
                                {t('ai.stop')}
                            </button>
                        ) : (
                            <button
                                type="submit"
                                // Khoá thêm khi đang tải tệp: gửi lúc này là gửi thiếu
                                // đúng cái tệp người dùng vừa chọn.
                                disabled={!prompt.trim() || inputLocked || uploading}
                                title={t('ai.send')}
                                aria-label={t('ai.send')}
                                className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center cursor-pointer"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    {/* Chọn model cho lượt hỏi KẾ TIẾP. Đổi giữa cuộc trò chuyện được: mỗi lượt
                        mang model riêng, lịch sử vẫn là một cuộc. Khoá trong lúc đang trả lời
                        vì lượt đó đã đi bằng model cũ rồi.

                        Chỉ còn một nhãn ngắn, không ghi "nhanh"/"kỹ": đo thật 29/09/2026 thì
                        2.5 ra chữ đầu sớm hơn nhưng viết dài gấp đôi nên xong muộn hơn — ghi
                        "nhanh" là hứa một điều không đúng. Số đo ở `backend/src/ai/ai-models.ts`.

                        Backend cũ không có danh sách thì về dòng cũ: tên model mặc định. */}
                    <div className="mt-2 flex items-center gap-2 min-w-0 text-[11px]">
                        {modelOptions && modelOptions.length > 1 ? (
                            <div
                                role="radiogroup"
                                aria-label={t('ai.model.label')}
                                className="shrink-0 inline-flex p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800"
                            >
                                {modelOptions.map((m) => {
                                    const active = m.id === selectedModel;
                                    return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={isThinking}
                                            onClick={() => pickModel(m.id)}
                                            title={m.id}
                                            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
                                                active
                                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50'
                                            }`}
                                        >
                                            {m.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            status?.model && (
                                <span className="shrink-0 font-mono text-gray-400 dark:text-gray-500">
                                    {status.model}
                                </span>
                            )
                        )}
                        <span className="min-w-0 truncate text-gray-400 dark:text-gray-500" title={t('ai.disclaimer')}>
                            {t('ai.disclaimer')}
                        </span>
                    </div>
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
                                                        {new Date(c.updatedAt).toLocaleDateString(locale, {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                        })}
                                                    </span>
                                                </p>
                                            </button>
                                            {/* Cùng cơ chế hai bước với nút dọn hội thoại
                                                ở đầu khung. Ở đây còn cần hơn: nút xoá nằm
                                                ngay cạnh vùng bấm để MỞ cuộc đó ra đọc, nên
                                                bấm trượt vài pixel là xoá vĩnh viễn đúng
                                                cuộc mình vừa định mở. Không còn ẩn theo
                                                hover trên desktop — một nút xoá nhấp nháy
                                                hiện ra dưới con trỏ là cách chắc chắn để
                                                bấm nhầm. */}
                                            <button
                                                onClick={() => removeConversation(c.id)}
                                                title={
                                                    confirmDeleteId === c.id
                                                        ? t('ai.history.delete.confirmHint')
                                                        : t('ai.history.delete')
                                                }
                                                aria-label={
                                                    confirmDeleteId === c.id
                                                        ? t('ai.history.delete.confirmHint')
                                                        : t('ai.history.delete')
                                                }
                                                className={`mr-2 rounded-full transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                                                    confirmDeleteId === c.id
                                                        ? 'px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-900/60'
                                                        : 'p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-white dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                                {confirmDeleteId === c.id && t('ai.clear.confirm')}
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
                                {/* `item?.id` chứ không `item.id`: panel mở từ thanh điều
                                    hướng không có mục nào, và `null === null` sẽ cho phép
                                    nối tiếp MỌI cuộc cũ — kể cả cuộc về một tệp khác.
                                    `viewing.fileId` cũng null ở những cuộc hỏi chay, nên
                                    phải đòi có mục thật thì mới so sánh. */}
                                {item && viewing.fileId === item.id ? (
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
