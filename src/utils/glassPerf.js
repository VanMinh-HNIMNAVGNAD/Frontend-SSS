import { useSyncExternalStore } from 'react';

/**
 * Mức hiệu ứng kính (06/11/2026) — người dùng báo "liquid glass còn khá lag trên máy yếu".
 *
 * Thứ tốn GPU nhất của giao diện là `backdrop-filter: blur()` trên mọi bề mặt nổi (panel AI, hộp
 * thoại, menu, toast, trình xem tệp) — mỗi khung hình có gì đó chuyển động PHÍA SAU chúng (cuộn
 * danh sách, giọt kính nhảy, tiến trình tải lên) là GPU phải làm mờ lại cả vùng đó. Máy có GPU rời
 * thì không sao; máy văn phòng đời cũ, Chromebook, điện thoại tầm thấp, hay trình duyệt đang tắt
 * tăng tốc phần cứng thì tụt xuống vài chục khung hình/giây.
 *
 * Ba mức, chọn ở Cài đặt → Cài đặt chung → Hiệu ứng kính:
 *   • `full`  — như cũ: kính mờ, viền sáng, giọt nước nhấc lên có bóng xa + lớp kính trong;
 *   • `lite`  — "Tiết kiệm": bỏ HẾT backdrop-filter (bề mặt đục hơn để chữ vẫn đọc rõ), bỏ viền sáng
 *               dùng mask, bóng đổ một lớp; giọt nước vẫn nhảy (chỉ là transform — rẻ) nhưng không
 *               nhấc bóng. Xem khối `.glass-lite` trong index.css / liquid-glass.css;
 *   • `auto`  — mặc định: `lite` khi máy có dấu hiệu yếu (bên dưới), còn lại `full`.
 *
 * Dấu hiệu "máy yếu" của `auto`:
 *   1. trình duyệt không cho WebGL tăng tốc phần cứng (`failIfMajorPerformanceCaveat`) — tức đang vẽ
 *      bằng CPU, blur là thảm hoạ; dò một lần lúc rảnh, nhớ 7 ngày;
 *   2. RAM ≤ 2 GB, hoặc ≤ 4 GB và ≤ 4 nhân, hoặc ≤ 2 nhân; bật "Tiết kiệm dữ liệu";
 *   3. ĐO THẬT: chính giọt kính báo số khung hình chậm của mỗi cú nhảy (utils/liquidMotion.js). Ba cú
 *      nhảy giật (trên 30% khung hình dưới 30 fps) trong một phiên ⇒ chuyển sang `lite` cho phiên đó.
 *      Một lượt render nặng của React chỉ làm hụt 1–2 khung (một khoảng dài), không đủ 30%, nên bấm
 *      chuyển trang không bị tính nhầm là máy yếu.
 */

export const GLASS_FX_KEY = 'driveR_settings_glassFx';
const PROBE_KEY = 'driveR_glassFx_probe';
const SESSION_JANK_KEY = 'driveR_glassFx_janky';
const PROBE_TTL_MS = 7 * 24 * 3600 * 1000;
const JANKY_JUMPS_TO_LITE = 3;

const MODES = new Set(['auto', 'full', 'lite']);

function safeGet(storage, key) {
    try {
        return storage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

function safeSet(storage, key, value) {
    try {
        storage?.setItem(key, value);
    } catch {
        // Chế độ riêng tư / bộ nhớ bị chặn: chỉ là không nhớ được qua lần sau.
    }
}

const hasWindow = typeof window !== 'undefined';
const local = hasWindow ? window.localStorage : null;
const session = hasWindow ? window.sessionStorage : null;

let pref = MODES.has(safeGet(local, GLASS_FX_KEY)) ? safeGet(local, GLASS_FX_KEY) : 'auto';
/** Lý do `auto` chọn `lite` (null = máy ổn) — Cài đặt hiện ra cho người dùng biết vì sao. */
let autoLiteReason = null;
let jankyJumps = 0;
const listeners = new Set();

function hardwareReason() {
    if (!hasWindow) return null;
    const nav = window.navigator || {};
    if (nav.connection?.saveData) return 'saveData';
    const cores = Number(nav.hardwareConcurrency) || 0;
    const memory = Number(nav.deviceMemory) || 0;
    if (memory && memory <= 2) return 'lowMemory';
    if (cores && cores <= 2) return 'lowCpu';
    if (memory && memory <= 4 && cores && cores <= 4) return 'lowEnd';
    try {
        const probe = JSON.parse(safeGet(local, PROBE_KEY) || 'null');
        if (probe && Date.now() - probe.at < PROBE_TTL_MS && probe.software) return 'noGpu';
    } catch {
        // Bản ghi hỏng: dò lại lúc rảnh.
    }
    if (safeGet(session, SESSION_JANK_KEY) === '1') return 'janky';
    return null;
}

autoLiteReason = hardwareReason();

export function isGlassLite() {
    return pref === 'lite' || (pref === 'auto' && autoLiteReason !== null);
}

function snapshot() {
    return `${pref}|${autoLiteReason ?? ''}`;
}

let lastSnapshot = snapshot();

function apply() {
    if (!hasWindow) return;
    document.documentElement.classList.toggle('glass-lite', isGlassLite());
    const next = snapshot();
    if (next !== lastSnapshot) {
        lastSnapshot = next;
        listeners.forEach((l) => l());
    }
}

export function getGlassFxPref() {
    return pref;
}

export function getAutoLiteReason() {
    return autoLiteReason;
}

export function setGlassFxPref(mode) {
    if (!MODES.has(mode)) return;
    pref = mode;
    safeSet(local, GLASS_FX_KEY, mode);
    apply();
}

export function subscribeGlassFx(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** `{ pref, lite, reason }` — đổi khi người dùng chọn mức khác hoặc `auto` vừa phát hiện máy yếu. */
export function useGlassFx() {
    const snap = useSyncExternalStore(subscribeGlassFx, snapshot, snapshot);
    void snap;
    return { pref, lite: isGlassLite(), reason: autoLiteReason };
}

/**
 * Giọt kính báo về sau mỗi cú nhảy. `frames` = số khung hình của cú nhảy, `slow` = số khung dài hơn
 * ~34 ms (dưới 30 fps). Chỉ đếm khi tab đang hiện (tab ẩn thì trình duyệt tự bóp rAF).
 */
export function reportLiquidFrames(frames, slow) {
    if (autoLiteReason !== null || frames < 8) return;
    if (hasWindow && document.visibilityState !== 'visible') return;
    if (slow / frames <= 0.3) return;
    jankyJumps += 1;
    if (jankyJumps < JANKY_JUMPS_TO_LITE) return;
    autoLiteReason = 'janky';
    safeSet(session, SESSION_JANK_KEY, '1');
    apply();
}

/**
 * Dò tăng tốc phần cứng một lần lúc rảnh: `failIfMajorPerformanceCaveat` khiến `getContext` trả
 * null khi trình duyệt sẽ vẽ WebGL bằng CPU (SwiftShader/llvmpipe, GPU bị chặn, tắt tăng tốc phần
 * cứng). Ngữ cảnh được huỷ ngay để trả bộ nhớ GPU.
 */
function probeGpu() {
    try {
        const cached = JSON.parse(safeGet(local, PROBE_KEY) || 'null');
        if (cached && Date.now() - cached.at < PROBE_TTL_MS) return;
    } catch {
        // dò lại
    }
    let software;
    try {
        const canvas = document.createElement('canvas');
        const gl =
            canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) ||
            canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true });
        software = !gl;
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
        software = false;
    }
    safeSet(local, PROBE_KEY, JSON.stringify({ software, at: Date.now() }));
    if (software && autoLiteReason === null) {
        autoLiteReason = 'noGpu';
        apply();
    }
}

/** Gọi một lần ở main.jsx, TRƯỚC render đầu tiên — class có sẵn từ khung hình đầu, không nháy. */
export function initGlassFx() {
    if (!hasWindow) return;
    apply();
    const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 2500));
    idle(() => probeGpu(), { timeout: 5000 });
}
