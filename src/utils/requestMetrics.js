/**
 * Đếm request để lấy số benchmark THẬT, thay vì suy ra từ việc đọc code.
 *
 * Vì sao cần: những thay đổi về cache chỉ đo được bằng "bao nhiêu request đã bay
 * đi" và "bao nhiêu byte đã tải về". Đọc code cho ra con số lý thuyết; con số thật
 * còn phụ thuộc thứ tự mount, việc gộp request, và bộ đệm của trình duyệt. Không
 * có phép đo thì mọi phát biểu "nhanh hơn N lần" đều là phỏng đoán.
 *
 * TẮT theo mặc định ở production. Bật bằng một trong hai cách:
 *   • chạy `npm run dev` (tự bật, `import.meta.env.DEV`);
 *   • hoặc trên bản build thật: `localStorage.setItem('driver:metrics', '1')` rồi F5.
 *
 * Dùng trong DevTools Console:
 *   __driver.reset()              — về 0, gọi ngay trước thao tác cần đo
 *   __driver.report()             — in bảng: endpoint, số lượt, trùng lặp, thời gian
 *   __driver.bytes()              — số byte ảnh thumbnail đã tải về
 *
 * Cố ý KHÔNG gửi số liệu đi đâu: đây là công cụ đo tại chỗ, không phải telemetry.
 */

const STORAGE_FLAG = 'driver:metrics';

function readFlag() {
  try {
    return localStorage.getItem(STORAGE_FLAG) === '1';
  } catch {
    // Chế độ riêng tư / lưu trữ bị chặn: chỉ cần không nổ.
    return false;
  }
}

export const metricsEnabled = Boolean(import.meta.env?.DEV) || readFlag();

/**
 * Gộp URL về dạng "khuôn" để đếm.
 *
 * `/files/a1b2.../preview-url` và `/files/c3d4.../preview-url` là CÙNG một endpoint
 * về mặt hiệu năng; đếm riêng từng id thì bảng báo cáo dài vô nghĩa và không thấy
 * được đúng thứ cần thấy — rằng endpoint đó bị gọi 50 lần.
 */
function normalizePath(url = '') {
  return (
    url
      .split('?')[0]
      // UUID
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      // token chia sẻ và các đoạn dài không phải chữ thường thuần
      .replace(/\/[A-Za-z0-9_-]{20,}/g, '/:token') || '/'
  );
}

/** Bộ đếm cho một khuôn endpoint. */
const byEndpoint = new Map(); // key -> { count, duplicates, totalMs, errors }

/**
 * Dấu vết các request ĐÃ gửi, để phát hiện trùng lặp.
 * key = `${method} ${url đầy đủ}` -> timestamp lần gần nhất.
 */
const recentExact = new Map();
const DUPLICATE_WINDOW_MS = 5000;

let thumbnailBytes = 0;
let thumbnailFetches = 0;

function entryFor(key) {
  let entry = byEndpoint.get(key);
  if (!entry) {
    entry = { count: 0, duplicates: 0, totalMs: 0, errors: 0 };
    byEndpoint.set(key, entry);
  }
  return entry;
}

/** Gọi từ request interceptor. Trả về nhãn để response interceptor khớp lại. */
export function recordRequestStart(config) {
  if (!metricsEnabled) return null;

  const method = (config?.method || 'get').toUpperCase();
  const url = config?.url || '';
  const key = `${method} ${normalizePath(url)}`;
  const entry = entryFor(key);
  entry.count += 1;

  // Trùng lặp = ĐÚNG cùng một URL (kèm query) trong một cửa sổ ngắn. Đây là thứ
  // đáng báo động: hai component cùng hỏi một câu hỏi y hệt.
  const exactKey = `${method} ${url}${JSON.stringify(config?.params ?? '')}`;
  const last = recentExact.get(exactKey);
  const now = Date.now();
  if (last && now - last < DUPLICATE_WINDOW_MS) entry.duplicates += 1;
  recentExact.set(exactKey, now);

  return { key, startedAt: now };
}

/** Gọi từ response interceptor (cả nhánh thành công và nhánh lỗi). */
export function recordRequestEnd(mark, { failed = false } = {}) {
  if (!metricsEnabled || !mark) return;
  const entry = entryFor(mark.key);
  entry.totalMs += Date.now() - mark.startedAt;
  if (failed) entry.errors += 1;
}

/**
 * Byte ảnh tải về để dựng thumbnail.
 *
 * Đếm riêng khỏi bảng endpoint vì những lượt tải này KHÔNG đi qua axios — chúng
 * là `fetch()` thẳng tới URL có chữ ký của GCS. Mà đây lại đúng là con số lớn
 * nhất trong toàn bộ vấn đề (ảnh gốc vài MB cho một ô 384px), nên bỏ nó ra ngoài
 * phép đo là đo thiếu chỗ quan trọng nhất.
 */
export function recordThumbnailBytes(bytes) {
  if (!metricsEnabled) return;
  thumbnailFetches += 1;
  thumbnailBytes += Number(bytes) || 0;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function reset() {
  byEndpoint.clear();
  recentExact.clear();
  thumbnailBytes = 0;
  thumbnailFetches = 0;
  return 'đã về 0 — giờ thực hiện thao tác cần đo, rồi gọi __driver.report()';
}

export function snapshot() {
  const rows = [...byEndpoint.entries()]
    .map(([endpoint, e]) => ({
      endpoint,
      requests: e.count,
      duplicates: e.duplicates,
      avgMs: e.count ? Math.round(e.totalMs / e.count) : 0,
      errors: e.errors,
    }))
    .sort((a, b) => b.requests - a.requests);

  return {
    rows,
    totalRequests: rows.reduce((sum, r) => sum + r.requests, 0),
    totalDuplicates: rows.reduce((sum, r) => sum + r.duplicates, 0),
    thumbnailFetches,
    thumbnailBytes,
  };
}

export function report() {
  const s = snapshot();
  console.table(s.rows);
  console.log(
    `Tổng: ${s.totalRequests} request · trùng lặp: ${s.totalDuplicates} · ` +
      `ảnh thumbnail: ${s.thumbnailFetches} lượt / ${formatBytes(s.thumbnailBytes)}`,
  );
  return s;
}

export function bytes() {
  return { fetches: thumbnailFetches, bytes: thumbnailBytes, human: formatBytes(thumbnailBytes) };
}

// Cửa vào duy nhất từ Console. Gắn một lần, chỉ khi đã bật.
if (metricsEnabled && typeof window !== 'undefined') {
  window.__driver = { reset, report, snapshot, bytes };
  console.info('[driver] Đang đếm request. Dùng __driver.reset() rồi __driver.report().');
}
