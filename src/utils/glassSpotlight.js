/**
 * Ánh sáng theo chuột cho kính — MỘT listener `pointermove` cho cả ứng dụng.
 *
 * Mỗi khung hình (gộp qua requestAnimationFrame, chuột 1000Hz cũng chỉ tính 60 lần/giây), đi
 * ngược từ phần tử dưới con trỏ lên tới gốc và ghi toạ độ con trỏ — tính theo khung của từng
 * phần tử — vào biến CSS của:
 *   • tấm kính LỚN có <GlassLight/> bên trong   → `--lx` / `--ly` trên chính lớp ánh sáng;
 *   • bề mặt nổi `.glass-strong` / `.glass-dark` (menu, hộp thoại, ngăn kéo…)
 *                                                → `--lx` / `--ly` trên bề mặt đó (CSS vẽ bằng
 *                                                  `::before` / `::after`);
 *   • phần tử có đốm bóng (`.glass-soft`, `.glass-input`, `[data-spotlight]`)
 *                                                → `--spot-x` / `--spot-y` trên phần tử đó.
 * Ghi cho MỌI cấp chứ không chỉ cấp trong cùng: rê lên khối bộ nhớ thì cả khối lẫn thanh bên
 * chứa nó đều sáng đúng chỗ.
 *
 * CHỈ phần tử ĐỦ LỚN mới được chiếu sáng. Trên một nút 30px, đốm sáng chạy theo chuột và quầng
 * sáng của bề mặt chỉ còn là một cục tròn bóng loáng — trông như dán một giọt nước lên nút, đúng
 * thứ không nên có ở bong bóng chat AI, ô chọn ☐, nút lọc… Phần tử nhỏ không bao giờ nhận toạ độ;
 * với đốm bóng, phần tử đủ lớn còn được gắn `data-spot` — CSS chỉ vẽ đốm khi có thuộc tính này.
 *
 * Bật/tắt ánh sáng khi rê vào/rời đi là việc của CSS (`:hover`, xem styles/liquid-glass.css).
 */

// Không có `.btn-accent`: nút xanh vốn nhỏ hơn ngưỡng dưới, còn bong bóng tin nhắn trong khung chat AI
// cũng mượn btn-accent để lấy màu xanh và thường đủ lớn — đốm sáng chạy theo chuột trên tin nhắn là sai chỗ.
const SPOT_SELECTOR = '.glass-soft, .glass-input, [data-spotlight]';
const SURFACE_SELECTOR = '.glass-strong, .glass-dark';

/** Đốm bóng: chỉ phần tử rộng ≥ 120px VÀ cao ≥ 56px (khối bộ nhớ, thẻ tệp) — không nút, ô nhập. */
const SPOT_MIN_WIDTH = 120;
const SPOT_MIN_HEIGHT = 56;
/** Quầng sáng của bề mặt nổi: chỉ bề mặt ≥ 120×120px (menu, hộp thoại, ngăn kéo). */
const SURFACE_MIN_SIZE = 120;

/** Tấm kính → lớp ánh sáng của nó. WeakMap: tấm kính bị gỡ khỏi DOM là tự rơi ra. */
const lights = new WeakMap();

let target = null;
let pointerX = 0;
let pointerY = 0;
let frame = 0;
let installed = false;

/**
 * Ref callback của <GlassLight/>: đăng ký lớp ánh sáng cho tấm kính cha của nó.
 * Trả về hàm dọn (React 19 gọi khi phần tử bị gỡ).
 *
 * @param {HTMLElement | null} light
 */
export function registerGlassLight(light) {
    const host = light?.parentElement;
    if (!host) return undefined;
    lights.set(host, light);
    return () => {
        if (lights.get(host) === light) lights.delete(host);
    };
}

function paint() {
    frame = 0;
    for (let el = target; el && el !== document.documentElement; el = el.parentElement) {
        const light = lights.get(el);
        const isSpot = el.matches(SPOT_SELECTOR);
        // Bề mặt nổi đã có <GlassLight/> riêng (thanh bên trên điện thoại) thì lớp đó lo.
        const isSurface = !light && el.matches(SURFACE_SELECTOR);
        if (!light && !isSpot && !isSurface) continue;

        // Theo khung đệm (padding box) — gốc toạ độ của cả `background` lẫn con `absolute`.
        const rect = el.getBoundingClientRect();
        const x = `${pointerX - rect.left - el.clientLeft}px`;
        const y = `${pointerY - rect.top - el.clientTop}px`;
        if (isSpot) {
            const big = rect.width >= SPOT_MIN_WIDTH && rect.height >= SPOT_MIN_HEIGHT;
            if (big !== el.hasAttribute('data-spot')) el.toggleAttribute('data-spot', big);
            if (big) {
                el.style.setProperty('--spot-x', x);
                el.style.setProperty('--spot-y', y);
            }
        }
        const bigSurface = rect.width >= SURFACE_MIN_SIZE && rect.height >= SURFACE_MIN_SIZE;
        if (isSurface && bigSurface) {
            el.style.setProperty('--lx', x);
            el.style.setProperty('--ly', y);
        }
        if (light) {
            light.style.setProperty('--lx', x);
            light.style.setProperty('--ly', y);
        }
    }
}

function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
}

/** Gọi một lần lúc khởi động (main.jsx). Gọi lại cũng vô hại. */
export function installGlassSpotlight() {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    document.addEventListener(
        'pointermove',
        (e) => {
            // Ngón tay không "rê" — chạm là bấm luôn, không có gì để chiếu sáng.
            if (e.pointerType === 'touch') return;
            pointerX = e.clientX;
            pointerY = e.clientY;
            target = e.target instanceof Element ? e.target : null;
            schedule();
        },
        { capture: true, passive: true },
    );

    // Lăn chuột mà không nhích: nội dung trôi dưới con trỏ đứng yên, phần tử dưới con trỏ đã
    // khác. `capture` vì sự kiện scroll không nổi bọt — đây là cách nghe mọi khung cuộn.
    document.addEventListener(
        'scroll',
        () => {
            if (!target) return;
            target = document.elementFromPoint(pointerX, pointerY);
            schedule();
        },
        { capture: true, passive: true },
    );
}
