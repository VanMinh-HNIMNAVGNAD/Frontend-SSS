/**
 * Hoạt ảnh nhỏ dùng anime.js v4 (20/11/2026) — nảy icon, bật số đếm, lắc chuông, hiện dần danh sách.
 *
 * Chỉ dùng cho những cú "một phát" ngắn trên vài phần tử (transform/opacity — trình duyệt không phải
 * tính lại bố cục). Giọt kính đang chọn KHÔNG dùng anime.js: nó có vật lý lò xo bốn mép riêng
 * (utils/liquidMotion.js) mà một tween không thay được.
 *
 * Người dùng bật "Giảm chuyển động" trong hệ điều hành thì mọi hàm ở đây không làm gì.
 */
import { animate, spring, stagger } from 'animejs';

const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

const canAnimate = (el) => Boolean(el) && !reducedMotion?.matches;

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
