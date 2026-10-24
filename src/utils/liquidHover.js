import { LiquidBody, SPRINGS } from './liquidMotion';

/**
 * Hover kính lỏng cho CẢ ứng dụng — kiểu con trỏ của iPadOS: con trỏ "hoá thành" một khối kính
 * nằm sau nút đang rê, rồi trượt + đổi hình (rộng/hẹp, bo góc) sang nút kế bên thay vì mỗi nút
 * tự bật một nền phẳng.
 *
 * MỘT khối duy nhất, gắn thẳng vào <body>, nên mọi nút ở mọi nơi (kể cả nút thêm sau này) tự có
 * hiệu ứng mà không phải bọc gì. Phần tử được nhận hover:
 *   `button`, `a[href]`, `[role=button|menuitem|option|tab…]`, `[data-liquid-hover]`
 * trừ khi:
 *   • bị vô hiệu, hoặc nằm trong `[data-liquid-hover="off"]`;
 *   • tự có nền hover riêng (`hover:bg-…` còn lại là màu ngữ nghĩa: đỏ = xoá, xanh = chính…) —
 *     nền trung tính (trắng/đen/xám) đã được gỡ khỏi các nút để nhường cho khối kính này;
 *   • là nút màu đặc (`btn-accent`, nền gradient / nền màu đậm) — kính xám đè lên nút xanh là bẩn;
 *   • là mục ĐANG CHỌN — của một LiquidGroup (viên kính "đang chọn" đã sáng sẵn ở đó), hoặc mang
 *     `data-liquid-selected` (hàng tệp đang được tích chọn).
 *
 * Bề mặt LUÔN tối (trình xem tệp `glass-stage` / `glass-dark`, hoặc `[data-liquid-surface="dark"]`)
 * dùng khối kính kiểu Tối kể cả khi ứng dụng đang ở giao diện Sáng — làm tối thêm một nền đã tối
 * thì không ai thấy gì.
 *
 * Vì sao khối kính nằm TRÊN cùng mà chữ vẫn nét: lớp "tô" dùng `mix-blend-mode` — Sáng: `multiply`
 * (chỉ làm tối nhẹ, chữ đen vẫn đen), Tối: `screen` (chỉ làm sáng). Không có lớp trắng nào phủ lên
 * chữ như bản trước. Viền kính là lớp thứ hai, trộn bình thường nhưng chỉ là một vòng 1px.
 *
 * `data-liquid-tone="danger"` trên nút → khối kính ánh đỏ.
 */

const TARGET_SELECTOR = [
    'button',
    'a[href]',
    'summary',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="tab"]',
    '[data-liquid-hover]',
].join(',');

/** Nút tự lo nền hover (màu ngữ nghĩa), kể cả có tiền tố biến thể (`enabled:hover:bg-…`).
 * `…hover:bg-transparent` (thường là `disabled:hover:bg-transparent`) không tính. */
const OWN_HOVER = /(^|\s)(?:[\w-]+:)*hover:bg-(?!transparent)/;
const SELECTED_IN_GROUP = '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]';
const DARK_SURFACE = '.glass-stage, .glass-dark, [data-liquid-surface="dark"]';

/** Khoảng trống giữa các nút mà chuột lướt qua dưới chừng này ms thì khối kính không tắt. */
const HIDE_DELAY = 70;
/** Nút mới cách nút cũ xa hơn chừng này (px) thì hiện lại tại chỗ thay vì bay ngang màn hình. */
const MAX_TRAVEL = 220;
/** Độ "hút" về phía con trỏ (px) — như con trỏ iPad: khối kính lệch nhẹ theo tay. */
const MAGNET_X = 3;
const MAGNET_Y = 1.5;
/** Nút chữ trơn (không có padding) được nới ra thành viên thuốc tối thiểu cỡ này. */
const MIN_HEIGHT = 28;
const TEXT_PAD_X = 6;

let tint = null;
let rim = null;
let body = null;
let target = null;
let targetBox = null;
let clipRect = null;
let pointer = { x: 0, y: 0 };
let hideTimer = 0;
let hiddenAt = -Infinity;
let watchFrame = 0;
let installed = false;

function isColoredSolid(cs) {
    if (cs.backgroundImage !== 'none' && cs.backgroundImage.includes('gradient')) return true;
    const m = cs.backgroundColor.match(/[\d.]+/g);
    if (!m) return false;
    const [r, g, b, a = 1] = m.map(Number);
    return a >= 0.6 && Math.max(r, g, b) - Math.min(r, g, b) > 48;
}

/**
 * Kết luận "nút này tự lo hover" + số đo kiểu dáng, nhớ theo phần tử (và chuỗi class của nó, vì
 * class đổi thì kết luận đổi). `resolveTarget` chạy ở MỌI lần chuột nhúc nhích — không được gọi
 * getComputedStyle mỗi lần như vậy.
 */
const styleCache = new WeakMap();

function styleOf(el) {
    const cls = el.getAttribute('class') || '';
    const hit = styleCache.get(el);
    if (hit && hit.cls === cls) return hit;
    const cs = getComputedStyle(el);
    const entry = {
        cls,
        ownHover:
            !el.hasAttribute('data-liquid-hover') &&
            (OWN_HOVER.test(cls) || el.classList.contains('btn-accent') || isColoredSolid(cs)),
        padX: (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0),
        radius: parseFloat(cs.borderTopLeftRadius) || 0,
    };
    styleCache.set(el, entry);
    return entry;
}

/** Phần tử dưới con trỏ có nhận hover kính không — trả về chính nó hoặc `null`. */
function resolveTarget(node) {
    const el = node instanceof Element ? node.closest(TARGET_SELECTOR) : null;
    if (!el || el.closest('[data-liquid-hover="off"]')) return null;
    if (el.matches(':disabled, [aria-disabled="true"]')) return null;
    if (el.hasAttribute('data-liquid-selected')) return null;
    if (el.matches(SELECTED_IN_GROUP) && el.closest('[data-liquid-group]')) return null;
    if (styleOf(el).ownHover) return null;
    // Link xuống dòng (nhiều mảnh chữ nhật) không có một khung để bao.
    if (el.getClientRects().length !== 1) return null;
    return el;
}

/** Khung khối kính cho `el` (toạ độ màn hình), đã nới cho nút chữ trơn. */
function measureTarget(el) {
    const r = el.getBoundingClientRect();
    const { padX, radius: ownRadius } = styleOf(el);
    let { left, top, width, height } = r;
    if (padX < 8) {
        left -= TEXT_PAD_X;
        width += TEXT_PAD_X * 2;
    }
    if (height < MIN_HEIGHT) {
        top -= (MIN_HEIGHT - height) / 2;
        height = MIN_HEIGHT;
    }
    const radius = Math.min(ownRadius < 6 ? 10 : ownRadius, height / 2, width / 2);
    return { l: left, t: top, r: left + width, b: top + height, radius };
}

/**
 * Vùng nhìn thấy được của `el`: giao của mọi khung cuộn/cắt bao ngoài nó. Không có bước này thì
 * rê vào một hàng đang bị cuộn khuất một nửa, khối kính vẽ đè ra ngoài khung danh sách.
 *
 * Đi theo đúng luật cắt của CSS: phần tử `fixed` (menu chuột phải nằm TRONG <main> nhưng không bị
 * <main> cắt) thì dừng; phần tử `absolute` thì bỏ qua các tổ tiên KHÔNG định vị — `overflow` của
 * chúng không cắt được nó.
 */
function measureClip(el) {
    let rect = { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
    let escaping = false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
        const cs = getComputedStyle(node);
        const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
        if (node !== el && clips && (!escaping || cs.position !== 'static')) {
            const pr = node.getBoundingClientRect();
            rect = {
                l: Math.max(rect.l, pr.left + node.clientLeft),
                t: Math.max(rect.t, pr.top + node.clientTop),
                r: Math.min(rect.r, pr.left + node.clientLeft + node.clientWidth),
                b: Math.min(rect.b, pr.top + node.clientTop + node.clientHeight),
            };
        }
        if (cs.position === 'fixed') break;
        if (cs.position === 'absolute') escaping = true;
        else if (cs.position !== 'static') escaping = false;
    }
    return rect;
}

/** Khung đích + độ hút về phía con trỏ. */
function magnetized(box) {
    const w = box.r - box.l;
    const h = box.b - box.t;
    const fx = Math.max(-0.5, Math.min(0.5, (pointer.x - (box.l + w / 2)) / w));
    const fy = Math.max(-0.5, Math.min(0.5, (pointer.y - (box.t + h / 2)) / h));
    const dx = fx * 2 * MAGNET_X;
    const dy = fy * 2 * MAGNET_Y;
    return { l: box.l + dx, r: box.r + dx, t: box.t + dy, b: box.b + dy, radius: box.radius };
}

function paint() {
    const { l, t, r, b } = body.current;
    // Cắt theo vùng nhìn thấy (toạ độ trong khung của khối kính).
    const clip = clipRect
        ? `inset(${Math.max(0, clipRect.t - t)}px ${Math.max(0, r - clipRect.r)}px ${Math.max(0, b - clipRect.b)}px ${Math.max(0, clipRect.l - l)}px round ${body.radius}px)`
        : 'none';
    const mx = `${pointer.x - l}px`;
    const my = `${pointer.y - t}px`;
    for (const el of body.els) {
        el.style.clipPath = clip;
        el.style.setProperty('--mx', mx);
        el.style.setProperty('--my', my);
    }
}

function show(el) {
    clearTimeout(hideTimer);
    hideTimer = 0;
    const box = measureTarget(el);
    const wasVisible = body.visible || performance.now() - hiddenAt < 160;
    const prev = targetBox;
    target = el;
    targetBox = box;
    clipRect = measureClip(el);
    const tone = el.closest('[data-liquid-tone]')?.getAttribute('data-liquid-tone') || '';
    const surface = el.closest(DARK_SURFACE) ? 'dark' : '';
    for (const node of body.els) {
        node.dataset.tone = tone;
        node.dataset.surface = surface;
    }

    const far =
        !prev ||
        Math.hypot((prev.l + prev.r - box.l - box.r) / 2, (prev.t + prev.b - box.t - box.b) / 2) > MAX_TRAVEL;
    if (wasVisible && !far) body.glide(magnetized(box));
    else body.snap(magnetized(box));
    if (!body.visible) body.setVisible(true);
    paint();
    watch();
}

function hide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    if (!body.visible) return;
    body.setVisible(false);
    body.toggleClass('is-pressed', false);
    target = null;
    hiddenAt = performance.now();
}

function hideSoon() {
    if (body.visible && !hideTimer) hideTimer = setTimeout(hide, HIDE_DELAY);
}

/**
 * Trong lúc đang hiện: bám theo nút mỗi khung hình — nút có thể tự di chuyển (menu đang mở ra
 * với hiệu ứng phóng, thẻ nhấc lên khi rê, danh sách cuộn) hoặc biến mất (menu đóng sau khi bấm).
 */
function watch() {
    if (watchFrame) return;
    const loop = () => {
        watchFrame = 0;
        if (!body.visible) return;
        if (!target || !target.isConnected || target.matches(':disabled')) {
            hide();
            return;
        }
        const box = measureTarget(target);
        const moved = ['l', 't', 'r', 'b'].some((k) => Math.abs(box[k] - targetBox[k]) > 0.5);
        if (moved) {
            targetBox = box;
            clipRect = measureClip(target);
            body.retarget(magnetized(box));
        }
        paint();
        watchFrame = requestAnimationFrame(loop);
    };
    watchFrame = requestAnimationFrame(loop);
}

function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY };
    const el = resolveTarget(e.target);
    if (!el) {
        hideSoon();
        return;
    }
    if (el !== target || !body.visible) {
        show(el);
    } else {
        clearTimeout(hideTimer);
        hideTimer = 0;
        body.retarget(magnetized(targetBox));
    }
}

/** Gọi một lần lúc khởi động (main.jsx). */
export function installLiquidHover() {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    tint = document.createElement('div');
    tint.className = 'liquid-hover liquid-hover-tint';
    rim = document.createElement('div');
    rim.className = 'liquid-hover liquid-hover-rim';
    for (const el of [tint, rim]) {
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    body = new LiquidBody([tint, rim], { mode: 'size', spring: SPRINGS.HOVER, onRender: paint });

    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    // Rời cửa sổ trình duyệt.
    document.documentElement.addEventListener('pointerleave', hide);
    document.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' && body.visible && target?.contains(e.target)) body.toggleClass('is-pressed', true);
    }, { capture: true, passive: true });
    const release = () => body.toggleClass('is-pressed', false);
    document.addEventListener('pointerup', release, { capture: true, passive: true });
    document.addEventListener('pointercancel', release, { capture: true, passive: true });
    // Gõ phím (Tab, phím tắt mở hộp thoại…) thì người dùng không còn nhìn theo chuột.
    document.addEventListener('keydown', hide, { capture: true, passive: true });
    // Cuộn: nút dưới con trỏ đứng yên đã khác — tính lại từ điểm con trỏ.
    document.addEventListener(
        'scroll',
        () => {
            if (!body.visible) return;
            const el = resolveTarget(document.elementFromPoint(pointer.x, pointer.y));
            if (el) show(el);
            else hide();
        },
        { capture: true, passive: true },
    );
}
