import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ảnh trong cửa sổ xem trước, nạp theo BA TẦNG thay vì nạp thẳng ảnh gốc.
 *
 * Trước 02/10/2026 cửa sổ xem trước đưa URL ảnh gốc vào <img>: ảnh chụp 30–50MB ở tốc độ
 * đo được ~2MiB/s là 15–25 giây nhìn khung trống, và một ảnh 108MP giải mã ra ~430MB
 * trong tab (điện thoại có thể không vẽ nổi). Nay:
 *
 *   1. `placeholder` — thumbnail 384px ĐÃ có trong máy (vừa thấy nó ngoài lưới): hiện ngay.
 *   2. `preview`     — bản 2048px WebP do server dựng (`GET /files/:id/preview-image`),
 *                      0,4–1MB. Đủ nét cho xem vừa khung ở hầu hết màn hình.
 *   3. `original`    — ảnh gốc, CHỈ khi người dùng phóng to quá độ nét của bản 2048 (hoặc
 *                      bấm "Xem ảnh gốc"). Tải có tiến độ, giải mã xong mới thay.
 *
 * Ảnh không đủ điều kiện (nhỏ, GIF/SVG/HEIC…) hoặc server không có bản xem trước (tính
 * năng tắt, backend cũ, lỗi) thì đi đúng đường cũ: ảnh gốc thẳng vào <img>.
 *
 * Tầng 2 KHÔNG đưa ảnh gốc vào <img> khi đang chờ: có URL trong `src` là trình duyệt kéo
 * nguyên 50MB về, tức mất đúng thứ cần tiết kiệm.
 */

/** Khớp `PREVIEW_IMAGE_MIN_BYTES` ở `backend/src/storage/storage.service.ts`. */
export const PREVIEW_IMAGE_MIN_BYTES = 1.5 * 1024 * 1024;

/** Khớp `RENDERABLE_EXT` ở `backend/src/storage/thumbnail-render.ts`. */
const SERVER_RENDERABLE = /\.(jpe?g|jfif|png|webp|avif|tiff?)$/i;

/**
 * Cần nét hơn bản 2048 bao nhiêu thì mới tải ảnh gốc. Dư 15% vì phóng nhẹ một chút trên
 * bản 2048 mắt không phân biệt được, còn tải ảnh gốc thì tốn hàng chục MB.
 */
const UPGRADE_RATIO = 1.15;

/** Kết quả `loadPreview` đã có trong phiên — lật qua lại giữa các ảnh không hỏi lại. */
const previewCache = new Map();
/** Dưới hạn chữ ký 1 giờ của URL trang chia sẻ; URL CDN thì vốn không hết hạn. */
const PREVIEW_CACHE_TTL_MS = 45 * 60 * 1000;

function readCached(key) {
  const hit = key ? previewCache.get(key) : null;
  if (!hit) return null;
  if (Date.now() - hit.at > PREVIEW_CACHE_TTL_MS) {
    previewCache.delete(key);
    return null;
  }
  return hit.value;
}

/** Ảnh này có đáng xin bản 2048 không. */
export function wantsPreviewImage(file) {
  if (!file || file.type === 'folder') return false;
  const size = Number(file.sizeBytes ?? file.size ?? 0);
  return SERVER_RENDERABLE.test(file.name || '') && size >= PREVIEW_IMAGE_MIN_BYTES;
}

/** Nạp và GIẢI MÃ xong một ảnh trước khi đưa vào <img> — đổi nguồn không nháy trắng. */
function decodeImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

/** Tải có tiến độ. Ném lỗi khi kho không cho đọc bằng fetch (CORS) — nơi gọi tự lùi. */
async function fetchBlobWithProgress(url, { signal, totalHint, onProgress }) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || totalHint || 0;
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!res.body?.getReader) return res.blob();

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total) onProgress(Math.min(1, received / total));
  }
  return new Blob(chunks, { type });
}

const prefetching = new Set();

/**
 * Chuẩn bị SẴN bản 2048 của một ảnh (tệp kế bên trong danh sách) — bấm ‹ › là hiện ngay,
 * như Google Drive tải trước ảnh trước/sau. Chỉ đi tầng 2: không bao giờ kéo ảnh gốc.
 */
export function prefetchPreviewImage(file, loadPreview, cacheKey) {
  if (!wantsPreviewImage(file) || typeof loadPreview !== 'function' || cacheKey == null) return;
  const key = `${file.id}|${cacheKey}`;
  if (readCached(key) || prefetching.has(key)) return;
  prefetching.add(key);
  Promise.resolve()
    .then(() => loadPreview())
    .then(async (res) => {
      if (!res?.url) return;
      await decodeImage(res.url);
      previewCache.set(key, { value: { status: 'ready', ...res }, at: Date.now() });
    })
    .catch(() => {})
    .finally(() => prefetching.delete(key));
}

/**
 * @param {object}   args
 * @param {object}   args.file            tệp đang xem (`id`, `name`, `sizeBytes`)
 * @param {string}   [args.originalUrl]   URL ảnh gốc (có chữ ký) — chưa có thì null
 * @param {string}   [args.placeholderUrl] thumbnail đã có trong máy, nếu có
 * @param {Function} [args.loadPreview]   `() => Promise<{url,width,height,originalWidth,originalHeight}|null>`
 * @param {string}   [args.cacheKey]      khoá đệm phiên cho `loadPreview` (null = không đệm)
 */
export function usePreviewImage({ file, originalUrl, placeholderUrl, loadPreview, cacheKey }) {
  const eligible = wantsPreviewImage(file) && typeof loadPreview === 'function';
  const key = eligible ? `${file.id}|${cacheKey ?? ''}` : null;
  const sizeBytes = Number(file?.sizeBytes ?? file?.size ?? 0);

  // State GẮN KÈM khoá của tệp nó thuộc về: đổi tệp là bản cũ tự hết hiệu lực khi render,
  // không cần một effect chỉ để dọn state.
  const [preview, setPreview] = useState(null); // { key, status: 'ready'|'none', ...res }
  const [original, setOriginal] = useState(null); // { key, status, progress, src }
  const current = preview?.key === key ? preview : (() => {
    const cached = readCached(key);
    return cached ? { key, ...cached } : null;
  })();
  const orig = original?.key === key ? original : null;

  // `loadPreview` thường là một arrow function mới ở mỗi render — giữ bản mới nhất trong
  // ref để effect chỉ chạy lại khi ĐỔI TỆP.
  const loadRef = useRef(loadPreview);
  useEffect(() => {
    loadRef.current = loadPreview;
  });

  // ── Tầng 2: xin bản 2048 ──
  useEffect(() => {
    if (!key || readCached(key)) return undefined;
    let cancelled = false;
    (async () => {
      let value = { status: 'none' };
      try {
        const res = await loadRef.current();
        if (res?.url) {
          await decodeImage(res.url);
          value = { status: 'ready', ...res };
        }
      } catch {
        // Không có bản xem trước thì dùng ảnh gốc — đúng đường cũ, không phải lỗi.
      }
      if (cancelled) return;
      if (value.status === 'ready' && cacheKey != null) previewCache.set(key, { value, at: Date.now() });
      setPreview({ key, ...value });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, cacheKey]);

  // ── Tầng 3: ảnh gốc, chỉ khi được yêu cầu ──
  const abortRef = useRef(null);
  const objectUrlRef = useRef(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    },
    [key],
  );

  const canUpgrade =
    current?.status === 'ready' &&
    (Number(current.originalWidth) > Number(current.width) ||
      Number(current.originalHeight) > Number(current.height));

  const requestOriginal = useCallback(() => {
    if (!key || !originalUrl || !canUpgrade) return;
    if (orig && orig.status !== 'error') return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setOriginal({ key, status: 'loading', progress: 0, src: null });

    let lastReport = 0;
    const onProgress = (p) => {
      const now = Date.now();
      if (p < 1 && now - lastReport < 150) return;
      lastReport = now;
      setOriginal((o) => (o?.key === key && o.status === 'loading' ? { ...o, progress: p } : o));
    };

    (async () => {
      let src;
      try {
        const blob = await fetchBlobWithProgress(originalUrl, {
          signal: controller.signal,
          totalHint: sizeBytes,
          onProgress,
        });
        src = URL.createObjectURL(blob);
        objectUrlRef.current = src;
      } catch (err) {
        if (controller.signal.aborted) return;
        // Kho không cho fetch (CORS chưa mở cho origin này): để <img> tự tải — không có
        // tiến độ, nhưng vẫn ra ảnh.
        void err;
        src = originalUrl;
        setOriginal((o) => (o?.key === key ? { ...o, progress: null } : o));
      }
      try {
        await decodeImage(src);
        if (controller.signal.aborted) return;
        setOriginal({ key, status: 'done', progress: 1, src });
      } catch {
        if (controller.signal.aborted) return;
        // Giải mã hỏng (ảnh quá lớn với máy này…): ở lại bản 2048, báo cho người dùng.
        setOriginal({ key, status: 'error', progress: null, src: null });
      }
    })();
  }, [key, originalUrl, canUpgrade, orig, sizeBytes]);

  /** ZoomableImage báo: với mức phóng hiện tại cần `px` điểm ảnh ở cạnh dài. */
  const reportDemand = useCallback(
    (px) => {
      if (!canUpgrade || orig) return;
      const longEdge = Math.max(Number(current.width) || 0, Number(current.height) || 0);
      if (longEdge > 0 && px > longEdge * UPGRADE_RATIO) requestOriginal();
    },
    [canUpgrade, orig, current, requestOriginal],
  );

  if (!eligible) {
    return { src: originalUrl ?? null, stage: 'original', fullSize: null, original: null, canUpgrade: false, requestOriginal, reportDemand };
  }

  const fullSize =
    current?.status === 'ready' && current.originalWidth && current.originalHeight
      ? { width: Number(current.originalWidth), height: Number(current.originalHeight) }
      : null;

  if (orig?.status === 'done') {
    return { src: orig.src, stage: 'original', fullSize, original: orig, canUpgrade, requestOriginal, reportDemand };
  }
  if (current?.status === 'ready') {
    return { src: current.url, stage: 'preview', fullSize, original: orig, canUpgrade, requestOriginal, reportDemand };
  }
  if (current?.status === 'none') {
    return { src: originalUrl ?? null, stage: 'original', fullSize: null, original: null, canUpgrade: false, requestOriginal, reportDemand };
  }
  return { src: placeholderUrl ?? null, stage: 'placeholder', fullSize: null, original: null, canUpgrade: false, requestOriginal, reportDemand };
}
