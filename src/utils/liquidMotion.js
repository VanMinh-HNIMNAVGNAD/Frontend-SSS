/**
 * Chuyển động kính lỏng — vật lý lò xo, không dùng CSS transition.
 *
 * Mỗi khối kính có BỐN lò xo, một cho mỗi mép (trái, phải, trên, dưới). Khi khối chuyển sang
 * mục khác, mép phía trước (mép DẪN) dùng lò xo cứng hơn mép phía sau (mép KÉO) một chút, nên
 * khối hơi thuôn ra theo hướng đi rồi tròn lại khi tới nơi — như một giọt nước được kéo trên mặt
 * kính, mà không phải "diễn" độ dãn bằng tay theo vận tốc.
 *
 * Thông số lò xo lấy theo cách Apple mô tả lò xo trong SwiftUI: `response` (thời gian một chu kỳ,
 * giây) và `dampingFraction` (tỉ lệ giảm chấn). `.smooth` của Apple là ~0.5 / 1.0, `.snappy`
 * ~0.3 / 0.85 — chuyển động "liquid glass" của iOS 26 nằm quanh 0.35–0.4 / 0.75–0.85: tới nơi
 * nhanh, nảy rất nhẹ một lần rồi dừng, không lắc lư.
 *
 * Vì sao không dùng `transition`: transition chạy theo một đường cong cố định từ đầu tới cuối,
 * nên rê chuột lướt qua 4 mục là 4 lần bắt đầu lại từ vận tốc 0 — giật cục. Lò xo giữ nguyên
 * vận tốc đang có khi đổi đích, nên lướt qua nhiều mục khối kính vẫn trôi một mạch.
 *
 * Mọi khối kính trên trang dùng chung MỘT vòng requestAnimationFrame, tự tắt khi tất cả đứng yên.
 */

/**
 * Lò xo theo thông số kiểu Apple.
 * @param {number} response Thời gian một chu kỳ dao động (giây) — nhỏ là nhanh.
 * @param {number} dampingFraction 1 = không nảy; < 1 = nảy nhẹ.
 */
function appleSpring(response, dampingFraction) {
    const omega = (2 * Math.PI) / response;
    return { k: omega * omega, c: 2 * dampingFraction * omega };
}

/**
 * Bộ lò xo dựng sẵn: `lead` cho mép phía trước, `trail` cho mép phía sau.
 * - SELECT: viên kính "đang chọn" khi đổi mục — có thời gian để thấy nó nhấc lên, trượt, đáp.
 * - HOVER:  vùng sáng theo chuột — phải bám tay, gần như không thuôn.
 */
export const SPRINGS = {
    SELECT: { lead: appleSpring(0.36, 0.78), trail: appleSpring(0.44, 0.86), maxStretch: 1.18 },
    HOVER: { lead: appleSpring(0.24, 0.86), trail: appleSpring(0.28, 0.9), maxStretch: 1.12 },
};

/** Bước tích phân cố định — đủ nhỏ để lò xo cứng không mất ổn định khi máy chậm, khung dài. */
const SUBSTEP = 1 / 240;
/** Dưới ngưỡng này (px, px/s) coi như đã đứng yên. */
const REST_DISTANCE = 0.05;
const REST_SPEED = 0.5;
const MIN_SQUEEZE = 0.6;

const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

// ── Vòng lặp dùng chung ─────────────────────────────────────────────────────

const moving = new Set();
let frame = 0;
let lastTime = 0;

function tick(now) {
    // Tab bị ẩn rồi quay lại thì `now - lastTime` có thể là vài giây: kẹp lại để khối kính không
    // "dịch chuyển tức thời" qua một bước tích phân khổng lồ.
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    for (const body of moving) {
        if (!body.step(dt)) moving.delete(body);
    }
    frame = moving.size ? requestAnimationFrame(tick) : 0;
}

function wake(body) {
    moving.add(body);
    if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
    }
}

// ── Một khối kính ───────────────────────────────────────────────────────────

/**
 * @typedef {{ l: number, t: number, r: number, b: number, radius: number }} LiquidBox
 *   Khung đích (px) và bán kính bo góc.
 */

export class LiquidBody {
    /**
     * @param {HTMLElement | HTMLElement[]} els Một hay nhiều phần tử đi CÙNG một hình dạng
     *   (viên kính dưới chữ + thấu kính trên chữ của LiquidGroup).
     * @param {object} [options]
     * @param {'scale'|'size'} [options.mode='scale'] Cách vẽ độ dãn khi đang trượt:
     *   `scale` — cỡ thật cố định theo đích, dãn bằng `transform: scale` (bản đồ khúc xạ dãn theo,
     *   luôn khớp); `size` — ghi thẳng width/height mỗi khung (góc bo luôn tròn đúng — cho vùng
     *   sáng hover, nơi không có khúc xạ).
     * @param {typeof SPRINGS.SELECT} [options.spring]
     * @param {(w: number, h: number, radius: number) => void} [options.onResize] Cỡ gốc đổi.
     * @param {() => void} [options.onRender] Sau mỗi khung hình.
     * @param {() => void} [options.onStart] Bắt đầu trượt sang đích mới (`glide`).
     * @param {() => void} [options.onSettle] Đã đứng yên.
     */
    constructor(els, options = {}) {
        this.els = Array.isArray(els) ? els : [els];
        this.mode = options.mode ?? 'scale';
        this.spring = options.spring ?? SPRINGS.SELECT;
        this.hooks = options;
        this.edges = { l: this.#edge(), r: this.#edge(), t: this.#edge(), b: this.#edge() };
        this.baseW = 0;
        this.baseH = 0;
        this.radius = -1;
        /** Khung đang vẽ (sau lò xo, trước khi thắt) — cho đốm sáng và clip của bên dùng. */
        this.current = { l: 0, t: 0, r: 0, b: 0 };
        this.placed = false;
        this.visible = false;
    }

    get isMoving() {
        return moving.has(this);
    }

    /** Đặt thẳng vào khung, không chuyển động (lần hiện đầu, đổi bố cục, giảm chuyển động). */
    snap(box) {
        for (const [edge, value] of this.#pairs(box)) {
            edge.x = edge.to = value;
            edge.v = 0;
        }
        const wasMoving = moving.delete(this);
        this.#setBase(box);
        this.placed = true;
        this.render();
        if (wasMoving) this.hooks.onSettle?.();
    }

    /** Trượt tới khung mới: mép phía trước dẫn, mép phía sau kéo theo. */
    glide(box) {
        if (!this.placed || reducedMotion?.matches) {
            this.snap(box);
            return;
        }
        const { l, r, t, b } = this.edges;
        const { lead, trail } = this.spring;
        const dx = box.l + box.r - (l.x + r.x);
        const dy = box.t + box.b - (t.x + b.x);
        Object.assign(r, dx < -0.5 ? trail : lead);
        Object.assign(l, dx > 0.5 ? trail : lead);
        Object.assign(b, dy < -0.5 ? trail : lead);
        Object.assign(t, dy > 0.5 ? trail : lead);
        this.hooks.onStart?.();
        this.retarget(box);
    }

    /** Đổi đích mà giữ nguyên vận tốc và vai dẫn/kéo — dùng khi bố cục xê dịch giữa chừng. */
    retarget(box) {
        for (const [edge, value] of this.#pairs(box)) edge.to = value;
        this.#setBase(box);
        wake(this);
    }

    /** Khung đích hiện tại có trùng `box` không (sai số dưới nửa pixel). */
    isAt(box) {
        return this.placed && this.#pairs(box).every(([edge, value]) => Math.abs(edge.to - value) < 0.5);
    }

    setVisible(visible, { instant = false } = {}) {
        this.visible = visible;
        for (const el of this.els) {
            if (instant) {
                // Lần hiện đầu tiên (trang vừa mở): bỏ qua hiệu ứng mờ dần — viên đang chọn có
                // ngay từ khung hình đầu như một cái nền tĩnh.
                el.style.transition = 'none';
                el.classList.toggle('is-visible', visible);
                void el.offsetWidth;
                el.style.transition = '';
            } else {
                el.classList.toggle('is-visible', visible);
            }
        }
    }

    /** Thêm/bỏ một class trên mọi phần tử của khối (`is-lifted`, `is-pressed`…). */
    toggleClass(name, on) {
        for (const el of this.els) el.classList.toggle(name, on);
    }

    /** Một bước mô phỏng; trả `false` khi đã đứng yên (vòng lặp bỏ khối này ra). */
    step(dt) {
        const edges = Object.values(this.edges);
        const n = Math.max(1, Math.ceil(dt / SUBSTEP));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            for (const e of edges) {
                const a = -e.k * (e.x - e.to) - e.c * e.v;
                e.v += a * h;
                e.x += e.v * h;
            }
        }
        this.#limitStretch(this.edges.t, this.edges.b, this.baseH);
        this.#limitStretch(this.edges.l, this.edges.r, this.baseW);

        const settled = edges.every(
            (e) => Math.abs(e.x - e.to) < REST_DISTANCE && Math.abs(e.v) < REST_SPEED,
        );
        if (settled) {
            for (const e of edges) {
                e.x = e.to;
                e.v = 0;
            }
        }
        this.render();
        if (settled) this.hooks.onSettle?.();
        return !settled;
    }

    render() {
        const { l, r, t, b } = this.edges;
        this.current = { l: l.x, t: t.x, r: r.x, b: b.x };

        if (this.mode === 'size') {
            const w = Math.max(0, r.x - l.x);
            const h = Math.max(0, b.x - t.x);
            for (const el of this.els) {
                el.style.translate = `${l.x}px ${t.x}px`;
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
            }
            this.hooks.onRender?.();
            return;
        }

        const w = this.baseW || 1;
        const h = this.baseH || 1;
        const fx = (r.x - l.x) / w;
        const fy = (b.x - t.x) / h;
        // Thuôn theo chiều này thì thắt nhẹ chiều kia — giọt nước giữ thể tích. Số mũ nhỏ: thắt
        // đúng theo thể tích (mũ 0.5) thì khối kính mảnh như sợi chỉ.
        const sx = fx / (fy > 1 ? fy ** 0.15 : 1);
        const sy = fy / (fx > 1 ? fx ** 0.15 : 1);
        const x = (l.x + r.x - w) / 2;
        const y = (t.x + b.x - h) / 2;
        const transform = Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 ? '' : `scale(${sx}, ${sy})`;
        for (const el of this.els) {
            el.style.translate = `${x}px ${y}px`;
            el.style.transform = transform;
        }
        this.hooks.onRender?.();
    }

    #edge() {
        return { x: 0, v: 0, to: 0, ...this.spring.lead };
    }

    #pairs(box) {
        const { l, r, t, b } = this.edges;
        return [[l, box.l], [r, box.r], [t, box.t], [b, box.b]];
    }

    /**
     * Cỡ gốc = cỡ của đích. Chế độ `scale` đặt width/height thật theo đích (góc bo luôn tròn đúng
     * khi đứng yên); chế độ `size` tự ghi width/height mỗi khung nên chỉ cần bán kính.
     */
    #setBase(box) {
        const w = Math.max(1, box.r - box.l);
        const h = Math.max(1, box.b - box.t);
        const radius = Math.max(0, box.radius ?? 0);
        if (Math.abs(w - this.baseW) < 0.5 && Math.abs(h - this.baseH) < 0.5 && radius === this.radius) return;
        this.baseW = w;
        this.baseH = h;
        this.radius = radius;
        for (const el of this.els) {
            if (this.mode === 'scale') {
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
            }
            el.style.borderRadius = `${radius}px`;
        }
        this.hooks.onResize?.(w, h, radius);
    }

    /** Kẹp độ dài trong [MIN_SQUEEZE, maxStretch] lần cỡ gốc bằng cách kéo MÉP SAU lại. */
    #limitStretch(a, b, base) {
        if (!base) return;
        const max = this.spring.maxStretch;
        const len = b.x - a.x;
        const trailing = a.k < b.k ? a : b.k < a.k ? b : null;
        if (len > base * max) {
            if (trailing === a) a.x = b.x - base * max;
            else b.x = a.x + base * max;
        } else if (len < base * MIN_SQUEEZE) {
            const mid = (a.x + b.x) / 2;
            a.x = mid - (base * MIN_SQUEEZE) / 2;
            b.x = mid + (base * MIN_SQUEEZE) / 2;
        }
    }
}
