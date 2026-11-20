import { useEffect, useLayoutEffect, useRef } from 'react';
import { glideItems, revealItems } from '../utils/motion';

/** Toạ độ góc trên-trái của `el` so với khung chứa (`origin` = rect của khung). */
const offsetIn = (el, origin) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top };
};

/** Quá chừng này mục thì bỏ hoạt ảnh: đo + tạo vài trăm animation không đáng cho một cú lướt. */
const MAX_ITEMS = 120;

/**
 * Hoạt ảnh cho một danh sách mục có khoá (lưới thẻ tệp, hàng bảng) — 20/11/2026.
 *
 * - Lần đầu danh sách hiện ra (sau skeleton, đổi chế độ xem): các mục rõ dần lệch nhịp.
 * - Danh sách đổi (xoá, tạo mới, sắp xếp, tải lên xong, lọc): mục còn lại LƯỚT từ chỗ cũ tới chỗ
 *   mới (FLIP), mục mới rõ dần. Mục bị xoá thì React đã gỡ khỏi DOM — chỉ những mục còn lại
 *   lấp chỗ trống một cách êm.
 * - Đổi gần hết (sang thư mục khác mà dữ liệu có sẵn): coi như danh sách mới, hiện dần.
 *
 * Con TRỰC TIẾP thứ i của `ref` là mục `keys[i]` (React dựng đúng thứ tự mảng). Vị trí đo TƯƠNG
 * ĐỐI với chính khung chứa — cuộn trang hay khối phía trên (nhóm Thư mục) xuất hiện/biến mất đều
 * dời cả khung lẫn mục nên không làm lệch. Đổi cỡ khung (số cột đổi) thì đo lại ngay, để lần đổi
 * sau không lướt từ vị trí cũ đã sai.
 *
 * @param {import('react').RefObject<HTMLElement>} ref khung chứa các mục
 * @param {Array<string|number>} keys khoá theo đúng thứ tự hiển thị
 */
export default function useListMotion(ref, keys) {
    /** @type {import('react').MutableRefObject<Map<string|number, {el: Element, x: number, y: number}>|null>} */
    const prevRef = useRef(null);
    const signature = keys.join('\u0001');

    useLayoutEffect(() => {
        const root = ref.current;
        if (!root) {
            prevRef.current = null;
            return;
        }
        const els = Array.from(root.children);
        if (els.length !== keys.length) {
            // Có phần tử lạ chen vào khung — không ghép được mục ↔ khoá thì thôi, không đoán.
            prevRef.current = null;
            return;
        }
        // Lần đổi trước còn đang lướt: dừng nó trước khi đo, nếu không vị trí đo được gồm cả phần
        // transform đang chạy. Chỉ huỷ animation tạo bằng script (WAAPI) — chuyển tiếp CSS của thẻ
        // (rê chuột…) để nguyên.
        for (const el of els) {
            for (const a of el.getAnimations()) {
                if (!(a instanceof CSSTransition) && !(a instanceof CSSAnimation)) a.cancel();
            }
        }
        const now = new Map();
        const origin = root.getBoundingClientRect();
        els.forEach((el, i) => now.set(keys[i], { el, ...offsetIn(el, origin) }));
        const before = prevRef.current;
        prevRef.current = now;
        if (els.length > MAX_ITEMS) return;

        if (!before || before.size === 0) {
            revealItems(els);
            return;
        }

        const moved = [];
        const entered = [];
        now.forEach((pos, key) => {
            const old = before.get(key);
            if (!old) {
                entered.push(pos.el);
                return;
            }
            const dx = old.x - pos.x;
            const dy = old.y - pos.y;
            if (dx || dy) moved.push([pos.el, dx, dy]);
        });
        if (entered.length > els.length * 0.6) {
            revealItems(els);
            return;
        }
        if (moved.length || entered.length) glideItems(moved, entered);
        // `signature` là đại diện của `keys`; chạy lại theo NỘI DUNG danh sách chứ không theo
        // danh tính mảng (mỗi lần render cha tạo mảng mới).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    // Đổi cỡ khung (cửa sổ co giãn, thanh bên thu/mở → số cột đổi): đo lại vị trí đã lưu. Khung có
    // thể bị gỡ rồi dựng lại (skeleton ↔ nội dung, rỗng ↔ có mục) nên mỗi lần commit kiểm tra
    // xem đang quan sát đúng phần tử chưa.
    const observerRef = useRef(null);
    useEffect(() => {
        const root = ref.current;
        const current = observerRef.current;
        if (current?.target === root) return;
        current?.ro.disconnect();
        observerRef.current = null;
        if (!root || typeof ResizeObserver === 'undefined') return;
        let frame = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const map = prevRef.current;
                if (!map || !root.isConnected) return;
                const origin = root.getBoundingClientRect();
                map.forEach((pos) => Object.assign(pos, offsetIn(pos.el, origin)));
            });
        });
        ro.observe(root);
        observerRef.current = { target: root, ro };
    });
    useEffect(() => () => observerRef.current?.ro.disconnect(), []);
}
