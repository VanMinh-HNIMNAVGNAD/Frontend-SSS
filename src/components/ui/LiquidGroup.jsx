import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { LiquidBody, SPRINGS } from '../../utils/liquidMotion';

const ITEM_SELECTOR = '[data-liquid-key]';

function findItem(group, key) {
    for (const item of group.querySelectorAll(ITEM_SELECTOR)) {
        if (item.dataset.liquidKey === key && item.closest('[data-liquid-group]') === group) return item;
    }
    return null;
}

/**
 * Khung của `item` trong hệ toạ độ mà viên kính (`absolute` trong nhóm) dùng: tính từ khung đệm
 * của nhóm, cộng phần đã cuộn — viên kính nằm trong nội dung cuộn nên cuộn theo nội dung. Chia
 * cho tỉ lệ co giãn hiện tại của nhóm (hộp thoại đang chạy hiệu ứng `animate-glass-in` 0.96 → 1).
 */
function measure(group, item) {
    const g = group.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const sx = group.offsetWidth ? g.width / group.offsetWidth : 1;
    const sy = group.offsetHeight ? g.height / group.offsetHeight : 1;
    const l = (r.left - g.left) / sx - group.clientLeft + group.scrollLeft;
    const t = (r.top - g.top) / sy - group.clientTop + group.scrollTop;
    const w = r.width / sx;
    const h = r.height / sy;
    const radius = Math.min(parseFloat(getComputedStyle(item).borderTopLeftRadius) || 0, w / 2, h / 2);
    return { l, t, r: l + w, b: t + h, radius };
}

/**
 * Nhóm lựa chọn kiểu Liquid Glass (iOS 26): thanh bên, tab, nút phân đoạn.
 *
 * Mỗi mục là một phần tử con (sâu bao nhiêu cũng được) mang `data-liquid-key="…"`. Mục đang chọn
 * (`activeKey`) có một VIÊN KÍNH nằm dưới chữ — mục không tự tô nền "đang chọn" nữa, chỉ đổi màu
 * chữ/icon như cũ. Khi đổi lựa chọn, viên kính:
 *   1. NHẤC LÊN — phóng nhẹ, và một lớp kính trong (viền sáng, tăng độ bão hoà màu phía sau) hiện
 *      lên trên chữ;
 *   2. TRƯỢT sang mục mới bằng lò xo, hơi thuôn theo hướng đi (utils/liquidMotion.js);
 *   3. ĐÁP xuống — lớp kính trong tan, viên kính lún nhẹ rồi nảy về đúng cỡ.
 *
 * Lớp kính trong KHÔNG bẻ cong chữ. Bản trước có khúc xạ (SVG feDisplacementMap) ở đây, nhưng
 * chữ của các mục mà nó trượt qua bị nén/kéo méo — trông như lỗi. Apple chỉ bẻ cong nội dung
 * khi người dùng NHẤN GIỮ rồi kéo viên chọn; chạm/bấm để đổi tab thì viên kính chỉ trượt và nảy.
 *
 * Hover KHÔNG nằm ở đây: một khối kính hover chung cho cả ứng dụng (utils/liquidHover.js) tự trượt
 * giữa các mục, và tự bỏ qua mục đang chọn (`aria-current` / `aria-pressed` / `aria-selected`) —
 * nên mục đang chọn nhớ đặt một trong ba thuộc tính đó.
 *
 * Phần tử nhóm tự có `position: relative` + `isolation: isolate` (lớp `components`, nên
 * `fixed`/`absolute` truyền qua `className` vẫn thắng). Mọi prop khác (onClick, style, role, ref…)
 * được chuyển nguyên cho phần tử nhóm.
 *
 * @param {object} props
 * @param {string} [props.as='div'] Thẻ HTML của nhóm (`nav`, `div`…)
 * @param {string|null} [props.activeKey] Khoá của mục đang chọn
 */
export default function LiquidGroup({ as: Tag = 'div', activeKey = null, className = '', ref, children, ...rest }) {
    const groupRef = useRef(null);
    const pillRef = useRef(null);
    const lensRef = useRef(null);
    const bodyRef = useRef(null);
    const lastActiveKeyRef = useRef(undefined);

    const setGroupRef = useCallback(
        (el) => {
            groupRef.current = el;
            if (typeof ref === 'function') return ref(el);
            if (ref) ref.current = el;
            return undefined;
        },
        [ref],
    );

    /** Viên kính + thấu kính đi chung một hình dạng; tạo lần đầu cần tới (chỉ trong effect). */
    const getBody = useCallback(() => {
        if (!bodyRef.current) {
            const body = new LiquidBody([pillRef.current, lensRef.current], {
                spring: SPRINGS.SELECT,
                onStart: () => body.toggleClass('is-lifted', true),
                onSettle: () => body.toggleClass('is-lifted', false),
            });
            bodyRef.current = body;
        }
        return bodyRef.current;
    }, []);

    // Không có mảng phụ thuộc: chạy sau MỌI lần render, vì mục có thể dời chỗ mà `activeKey` không
    // đổi (danh sách nhãn nạp xong chèn thêm hàng phía trên "Thùng rác"…). Mỗi lần chỉ tốn hai lần
    // đo khung; trùng chỗ cũ thì không làm gì.
    useLayoutEffect(() => {
        const group = groupRef.current;
        const body = getBody();
        const item = activeKey == null ? null : findItem(group, activeKey);
        const keyChanged = lastActiveKeyRef.current !== activeKey;
        lastActiveKeyRef.current = activeKey;

        if (!item) {
            if (body.visible) body.setVisible(false);
            body.placed = false;
            return;
        }

        const box = measure(group, item);
        if (keyChanged && body.visible) body.glide(box);
        else if (body.isMoving) body.retarget(box);
        else if (!body.isAt(box)) body.snap(box);

        if (!body.visible) body.setVisible(true, { instant: true });
    });

    // Bám theo bố cục: thu/mở thanh bên, đổi cỡ cửa sổ, phông chữ nạp xong.
    useEffect(() => {
        const group = groupRef.current;
        let frame = 0;
        const resync = () => {
            frame = 0;
            const body = getBody();
            const key = lastActiveKeyRef.current;
            const item = key == null ? null : findItem(group, key);
            if (!item || !body.placed) return;
            const box = measure(group, item);
            if (body.isMoving) body.retarget(box);
            else if (!body.isAt(box)) body.snap(box);
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(resync);
        };

        const observer = new ResizeObserver(schedule);
        observer.observe(group);
        document.fonts?.ready.then(schedule);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [getBody]);

    return (
        <Tag ref={setGroupRef} data-liquid-group="" className={`liquid-group ${className}`} {...rest}>
            <span ref={pillRef} aria-hidden="true" className="liquid-pill" />
            <span ref={lensRef} aria-hidden="true" className="liquid-lens" />
            {children}
        </Tag>
    );
}
