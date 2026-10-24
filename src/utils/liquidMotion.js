/**
 * Chuyển động "giọt nước" cho LiquidGroup — vật lý lò xo, không dùng CSS transition.
 *
 * Mỗi giọt có BỐN lò xo, một cho mỗi mép (trái, phải, trên, dưới). Khi giọt chuyển sang mục
 * khác, mép ở phía trước (mép DẪN) dùng lò xo cứng — đi nhanh, hơi vượt đích một chút rồi bật
 * lại; mép phía sau (mép KÉO) dùng lò xo mềm hơn — đi chậm. Nhờ vậy giọt TỰ KÉO DÀI ra khi
 * đang trượt và co tròn lại khi tới nơi, đúng như một giọt nước bị kéo trên mặt kính, mà không
 * phải "diễn" độ dãn bằng tay theo vận tốc.
 *
 * Vì sao không dùng `transition: transform`: transition chạy theo một đường cong cố định từ
 * điểm đầu tới điểm cuối, nên rê chuột lướt nhanh qua 4 mục là 4 lần bắt đầu lại từ vận tốc 0
 * — giọt giật cục. Lò xo giữ nguyên vận tốc đang có khi đổi đích, nên lướt qua nhiều mục giọt
 * vẫn trôi một mạch.
 *
 * Mọi giọt trên trang dùng chung MỘT vòng requestAnimationFrame, và vòng đó tự tắt khi không
 * còn giọt nào đang chuyển động.
 */

/** Mép dẫn: cứng, hơi vượt đích (ζ < 1) cho cảm giác nảy nhẹ của chất lỏng. */
const LEAD = spring(360, 0.74);
/** Mép kéo: mềm và gần như không vượt — giọt "kéo đuôi" theo sau. */
const TRAIL = spring(175, 0.88);
/** Bước tích phân cố định — đủ nhỏ để lò xo cứng không mất ổn định khi máy chậm, khung dài. */
const SUBSTEP = 1 / 240;
/** Dưới ngưỡng này (px, px/s) coi như đã đứng yên. */
const REST_DISTANCE = 0.05;
const REST_SPEED = 0.5;
/** Giọt dài tối đa bằng chừng này lần cỡ gốc — nhảy xa từ đầu xuống cuối thanh bên vẫn chỉ
 * là một giọt hơi thuôn, không thành một vệt dài nửa màn hình. */
const MAX_STRETCH = 1.9;
const MIN_SQUEEZE = 0.55;

function spring(stiffness, dampingRatio) {
    return { k: stiffness, c: 2 * dampingRatio * Math.sqrt(stiffness) };
}

const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

// ── Vòng lặp dùng chung ─────────────────────────────────────────────────────

const moving = new Set();
let frame = 0;
let lastTime = 0;

function tick(now) {
    // Tab bị ẩn rồi quay lại thì `now - lastTime` có thể là vài giây: kẹp lại để giọt không
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

// ── Một giọt ────────────────────────────────────────────────────────────────

function makeEdge() {
    return { x: 0, v: 0, to: 0, ...LEAD };
}

/**
 * @typedef {{ l: number, t: number, r: number, b: number, radius: number }} LiquidBox
 *   Khung đích (px, trong hệ toạ độ của nhóm) và bán kính bo góc của mục.
 */

export class LiquidBody {
    /**
     * @param {HTMLElement} el Phần tử giọt (`.liquid-pill` / `.liquid-drop`)
     * @param {{ onResize?: (w: number, h: number, radius: number) => void, onRender?: () => void }} [hooks]
     *   `onResize` — cỡ gốc đổi (bản đồ khúc xạ phải vẽ lại); `onRender` — sau mỗi khung hình.
     */
    constructor(el, hooks = {}) {
        this.el = el;
        this.hooks = hooks;
        this.edges = { l: makeEdge(), r: makeEdge(), t: makeEdge(), b: makeEdge() };
        this.baseW = 0;
        this.baseH = 0;
        this.radius = -1;
        /** Vị trí góc trên-trái của khung gốc (chưa tính kéo dãn) — để tính đốm sáng trong giọt. */
        this.x = 0;
        this.y = 0;
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
        moving.delete(this);
        this.#setBase(box);
        this.placed = true;
        this.render();
    }

    /** Trượt tới khung mới: mép phía trước dẫn, mép phía sau kéo theo. */
    glide(box) {
        if (!this.placed || reducedMotion?.matches) {
            this.snap(box);
            return;
        }
        const { l, r, t, b } = this.edges;
        const dx = box.l + box.r - (l.x + r.x);
        const dy = box.t + box.b - (t.x + b.x);
        Object.assign(r, dx < -0.5 ? TRAIL : LEAD);
        Object.assign(l, dx > 0.5 ? TRAIL : LEAD);
        Object.assign(b, dy < -0.5 ? TRAIL : LEAD);
        Object.assign(t, dy > 0.5 ? TRAIL : LEAD);
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
        if (instant) {
            // Lần hiện đầu tiên (trang vừa mở): bỏ qua hiệu ứng mờ dần, viên đang chọn có
            // ngay từ khung hình đầu như cái nền tĩnh cũ.
            this.el.style.transition = 'none';
            this.el.classList.toggle('is-visible', visible);
            void this.el.offsetWidth;
            this.el.style.transition = '';
        } else {
            this.el.classList.toggle('is-visible', visible);
        }
    }

    /** Một bước mô phỏng; trả `false` khi đã đứng yên (vòng lặp bỏ giọt này ra). */
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
        return !settled;
    }

    render() {
        const { l, r, t, b } = this.edges;
        const w = this.baseW || 1;
        const h = this.baseH || 1;
        const fx = (r.x - l.x) / w;
        const fy = (b.x - t.x) / h;
        // Kéo dài theo chiều này thì thắt nhẹ chiều kia — giọt nước giữ thể tích. Số mũ nhỏ: dãn
        // gấp đôi chỉ thắt ~10%; thắt theo đúng thể tích (mũ 0.5) thì giọt mảnh như sợi chỉ.
        const sx = fx / (fy > 1 ? fy ** 0.15 : 1);
        const sy = fy / (fx > 1 ? fx ** 0.15 : 1);

        this.x = (l.x + r.x - w) / 2;
        this.y = (t.x + b.x - h) / 2;
        this.el.style.translate = `${this.x}px ${this.y}px`;
        this.el.style.transform =
            Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 ? '' : `scale(${sx}, ${sy})`;
        this.hooks.onRender?.();
    }

    #pairs(box) {
        const { l, r, t, b } = this.edges;
        return [[l, box.l], [r, box.r], [t, box.t], [b, box.b]];
    }

    /**
     * Cỡ gốc = cỡ của mục đích. Đặt bằng width/height thật (không phải scale) để góc bo luôn
     * tròn đúng khi giọt đứng yên; độ dãn lúc trượt mới là `transform: scale`.
     */
    #setBase(box) {
        const w = Math.max(1, box.r - box.l);
        const h = Math.max(1, box.b - box.t);
        const radius = Math.max(0, box.radius ?? 0);
        if (Math.abs(w - this.baseW) < 0.5 && Math.abs(h - this.baseH) < 0.5 && radius === this.radius) return;
        this.baseW = w;
        this.baseH = h;
        this.radius = radius;
        this.el.style.width = `${w}px`;
        this.el.style.height = `${h}px`;
        this.el.style.borderRadius = `${radius}px`;
        this.hooks.onResize?.(w, h, radius);
    }

    /** Kẹp độ dài giọt trong [MIN_SQUEEZE, MAX_STRETCH] lần cỡ gốc bằng cách kéo MÉP SAU lại. */
    #limitStretch(a, b, base) {
        if (!base) return;
        const len = b.x - a.x;
        const trailing = a.k < b.k ? a : b.k < a.k ? b : null;
        if (len > base * MAX_STRETCH) {
            if (trailing === a) a.x = b.x - base * MAX_STRETCH;
            else b.x = a.x + base * MAX_STRETCH;
        } else if (len < base * MIN_SQUEEZE) {
            const mid = (a.x + b.x) / 2;
            a.x = mid - (base * MIN_SQUEEZE) / 2;
            b.x = mid + (base * MIN_SQUEEZE) / 2;
        }
    }
}
