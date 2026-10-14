/**
 * Mở PDF theo TỪNG ĐOẠN (HTTP Range) thay vì tải nguyên tệp vào RAM trước khi vẽ trang 1.
 *
 * Bản cũ ở khung xem trước và trang chia sẻ: `fetch(url).arrayBuffer()` → `getDocument({ data })`.
 * Một bản scan 300MB là 300MB trong RAM tab (cộng thêm một bản nữa bên worker) trước khi người
 * xem thấy được chữ nào — điện thoại thì sập tab.
 *
 * Vì sao không đưa thẳng `url` cho pdf.js: nó chỉ xin theo Range khi ĐỌC ĐƯỢC header
 * `Accept-Ranges: bytes`, mà với request khác origin thì header đó phải được bucket expose qua
 * CORS — cấu hình CORS đang áp thật trên bucket GCS KHÔNG có (xem `.ai/error.md`), nên pdf.js
 * lặng lẽ lùi về tải cả tệp. Ở đây tự làm phần mạng (`PDFDataRangeTransport`): chỉ cần biết
 * TỔNG dung lượng — đọc từ `Content-Range` (bucket có expose) hoặc lấy `sizeHint` trong DB.
 *
 * Lùi về cách cũ (tải cả tệp) khi: tệp nhỏ (một request là xong, nhanh hơn), server bỏ qua
 * Range (trả 200 — body chính là cả tệp), trình duyệt còn preflight `Range` mà bucket chưa cho
 * (lỗi CORS), không biết tổng dung lượng, hoặc chế độ từng đoạn hỏng trước khi mở xong tài liệu
 * (vd `size_bytes` cũ trong DB sai). Tức là mất phần tiết kiệm, không mất chức năng.
 */

/**
 * Dưới ngưỡng này tải một phát như cũ. Đọc theo đoạn tốn nhiều lượt đi-về nối tiếp nhau (lúc
 * mở, pdf.js đọc mọi page dict để kiểm trang cuối — tệp scan đặt page dict xen giữa các ảnh
 * thì mỗi trang một lượt), nên với tệp vừa phải, một request duy nhất vẫn nhanh hơn mà RAM
 * chưa thành vấn đề.
 */
const FULL_FETCH_MAX_BYTES = 8 * 1024 * 1024;
/** Đoạn đầu xin kèm lượt dò: đủ cho header + (nếu tệp linearized) bảng trang 1. */
const PROBE_BYTES = 64 * 1024;
/**
 * Cỡ một đoạn pdf.js xin (= mặc định của nó). Các đoạn liền nhau được gộp vào một request nên
 * ảnh lớn vẫn về trong một lượt; đoạn nhỏ chỉ để page dict nằm rải rác không kéo theo nhiều
 * byte thừa.
 */
const RANGE_CHUNK_BYTES = 64 * 1024;

export class PdfHttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = 'PdfHttpError';
    this.status = status;
  }
}

/** `bytes 0-65535/1234567` → 1234567. Không đọc được (CORS không expose, `*`) → null. */
export function totalFromContentRange(header) {
  const match = /\/(\d+)\s*$/.exec(header || '');
  const total = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/**
 * pdf.js nạp theo yêu cầu, KHÔNG import tĩnh — 419KB (128KB nén), một trong những khối lớn nhất
 * của gói JS, mà phần lớn lần mở xem trước không phải PDF.
 *
 * Một chỗ nạp DUY NHẤT cho cả khung xem trước, trang chia sẻ và bộ dựng thumbnail (##85).
 * Trước đây khung xem trước và trang chia sẻ `import * as pdfjsLib` tĩnh, nên mở một tấm ẢNH
 * cũng phải tải + biên dịch trọn pdf.js trước khi cửa sổ vẽ được gì.
 *
 * Ghi nhớ ở phạm vi module: cả phiên chỉ tải một lần. Hỏng (mất mạng, chunk của bản build cũ)
 * thì quên đi để lần mở sau còn thử lại được.
 */
let pdfjsPromise = null;
export const loadPdfjs = () =>
  (pdfjsPromise ??= import('pdfjs-dist')
    .then((pdfjsLib) => {
      // Worker phải trỏ đúng bản đi kèm phiên bản pdf.js vừa nạp — đặt ngay sau khi nạp xong
      // thay vì lúc module này được import.
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return pdfjsLib;
    })
    .catch((err) => {
      pdfjsPromise = null;
      throw err;
    }));

/**
 * @param {typeof import('pdfjs-dist')} pdfjsLib
 * @param {string} url  URL đọc được bằng GET (presigned)
 * @param {{ sizeHint?: number, onError?: (err: Error) => void }} [options]
 *   `sizeHint` = `sizeBytes` trong DB, dùng khi không đọc được `Content-Range`.
 *   `onError` = một đoạn hỏng SAU khi tài liệu đã mở (URL hết hạn, mất mạng): pdf.js không có
 *   kênh báo lỗi cho transport tự viết, trang đang chờ sẽ treo mãi nếu không báo ra ngoài.
 * @returns {{ promise: Promise<import('pdfjs-dist').PDFDocumentProxy>, mode: () => string, destroy: () => void }}
 */
export function openPdf(pdfjsLib, url, { sizeHint, onError } = {}) {
  const controller = new AbortController();
  let task = null;
  let destroyed = false;
  let mode = 'pending';

  const start = (source) => {
    if (destroyed) throw new DOMException('Đã huỷ', 'AbortError');
    task?.destroy();
    task = pdfjsLib.getDocument(source);
    return task.promise;
  };

  const fullFetch = async () => {
    mode = 'full';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new PdfHttpError(res.status);
    return start({ data: new Uint8Array(await res.arrayBuffer()) });
  };

  const fetchRange = async (begin, endExclusive) => {
    // Thử lại MỘT lần: một nhịp mạng chập chờn không đáng làm hỏng cả tài liệu.
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Range: `bytes=${begin}-${endExclusive - 1}` },
          signal: controller.signal,
        });
        // 200 ở đây = server bỏ qua Range giữa chừng: nhận cả tệp vào RAM là đúng thứ đang tránh.
        if (res.status !== 206) throw new PdfHttpError(res.status);
        return new Uint8Array(await res.arrayBuffer());
      } catch (err) {
        if (err?.name === 'AbortError' || attempt >= 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  };

  const promise = (async () => {
    const hint = Number(sizeHint) || 0;
    if (hint > 0 && hint <= FULL_FETCH_MAX_BYTES) return fullFetch();

    let probe;
    try {
      probe = await fetch(url, {
        headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // Trình duyệt còn preflight `Range` và bucket chưa cho phép → TypeError (CORS).
      return fullFetch();
    }
    if (probe.status === 200) {
      mode = 'full';
      return start({ data: new Uint8Array(await probe.arrayBuffer()) });
    }
    if (probe.status !== 206) throw new PdfHttpError(probe.status);

    const head = new Uint8Array(await probe.arrayBuffer());
    const total = totalFromContentRange(probe.headers.get('Content-Range')) ?? (hint > 0 ? hint : null);
    if (!total) return fullFetch();
    if (head.byteLength >= total) {
      mode = 'full';
      return start({ data: head });
    }

    let opened = false;
    let failLoad = null;
    const loadFailed = new Promise((_, reject) => {
      failLoad = reject;
    });
    loadFailed.catch(() => undefined);

    class RangeTransport extends pdfjsLib.PDFDataRangeTransport {
      requestDataRange(begin, end) {
        fetchRange(begin, Math.min(end, total))
          .then((chunk) => {
            if (!destroyed) this.onDataRange(begin, chunk);
          })
          .catch((err) => {
            if (destroyed || err?.name === 'AbortError') return;
            if (!opened) failLoad(err);
            else onError?.(err);
          });
      }
    }

    mode = 'range';
    const transport = new RangeTransport(total, head);
    try {
      const doc = await Promise.race([
        start({
          range: transport,
          length: total,
          rangeChunkSize: RANGE_CHUNK_BYTES,
          // Chỉ xin đúng đoạn cần cho trang đang xem — không âm thầm kéo nốt cả tệp về.
          disableAutoFetch: true,
          disableStream: true,
        }),
        loadFailed,
      ]);
      opened = true;
      return doc;
    } catch (err) {
      if (destroyed || err?.name === 'AbortError') throw err;
      // Hỏng TRƯỚC khi mở xong (vd tổng dung lượng lấy từ DB bị sai → 416): thử cách cũ.
      console.warn('[PDF] Đọc theo đoạn thất bại, chuyển sang tải cả tệp:', err);
      return fullFetch();
    }
  })();

  return {
    promise,
    /** 'range' | 'full' | 'pending' — để kiểm thử/ghi log. */
    mode: () => mode,
    /** Huỷ request đang bay + giải phóng tài liệu trong worker. Gọi khi đóng/đổi tệp. */
    destroy() {
      destroyed = true;
      controller.abort();
      task?.destroy();
    },
  };
}
