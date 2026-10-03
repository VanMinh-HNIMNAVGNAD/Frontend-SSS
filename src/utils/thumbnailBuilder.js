import { recordThumbnailBytes } from './requestMetrics';
import { openPdf } from './pdfRange';

/**
 * Dựng THÀNH PHẨM thumbnail — phần thuần tính toán, không biết gì về React.
 *
 * Tách ra khỏi `hooks/useFileThumbnail.js` vì nay có HAI phía gọi, và phía thứ hai
 * mới là phía đáng giá:
 *
 *   • hook — dựng khi thẻ hiện ra, từ tệp đã nằm trên cloud (phải tải về trước);
 *   • `utils/thumbnailPrimer.js` — dựng NGAY LÚC UPLOAD, từ `File` còn trong RAM,
 *     nên không tốn một byte mạng nào.
 *
 * Mọi hàm ở đây trả `null` khi không dựng được và KHÔNG ném lỗi ra ngoài trừ khi
 * ghi rõ: phía gọi luôn có đường lùi (icon, hoặc URL có chữ ký dùng trực tiếp), nên
 * một thumbnail hỏng không được phép thành một màn hình hỏng.
 */

/**
 * Các biến thể thumbnail — PHẢI khớp `THUMBNAIL_VARIANTS` ở
 * `backend/src/storage/thumbnail-url.ts`. Lệch tên là backend từ chối cấp URL ghi.
 *
 * `mini` (Trang chủ, hàng danh sách) dùng t160; `full` (thẻ Lưới) dùng t384.
 */
export const VARIANT_SIZES = { t160: 160, t384: 384 };
export const VARIANT_FOR = { mini: 't160', full: 't384' };

/** Chất lượng mã hoá. 0.72 là mức không nhìn ra khác biệt ở cỡ ≤384px. */
const QUALITY = 0.72;

/**
 * Định dạng mã hoá thumbnail: WebP nếu trình duyệt biết mã hoá, ngược lại PNG.
 *
 * KHÔNG lùi về JPEG: nguồn hay là PNG/WebP có nền trong suốt, mà JPEG không có
 * kênh alpha nên phần trong suốt thành một khối đen. PNG to hơn nhưng đúng.
 * Dò một lần rồi ghi nhớ — `toDataURL` với định dạng lạ thì lặng lẽ trả về PNG,
 * nên phải kiểm bằng tiền tố của chuỗi kết quả chứ không có cờ nào để hỏi.
 */
let thumbMimePromise = null;
export const resolveThumbMime = () =>
  (thumbMimePromise ??= Promise.resolve().then(() => {
    try {
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      return probe.toDataURL('image/webp').startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/png';
    } catch {
      return 'image/png';
    }
  }));

/**
 * Vẽ một nguồn bất kỳ (bitmap, `<video>`, canvas) ra canvas ở cỡ yêu cầu.
 *
 * `maxEdge` là trần của CẠNH DÀI, và tỉ lệ luôn được giữ. `Math.min(1, …)` là chủ
 * ý: một tấm ảnh 120px không được phóng lên 384px — phóng to chỉ làm nó mờ đi mà
 * tệp thì nặng hơn.
 */
function drawScaled(source, srcWidth, srcHeight, maxEdge) {
  const longest = Math.max(srcWidth, srcHeight) || 1;
  const scale = Math.min(1, maxEdge / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(srcWidth * scale));
  canvas.height = Math.max(1, Math.round(srcHeight * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Canvas → Blob, bọc lại `toBlob` (callback) thành promise. */
function canvasToBlob(canvas, mime) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, QUALITY));
}

/**
 * Dựng MỌI biến thể từ MỘT nguồn đã giải mã xong.
 *
 * "Một nguồn" là điểm chính của cả pipeline: một lần giải mã → nhiều canvas. Trước
 * đây mỗi biến thể tự đi tải và giải mã lại ảnh gốc, nên mở Trang chủ (cần bản nhỏ)
 * rồi vào chế độ Lưới (cần bản lớn) là làm lại toàn bộ việc đó lần hai.
 *
 * Trả `{ dataUrls, blobs }`: `dataUrls` để hiển thị và đệm ở IndexedDB (tự chứa),
 * `blobs` để đẩy lên R2 (cần `size` chính xác cho chữ ký). `blobs[x]` là `null` khi
 * trình duyệt không mã hoá được WebP — backend ký cứng `content-type: image/webp`,
 * gửi PNG lên là R2 trả 403.
 */
export async function buildVariantsFromSource(source, srcWidth, srcHeight) {
  if (!srcWidth || !srcHeight) return null;

  const mime = await resolveThumbMime();
  const dataUrls = {};
  const blobs = {};

  for (const [variant, maxEdge] of Object.entries(VARIANT_SIZES)) {
    const canvas = drawScaled(source, srcWidth, srcHeight, maxEdge);
    dataUrls[variant] = canvas.toDataURL(mime, QUALITY);
    blobs[variant] = mime === 'image/webp' ? await canvasToBlob(canvas, mime) : null;
  }

  return { dataUrls, blobs };
}

/**
 * Ảnh (Blob hoặc File) → mọi biến thể.
 *
 * Dùng cho cả hai phía: hook đưa vào blob vừa tải từ cloud, primer đưa vào chính
 * `File` người dùng vừa chọn.
 */
export async function buildVariantsFromImageBlob(blob) {
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    return await buildVariantsFromSource(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

/**
 * Tải ảnh gốc về rồi dựng mọi biến thể.
 *
 * Đây là đường ĐẮT — vài MB cho một ô 384px — và là thứ mà cả pipeline R2 lẫn
 * primer sinh ra để tránh. Nó vẫn phải tồn tại cho những tệp có từ trước khi có
 * pipeline, và cho tệp của người khác chia sẻ cho mình.
 *
 * Vẽ được lên canvas là nhờ bucket đã mở CORS cho origin của app. Nếu không,
 * `fetch` ném lỗi và phía gọi lùi về dùng URL có chữ ký trực tiếp như cũ.
 */
export async function buildVariantsFromImageUrl(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  // Con số đáng nhìn nhất trong toàn bộ phép đo: bao nhiêu byte ảnh GỐC đã phải
  // tải về. `fetch` này không đi qua axios nên bảng đếm endpoint không thấy nó.
  recordThumbnailBytes(blob.size);
  return buildVariantsFromImageBlob(blob);
}

/**
 * Chốt đồng thời cho hai nhánh NẶNG: video và PDF.
 *
 * Ảnh không cần chốt — `createImageBitmap` giải mã ngoài luồng chính và một tấm
 * ảnh chỉ sống vài chục ms. Video và PDF thì khác hẳn: mỗi lượt giữ một bộ giải mã
 * video, hoặc một tài liệu pdf.js đã phân tích xong, trong suốt thời gian chạy. Một
 * thư mục 50 video mà thả hết ra cùng lúc là 50 bộ giải mã sống song song — tab
 * đứng hình hoặc trình duyệt tự giết nửa số đó, và cả hai đều tệ hơn việc xếp hàng.
 *
 * 2 chứ không phải 1: phần lớn thời gian của một lượt là CHỜ mạng, nên hai lượt
 * gối lên nhau vẫn dùng hết được đường truyền mà không chồng CPU.
 */
function createGate(max) {
  let active = 0;
  const waiting = [];

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return async function gate(task) {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

const heavyGate = createGate(2);

// ── Video ────────────────────────────────────────────────────────────────────

/**
 * Giây thứ mấy được lấy làm khung hình đại diện.
 *
 * Không lấy giây 0: rất nhiều video mở đầu bằng một khung đen hoặc một tấm logo
 * trắng, và một lưới toàn ô đen thì chẳng khác gì không có thumbnail.
 */
const VIDEO_FRAME_TIME = 1;

/**
 * Trần thời gian cho một lượt bắt khung hình.
 *
 * Bắt khung hình có NHIỀU bước hỏng được hơn nhánh ảnh: codec trình duyệt không
 * giải được, `seeked` không bao giờ bắn, hoặc tệp nằm trên mạng chậm. Không có
 * trần này thì một tệp như vậy giữ một `<video>` ẩn sống mãi trong tab.
 */
const VIDEO_CAPTURE_TIMEOUT_MS = 20_000;

/**
 * Dựng một `<video>` ẩn, tua tới `VIDEO_FRAME_TIME`, rồi trả chính element đó để
 * vẽ lên canvas.
 *
 * `crossOrigin = 'anonymous'` là BẮT BUỘC với nguồn từ cloud: thiếu nó thì canvas
 * bị "vấy bẩn" (tainted) và `toDataURL` ném `SecurityError` — mà lỗi đó chỉ xuất
 * hiện ở bước cuối, sau khi đã tải xong video. Với `blob:` URL (tệp local) thì
 * KHÔNG đặt, vì đó không phải nguồn cross-origin và một số trình duyệt từ chối.
 */
function captureVideoFrame(src, { crossOrigin = null } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      // Bỏ nguồn đi để trình duyệt dừng tải ngay, đừng để nó chạy tiếp trong nền.
      video.removeAttribute('src');
      video.load?.();
      finish(reject, new Error('video-capture-timeout'));
    }, VIDEO_CAPTURE_TIMEOUT_MS);

    if (crossOrigin) video.crossOrigin = crossOrigin;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      // Video ngắn hơn 1 giây thì lấy giữa clip.
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = duration && duration < VIDEO_FRAME_TIME ? duration / 2 : VIDEO_FRAME_TIME;
    };
    video.onseeked = () => finish(resolve, video);
    video.onerror = () => finish(reject, new Error('video-capture-failed'));

    video.src = src;
  });
}

/** Khung hình đầu của một video trên cloud → mọi biến thể. */
export function buildVariantsFromVideoUrl(url) {
  return heavyGate(async () => {
    const video = await captureVideoFrame(url, { crossOrigin: 'anonymous' });
    try {
      return await buildVariantsFromSource(video, video.videoWidth, video.videoHeight);
    } finally {
      video.removeAttribute('src');
      video.load?.();
    }
  });
}

/**
 * Khung hình đầu của một video CÒN TRONG MÁY → mọi biến thể.
 *
 * Đường rẻ nhất trong cả tệp này: `blob:` URL đọc thẳng từ đĩa của người dùng, nên
 * một video 2GB cũng chỉ tốn phần header + khung hình đầu, và không có byte nào đi
 * qua mạng.
 */
export async function buildVariantsFromVideoFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await captureVideoFrame(objectUrl);
    try {
      return await buildVariantsFromSource(video, video.videoWidth, video.videoHeight);
    } finally {
      video.removeAttribute('src');
      video.load?.();
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/**
 * pdf.js nạp theo yêu cầu, KHÔNG import tĩnh — nó là một trong những phần lớn nhất
 * của gói JavaScript, mà phần lớn người dùng không mở tệp PDF nào.
 *
 * `import()` được ghi nhớ trong biến module nên chỉ tải một lần cho cả phiên.
 */
let pdfjsPromise = null;
export const loadPdfjs = () =>
  (pdfjsPromise ??= import('pdfjs-dist').then((pdfjsLib) => {
    // Worker phải trỏ đúng bản đi kèm phiên bản pdf.js vừa nạp — đặt ngay sau khi
    // nạp xong thay vì lúc module này được import.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return pdfjsLib;
  }));

/** Cạnh dài của trang PDF sau khi render, trước khi thu xuống từng biến thể. */
const PDF_RENDER_EDGE = VARIANT_SIZES.t384;

/**
 * Trang ĐẦU của một PDF → mọi biến thể.
 *
 * Điểm quan trọng nhất ở đây là cách MỞ tệp: đưa `url` cho pdf.js thay vì tự
 * `fetch().arrayBuffer()` rồi đưa `data` vào.
 *
 * Bản cũ kéo NGUYÊN tệp về chỉ để vẽ một ô 384px — một bản scan hợp đồng 80MB tốn
 * đúng 80MB cho việc đó. `openPdf` xin theo HTTP Range và thường chỉ lấy vài trăm KB
 * (bảng tham chiếu ở cuối tệp + trang 1).
 *
 * Không đưa thẳng `url` cho pdf.js nữa: nó chỉ dùng Range khi đọc được `Accept-Ranges`,
 * mà CORS của bucket không expose header đó — tức trước đây vẫn âm thầm tải cả tệp. Kho
 * không hỗ trợ Range thì `openPdf` lùi về tải cả tệp — mất phần tiết kiệm, không hỏng.
 */
export function buildVariantsFromPdfUrl(url) {
  return heavyGate(() => renderPdfFirstPage(url));
}

async function renderPdfFirstPage(url) {
  const pdfjsLib = await loadPdfjs();
  const opened = openPdf(pdfjsLib, url);
  let doc;
  try {
    doc = await opened.promise;
  } catch (err) {
    opened.destroy();
    throw err;
  }

  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Render thẳng ở cỡ cần dùng. Bản cũ ghi cứng `scale: 0.5`, nên một trang A0 ra
    // canvas khổng lồ còn một trang nhỏ ra canvas mờ.
    const scale = Math.min(1, PDF_RENDER_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    return await buildVariantsFromSource(canvas, canvas.width, canvas.height);
  } finally {
    // Trả lại worker + bộ đệm trang. Thiếu bước này thì cuộn qua một thư mục PDF là
    // giữ lại hàng chục tài liệu đã giải mã trong RAM của tab.
    void doc.destroy();
  }
}
