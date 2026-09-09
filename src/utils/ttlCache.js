import { clearThumbnails } from './thumbnailStore';

/**
 * Bộ nhớ đệm theo thời gian sống, dùng chung cho những lời gọi API mà cùng một
 * câu trả lời bị hỏi đi hỏi lại trong vài giây.
 *
 * Sinh ra từ một mẫu đã có sẵn và đã chứng minh là đúng trong `useFileThumbnail.js`
 * (nơi Trang chủ hiển thị cùng một tệp ở ba khu vực nên xin presigned URL ba lần).
 * Tách ra đây để bảng giá gói dịch vụ, URL xem trước và danh sách phiên đăng nhập
 * dùng lại cùng một cách, thay vì mỗi chỗ chép lại một `Map` riêng.
 *
 * Điểm khác biệt so với một `Map` thường: nó gộp cả những lời gọi ĐANG BAY.
 * Mở nhanh hai thẻ cùng một tệp thì chỉ có một request rời máy, thẻ thứ hai chờ
 * chung promise đó — nếu chỉ cache kết quả thì cả hai đều thấy cache trống và
 * cùng bắn request.
 *
 * Cache nằm ở phạm vi module nên sống qua việc unmount/mount component (đó chính
 * là mục đích: mở modal, đóng, mở lại). Đổi tài khoản thì phải gọi `clear()` —
 * xem `resetSharedCaches()` ở cuối file này.
 */
export function createTtlCache({ ttlMs, maxEntries = 100 } = {}) {
  const entries = new Map(); // key -> { value, expiresAt }
  const inFlight = new Map(); // key -> Promise

  const prune = () => {
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  return {
    /**
     * Trả về giá trị đã lưu nếu còn hạn, ngược lại gọi `loader()` đúng một lần.
     * `loader` ném lỗi thì KHÔNG có gì được lưu — lần gọi sau sẽ thử lại thật.
     */
    async get(key, loader) {
      const hit = entries.get(key);
      if (hit && Date.now() < hit.expiresAt) return hit.value;
      if (hit) entries.delete(key);

      const flying = inFlight.get(key);
      if (flying) return flying;

      const promise = (async () => {
        try {
          const value = await loader();
          entries.set(key, { value, expiresAt: Date.now() + ttlMs });
          prune();
          return value;
        } finally {
          inFlight.delete(key);
        }
      })();

      inFlight.set(key, promise);
      return promise;
    },

    /** Bỏ một mục — dùng sau khi thao tác ghi làm câu trả lời cũ thành sai. */
    invalidate(key) {
      entries.delete(key);
    },

    clear() {
      entries.clear();
      inFlight.clear();
    },
  };
}

// ── Các bộ đệm dùng chung ────────────────────────────────────────────────────

/**
 * Bảng giá gói dịch vụ. Gần như tĩnh (đổi khi vận hành sửa bảng giá), nhưng
 * trang Gói dịch vụ tải lại nó mỗi lần người dùng ghé qua.
 */
export const plansCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 4 });

/**
 * URL xem trước có chữ ký. Backend phát hạn 15 phút (storage.service.ts:
 * expiresIn 900) nên 10 phút là biên an toàn — hết hạn thì xin URL mới.
 */
export const previewUrlCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 120 });

/**
 * Nội dung văn bản của tệp, cho khung xem trước code / text / markdown.
 * Ngắn hơn vì nội dung tệp có thể bị thay bằng một lần upload đè.
 */
export const fileTextCache = createTtlCache({ ttlMs: 3 * 60 * 1000, maxEntries: 40 });

/**
 * Danh sách phiên đăng nhập trong Hồ sơ cá nhân. TTL cố tình rất ngắn: đây là
 * màn hình bảo mật, người dùng vào đó để xem tình trạng THẬT. 30 giây chỉ đủ
 * chặn việc đóng-mở modal liên tục thành một chuỗi request, không đủ để hiển
 * thị một thông tin đã lỗi thời một cách có ý nghĩa.
 */
export const sessionsCache = createTtlCache({ ttlMs: 30 * 1000, maxEntries: 2 });

/**
 * Trạng thái AI (`GET /ai/status`: bật/tắt, model, hạn mức tháng).
 *
 * Khung AI hỏi cái này MỖI LẦN mở — mà nó được gắn `key={item.id}` nên mở một tệp
 * khác là một instance mới, tức mỗi lượt right-click → "Hỏi AI" là một request.
 * TTL ngắn vì hạn mức có thật sự đổi, nhưng `POST /ai/ask` đã trả về `quota` mới
 * ở mỗi câu trả lời rồi, nên bộ đệm này chỉ chặn phần lặp vô ích.
 */
export const aiStatusCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 2 });

/**
 * Nhật ký hoạt động. Khoá là fileId, hoặc `'global'` cho nhật ký toàn tài khoản.
 *
 * Hai chỗ dùng — `FileInfoDrawer` và `ActivityLogDrawer` — đều gọi lại API mỗi lần
 * mở, kể cả khi vừa đóng đúng tệp đó một giây trước. TTL ngắn vì mọi thao tác trong
 * app đều sinh thêm log; và mọi thao tác ghi đều đốt bộ đệm này
 * (`invalidateAfterFileMutation`) nên 30 giây chỉ chặn việc đóng-mở liên tục.
 */
export const activityLogsCache = createTtlCache({ ttlMs: 30 * 1000, maxEntries: 20 });

/**
 * Danh sách phiên bản của một tệp. Chỉ đổi khi có ai tải lên một bản mới đè lên,
 * nên dài hơn nhật ký được.
 */
export const fileVersionsCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 20 });

/**
 * Danh sách người được chia sẻ trực tiếp một tệp (`ShareModal`).
 * Ngắn: đây là màn hình quyền truy cập, người dùng mở nó ra để thấy trạng thái THẬT.
 */
export const shareAccessCache = createTtlCache({ ttlMs: 30 * 1000, maxEntries: 20 });

/**
 * Danh sách Bộ nhớ dùng chung. `SharedDrivesPage` gọi lại mỗi lần vào route.
 */
export const sharedDrivesCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 2 });

/** Các tệp lớn nhất (`QuickCleanupModal`) — gọi lại mỗi lần mở modal. */
export const largestFilesCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 4 });

/**
 * Một thao tác GHI lên tệp làm những câu trả lời nào thành sai?
 *
 * Gọi từ chính `services/api.js`, ngay sau khi mutation thành công — KHÔNG bắt phía
 * gọi tự nhớ. Đặt việc đốt bộ đệm cạnh việc ghi là cách duy nhất để nó không bị bỏ
 * sót khi có người thêm một nút mới ở đâu đó trong app.
 *
 * Cố ý KHÔNG đụng tới `listCacheRef` trong FileContext: danh sách file đã tự cập
 * nhật tại chỗ theo từng thao tác (`upsertItems`, lọc bỏ khỏi `items`…) rồi, đốt
 * thêm ở đây sẽ biến mỗi lần đổi tên thành một lần tải lại cả trang — đúng thứ mà
 * lối stale-while-revalidate ở đó đang tránh.
 */
export function invalidateAfterFileMutation(fileId) {
  // Nhật ký đổi sau MỌI thao tác, kể cả nhật ký toàn cục — nên xoá cả bộ.
  activityLogsCache.clear();
  // Dung lượng đổi thì bảng "tệp lớn nhất" cũng đổi.
  largestFilesCache.clear();

  if (fileId) {
    const key = String(fileId);
    fileVersionsCache.invalidate(key);
    shareAccessCache.invalidate(key);
    // Nội dung tệp có thể vừa bị thay bằng một bản upload đè.
    fileTextCache.invalidate(key);
    // Hai ô: đường gộp (`id`) và đường trình phát (`id:pb`) — xem `storageApi.getPreviewUrl`.
    previewUrlCache.invalidate(key);
    previewUrlCache.invalidate(`${key}:pb`);
  }
}

/**
 * Đăng xuất / đổi tài khoản phải xoá sạch: các bộ đệm này nằm ở phạm vi module
 * nên không tự chết theo việc unmount cây React như state thường.
 */
export function resetSharedCaches() {
  plansCache.clear();
  previewUrlCache.clear();
  fileTextCache.clear();
  sessionsCache.clear();
  aiStatusCache.clear();
  activityLogsCache.clear();
  fileVersionsCache.clear();
  shareAccessCache.clear();
  sharedDrivesCache.clear();
  largestFilesCache.clear();
  // Thumbnail nằm trên IndexedDB nên KHÔNG tự chết khi đóng tab — đây là nội dung
  // tệp của một người dùng cụ thể, để lại trên máy dùng chung là để nó loé lên
  // trong phiên của người kế tiếp. Không await: đăng xuất không được phép chờ đĩa.
  void clearThumbnails();
}
