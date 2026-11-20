/**
 * KHÚC XẠ THẬT cho giọt kính đang bay (20/11/2026) — người dùng: "giọt nước đi qua text thì text
 * bị khúc xạ ánh sáng, làm như thật".
 *
 * Cách làm: lớp kính trong của LiquidGroup (`.liquid-lens`, nằm TRÊN chữ, chỉ hiện khi giọt đang
 * bay) mang `backdrop-filter: url(#lg-refract-N)` — một bộ lọc SVG `feDisplacementMap` dời từng
 * điểm ảnh của những gì nằm sau giọt theo một BẢN ĐỒ DỜI vẽ sẵn bằng canvas cho đúng cỡ giọt:
 *
 *   • Thân giọt là một thấu kính lồi: điểm ảnh lấy mẫu gần tâm hơn → chữ dưới giọt PHÓNG TO nhẹ.
 *   • Vành giọt (dải `bezel` sát mép) cong gắt như mép một giọt nước: lấy mẫu sâu vào trong theo
 *     pháp tuyến của mép, càng sát mép càng mạnh → chữ chạy qua vành bị UỐN CONG, kéo giãn.
 *   • Tán sắc: ba kênh R/G/B dời lệch nhau vài phần trăm → viền chữ ở vành có ánh cầu vồng mảnh,
 *     như ánh sáng đi qua lăng kính.
 *   • Độ khúc xạ tăng theo độ nhấc (`lift` 0 → 1) của cú nhảy: giọt vừa rời chỗ còn mỏng, lên cao
 *     dày dần, đáp xuống thì phẳng lại — chữ không giật từ thẳng sang méo trong một khung hình.
 *
 * Lấy mẫu luôn hướng VÀO TRONG nên không bao giờ đọc ra ngoài khung giọt (vùng đó trong suốt) — đó
 * là lỗi của bản khúc xạ số 2 (25/10): chữ các mục nó bay qua bị nén méo và mất mảng.
 *
 * Chỉ Chromium (Chrome, Edge, Cốc Cốc, Opera…) vẽ được `backdrop-filter: url(…)`. Safari/Firefox
 * giữ lớp kính trong như cũ (tăng bão hoà + viền sáng, không bẻ cong) — `supportsRefraction()`.
 * Chế độ kính "Tiết kiệm" (`html.glass-lite`) giấu hẳn lớp kính trong nên cũng không khúc xạ.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Chromium mới vẽ được bộ lọc SVG trong backdrop-filter; các trình duyệt khác bỏ qua. */
let supported;
export function supportsRefraction() {
    if (supported !== undefined) return supported;
    supported = false;
    if (typeof window === 'undefined' || typeof document === 'undefined') return supported;
    const css = window.CSS;
    if (!css?.supports?.('backdrop-filter', 'url(#a)') && !css?.supports?.('-webkit-backdrop-filter', 'url(#a)')) {
        return supported;
    }
    const brands = navigator.userAgentData?.brands;
    const isChromium = brands
        ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand))
        : /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent);
    supported = isChromium;
    return supported;
}

let defsHost = null;
function getDefs() {
    if (defsHost?.isConnected) return defsHost;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defsHost = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defsHost);
    document.body.appendChild(svg);
    return defsHost;
}

/** Độ lệch kênh màu (tán sắc): đỏ bẻ ít nhất, lam nhiều nhất. */
const DISPERSION = { r: 1, g: 1.03, b: 1.06 };
/** Phóng đại của thân giọt: lấy mẫu gần tâm hơn chừng này phần (0.07 ≈ phóng 1,075×). */
const MAGNIFY = 0.07;

/**
 * Bản đồ dời cho một khung bo góc W×H, bán kính R. Trả data URL (PNG) + `scale` cần dùng với nó.
 * Kênh R = dời ngang, G = dời dọc, mã hoá 0.5 + d/scale (feDisplacementMap: dời = scale·(C − 0.5)).
 */
const mapCache = new Map();
function buildMap(W, H, R) {
    const key = `${W}x${H}r${R}`;
    const cached = mapCache.get(key);
    if (cached) return cached;

    const cx = W / 2;
    const cy = H / 2;
    const halfW = W / 2;
    const halfH = H / 2;
    const r = Math.min(R, halfW, halfH);
    // Bề dày vành: phần cong của giọt — MỎNG (mục thanh bên ~40px → vành ~8px). Vành dày (bản
    // thử đầu: 2/3 nửa chiều cao) thì mép trên và mép dưới cùng ép chữ vào giữa, chữ vỡ thành mảnh.
    const bezel = Math.min(10, Math.max(4, Math.min(halfW, halfH) * 0.42));
    const edgeMax = bezel * 0.7;

    const dx = new Float32Array(W * H);
    const dy = new Float32Array(W * H);
    let maxAbs = 0.5;
    for (let y = 0; y < H; y++) {
        const py = y + 0.5 - cy;
        const ay = Math.abs(py);
        for (let x = 0; x < W; x++) {
            const px = x + 0.5 - cx;
            const ax = Math.abs(px);
            // Khoảng cách có dấu tới mép khung bo góc (âm = bên trong) và pháp tuyến ra ngoài.
            const qx = ax - (halfW - r);
            const qy = ay - (halfH - r);
            let dist;
            let nx;
            let ny;
            if (qx > 0 && qy > 0) {
                const len = Math.hypot(qx, qy) || 1;
                dist = len - r;
                nx = (qx / len) * Math.sign(px);
                ny = (qy / len) * Math.sign(py);
            } else if (qx > qy) {
                dist = qx - r;
                nx = Math.sign(px);
                ny = 0;
            } else {
                dist = qy - r;
                nx = 0;
                ny = Math.sign(py);
            }
            const inside = -dist;
            const i = y * W + x;
            if (inside <= 0) continue;
            // Vành: mặt cắt kiểu "squircle" — dốc gắt sát mép, phẳng dần vào trong.
            const t = Math.min(1, inside / bezel);
            const edge = edgeMax * (1 - t) ** 2.4;
            // Lấy mẫu VÀO TRONG (ngược pháp tuyến) + về phía tâm (phóng đại).
            const vx = -nx * edge - px * MAGNIFY;
            const vy = -ny * edge - py * MAGNIFY;
            dx[i] = vx;
            dy[i] = vy;
            const m = Math.max(Math.abs(vx), Math.abs(vy));
            if (m > maxAbs) maxAbs = m;
        }
    }

    const scale = maxAbs * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let i = 0; i < W * H; i++) {
        data[i * 4] = Math.round((0.5 + dx[i] / scale) * 255);
        data[i * 4 + 1] = Math.round((0.5 + dy[i] / scale) * 255);
        data[i * 4 + 2] = 128;
        data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const result = { url: canvas.toDataURL('image/png'), scale };
    // Giữ vài chục bản đồ là đủ (mỗi nhóm một hai cỡ mục); quá thì bỏ bản cũ nhất.
    if (mapCache.size > 48) mapCache.delete(mapCache.keys().next().value);
    mapCache.set(key, result);
    return result;
}

let nextId = 0;

/**
 * Gắn khúc xạ vào một lớp kính trong. Trả `null` nếu trình duyệt không vẽ được.
 * @param {HTMLElement} lens
 */
export function createRefraction(lens) {
    if (!lens || !supportsRefraction()) return null;
    const id = `lg-refract-${++nextId}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');

    const image = document.createElementNS(SVG_NS, 'feImage');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'map');
    filter.appendChild(image);

    // Một lần dời cho mỗi kênh màu rồi cộng lại (tán sắc).
    const displacers = {};
    for (const [ch, row] of [['r', '1 0 0 0 0'], ['g', '0 1 0 0 0'], ['b', '0 0 1 0 0']]) {
        const d = document.createElementNS(SVG_NS, 'feDisplacementMap');
        d.setAttribute('in', 'SourceGraphic');
        d.setAttribute('in2', 'map');
        d.setAttribute('xChannelSelector', 'R');
        d.setAttribute('yChannelSelector', 'G');
        d.setAttribute('scale', '0');
        d.setAttribute('result', `d${ch}`);
        filter.appendChild(d);
        displacers[ch] = d;
        const m = document.createElementNS(SVG_NS, 'feColorMatrix');
        m.setAttribute('in', `d${ch}`);
        m.setAttribute('type', 'matrix');
        const zero = '0 0 0 0 0';
        const rows = { r: [row, zero, zero], g: [zero, row, zero], b: [zero, zero, row] }[ch];
        m.setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`);
        m.setAttribute('result', `c${ch}`);
        filter.appendChild(m);
    }
    const rg = document.createElementNS(SVG_NS, 'feComposite');
    rg.setAttribute('in', 'cr');
    rg.setAttribute('in2', 'cg');
    rg.setAttribute('operator', 'arithmetic');
    rg.setAttribute('k2', '1');
    rg.setAttribute('k3', '1');
    rg.setAttribute('result', 'crg');
    filter.appendChild(rg);
    const rgb = document.createElementNS(SVG_NS, 'feComposite');
    rgb.setAttribute('in', 'crg');
    rgb.setAttribute('in2', 'cb');
    rgb.setAttribute('operator', 'arithmetic');
    rgb.setAttribute('k2', '1');
    rgb.setAttribute('k3', '1');
    filter.appendChild(rgb);

    getDefs().appendChild(filter);
    lens.classList.add('has-refraction');
    lens.style.setProperty('--lens-filter', `url(#${id})`);

    let mapScale = 0;
    let strength = -1;

    const applyStrength = (s) => {
        for (const ch of ['r', 'g', 'b']) {
            displacers[ch].setAttribute('scale', (mapScale * s * DISPERSION[ch]).toFixed(2));
        }
    };

    return {
        /** Cỡ giọt đổi (đổi mục, đổi bố cục): vẽ lại bản đồ cho đúng cỡ mới. */
        resize(w, h, radius) {
            const W = Math.max(2, Math.round(w));
            const H = Math.max(2, Math.round(h));
            const R = Math.max(0, Math.round(radius));
            const map = buildMap(W, H, R);
            for (const el of [filter, image]) {
                el.setAttribute('width', String(W));
                el.setAttribute('height', String(H));
            }
            image.setAttribute('href', map.url);
            mapScale = map.scale;
            if (strength >= 0) applyStrength(strength);
        },
        /** Độ khúc xạ theo độ nhấc (0 → 1), làm tròn để không ghi thuộc tính mỗi khung vô ích. */
        setStrength(lift) {
            // Lên nhanh, hạ chậm: chữ cong ngay khi giọt rời chỗ, phẳng lại mượt lúc đáp.
            const s = Math.round(Math.min(1, lift * 1.6) ** 0.8 * 50) / 50;
            if (s === strength) return;
            strength = s;
            applyStrength(s);
        },
        destroy() {
            filter.remove();
            lens.classList.remove('has-refraction');
            lens.style.removeProperty('--lens-filter');
        },
    };
}
