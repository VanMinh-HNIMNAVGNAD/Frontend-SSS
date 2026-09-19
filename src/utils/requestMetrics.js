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

// ── Đo byte và 200/304 của API, bằng Resource Timing ─────────────────────────

/**
 * Vì sao phải đi đường vòng qua Resource Timing thay vì đọc từ axios.
 *
 * Hai lý do, và cái thứ hai mới là cái quyết định:
 *
 *  1. axios (XHR) không cho biết một response tốn bao nhiêu byte trên dây.
 *     `content-length` thì thường vắng mặt vì response đã đi qua `compression()`
 *     và được gửi theo lối chunked.
 *  2. **Ứng dụng KHÔNG BAO GIỜ nhìn thấy `304`.** Trình duyệt tự gửi
 *     `If-None-Match`, tự nhận 304, rồi đưa cho XHR một `200` dựng lại từ bộ đệm.
 *     Nên đếm `status` ở tầng axios sẽ báo 100% là 200 kể cả khi ETag đang chạy
 *     hoàn hảo — đúng loại phép đo tệ nhất: nó không im lặng, nó nói sai.
 *
 * Resource Timing thì thấy cả ba trạng thái. Điều kiện: backend phải gửi
 * `Timing-Allow-Origin` (đã thêm ở `main.ts`), nếu không mọi con số đều bị che
 * thành 0 và bảng dưới đây sẽ nói thẳng là nó mù.
 */
const apiByEndpoint = new Map(); // key -> { responses, network, revalidated, cached, blind, bodyBytes, wireBytes, totalMs }

/** Bỏ qua mọi entry sinh ra trước lần `reset()` gần nhất. */
let metricsSince = 0;

function apiEntryFor(key) {
  let entry = apiByEndpoint.get(key);
  if (!entry) {
    entry = {
      responses: 0,
      network: 0,
      revalidated: 0,
      cached: 0,
      blind: 0,
      bodyBytes: 0,
      wireBytes: 0,
      savedBytes: 0,
      totalMs: 0,
    };
    apiByEndpoint.set(key, entry);
  }
  return entry;
}

/**
 * Một lượt response thuộc loại nào.
 *
 *  • `cached`      — không đi mạng chút nào (`transferSize === 0` mà vẫn có thân).
 *  • `revalidated` — ĐÃ đi mạng, nhưng server trả 304 nên chỉ có header đi qua dây.
 *                    Đây chính là con số mà ETag sinh ra để tạo.
 *  • `network`     — 200 thật, tải cả thân về.
 *  • `blind`       — không đọc được gì (thiếu `Timing-Allow-Origin`).
 *
 * Dấu hiệu của 304 là `transferSize < encodedBodySize`, KHÔNG phải
 * `encodedBodySize === 0`.
 *
 * Bản đầu của hàm này dùng điều kiện sau và nó sai, theo kiểu tệ nhất: bảng đo báo
 * "0 lượt 304" trong khi log của server cho thấy mọi lượt đều trả 304. Lý do là
 * `encodedBodySize` mô tả THÂN CỦA RESPONSE, kể cả khi thân ấy được dựng lại từ bộ
 * đệm và không tốn một byte mạng nào — còn `transferSize` mới là số byte thật sự đi
 * qua dây (với 304 thì chỉ vài trăm byte header). Phát hiện bằng cách chạy thật
 * trong Chrome; xem `35.5` trong `.ai/task-ledger.md`.
 */
function classifyResource(entry) {
  const { transferSize = 0, encodedBodySize = 0, decodedBodySize = 0 } = entry;
  if (transferSize === 0) return decodedBodySize > 0 ? 'cached' : 'blind';
  if (encodedBodySize > 0 && transferSize < encodedBodySize) return 'revalidated';
  return 'network';
}

function noteResource(entry) {
  if (entry.startTime < metricsSince) return;
  if (entry.initiatorType !== 'xmlhttprequest' && entry.initiatorType !== 'fetch') return;
  if (!entry.name.includes('/api/')) return;

  const key = `GET ${normalizePath(entry.name.replace(/^https?:\/\/[^/]+/, ''))}`;
  const row = apiEntryFor(key);
  const kind = classifyResource(entry);

  row.responses += 1;
  row.totalMs += entry.duration;
  row.wireBytes += entry.transferSize || 0;
  row[kind] += 1;

  if (kind === 'network') row.bodyBytes += entry.encodedBodySize || 0;
  // Một lượt 304 cho biết CHÍNH XÁC phần đã tiết kiệm: thân mà client không phải
  // tải (`encodedBodySize`), trừ đi phần header đã thật sự đi (`transferSize`).
  // Không cần ước lượng bằng trung bình như bản đầu.
  if (kind === 'revalidated') {
    row.savedBytes += Math.max(0, (entry.encodedBodySize || 0) - (entry.transferSize || 0));
  }
}

if (metricsEnabled && typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) noteResource(entry);
    }).observe({ type: 'resource', buffered: true });
  } catch {
    // Trình duyệt không hỗ trợ `type`/`buffered` — bảng API sẽ rỗng, phần còn lại
    // của công cụ đo vẫn chạy.
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function reset() {
  byEndpoint.clear();
  recentExact.clear();
  apiByEndpoint.clear();
  // Mốc này là thứ giữ cho `buffered: true` của PerformanceObserver không kéo lại
  // cả những lượt gọi từ trước lúc đo.
  metricsSince = typeof performance !== 'undefined' ? performance.now() : 0;
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

/**
 * Bảng đo của ETag: byte, 200 vs 304, và thời gian.
 *
 * CỐ Ý tách hẳn khỏi `bytes()` (byte ảnh thumbnail). Hai phép đo trả lời hai câu
 * hỏi khác nhau, và trộn chúng lại thì không con số nào còn dùng để ra quyết định
 * được nữa: một thay đổi làm giảm byte thumbnail có thể đồng thời làm tăng số lượt
 * gọi API, mà tổng gộp lại vẫn đẹp.
 *
 * Cột `đã tiết kiệm` là số ĐO, không phải ước lượng: mỗi lượt 304 tự nói ra phần
 * thân mà client không phải tải (`encodedBodySize`) và phần header đã thật sự đi
 * (`transferSize`); hiệu của chúng là byte tiết kiệm được.
 */
export function api() {
  const rows = [...apiByEndpoint.entries()]
    .map(([endpoint, e]) => ({
      endpoint,
      responses: e.responses,
      '200': e.network,
      '304': e.revalidated,
      'từ cache': e.cached,
      'không đọc được': e.blind,
      'thân TB (200)': formatBytes(e.network ? Math.round(e.bodyBytes / e.network) : 0),
      'byte qua dây': formatBytes(e.wireBytes),
      'đã tiết kiệm': formatBytes(e.savedBytes),
      'thời gian TB': `${Math.round(e.totalMs / Math.max(1, e.responses))} ms`,
    }))
    .sort((a, b) => b.responses - a.responses);

  const blind = rows.reduce((sum, r) => sum + r['không đọc được'], 0);
  if (blind > 0) {
    console.warn(
      `[driver] ${blind} lượt không đọc được kích thước — backend chưa gửi ` +
        '`Timing-Allow-Origin` cho origin này, xem `main.ts`.',
    );
  }
  console.table(rows);
  return rows;
}

// Cửa vào duy nhất từ Console. Gắn một lần, chỉ khi đã bật.
if (metricsEnabled && typeof window !== 'undefined') {
  window.__driver = { reset, report, snapshot, bytes, api };
  console.info(
    '[driver] Đang đếm request. Dùng __driver.reset() rồi __driver.report(); ' +
      '__driver.api() cho bảng 200/304 và byte của API.',
  );
}
