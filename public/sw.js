/**
 * Service Worker — CHỈ cho byte thumbnail trên CDN. Không gì khác.
 *
 * ## Vì sao phạm vi hẹp đến thế
 *
 * Một Service Worker chặn MỌI request của trang, nên mỗi thứ nó ôm thêm là một
 * cách mới để hỏng, và những kiểu hỏng của SW đều khó chẩn đoán: người dùng thấy
 * dữ liệu cũ hoặc một trang trắng, mà bấm F5 không chữa được.
 *
 * Cụ thể, ba thứ nó CỐ Ý không làm:
 *
 *  • **Không cache app shell** (`index.html`, JS, CSS). Đó là cách kinh điển để một
 *    bản deploy mới không bao giờ tới được người dùng.
 *  • **Không cache response của API.** Chúng gắn với tài khoản và đổi liên tục;
 *    `ContentEtagInterceptor` đã lo phần đó bằng ETag, đúng tầng cần lo.
 *  • **Không cache bất cứ URL nào có query string.** Chữ ký nằm ở query, nên bỏ
 *    query khỏi khoá cache là biến bộ đệm này thành đúng lỗ hổng "người này lấy
 *    được nội dung của người kia" mà `.ai/r2-thumbnails.md` mục 1 đã cảnh báo.
 *
 * ## Thứ nó thật sự thêm vào, so với bộ đệm HTTP
 *
 * Thành thật mà nói: không nhiều, và đó là lý do việc này từng được xếp sau. URL
 * thumbnail là capability URL ổn định kèm `immutable, max-age=1 năm`, nên trình
 * duyệt vốn đã cache tốt. Phần thêm được là:
 *
 *  • **Sống sót qua việc trình duyệt dọn bộ đệm HTTP.** Bộ đệm HTTP bị thu hồi
 *    lặng lẽ khi máy chật; CacheStorage thì nằm dưới hạn mức lưu trữ của origin,
 *    cùng nơi với IndexedDB đang giữ thumbnail tự dựng.
 *  • **Chạy được khi mất mạng** — một thư mục đã xem vẫn hiện đủ ảnh.
 *  • **Xoá được theo ý mình.** Đăng xuất là xoá sạch, xem `clearThumbnailCache`
 *    trong `utils/serviceWorker.js`. Bộ đệm HTTP thì không có API nào làm được thế.
 */

const CACHE_NAME = 'driver-thumbs-v1';

/**
 * Trần số bản ghi. Mỗi thumbnail ~20KB nên 3000 bản ≈ 60MB — cùng con số với
 * `utils/thumbnailStore.js`, vì hai lớp này phục vụ đúng cùng một tập ảnh.
 */
const MAX_ENTRIES = 3000;

/** Dọn khi vượt ngưỡng bao nhiêu bản, để không phải dọn ở mỗi lần ghi. */
const PRUNE_SLACK = 200;

self.addEventListener('install', () => {
  // Không chờ tab cũ đóng: bản SW này không đổi hợp đồng gì với trang, nên lên
  // thẳng là an toàn và tránh cảnh một máy chạy hai phiên bản.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Xoá cache của những phiên bản trước — tên có version nên đây là đường duy
      // nhất để đổi định dạng lưu mà không để lại rác vĩnh viễn.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('driver-thumbs-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Request này có phải một tấm thumbnail trên CDN không. */
function isThumbnailRequest(request) {
  if (request.method !== 'GET') return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  // Cùng origin ⇒ đây là tài nguyên của chính app, không phải thumbnail trên CDN.
  if (url.origin === self.location.origin) return false;
  // Có query ⇒ có thể là URL mang chữ ký. Xem docblock đầu tệp.
  if (url.search) return false;

  return url.pathname.startsWith('/thumbnails/');
}

self.addEventListener('fetch', (event) => {
  if (!isThumbnailRequest(event.request)) return; // để trình duyệt tự lo, như khi không có SW
  event.respondWith(serveThumbnail(event.request));
});

async function serveThumbnail(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = new URL(request.url).href;

  const hit = await cache.match(key);
  if (hit) return hit;

  // Xin lại bằng `mode: 'cors'` thay vì chuyển tiếp request gốc.
  //
  // Request từ `<img>` là `no-cors`, và response của nó là **opaque**: trình duyệt
  // cho lưu, nhưng tính vào hạn mức lưu trữ bằng một khối đệm cố định (bậc vài MB
  // MỖI bản ghi, không phải 20KB thật). Vài trăm tấm là chạm trần và trình duyệt
  // thu hồi cả origin — mất luôn IndexedDB thumbnail nằm cùng chỗ.
  //
  // Bucket đã mở CORS cho origin của app (`.ai/r2-thumbnails.md` mục 3.2) nên
  // đường này chạy được; `credentials: 'omit'` vì capability URL không cần danh
  // tính nào, và gửi kèm cookie sẽ làm CORS từ chối.
  try {
    const response = await fetch(key, { mode: 'cors', credentials: 'omit' });
    if (response.ok) {
      await cache.put(key, response.clone());
      void prune(cache);
    }
    return response;
  } catch {
    // CORS chưa mở, mạng lỗi, miền chưa cấu hình — chuyển tiếp nguyên request gốc
    // và KHÔNG lưu gì. Kết quả tệ nhất là hành vi y như khi không có SW.
    return fetch(request);
  }
}

/**
 * Giữ số bản ghi dưới trần. `cache.keys()` trả về theo thứ tự chèn, nên cắt từ đầu
 * là bỏ những bản cũ nhất — không phải LRU thật, nhưng đúng thứ cần: một bộ đệm
 * ảnh chỉ cần không phình vô hạn.
 */
let pruning = false;
async function prune(cache) {
  if (pruning) return;
  pruning = true;
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES + PRUNE_SLACK) return;
    const excess = keys.slice(0, keys.length - MAX_ENTRIES);
    await Promise.all(excess.map((request) => cache.delete(request)));
  } finally {
    pruning = false;
  }
}
