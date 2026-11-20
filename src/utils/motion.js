/**
 * Hoạt ảnh nhỏ dùng anime.js v4 (20/11/2026) — nảy icon, bật số đếm, lắc chuông, hiện dần danh sách.
 *
 * Chỉ dùng cho những cú "một phát" ngắn trên vài phần tử (transform/opacity — trình duyệt không phải
 * tính lại bố cục). Giọt kính đang chọn KHÔNG dùng anime.js: nó có vật lý lò xo bốn mép riêng
 * (utils/liquidMotion.js) mà một tween không thay được.
 *
 * Người dùng bật "Giảm chuyển động" trong hệ điều hành thì mọi hàm ở đây không làm gì.
 */
import { animate, spring, stagger, svg, waapi } from 'animejs';

const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

const canAnimate = (el) => Boolean(el) && !reducedMotion?.matches;

/**
 * Hoạt ảnh "nặng" theo số lượng (cả lưới tệp trượt, hiện dần cả danh sách): tắt thêm ở chế độ kính
 * Tiết kiệm (`html.glass-lite`, utils/glassPerf.js) — máy đã bị coi là yếu thì chỉ giữ cú nhỏ.
 */
export const bulkMotionAllowed = () =>
    !reducedMotion?.matches &&
    typeof document !== 'undefined' &&
    !document.documentElement.classList.contains('glass-lite');

/** Lò xo nảy dùng chung: dứt khoát, nảy một hai nhịp rồi lặng. */
const BOUNCY = spring({ bounce: 0.55, duration: 460 });

/**
 * Icon bị "nhấn": co lại, nghiêng nhẹ rồi bật về bằng lò xo — như ấn vào một viên thạch.
 * @param {Element|null} el
 */
export function bounceIcon(el) {
    if (!canAnimate(el)) return;
    animate(el, {
        scale: [
            { to: 0.78, duration: 90, ease: 'out(2)' },
            { to: 1, ease: BOUNCY },
        ],
        rotate: [
            { to: -12, duration: 90, ease: 'out(2)' },
            { to: 0, ease: BOUNCY },
        ],
    });
}

/**
 * Rê chuột lên icon: nhấc nhẹ lên 1,5px và phóng 8%, rời chuột thì hạ về — lò xo nên đổi hướng
 * giữa chừng vẫn mượt (anime.js thay tween đang chạy trên cùng thuộc tính).
 * @param {Element|null} el
 * @param {boolean} on
 */
export function hoverIcon(el, on) {
    if (!canAnimate(el)) return;
    animate(el, {
        y: on ? -1.5 : 0,
        scale: on ? 1.08 : 1,
        ease: spring({ bounce: on ? 0.45 : 0.2, duration: 320 }),
    });
}

/**
 * Viên số đếm vừa tăng: bật ra từ nhỏ với một cú nảy.
 * @param {Element|null} el
 */
export function popBadge(el) {
    if (!canAnimate(el)) return;
    animate(el, {
        scale: [0.35, 1],
        opacity: [0, 1],
        ease: spring({ bounce: 0.6, duration: 520 }),
    });
}

/**
 * Chuông rung khi có thông báo mới: lắc tắt dần quanh móc treo (đặt `transform-origin` ở đỉnh).
 * @param {Element|null} el
 */
export function ringBell(el) {
    if (!canAnimate(el)) return;
    animate(el, {
        rotate: [0, 18, -15, 11, -7, 4, -2, 0],
        duration: 900,
        ease: 'inOut(2)',
    });
}

/**
 * Hiện dần một loạt icon (thanh bên lần đầu mở): bật ra từ nhỏ, lệch nhịp từ trên xuống. Chỉ đụng
 * tới ICON chứ không đụng nút: giọt kính đang chọn đo vị trí nút lúc dựng, nút trượt vào sau đó là
 * giọt lệch chỗ.
 * @param {Element[]|NodeList} els
 */
export function staggerIn(els) {
    if (!els?.length || reducedMotion?.matches) return;
    animate(els, {
        scale: [0.4, 1],
        opacity: [0, 1],
        delay: stagger(32, { start: 60 }),
        ease: spring({ bounce: 0.5, duration: 520 }),
    });
}

/**
 * Chuyển trang (MainLayout.jsx): nội dung mới trồi lên 10px và rõ dần bằng lò xo êm.
 *
 * Gỡ `transform` ngay khi xong: một phần tử còn giữ transform (kể cả `translateY(0)`) thành khối
 * chứa của mọi con `position: fixed` — menu chuột phải, hộp thoại render trong trang sẽ bị nhốt
 * vào vùng nội dung. Đổi trang liên tục thì anime.js thay tween cũ, lần gỡ cuối vẫn chạy.
 * @param {HTMLElement|null} el
 */
export function pageIn(el) {
    if (!canAnimate(el)) return;
    animate(el, {
        opacity: [0, 1],
        y: [10, 0],
        ease: spring({ bounce: 0.18, duration: 420 }),
        onComplete: () => {
            el.style.removeProperty('transform');
            el.style.removeProperty('opacity');
        },
    });
}

/* ── Bổ sung 20/11/2026 (tối) ───────────────────────────────────────────────────────────────────
   Nguyên tắc: chỉ transform/opacity, ngắn (≤ 0,5 s), không lặp, không hoạt ảnh nào chặn thao tác.
   Những cú áp lên NHIỀU phần tử chạy bằng Web Animations API (chạy trên luồng compositor — luồng
   chính đang bận dựng lưới tệp vẫn không giật), đường cong lò xo lấy từ anime.js rồi đổi sang
   `linear(...)` bằng `waapi.convertEase`. Gọi thẳng `el.animate()` với fill `backwards` thay cho
   `waapi.animate()`: xong là biến mất, KHÔNG ghi giá trị cuối vào style nội tuyến — một
   `transform` còn sót sẽ nhốt menu `position: fixed`, một `opacity: 1` còn sót sẽ đè lớp mờ của
   thẻ đang "Cắt". */

/** @param {ReturnType<typeof spring>} s */
const springTiming = (s) => ({ easing: waapi.convertEase(s.ease), duration: s.settlingDuration });

const GLIDE = springTiming(spring({ bounce: 0.12, duration: 440 }));
const RISE = springTiming(spring({ bounce: 0.2, duration: 460 }));
const ENTER = springTiming(spring({ bounce: 0.25, duration: 420 }));
const TICK = springTiming(spring({ bounce: 0.4, duration: 360 }));

/**
 * @param {Element} el
 * @param {Keyframe[]} keyframes
 * @param {{easing: string, duration: number}} timing
 * @param {number} [delay]
 */
const play = (el, keyframes, timing, delay = 0) => el.animate?.(keyframes, { ...timing, delay, fill: 'backwards' });

/**
 * Gắn sao: ngôi sao bật to rồi xoay đúng 72° — một cánh sao, nên dừng lại vẫn y hệt hình cũ.
 * Bỏ sao: chỉ thu nhẹ rồi về.
 * @param {Element|null} el
 * @param {boolean} starred trạng thái MỚI
 */
export function popStar(el, starred) {
    if (!canAnimate(el)) return;
    if (starred) {
        animate(el, {
            scale: [
                { to: 1.38, duration: 120, ease: 'out(2)' },
                { to: 1, ease: spring({ bounce: 0.55, duration: 520 }) },
            ],
            rotate: { from: 0, to: 72, ease: spring({ bounce: 0.3, duration: 620 }) },
            onComplete: () => el.style.removeProperty('transform'),
        });
    } else {
        animate(el, {
            scale: [
                { to: 0.78, duration: 90, ease: 'out(2)' },
                { to: 1, ease: spring({ bounce: 0.35, duration: 380 }) },
            ],
            onComplete: () => el.style.removeProperty('transform'),
        });
    }
}

/**
 * Con số vừa đổi (vd. "Đã chọn 3 mục"): nhích lên một chút rồi về — báo "đã ghi nhận" mà không
 * bắt mắt người dùng rời khỏi chỗ đang bấm.
 * @param {Element|null} el
 */
export function tickNumber(el) {
    if (!canAnimate(el)) return;
    play(el, [{ transform: 'translateY(-3px) scale(1.06)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], TICK);
}

/**
 * Vẽ nét một đường SVG từ đầu tới cuối (dấu ✓ thành công) bằng `svg.createDrawable`.
 * Giảm chuyển động: đường đã vẽ đủ sẵn, không làm gì.
 * @param {SVGPathElement|null} path
 * @param {number} [delay]
 */
export function drawStroke(path, delay = 60) {
    if (!canAnimate(path)) return;
    animate(svg.createDrawable(path), {
        draw: ['0 0', '0 1'],
        duration: 420,
        delay,
        ease: 'out(3)',
    });
}

/**
 * Một loạt phần tử vừa xuất hiện (mở thư mục, mở bảng thông báo): rõ dần và trồi 6px, lệch nhịp
 * 22 ms. Chỉ nhịp cho ~24 phần tử đầu — phần dưới nằm ngoài màn hình, chờ chúng là chờ vô ích.
 * @param {Element[]} els
 */
export function revealItems(els) {
    if (!els?.length || !bulkMotionAllowed()) return;
    els.slice(0, 24).forEach((el, i) =>
        play(el, [{ opacity: 0, transform: 'translateY(6px) scale(0.985)' }, { opacity: 1, transform: 'none' }], RISE, i * 22),
    );
}

/**
 * FLIP: phần tử đã đổi chỗ (`dx`/`dy` = vị trí CŨ trừ vị trí mới) được đặt ngược về chỗ cũ rồi
 * lướt tới chỗ mới (trừ thẻ nhảy hàng — xem dưới); phần tử mới thêm thì rõ dần từ hơi nhỏ.
 * @param {Array<[Element, number, number]>} moved
 * @param {Element[]} entered
 */
export function glideItems(moved, entered) {
    if (!bulkMotionAllowed()) return;
    for (const [el, dx, dy] of moved) {
        // Thẻ phải nhảy hàng (từ đầu hàng dưới lên cuối hàng trên, hay ngược lại) mà bay chéo qua cả
        // lưới thì rối mắt: cho nó trượt ngắn 16px theo hướng đi và rõ dần ngay tại chỗ mới.
        if (dy && Math.abs(dx) > el.offsetWidth * 1.5) {
            const from = dx > 0 ? 16 : -16;
            play(el, [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }], GLIDE);
            continue;
        }
        play(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], GLIDE);
    }
    const start = moved.length ? 90 : 0;
    entered.slice(0, 24).forEach((el, i) =>
        play(el, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], ENTER, start + i * 30),
    );
}

/**
 * Một mục vừa được nối vào cuối dãy (chặng mới của breadcrumb khi mở thư mục con): trượt vào từ
 * bên trái 8px và rõ dần.
 * @param {Element|null} el
 */
export function slideInEnd(el) {
    if (!canAnimate(el)) return;
    play(el, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], RISE);
}
