/**
 * Ánh sáng theo chuột cho kính (Liquid Glass 2) — MỘT listener `pointermove` cho cả ứng dụng.
 *
 * Mỗi khung hình (gộp qua requestAnimationFrame, chuột 1000Hz cũng chỉ tính 60 lần/giây), đi
 * ngược từ phần tử dưới con trỏ lên tới gốc và ghi toạ độ con trỏ — tính theo khung của từng
 * phần tử — vào biến CSS của:
 *   • tấm kính LỚN có <GlassLight/> bên trong   → `--lx` / `--ly` trên chính lớp ánh sáng;
 *   • phần tử có đốm bóng (`.glass-soft`, `.glass-input`, `.btn-accent`, `[data-spotlight]`)
 *                                                → `--spot-x` / `--spot-y` trên phần tử đó.
 * Ghi cho MỌI cấp chứ không chỉ cấp trong cùng: rê lên nút "+ Mới" thì cả nút lẫn thanh bên
 * chứa nó đều sáng đúng chỗ.
 *
 * Bật/tắt ánh sáng là việc của CSS (`:hover`, xem styles/liquid-glass.css) — file này chỉ lo
 * toạ độ, nên không có trạng thái "đang sáng" nào phải dọn khi chuột rời đi.
 */

const SPOT_SELECTOR = '.glass-soft, .glass-input, .btn-accent, [data-spotlight]';

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
        if (!light && !isSpot) continue;

        // Theo khung đệm (padding box) — gốc toạ độ của cả `background` lẫn con `absolute`.
        const rect = el.getBoundingClientRect();
        const x = `${pointerX - rect.left - el.clientLeft}px`;
        const y = `${pointerY - rect.top - el.clientTop}px`;
        if (isSpot) {
            el.style.setProperty('--spot-x', x);
            el.style.setProperty('--spot-y', y);
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
