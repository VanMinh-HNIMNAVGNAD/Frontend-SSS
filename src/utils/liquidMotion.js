/**
 * Chuyển động "giọt nước nhảy" cho viên kính đang chọn (LiquidGroup) — vật lý lò xo, không dùng
 * CSS transition.
 *
 * Một giọt nước thật khi chuyển chỗ không trượt như một khối cứng. Nó đi qua bốn nhịp — đúng
 * nguyên lý "squash & stretch" của hoạt hình:
 *
 *   1. VƯƠN  — mép phía trước lao về đích; mép phía sau còn DÍNH lại một nhịp ngắn (sức căng
 *              bề mặt), nên giọt kéo dài ra và thắt eo lại (giữ thể tích).
 *   2. BỨT   — mép sau rời chỗ cũ và đuổi theo bằng một lò xo cứng, ít giảm chấn.
 *   3. ĐÁP   — mép sau lao quá đà vào mép trước đang nảy ngược lại: giọt DẸT xuống và PHÌNH ngang.
 *   4. LẶNG  — nảy lại một nhịp nhỏ rồi đứng yên.
 *
 * Giữa hai mép còn có một lực NỘI TẠI, như sức căng bề mặt của giọt nước: bị kéo dài thì lực kéo
 * hai mép lại (yếu — giọt vẫn dãn được), bị ép ngắn thì đẩy hai mép ra (mạnh — nước gần như không
 * nén được). Lực bằng nhau và ngược chiều nên động lượng được giữ: khi mép sau đâm vào, cú va
 * truyền sang mép trước thành một nhịp nảy nhỏ thay vì làm giọt bẹp dí. Thiếu lực này, nhảy xa
 * (mép sau bị kéo theo với cả vận tốc của mép trước) là giọt bị ép tới tận ngưỡng kẹp.
 *
 * Trong lúc bay giọt được "nhấc" lên (`lift` 0 → 1: phóng nhẹ, bóng đổ xa và mờ hơn, lớp kính
 * trong hiện lên), sắp tới nơi thì hạ xuống (`lift` → 0) — cảm giác nhảy chứ không phải lê.
 *
 * Mỗi giọt có bốn lò xo cho bốn mép (trái, phải, trên, dưới) + một lò xo cho `lift`. Thông số lò
 * xo viết theo cách SwiftUI của Apple: `response` (giây cho một chu kỳ) và `dampingFraction`
 * (1 = không nảy, nhỏ hơn = nảy).
 *
 * Mọi thứ — kể cả nhấc/đáp — đều do JS vẽ qua `translate` / `transform` / biến `--lift`, không
 * có CSS transition nào chen vào. Nhờ vậy: (1) chuyển động tính trước được — mô phỏng ngoài trình
 * duyệt, hoặc đóng băng đồng hồ của trang rồi chụp đúng từng khung để kiểm thử; (2) bấm liên tục
 * vẫn liền mạch — lò xo giữ nguyên vận tốc đang có khi đổi đích, transition thì bắt đầu lại từ 0.
 *
 * Mọi giọt trên trang dùng chung MỘT vòng requestAnimationFrame, tự tắt khi tất cả đứng yên.
 */

/**
 * Lò xo theo thông số kiểu Apple.
 * @param {number} response Thời gian một chu kỳ dao động (giây) — nhỏ là nhanh.
 * @param {number} dampingFraction 1 = không nảy; < 1 = nảy.
 */
function appleSpring(response, dampingFraction) {
    const omega = (2 * Math.PI) / response;
    return { k: omega * omega, c: 2 * dampingFraction * omega };
}

/**
 * Thông số một cú nhảy — chọn bằng quét tham số trên mô phỏng (192 bộ, giữ bộ đạt mọi mục tiêu
 * và đứng yên nhanh nhất ở bước 1 mục, thao tác hay gặp nhất):
 *   bước 1 mục (41px)  — dãn 1.33, dẹt 0.91, vượt đích 1.3px, đứng yên sau ~0.43s;
 *   bước 3 mục (123px) — dãn 1.8 (chạm trần), dẹt 0.83, vượt 3.1px, ~0.57s;
 *   bước xa (300px)    — dẹt 0.87, vượt 4.2px, ~0.61s.
 */
export const DROPLET = {
    /** Mép trước vươn tới: nhanh, nảy nhẹ. */
    lead: appleSpring(0.32, 0.8),
    /** Mép sau bứt ra: cứng hơn mép trước và ít giảm chấn hơn → lao quá đà → giọt dẹt khi đáp. */
    snap: appleSpring(0.22, 0.65),
    /** Mép sau dính lại bao lâu (ms): 40 + 0.22·quãng đường, trong [40, 110]. */
    holdBase: 40,
    holdPerPx: 0.22,
    holdMax: 110,
    /** Nhấc lên / hạ xuống. */
    lift: appleSpring(0.32, 0.8),
    /** Còn cách đích dưới tỉ lệ này của cỡ giọt thì bắt đầu hạ xuống. */
    landAt: 0.35,
    /** Sức căng bề mặt: kéo hai mép lại khi giọt dài ra (1/s²) — nhỏ để giọt vẫn dãn được. */
    tension: 60,
    /** Độ "không nén được": đẩy hai mép ra khi giọt bị ép ngắn (1/s²). */
    firmness: 1200,
    /** Chặn an toàn cuối cùng (hiếm khi chạm tới nhờ hai lực trên): dài tối đa / dẹt tối thiểu. */
    maxStretch: 1.8,
    minSqueeze: 0.72,
    /** Giữ thể tích: dài ra f lần thì bề ngang nhân f^-volume (0.5 = đúng diện tích, 0 = không thắt). */
    volume: 0.4,
    /** Nhấc lên thì phóng thêm chừng này. */
    liftScale: 0.05,
    droplet: true,
};

/**
 * Trượt êm — cho nhóm NHỎ (nút List/Grid 28px, tab ngăn Thông tin, tab Cài đặt): một viên kính
 * trượt sang như thanh phân đoạn của Apple, không vươn/dẹt/nhấc. Trên mục cao chưa tới 34px,
 * cú nhảy giọt nước không đủ chỗ để đọc ra hình dạng — chỉ thấy một cục rung rinh.
 */
export const SLIDE = {
    ...DROPLET,
    lead: appleSpring(0.3, 0.9),
    droplet: false,
};

/** Bước tích phân cố định — đủ nhỏ để lò xo cứng không mất ổn định khi máy chậm, khung dài. */
const SUBSTEP = 1 / 240;
/** Dưới ngưỡng này (px, px/s) coi như đã đứng yên. */
const REST_DISTANCE = 0.05;
const REST_SPEED = 0.5;

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

function makeSpring(params) {
    return { x: 0, v: 0, to: 0, k: params.k, c: params.c, pending: null, releaseAt: 0 };
}

function integrate(s, h) {
    const a = -s.k * (s.x - s.to) - s.c * s.v;
    s.v += a * h;
    s.x += s.v * h;
}

function atRest(s) {
    return s.pending === null && Math.abs(s.x - s.to) < REST_DISTANCE && Math.abs(s.v) < REST_SPEED;
}

/**
 * @typedef {{ l: number, t: number, r: number, b: number, radius: number }} LiquidBox
 *   Khung đích (px) và bán kính bo góc.
 */

export class LiquidBody {
    /**
     * @param {HTMLElement[]} els Các phần tử đi CÙNG một hình dạng (viên kính dưới chữ + lớp kính
     *   trong trên chữ). Cỡ thật của chúng = cỡ của mục đích; độ dãn/dẹt lúc nhảy là
     *   `transform: scale` để góc bo luôn tròn đúng khi đứng yên.
     * @param {object} [options]
     * @param {typeof DROPLET} [options.params]
     * @param {() => void} [options.onRender] Sau mỗi khung hình.
     */
    constructor(els, options = {}) {
        this.els = els;
        this.p = options.params ?? DROPLET;
        this.hooks = options;
        this.edges = {
            l: makeSpring(this.p.lead),
            r: makeSpring(this.p.lead),
            t: makeSpring(this.p.lead),
            b: makeSpring(this.p.lead),
        };
        this.liftSpring = makeSpring(this.p.lift);
        /** Hai mép đang đóng vai dẫn / kéo của cú nhảy hiện tại (null khi không nhảy). */
        this.leadEdge = null;
        this.trailEdge = null;
        /** Đồng hồ riêng (giây) — chỉ tăng theo `step`, nên mô phỏng chạy lại được y hệt. */
        this.time = 0;
        this.baseW = 0;
        this.baseH = 0;
        this.radius = -1;
        /** Vùng không được vẽ tràn ra (khung cuộn của nhóm) — xem `setBounds`. */
        this.bounds = null;
        this.placed = false;
        this.visible = false;
    }

    get isMoving() {
        return moving.has(this);
    }

    /** Đặt thẳng vào khung, không chuyển động (lần hiện đầu, đổi bố cục, giảm chuyển động). */
    snap(box) {
        for (const [edge, value] of this.#pairs(box)) {
            Object.assign(edge, { x: value, to: value, v: 0, pending: null });
        }
        Object.assign(this.liftSpring, { x: 0, to: 0, v: 0 });
        this.leadEdge = this.trailEdge = null;
        moving.delete(this);
        this.#setBase(box);
        this.placed = true;
        this.render();
    }

    /** Đổi bộ thông số (DROPLET / SLIDE) — LiquidGroup chọn theo cỡ mục. */
    setParams(params) {
        this.p = params;
    }

    /** Nhảy sang khung mới: vươn → bứt → đáp → lặng (hoặc trượt êm với SLIDE). */
    jump(box) {
        if (!this.placed || reducedMotion?.matches) {
            this.snap(box);
            return;
        }
        const { l, r, t, b } = this.edges;
        const dx = (box.l + box.r - (l.x + r.x)) / 2;
        const dy = (box.t + box.b - (t.x + b.x)) / 2;

        // Mọi mép mặc định đi thẳng tới đích bằng lò xo "vươn" (trục không nhảy: chỉ đổi cỡ).
        for (const [edge, value] of this.#pairs(box)) {
            Object.assign(edge, this.p.lead, { to: value, pending: null });
        }

        // Trục nhảy chính: mép phía trước dẫn, mép phía sau dính lại rồi bứt ra.
        const vertical = Math.abs(dy) >= Math.abs(dx);
        const d = vertical ? dy : dx;
        if (this.p.droplet && Math.abs(d) > 0.5) {
            const [lead, trail, target] = vertical
                ? d > 0 ? [b, t, box.t] : [t, b, box.b]
                : d > 0 ? [r, l, box.l] : [l, r, box.r];
            const holdMs = Math.min(this.p.holdMax, this.p.holdBase + this.p.holdPerPx * Math.abs(d));
            Object.assign(trail, this.p.snap, { to: trail.x, pending: target, releaseAt: this.time + holdMs / 1000 });
            this.leadEdge = lead;
            this.trailEdge = trail;
            this.liftSpring.to = 1;
        }

        this.#setBase(box);
        wake(this);
    }

    /**
     * Đổi đích mà giữ nguyên vận tốc — dùng khi bố cục xê dịch giữa chừng (thu thanh bên, nhãn nạp
     * xong). Mép đang dính lại thì chỉ đổi chỗ sẽ bứt tới.
     */
    retarget(box) {
        for (const [edge, value] of this.#pairs(box)) {
            if (edge.pending !== null) edge.pending = value;
            else edge.to = value;
        }
        this.#setBase(box);
        wake(this);
    }

    /**
     * Vùng mà giọt không được phình/dãn vượt ra: khung cuộn của nhóm CẮT mọi thứ thò ra ngoài nó,
     * và phần bị cắt mang theo góc bo — giọt phình ngang lúc đáp trong thanh bên (mục rộng hết
     * khung) từng hiện thành một thanh góc vuông. `null` = không giới hạn.
     * @param {{ l: number, t: number, r: number, b: number } | null} bounds
     */
    setBounds(bounds) {
        this.bounds = bounds;
    }

    /** Khung đích hiện tại có trùng `box` không (sai số dưới nửa pixel). */
    isAt(box) {
        return (
            this.placed &&
            this.#pairs(box).every(([edge, value]) => Math.abs((edge.pending ?? edge.to) - value) < 0.5)
        );
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

    /** Một bước mô phỏng; trả `false` khi đã đứng yên (vòng lặp bỏ giọt này ra). */
    step(dt) {
        const edges = Object.values(this.edges);
        const n = Math.max(1, Math.ceil(dt / SUBSTEP));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            this.time += h;
            this.#bodyForces(h);
            for (const e of edges) {
                if (e.pending !== null) {
                    if (this.time >= e.releaseAt) {
                        // Hết nhịp dính: mép sau bứt ra.
                        e.to = e.pending;
                        e.pending = null;
                    } else {
                        // Đang dính: không có lò xo kéo về chỗ cũ, chỉ ma sát hãm lại (+ sức
                        // căng bề mặt ở #bodyForces) — mép sau "bám" chứ không bị giật ngược.
                        e.to = e.x;
                    }
                }
                integrate(e, h);
            }
            this.#limitShape();
            this.#updateLift();
            integrate(this.liftSpring, h);
        }

        const settled = edges.every(atRest) && atRest(this.liftSpring);
        if (settled) {
            for (const e of edges) Object.assign(e, { x: e.to, v: 0 });
            Object.assign(this.liftSpring, { x: 0, v: 0 });
            this.leadEdge = this.trailEdge = null;
        }
        this.render();
        return !settled;
    }

    /** Hình dạng hiện tại: tâm, độ dãn theo hai trục (sau khi giữ thể tích), độ nhấc. */
    shape() {
        const { l, r, t, b } = this.edges;
        const w = this.baseW || 1;
        const h = this.baseH || 1;
        const fx = Math.max(0.01, (r.x - l.x) / w);
        const fy = Math.max(0.01, (b.x - t.x) / h);
        const lift = Math.min(1, Math.max(0, this.liftSpring.x));
        const grow = 1 + this.p.liftScale * lift;
        // Dài ra theo trục này thì thắt lại theo trục kia, dẹt xuống thì phình ra — giữ thể tích.
        let sx = fx * fy ** -this.p.volume * grow;
        let sy = fy * fx ** -this.p.volume * grow;
        const cx = (l.x + r.x) / 2;
        const cy = (t.x + b.x) / 2;
        // Không phình/dãn ra ngoài khung cuộn của nhóm (bị cắt mất góc bo).
        if (this.bounds) {
            const halfW = Math.min(cx - this.bounds.l, this.bounds.r - cx);
            const halfH = Math.min(cy - this.bounds.t, this.bounds.b - cy);
            if (halfW > 0) sx = Math.min(sx, (2 * halfW) / w);
            if (halfH > 0) sy = Math.min(sy, (2 * halfH) / h);
        }
        return { cx, cy, sx, sy, fx, fy, lift };
    }

    render() {
        const { cx, cy, sx, sy, lift } = this.shape();
        const x = cx - this.baseW / 2;
        const y = cy - this.baseH / 2;
        const transform = Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 ? '' : `scale(${sx}, ${sy})`;
        for (const el of this.els) {
            el.style.translate = `${x}px ${y}px`;
            el.style.transform = transform;
            el.style.setProperty('--lift', lift.toFixed(3));
        }
        this.hooks.onRender?.();
    }

    #pairs(box) {
        const { l, r, t, b } = this.edges;
        return [[l, box.l], [r, box.r], [t, box.t], [b, box.b]];
    }

    /** Cỡ gốc = cỡ của mục đích (width/height thật, nên góc bo luôn đúng khi đứng yên). */
    #setBase(box) {
        const w = Math.max(1, box.r - box.l);
        const h = Math.max(1, box.b - box.t);
        const radius = Math.max(0, box.radius ?? 0);
        if (Math.abs(w - this.baseW) < 0.5 && Math.abs(h - this.baseH) < 0.5 && radius === this.radius) return;
        this.baseW = w;
        this.baseH = h;
        this.radius = radius;
        for (const el of this.els) {
            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            el.style.borderRadius = `${radius}px`;
        }
    }

    /** Sức căng bề mặt + độ không nén được giữa hai mép của mỗi trục (xem đầu file). */
    #bodyForces(h) {
        const { l, r, t, b } = this.edges;
        for (const [a, z, base] of [[t, b, this.baseH], [l, r, this.baseW]]) {
            if (!base) continue;
            const dev = (z.x - a.x - base) / base;
            const f = (dev > 0 ? this.p.tension : this.p.firmness) * dev * base * h;
            a.v += f;
            z.v -= f;
        }
    }

    /**
     * Kẹp hình dạng: dài quá `maxStretch` thì mép sau bị kéo theo (giọt không thành vệt dài khi
     * nhảy xa); dẹt quá `minSqueeze` thì nở đều hai phía.
     */
    #limitShape() {
        const { l, r, t, b } = this.edges;
        for (const [a, z, base] of [[t, b, this.baseH], [l, r, this.baseW]]) {
            if (!base) continue;
            const len = z.x - a.x;
            if (len > base * this.p.maxStretch && (this.trailEdge === a || this.trailEdge === z)) {
                // Chỉ dời vị trí, KHÔNG chép vận tốc của mép trước: chép vào là mép sau mang theo
                // cả đà của quãng đường dài và đâm sầm vào mép trước lúc đáp.
                const trail = this.trailEdge;
                trail.x = trail === a ? z.x - base * this.p.maxStretch : a.x + base * this.p.maxStretch;
            } else if (len < base * this.p.minSqueeze) {
                const mid = (a.x + z.x) / 2;
                a.x = mid - (base * this.p.minSqueeze) / 2;
                z.x = mid + (base * this.p.minSqueeze) / 2;
            }
        }
    }

    /** Sắp tới nơi (cả hai mép của trục nhảy đã gần đích, mép sau đã bứt) thì hạ xuống. */
    #updateLift() {
        if (this.liftSpring.to === 0 || !this.leadEdge) return;
        const { leadEdge: lead, trailEdge: trail } = this;
        const size = lead === this.edges.t || lead === this.edges.b ? this.baseH : this.baseW;
        const near = (e) => Math.abs(e.x - e.to) < size * this.p.landAt;
        if (trail.pending === null && near(lead) && near(trail)) this.liftSpring.to = 0;
    }
}
