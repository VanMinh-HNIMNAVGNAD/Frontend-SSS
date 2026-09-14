import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Bong bóng của trợ lý AI khi panel đang thu nhỏ — KÉO ĐƯỢC quanh cả bốn cạnh màn hình.
 *
 * Tách khỏi `GeminiModal` vì hai lý do thật, không phải để chia nhỏ tệp:
 *  • bong bóng cần một bộ hook riêng (vị trí, kéo thả, cỡ khung nhìn) mà `GeminiModal`
 *    chỉ dùng ở MỘT nhánh render. Nhét vào đó là bắt cả panel chạy lại mỗi lần con trỏ
 *    nhích 1px trong lúc kéo — trong khi panel lúc ấy còn không hiện ra.
 *  • nhánh thu nhỏ của `GeminiModal` là một `return` sớm; mọi hook thêm vào phải nằm
 *    TRƯỚC nó, tức là cách xa hàng trăm dòng so với chỗ nó được dùng.
 *
 * Vị trí được lưu thành CẠNH + TỈ LỆ DỌC CẠNH, không phải toạ độ x/y tuyệt đối. Lưu x/y
 * thì đổi cỡ cửa sổ (hoặc xoay điện thoại) là bong bóng rơi ra ngoài khung nhìn hoặc dạt
 * vào giữa màn hình, chắn nội dung — đúng thứ mà một widget nổi không được phép làm.
 * Với cạnh + tỉ lệ, nó luôn bám đúng cạnh người dùng đã thả, ở đúng phần trăm chiều dài đó.
 *
 * Props:
 *  - isThinking   đang có lượt trả lời chảy về: vẽ vòng xoay thay cho icon.
 *  - unseenReply  đã trả lời xong nhưng người dùng chưa mở ra xem: chấm báo ở góc.
 *  - label        nhãn cho `title` + `aria-label` (đã dịch sẵn ở phía gọi).
 *  - onRestore    bấm (KHÔNG phải kéo) thì mở lại khung chat.
 */

// Vị trí được nhớ qua các phiên: đổi chỗ bong bóng là một lựa chọn của người dùng, không
// phải trạng thái tạm — bắt họ kéo lại sau mỗi lần F5 thì tính năng này vô nghĩa.
const STORAGE_KEY = 'driver:aiBubblePos';

const SIZE = 56; // px — khớp với w-14/h-14 bên dưới; JS cần con số để kẹp toạ độ.
const MARGIN = 12; // px — khoảng hở với mép màn hình, bằng `right-3` của bản trước.
// Ngưỡng phân biệt BẤM với KÉO. Ngón tay trên cảm ứng luôn trượt vài pixel trong một cú
// chạm, nên không có ngưỡng thì mọi cú bấm mở lại panel đều bị hiểu nhầm thành kéo.
const DRAG_SLOP = 4; // px

const DEFAULT_POS = { edge: 'right', ratio: 0.5 };

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
// Quãng đường bong bóng được phép trượt dọc một cạnh, sau khi đã trừ hai đầu chừa lề.
const spanOf = (viewport) => Math.max(viewport - SIZE - MARGIN * 2, 0);

function readStoredPos() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_POS;
        const parsed = JSON.parse(raw);
        if (!['left', 'right', 'top', 'bottom'].includes(parsed?.edge)) return DEFAULT_POS;
        return { edge: parsed.edge, ratio: clamp(Number(parsed.ratio) || 0, 0, 1) };
    } catch {
        // localStorage có thể ném (chế độ riêng tư, trình duyệt chặn cookie bên thứ ba
        // trong iframe). Mất vị trí đã lưu không phải lý do để bong bóng biến mất.
        return DEFAULT_POS;
    }
}

/** Cạnh + tỉ lệ → toạ độ góc trên-trái, theo cỡ khung nhìn hiện tại. */
function posToPoint(pos, vw, vh) {
    const alongX = MARGIN + spanOf(vw) * pos.ratio;
    const alongY = MARGIN + spanOf(vh) * pos.ratio;
    switch (pos.edge) {
        case 'left':
            return { x: MARGIN, y: alongY };
        case 'top':
            return { x: alongX, y: MARGIN };
        case 'bottom':
            return { x: alongX, y: vh - SIZE - MARGIN };
        default:
            return { x: vw - SIZE - MARGIN, y: alongY };
    }
}

/**
 * Toạ độ thả tay → cạnh gần nhất + tỉ lệ dọc cạnh đó.
 *
 * Hút về cạnh chứ không để bong bóng đứng giữa màn hình: giữa màn hình là chỗ của nội
 * dung, và một nút tròn nằm đó sẽ che mất đúng thứ người dùng đang đọc để hỏi AI.
 */
function pointToPos(x, y, vw, vh) {
    const distances = {
        left: x - MARGIN,
        right: vw - SIZE - MARGIN - x,
        top: y - MARGIN,
        bottom: vh - SIZE - MARGIN - y,
    };
    const edge = Object.keys(distances).reduce((best, key) =>
        distances[key] < distances[best] ? key : best,
    );
    const ratio =
        edge === 'left' || edge === 'right'
            ? (y - MARGIN) / (spanOf(vh) || 1)
            : (x - MARGIN) / (spanOf(vw) || 1);
    return { edge, ratio: clamp(ratio, 0, 1) };
}

export default function AiBubble({ isThinking, unseenReply, label, onRestore }) {
    const [pos, setPos] = useState(readStoredPos);
    const [viewport, setViewport] = useState(() => ({
        w: window.innerWidth,
        h: window.innerHeight,
    }));
    // Toạ độ thô trong lúc ngón tay/con trỏ còn đang giữ. Khác null nghĩa là ĐANG KÉO:
    // lúc đó bong bóng đi theo con trỏ chứ không theo cạnh, và tắt transition để nó không
    // lê lết phía sau con trỏ.
    const [drag, setDrag] = useState(null);

    // Khoảng cách từ điểm bấm tới góc bong bóng — giữ nguyên suốt cú kéo, nếu không thì
    // bong bóng sẽ nhảy sao cho góc trên-trái trùng con trỏ ngay ở pixel đầu tiên.
    const grabOffset = useRef({ x: 0, y: 0 });
    // Điểm con trỏ lúc bấm xuống — mốc để đo "đã đi đủ xa để gọi là kéo chưa". Phải so
    // với ĐIỂM BẮT ĐẦU, không phải với vị trí ở khung hình trước: kéo chậm thì mỗi bước
    // chỉ nhích 1-2px, so với bước trước sẽ không bao giờ vượt ngưỡng.
    const startRef = useRef({ x: 0, y: 0 });
    // Đã vượt DRAG_SLOP chưa. Dùng ref chứ không phải state: `onClick` chạy ngay sau
    // `pointerup` trong cùng một nhịp, không kịp đọc một state vừa set.
    const movedRef = useRef(false);

    useEffect(() => {
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const handlePointerDown = useCallback(
        (event) => {
            // Chỉ nút trái/chạm. Chuột phải trên bong bóng phải để dành cho menu trình duyệt.
            if (event.button !== 0) return;
            const point = posToPoint(pos, viewport.w, viewport.h);
            grabOffset.current = { x: event.clientX - point.x, y: event.clientY - point.y };
            startRef.current = { x: event.clientX, y: event.clientY };
            movedRef.current = false;
            // Bắt con trỏ: kéo nhanh ra ngoài cửa sổ hay lướt qua một iframe (khung xem
            // trước tài liệu) vẫn nhận đủ `pointermove`/`pointerup`, nên bong bóng không
            // bị "dính" vào tay ở giữa màn hình.
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDrag(point);
        },
        [pos, viewport.w, viewport.h],
    );

    const handlePointerMove = useCallback(
        (event) => {
            if (!drag) return;
            const x = clamp(event.clientX - grabOffset.current.x, MARGIN, viewport.w - SIZE - MARGIN);
            const y = clamp(event.clientY - grabOffset.current.y, MARGIN, viewport.h - SIZE - MARGIN);
            if (
                Math.abs(event.clientX - startRef.current.x) > DRAG_SLOP ||
                Math.abs(event.clientY - startRef.current.y) > DRAG_SLOP
            ) {
                movedRef.current = true;
            }
            setDrag({ x, y });
        },
        [drag, viewport.w, viewport.h],
    );

    const handlePointerUp = useCallback(
        (event) => {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            if (drag && movedRef.current) {
                const next = pointToPos(drag.x, drag.y, viewport.w, viewport.h);
                setPos(next);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                } catch {
                    // Không lưu được thì vị trí chỉ sống trong phiên này — vẫn dùng được.
                }
            }
            setDrag(null);
        },
        [drag, viewport.w, viewport.h],
    );

    const handleClick = useCallback(() => {
        // Vừa kéo xong thì cú click kết thúc cú kéo, không phải lệnh mở panel.
        if (movedRef.current) {
            movedRef.current = false;
            return;
        }
        onRestore?.();
    }, [onRestore]);

    const point = drag ?? posToPoint(pos, viewport.w, viewport.h);

    return (
        <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleClick}
            title={label}
            aria-label={label}
            style={{
                left: point.x,
                top: point.y,
                // `touch-action: none` là thứ khiến kéo hoạt động trên cảm ứng: không có
                // nó, trình duyệt nuốt cử chỉ thành cuộn trang và `pointermove` tắt giữa chừng.
                touchAction: 'none',
                // Chỉ trượt mượt khi THẢ TAY (lúc hút về cạnh). Bật transition trong lúc
                // kéo thì bong bóng chạy sau con trỏ một nhịp, cảm giác như bị trễ.
                transition: drag ? 'none' : 'left 0.22s ease-out, top 0.22s ease-out',
            }}
            className={`fixed z-[60] w-14 h-14 rounded-full bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 shadow-xl flex items-center justify-center text-blue-600 dark:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 animate-fade-in select-none ${
                drag ? 'cursor-grabbing scale-105' : 'cursor-grab hover:scale-105'
            }`}
        >
            {/* Ba trạng thái, đọc được mà không cần mở ra: đang trả lời (vòng xoay),
                đã có câu trả lời chưa xem (chấm xanh), và bình thường.

                `ai-bubble-rainbow` (src/index.css) đổi `color` qua bảy sắc cầu vồng, và
                icon thừa hưởng bằng `currentColor` — nên vòng xoay lúc đang nghĩ cũng
                đổi màu y hệt, không cần lớp thứ hai. */}
            {isThinking ? (
                <Loader2 className="w-7 h-7 animate-spin ai-bubble-rainbow" />
            ) : (
                <Sparkles className="w-7 h-7 ai-bubble-rainbow" />
            )}
            {!isThinking && unseenReply && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 ring-2 ring-white dark:ring-[#282a2c]" />
            )}
        </button>
    );
}
