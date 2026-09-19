/**
 * Đăng ký (và gỡ) Service Worker cache thumbnail — xem `public/sw.js` để biết nó
 * làm gì và CỐ Ý không làm gì.
 *
 * Mọi hàm ở đây đều im lặng khi trình duyệt không hỗ trợ hoặc từ chối: Service
 * Worker là phần TĂNG THÊM, không phải điều kiện để app chạy.
 */

/**
 * Công tắc tắt, để trong `localStorage`.
 *
 * Cần một đường gỡ KHÔNG qua deploy: SW là thứ sống trên máy người dùng, nên khi
 * nó gây chuyện thì "sửa rồi đẩy bản mới" là một vòng lặp quá chậm. Đặt
 * `localStorage.setItem('driver:sw', '0')` rồi tải lại trang là nó tự gỡ, và lần
 * sau không đăng ký lại nữa.
 */
const DISABLE_FLAG = 'driver:sw';

const CACHE_NAME = 'driver-thumbs-v1';

function isDisabled() {
  try {
    return localStorage.getItem(DISABLE_FLAG) === '0';
  } catch {
    // Chế độ riêng tư / lưu trữ bị chặn: coi như không tắt.
    return false;
  }
}

function supported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Đăng ký SW. Gọi một lần lúc khởi động app.
 *
 * KHÔNG chạy ở chế độ dev: một SW đang giữ nhịp cache giữa lúc Vite đang thay
 * module nóng là công thức để mất hàng giờ đi tìm một lỗi không tồn tại.
 */
export function registerServiceWorker() {
  if (!supported() || !import.meta.env?.PROD) return;

  if (isDisabled()) {
    void unregisterServiceWorker();
    return;
  }

  // Chờ `load`: đăng ký sớm hơn là giành băng thông với chính những tài nguyên
  // đang dựng nên màn hình đầu tiên.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Bị chính sách của trình duyệt chặn, hoặc trang không chạy trên HTTPS.
    });
  });
}

/** Gỡ mọi SW đã đăng ký cho origin này, và xoá luôn cache của nó. */
export async function unregisterServiceWorker() {
  if (!supported()) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    /* không gỡ được thì thôi */
  }
  await clearThumbnailCache();
}

/**
 * Xoá sạch byte thumbnail đã lưu.
 *
 * Gọi lúc ĐĂNG XUẤT, cùng chỗ với `clearThumbnails()` (IndexedDB) trong
 * `resetSharedCaches`. Đây không phải chuyện dọn dẹp cho gọn: thumbnail là nội
 * dung tệp của một người dùng cụ thể, và để nó lại trên một máy dùng chung là để
 * nó loé lên trong phiên của người kế tiếp. Bỏ sót đúng lớp này là dựng lại đúng
 * lỗ hổng mà lớp IndexedDB đã đóng.
 *
 * Truy cập `caches` thẳng từ trang được vì CacheStorage thuộc về origin, không
 * thuộc về Service Worker — nên nó xoá được cả khi SW đang không chạy.
 */
export async function clearThumbnailCache() {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* lưu trữ bị chặn: không có gì để xoá */
  }
}
