import { getFileTypeCategory, publishThumbnail } from '../hooks/useFileThumbnail';
import {
  VARIANT_FOR,
  buildVariantsFromImageBlob,
  buildVariantsFromVideoFile,
} from './thumbnailBuilder';
import { thumbnailFingerprint, writeThumbnail } from './thumbnailStore';
import { uploadThumbnails } from './thumbnailUploader';

/**
 * Dựng thumbnail NGAY LÚC UPLOAD, từ tệp còn nằm trong RAM của trình duyệt.
 *
 * ## Vì sao
 *
 * Trước đây thumbnail chỉ được dựng khi một cái thẻ hiện ra (`useFileThumbnail`),
 * và lúc đó tệp đã ở trên cloud — nên đường duy nhất để thu nhỏ nó là TẢI NÓ VỀ.
 * Kịch bản thường gặp nhất vì thế là kịch bản tệ nhất: tải lên 50 tấm ảnh (~150MB
 * đi lên), lưới vẽ xong, rồi client tải về đúng 150MB đó để dựng thumbnail — trong
 * khi nó vừa cầm chính những `File` ấy trong tay vài giây trước.
 *
 * Ở đây không có byte nào đi qua mạng: `createImageBitmap` đọc thẳng từ `File`, và
 * video thì đọc qua một `blob:` URL trỏ vào đĩa của người dùng.
 *
 * ## Lợi ích thứ hai, và nó quan trọng hơn
 *
 * `getThumbnailUploadUrls` chỉ cấp URL ghi cho CHỦ TỆP (`storage.service.ts`, điều
 * kiện `ownerId` nằm ngay trong câu SQL). Nghĩa là trước đây, nếu chủ tệp chưa bao
 * giờ mở chế độ Lưới, thì KHÔNG AI đẩy được thumbnail lên R2 — và mọi thành viên
 * Bộ nhớ dùng chung phải tải ảnh gốc, mỗi người một lần, mãi mãi. Người upload
 * luôn là chủ tệp, nên dựng ở đây vá đúng lỗ đó.
 *
 * ## Không hứa gì cả
 *
 * Mọi thất bại đều bị nuốt: đây là việc làm THÊM cho lần sau, không phải một phần
 * của việc upload. Người dùng đã thấy tệp của mình nằm trong thư mục rồi.
 */

/*
 * Không có trần dung lượng ảnh (bỏ trần 25MB ngày 28/09/2026, theo yêu cầu): ảnh
 * lớn cỡ nào cũng được dựng thumbnail. Hàng đợi chạy tuần tự nên mỗi lúc chỉ có
 * một bitmap lớn nằm trong RAM; nếu giải mã hỏng thì `drain` nuốt lỗi như mọi
 * thất bại khác, và đường hiển thị sẽ dựng lại sau.
 */

/** GIF/SVG bỏ qua, cùng lý do với đường hiển thị: mất hoạt ảnh / không cần thu nhỏ. */
const SKIP_IMAGE_EXT = /\.(gif|svg)$/i;

/**
 * Hàng đợi MỘT việc tại một thời điểm.
 *
 * Tải lên 50 tệp là 50 lượt dựng, và chúng đến gần như cùng lúc. Chạy song song sẽ
 * giành main thread với đúng cái đang cần mượt nhất lúc ấy: thanh tiến trình upload
 * và lưới đang vẽ. Tuần tự thì tổng thời gian vẫn thế, mà không lượt nào chặn hình.
 */
const queue = [];
let draining = false;

/** Nhường cho trình duyệt làm xong việc của nó trước khi bốc việc tiếp theo. */
function whenIdle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 2_000 });
    else setTimeout(resolve, 0);
  });
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      await whenIdle();
      const job = queue.shift();
      try {
        await prime(job);
      } catch {
        // Codec lạ, ảnh hỏng, hết RAM canvas, IndexedDB bị chặn… — bỏ qua tệp này.
      }
    }
  } finally {
    draining = false;
  }
}

async function prime({ entity, file, cat }) {
  const built =
    cat === 'video' ? await buildVariantsFromVideoFile(file) : await buildVariantsFromImageBlob(file);
  if (!built?.dataUrls) return;

  const fingerprint = thumbnailFingerprint(entity);

  // L2 trước: nó phục vụ CHÍNH người vừa upload, ngay lập tức và chắc chắn, kể cả
  // khi pipeline R2 chưa bật hoặc lượt đẩy lên thất bại.
  for (const variant of Object.values(VARIANT_FOR)) {
    const dataUrl = built.dataUrls[variant];
    if (!dataUrl) continue;
    const key = `${entity.id}:${variant}`;
    const value = { thumbType: 'image', thumbUrl: dataUrl, textContent: null, sheetData: null };

    await writeThumbnail(key, fingerprint, value);

    // Và báo cho cái thẻ đang hiển thị ngay lúc này. Thiếu bước này thì thumbnail
    // đã nằm trong đệm mà thẻ vừa xuất hiện vẫn là icon: hook đã đọc đệm xong từ
    // trước khi lượt dựng này kết thúc, và không có gì gọi nó dậy để đọc lại.
    publishThumbnail(key, fingerprint, value);
  }

  // Rồi R2, cho mọi thiết bị khác và mọi thành viên khác. Không chờ.
  //
  // Trước đây lượt đẩy này bị bỏ qua trong im lặng khi phiên chưa kịp "thấy"
  // pipeline bật — và với tệp lớn thì đây là cơ hội duy nhất, nên nó thành những
  // video không bao giờ có thumbnail. `uploadThumbnails` nay tự thăm dò backend
  // thay vì đoán; xem `utils/thumbnailUploader.js`.
  uploadThumbnails(entity.id, built.blobs);
}

/**
 * Xếp một tệp vừa upload xong vào hàng đợi dựng thumbnail.
 *
 * @param {object} entity  Hàng `files` vừa được backend tạo — cần `id` và
 *   `storageKey` (storageKey là dấu vân tay nội dung, xem `thumbnailFingerprint`).
 * @param {File}   file    Chính tệp người dùng đã chọn, còn nguyên trong RAM.
 */
export function primeThumbnailsForUpload(entity, file) {
  if (!entity?.id || !file) return;

  const name = entity.name || file.name || '';
  const cat = getFileTypeCategory(name);
  if (cat !== 'image' && cat !== 'video') return;

  if (cat === 'image' && SKIP_IMAGE_EXT.test(name)) return;

  queue.push({ entity, file, cat });
  void drain();
}
