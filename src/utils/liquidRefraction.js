/**
 * Khúc xạ cho giọt kính (LiquidGroup) — phần làm cho nó là kính "lỏng" thật chứ không chỉ
 * là một mảng trắng mờ: mọi thứ nằm dưới MÉP giọt bị bẻ cong như nhìn qua một giọt nước.
 *
 * Cách làm: `backdrop-filter: url(#bộ-lọc-svg)` với `feDisplacementMap`. Bộ lọc đọc một ảnh
 * "bản đồ dịch chuyển" — kênh đỏ = lệch ngang, kênh xanh lá = lệch dọc, 128 = đứng yên — rồi
 * với mỗi điểm ảnh của phần nền phía sau, lấy mẫu ở chỗ bị lệch đi.
 *
 * Bản đồ ở đây chỉ lệch trong một DẢI MÉP (`bevel`), phần giữa giọt để nguyên: nhãn của mục
 * đang rê chuột vẫn nét, chỉ phần nền sát mép bị uốn — và khi giọt trượt ngang qua chữ của mục
 * bên cạnh thì chữ đó cong theo mép giọt.
 *
 * CHỈ CHROMIUM (Chrome, Edge, Cốc Cốc, Brave, Opera) vẽ được `backdrop-filter` bằng bộ lọc SVG.
 * Safari bỏ qua cả khai báo, Firefox thì không ổn định — hai trình duyệt đó dùng giọt kính
 * không khúc xạ (vẫn có viền sáng, bóng đổ, ánh theo chuột).
 */

/**
 * Bật khúc xạ hay không — tính MỘT lần lúc nạp module.
 *
 * Dò theo `navigator.userAgentData.brands` (chỉ Chromium có) chứ không theo
 * `CSS.supports('backdrop-filter', 'url(#a)')`: Safari trả `true` cho câu hỏi đó dù không vẽ.
 * Người dùng bật "Giảm độ trong suốt" thì không bẻ cong gì cả.
 */
export const canRefract = (() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const brands = navigator.userAgentData?.brands ?? [];
    if (!brands.some((b) => /chromium/i.test(b.brand))) return false;
    if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false;
    return Boolean(window.CSS?.supports?.('backdrop-filter', 'url(#a)'));
})();

// Mỗi cỡ giọt (cỡ của mục nó nằm lên) chỉ vẽ bản đồ một lần. Một ứng dụng có vài chục cỡ mục
// khác nhau là cùng — giới hạn để không phình mãi nếu cửa sổ bị kéo giãn liên tục.
const cache = new Map();
const CACHE_LIMIT = 48;

/**
 * Bản đồ dịch chuyển cho một hình chữ nhật bo góc cỡ `width` × `height`.
 *
 * Lực lệch tối đa (`scale` của feDisplacementMap) được giữ DƯỚI ngưỡng "gập": dải mép đi từ
 * lệch hết cỡ về 0 trong `bevel` px theo đường smoothstep (độ dốc lớn nhất 1.5/bevel), nên với
 * scale/2 · 1.5/bevel < 1 thì không có điểm nào lấy mẫu "lùi" qua điểm bên cạnh — vượt ngưỡng
 * đó là chữ dưới mép giọt bị lật ngược như gương (đã thấy khi thử với scale 24, bevel 10).
 *
 * @param {number} width  Bề rộng giọt (px CSS)
 * @param {number} height Chiều cao giọt (px CSS)
 * @param {number} radius Bán kính bo góc (px CSS)
 * @returns {{ url: string, scale: number, width: number, height: number }}
 */
export function displacementMap(width, height, radius) {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    const r = Math.max(0, Math.min(Math.round(radius), Math.floor(w / 2), Math.floor(h / 2)));
    const key = `${w}x${h}r${r}`;

    const hit = cache.get(key);
    if (hit) return hit;

    // Giọt nhỏ (nút ☰ 28px) thì mép mỏng theo — mép 11px trên một nút 28px là bẻ cong cả nút.
    const bevel = Math.min(11, Math.max(4, Math.min(w, h) * 0.26));
    const scale = bevel * 1.2;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const hw = w / 2;
    const hh = h / 2;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Khoảng cách có dấu (SDF) tới viền hình chữ nhật bo góc: âm là ở bên trong.
            const px = x + 0.5 - hw;
            const py = y + 0.5 - hh;
            const qx = Math.abs(px) - (hw - r);
            const qy = Math.abs(py) - (hh - r);
            const ox = Math.max(qx, 0);
            const oy = Math.max(qy, 0);
            const dist = Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;

            // 1 ở sát viền → 0 khi vào sâu quá `bevel`; smoothstep cho mép cong mềm.
            let t = Math.max(0, 1 + dist / bevel);
            t = t * t * (3 - 2 * t);

            // Hướng pháp tuyến (chĩa ra ngoài) — ở góc bo là hướng từ tâm cung ra.
            let nx = 0;
            let ny = 0;
            if (qx > 0 && qy > 0) {
                const len = Math.hypot(ox, oy) || 1;
                nx = ox / len;
                ny = oy / len;
            } else if (qx > qy) {
                nx = 1;
            } else {
                ny = 1;
            }
            nx *= Math.sign(px) || 1;
            ny *= Math.sign(py) || 1;

            // Lệch NGƯỢC pháp tuyến: mép giọt lấy mẫu từ phía TRONG (phần nền sát mép bị kéo giãn
            // ra như qua mép thấu kính). Lấy mẫu ra phía ngoài thì chạm vào vùng ngoài khung giọt,
            // nơi Chromium lấp nền bằng cách SOI GƯƠNG mép — chữ hiện lộn ngược ở mép trên giọt.
            const i = (y * w + x) * 4;
            data[i] = 128 - nx * t * 127;
            data[i + 1] = 128 - ny * t * 127;
            data[i + 2] = 128;
            data[i + 3] = 255;
        }
    }

    ctx.putImageData(img, 0, 0);
    const result = { url: canvas.toDataURL('image/png'), scale, width: w, height: h };

    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
}
