import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { LiquidBody } from '../../utils/liquidMotion';
import { canRefract, displacementMap } from '../../utils/liquidRefraction';

const ITEM_SELECTOR = '[data-liquid-key]';
/** Chuột rời khỏi mọi mục (rơi vào khe, vạch ngăn, menu con) bao lâu thì giọt mới tan. */
const HIDE_DELAY = 140;
/** Giọt vừa tan dưới chừng này ms mà chuột quay lại: trượt tiếp từ chỗ cũ thay vì hiện lại. */
const REJOIN_WINDOW = 180;

/** Mục thuộc ĐÚNG nhóm này (không phải của một nhóm lồng bên trong, như menu con). */
function ownItem(group, node) {
    const item = node instanceof Element ? node.closest(ITEM_SELECTOR) : null;
    if (!item || item.closest('[data-liquid-group]') !== group) return null;
    return item;
}

function findItem(group, key) {
    for (const item of group.querySelectorAll(ITEM_SELECTOR)) {
        if (item.dataset.liquidKey === key && item.closest('[data-liquid-group]') === group) return item;
    }
    return null;
}

function isDisabled(item) {
    return item.disabled || item.getAttribute('aria-disabled') === 'true';
}

/** Tỉ lệ co giãn hiện tại của nhóm (menu đang chạy hiệu ứng `animate-glass-in` 0.96 → 1). */
function groupScale(group, rect) {
    return [
        group.offsetWidth ? rect.width / group.offsetWidth : 1,
        group.offsetHeight ? rect.height / group.offsetHeight : 1,
    ];
}

/**
 * Khung của `item` trong hệ toạ độ mà giọt (`absolute` trong nhóm) dùng: tính từ khung đệm của
 * nhóm, cộng phần đã cuộn — giọt nằm trong nội dung cuộn nên cuộn theo nội dung.
 */
function measure(group, item) {
    const g = group.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const [sx, sy] = groupScale(group, g);
    const l = (r.left - g.left) / sx - group.clientLeft + group.scrollLeft;
    const t = (r.top - g.top) / sy - group.clientTop + group.scrollTop;
    const w = r.width / sx;
    const h = r.height / sy;
    const radius = Math.min(parseFloat(getComputedStyle(item).borderTopLeftRadius) || 0, w / 2, h / 2);
    return { l, t, r: l + w, b: t + h, radius };
}

/**
 * Nhóm lựa chọn kiểu Liquid Glass: thanh bên, tab, nút phân đoạn, menu.
 *
 * Mỗi mục là một phần tử con (sâu bao nhiêu cũng được) mang `data-liquid-key="…"`. Nhóm vẽ hai
 * giọt kính:
 *   • VIÊN ĐANG CHỌN (khi có `activeKey`) — nằm dưới chữ, TRƯỢT sang mục mới khi đổi lựa chọn.
 *     Mục không cần tự tô nền "đang chọn" nữa, chỉ đổi màu chữ/icon như cũ.
 *   • GIỌT NƯỚC theo chuột — trong suốt, nằm trên chữ, lướt mềm giữa các mục khi rê chuột
 *     (bút cảm ứng cũng vậy; ngón tay thì không). Trên Chromium giọt còn khúc xạ: phần nền và
 *     chữ dưới mép giọt bị bẻ cong như nhìn qua giọt nước (utils/liquidRefraction.js).
 *     Theo cả tiêu điểm bàn phím (Tab), nên người dùng bàn phím cũng thấy mình đang ở đâu.
 *
 * Mục bị vô hiệu (`disabled` / `aria-disabled="true"`) không nhận giọt. `data-liquid-tone=
 * "danger"` cho giọt ánh đỏ (Xoá vĩnh viễn, Chuyển vào thùng rác…).
 *
 * Phần tử nhóm tự có `position: relative` + `isolation: isolate` (lớp `components`, nên
 * `fixed`/`absolute` truyền qua `className` vẫn thắng). Mọi prop khác (onClick, style, role,
 * ref…) được chuyển nguyên cho phần tử nhóm.
 *
 * @param {object} props
 * @param {string} [props.as='div'] Thẻ HTML của nhóm (`nav`, `div`…)
 * @param {string|null} [props.activeKey] Khoá của mục đang chọn; bỏ trống nếu nhóm không có
 *   khái niệm "đang chọn" (menu)
 */
export default function LiquidGroup({ as: Tag = 'div', activeKey = null, className = '', ref, children, ...rest }) {
    const groupRef = useRef(null);
    const pillRef = useRef(null);
    const dropRef = useRef(null);
    const feImageRef = useRef(null);
    const feMapRef = useRef(null);
    const bodiesRef = useRef(null);
    const lastActiveKeyRef = useRef(undefined);
    // `useId` trả về ký tự như «» hoặc : — không hợp lệ trong `url(#…)` nếu không escape.
    const filterId = `liquid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const setGroupRef = useCallback(
        (el) => {
            groupRef.current = el;
            if (typeof ref === 'function') return ref(el);
            if (ref) ref.current = el;
            return undefined;
        },
        [ref],
    );

    /** Hai giọt, tạo lần đầu cần tới (chỉ gọi trong effect, khi ref đã có phần tử). */
    const getBodies = useCallback(() => {
        if (!bodiesRef.current) {
            const drop = new LiquidBody(dropRef.current, {
                // Giọt đổi cỡ (sang mục to/nhỏ hơn) thì bản đồ khúc xạ phải vẽ lại cho đúng cỡ.
                onResize: (w, h, radius) => {
                    if (!canRefract || !feImageRef.current) return;
                    const map = displacementMap(w, h, radius);
                    feImageRef.current.setAttribute('width', map.width);
                    feImageRef.current.setAttribute('height', map.height);
                    feImageRef.current.setAttribute('href', map.url);
                    feMapRef.current?.setAttribute('scale', map.scale);
                },
            });
            bodiesRef.current = { pill: new LiquidBody(pillRef.current), drop };
        }
        return bodiesRef.current;
    }, []);

    // ── Viên đang chọn ─────────────────────────────────────────────────────
    // Không có mảng phụ thuộc: chạy sau MỌI lần render, vì mục có thể dời chỗ mà `activeKey`
    // không đổi (danh sách nhãn nạp xong chèn thêm hàng phía trên "Thùng rác"…). Mỗi lần chỉ
    // tốn hai lần đo khung; trùng chỗ cũ thì không làm gì.
    useLayoutEffect(() => {
        const group = groupRef.current;
        const { pill } = getBodies();
        const item = activeKey == null ? null : findItem(group, activeKey);
        const keyChanged = lastActiveKeyRef.current !== activeKey;
        lastActiveKeyRef.current = activeKey;

        if (!item) {
            if (pill.visible) pill.setVisible(false);
            pill.placed = false;
            return;
        }

        const box = measure(group, item);
        if (keyChanged && pill.visible) pill.glide(box);
        else if (pill.isMoving) pill.retarget(box);
        else if (!pill.isAt(box)) pill.snap(box);

        if (!pill.visible) pill.setVisible(true, { instant: true });
    });

    // ── Bám theo bố cục: thu/mở thanh bên, đổi cỡ cửa sổ, phông chữ nạp xong ──
    useEffect(() => {
        const group = groupRef.current;
        let frame = 0;
        const resync = () => {
            frame = 0;
            const { pill, drop } = getBodies();
            const sync = (body, key) => {
                const item = key == null ? null : findItem(group, key);
                if (!item || !body.placed) return;
                const box = measure(group, item);
                if (body.isMoving) body.retarget(box);
                else if (!body.isAt(box)) body.snap(box);
            };
            sync(pill, lastActiveKeyRef.current);
            if (drop.visible) sync(drop, drop.el.dataset.key);
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
    }, [getBodies]);

    // ── Giọt nước theo chuột / tiêu điểm bàn phím ─────────────────────────
    useEffect(() => {
        const group = groupRef.current;
        const { drop } = getBodies();
        let hideTimer = 0;
        let hiddenAt = -Infinity;
        let pointer = null;
        let pointerInside = false;
        let spotFrame = 0;

        // Đốm sáng trong giọt đi theo đúng chỗ con trỏ (toạ độ trong khung gốc của giọt).
        const updateSpot = () => {
            spotFrame = 0;
            if (!pointer || !drop.visible) return;
            const g = group.getBoundingClientRect();
            const [sx, sy] = groupScale(group, g);
            const x = (pointer.x - g.left) / sx - group.clientLeft + group.scrollLeft - drop.x;
            const y = (pointer.y - g.top) / sy - group.clientTop + group.scrollTop - drop.y;
            drop.el.style.setProperty('--mx', `${x}px`);
            drop.el.style.setProperty('--my', `${y}px`);
        };
        drop.hooks.onRender = updateSpot;
        const scheduleSpot = () => {
            if (!spotFrame) spotFrame = requestAnimationFrame(updateSpot);
        };

        const cancelHide = () => {
            clearTimeout(hideTimer);
            hideTimer = 0;
        };

        const hide = () => {
            cancelHide();
            if (!drop.visible) return;
            drop.setVisible(false);
            drop.el.classList.remove('is-pressed');
            drop.el.dataset.key = '';
            hiddenAt = performance.now();
        };

        const hideSoon = () => {
            if (drop.visible && !hideTimer) hideTimer = setTimeout(hide, HIDE_DELAY);
        };

        const show = (item) => {
            cancelHide();
            const key = item.dataset.liquidKey;
            if (drop.visible && drop.el.dataset.key === key) return;
            drop.el.dataset.key = key;
            drop.el.dataset.tone = item.dataset.liquidTone || '';
            const box = measure(group, item);
            // Đang hiện, hoặc vừa tan chưa kịp hết: trượt tiếp. Còn lại thì hiện ngay tại mục.
            if (drop.visible || performance.now() - hiddenAt < REJOIN_WINDOW) drop.glide(box);
            else drop.snap(box);
            if (!drop.visible) drop.setVisible(true);
            updateSpot();
        };

        const track = (target) => {
            const item = ownItem(group, target);
            if (item && !isDisabled(item)) show(item);
            else hideSoon();
        };

        const onPointerMove = (e) => {
            if (e.pointerType === 'touch') return;
            pointer = { x: e.clientX, y: e.clientY };
            pointerInside = true;
            track(e.target);
            scheduleSpot();
        };
        const onPointerLeave = (e) => {
            if (e.pointerType === 'touch') return;
            pointerInside = false;
            pointer = null;
            hide();
        };
        const onPointerDown = (e) => {
            if (e.pointerType !== 'touch' && drop.visible) drop.el.classList.add('is-pressed');
        };
        const onPointerUp = () => drop.el.classList.remove('is-pressed');
        const onFocusIn = (e) => {
            const item = ownItem(group, e.target);
            if (item && !isDisabled(item) && item.matches(':focus-visible')) show(item);
        };
        const onFocusOut = (e) => {
            if (!pointerInside && !group.contains(e.relatedTarget)) hide();
        };
        // Cuộn dưới con trỏ đứng yên: mục dưới con trỏ đã khác. `capture` để bắt cả khung cuộn
        // lồng bên trong nhóm (danh sách nhãn trong menu con…).
        const onScroll = () => {
            if (pointer) track(document.elementFromPoint(pointer.x, pointer.y));
        };

        group.addEventListener('pointermove', onPointerMove);
        group.addEventListener('pointerleave', onPointerLeave);
        group.addEventListener('pointerdown', onPointerDown);
        group.addEventListener('pointerup', onPointerUp);
        group.addEventListener('pointercancel', onPointerUp);
        group.addEventListener('focusin', onFocusIn);
        group.addEventListener('focusout', onFocusOut);
        group.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => {
            group.removeEventListener('pointermove', onPointerMove);
            group.removeEventListener('pointerleave', onPointerLeave);
            group.removeEventListener('pointerdown', onPointerDown);
            group.removeEventListener('pointerup', onPointerUp);
            group.removeEventListener('pointercancel', onPointerUp);
            group.removeEventListener('focusin', onFocusIn);
            group.removeEventListener('focusout', onFocusOut);
            group.removeEventListener('scroll', onScroll, { capture: true });
            cancelHide();
            cancelAnimationFrame(spotFrame);
            drop.hooks.onRender = undefined;
        };
    }, [getBodies]);

    return (
        <Tag ref={setGroupRef} data-liquid-group="" className={`liquid-group ${className}`} {...rest}>
            <span ref={pillRef} aria-hidden="true" className="liquid-pill" />
            <span
                ref={dropRef}
                aria-hidden="true"
                className="liquid-drop"
                style={canRefract ? { backdropFilter: `url(#${filterId}) saturate(1.35)` } : undefined}
            />
            {canRefract && (
                <svg aria-hidden="true" className="liquid-defs" focusable="false">
                    {/* sRGB: mặc định linearRGB sẽ đổi giá trị 128 ("đứng yên") thành một độ lệch. */}
                    <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
                        <feImage ref={feImageRef} x="0" y="0" preserveAspectRatio="none" result="map" />
                        <feDisplacementMap
                            ref={feMapRef}
                            in="SourceGraphic"
                            in2="map"
                            scale="0"
                            xChannelSelector="R"
                            yChannelSelector="G"
                        />
                    </filter>
                </svg>
            )}
            {children}
        </Tag>
    );
}
