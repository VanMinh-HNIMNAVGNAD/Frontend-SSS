import { storageApi } from '../services/api';
import { createBatchLoader } from './batchLoader';

/**
 * Đẩy thumbnail vừa dựng ở client lên Cloudflare R2.
 *
 * ## Vì sao client làm việc này
 *
 * Sinh thumbnail phía server nghĩa là chạy xử lý ảnh trên một dyno 512MB ở Mỹ, phải
 * kéo ảnh gốc từ GCS về trước — tải một thư mục 50 ảnh là chắc chắn chết dyno, và
 * muốn làm được thì phải thêm một hàng đợi nền. Client thì đã có ảnh gốc trong tay
 * (nó vừa tải về để hiển thị) và đã có sẵn code thu nhỏ. Backend chỉ KÝ.
 *
 * ## Ba header PHẢI gửi đúng
 *
 * Backend ký presigned PUT với `signableHeaders` gồm `content-length`,
 * `content-type` và `cache-control` (xem `StorageService.getThumbnailUploadUrls`).
 * Nghĩa là ba header đó nằm TRONG chữ ký: lệch một chữ là R2 trả 403. Đó là chủ
 * ý — nó ép trần dung lượng, ép kiểu MIME, và bảo đảm object hạ cánh CÓ header
 * cache (nếu thiếu thì cả pipeline R2 mất lý do tồn tại).
 *
 * ## Thất bại thì sao
 *
 * Không sao cả, và đó là điều kiện thiết kế: người dùng ĐÃ thấy thumbnail rồi (bản
 * dựng tại chỗ, đã nằm trong IndexedDB). Việc đẩy lên R2 chỉ để LẦN SAU — và cho
 * thiết bị khác, cho thành viên khác — không phải tải lại ảnh gốc. Nên mọi lỗi ở
 * đây đều bị nuốt: chỉ chủ tệp được ghi, nên người được chia sẻ luôn bị từ chối và
 * đó là chuyện bình thường, không phải sự cố.
 */

/**
 * Pipeline R2 có đang bật không. BA trạng thái, không phải hai.
 *
 * Bản cũ là một cờ boolean mặc định `false`, chỉ bật khi `useFileThumbnail` DỰNG
 * một thumbnail và thấy hàng đó có `thumbUrls`. Đó là một cái bẫy im lặng: lượt
 * dựng ấy chỉ chạy khi cả hai tầng đệm đều trượt. Mở app, vào một thư mục mà mọi
 * thumbnail đã nằm sẵn trong IndexedDB (hoặc một thư mục trống), rồi tải lên một
 * video 200MB ⇒ cờ vẫn `false` ⇒ lượt đẩy lên R2 bị bỏ qua KHÔNG một dấu vết. Và
 * với tệp lớn thì đó là cơ hội DUY NHẤT: đường hiển thị không tải nguyên tệp về để
 * dựng lại. Kết quả đúng như đã thấy — cùng một cỡ tệp, máy này có thumbnail, máy
 * kia không, tuỳ vào việc phiên đó tình cờ có một lượt dựng nào trượt đệm hay không.
 *
 * Nay mặc định là `unknown`: cứ thử MỘT lô. Backend trả 400 khi tính năng chưa cấu
 * hình, và chỉ đúng câu trả lời đó mới chuyển sang `off` — nghĩa là chỗ này tự biết
 * sự thật thay vì đoán, và đoán sai thì im lặng mất dữ liệu.
 */
const UNKNOWN = 'unknown';
const ON = 'on';
const OFF = 'off';
let pipelineState = UNKNOWN;

/**
 * Gọi khi thấy một hàng có `thumbUrls`. Nay chỉ là ĐƯỜNG TẮT (biết trước để khỏi
 * tốn lô thăm dò), không còn là điều kiện cần — xem `pipelineState`.
 */
export function noteThumbnailPipelineEnabled() {
  pipelineState = ON;
}

/** Đúng ba giá trị mà backend đã ký. Đổi ở đây phải đổi cả `thumbnail-url.ts`. */
const THUMB_CONTENT_TYPE = 'image/webp';
const THUMB_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Gộp việc xin URL ghi của nhiều tệp thành một request.
 *
 * Khoá của lô là JSON đã mã hoá cả `{ fileId, variant, sizeBytes }` — cần vậy vì
 * `createBatchLoader` gộp theo khoá chuỗi, mà ở đây một "yêu cầu" gồm ba thành
 * phần chứ không chỉ một id. `fetchMany` giải mã lại rồi gửi đi một lượt.
 */
const uploadUrlBatch = createBatchLoader({
  windowMs: 50,
  // Khớp `ArrayMaxSize(50)` của `GetThumbnailUploadUrlsDto`.
  maxBatchSize: 50,
  fetchMany: async (keys) => {
    const items = keys.map((key) => JSON.parse(key));

    let res;
    try {
      res = await storageApi.getThumbnailUploadUrls(items);
    } catch (err) {
      // 400 = backend nói thẳng "tính năng chưa cấu hình" (xem
      // `StorageService.getThumbnailUploadUrls`). Chỉ câu trả lời đó mới được phép
      // tắt hẳn; 401/5xx/mất mạng là sự cố nhất thời, tắt theo là biến một phút
      // chập mạng thành cả phiên không đẩy được thumbnail nào.
      if (err?.response?.status === 400) pipelineState = OFF;
      // Không ném ra: `uploadOne` vốn nuốt mọi lỗi, và ném ở đây chỉ tạo ra một
      // promise bị từ chối mà không ai bắt.
      return new Map();
    }

    pipelineState = ON;

    // Ghép URL trả về với đúng khoá đã gửi. Backend không trả `sizeBytes` nên phải
    // dò lại từ danh sách gốc theo cặp (fileId, variant).
    const byPair = new Map((res?.items || []).map((row) => [`${row.fileId}|${row.variant}`, row.uploadUrl]));
    return new Map(
      keys.map((key, index) => [key, byPair.get(`${items[index].fileId}|${items[index].variant}`) ?? null]),
    );
  },
});

/**
 * Đẩy MỘT biến thể lên R2. Trả `true` nếu thành công.
 *
 * Không throw: xem phần "Thất bại thì sao" ở đầu file.
 */
async function uploadOne(fileId, variant, blob) {
  try {
    const uploadUrl = await uploadUrlBatch.load(
      JSON.stringify({ fileId, variant, sizeBytes: blob.size }),
    );
    // `null` = backend từ chối (không phải chủ tệp, hoặc quá trần). Không phải lỗi.
    if (!uploadUrl) return false;

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        // Ba header này nằm trong chữ ký — xem chú thích ở đầu file.
        'Content-Type': THUMB_CONTENT_TYPE,
        'Cache-Control': THUMB_CACHE_CONTROL,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Đẩy MỌI biến thể vừa dựng lên R2, chạy nền.
 *
 * Cố ý nhận cả bộ biến thể cùng lúc: chúng được dựng từ CÙNG MỘT lần tải ảnh gốc.
 * Nếu để mỗi biến thể tự lo thì mở Trang chủ (cần bản nhỏ) rồi vào chế độ Lưới
 * (cần bản lớn) sẽ tải ảnh gốc HAI lần — đúng thứ mà cả pipeline này ra đời để tránh.
 *
 * @param {string} fileId
 * @param {Record<string, Blob>} blobs  ví dụ `{ t160: Blob, t384: Blob }`
 */
export function uploadThumbnails(fileId, blobs) {
  if (!fileId || !blobs || pipelineState === OFF) return;
  for (const [variant, blob] of Object.entries(blobs)) {
    if (blob) void uploadOne(fileId, variant, blob);
  }
}
