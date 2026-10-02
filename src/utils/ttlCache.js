import { clearThumbnails } from './thumbnailStore';
import { clearThumbnailCache } from './serviceWorker';
import {
  readCached,
  writeCached,
  deleteCached,
  clearNamespace,
  clearPersistentCache,
  prunePersistentCache,
} from './persistentCache';

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
export function createTtlCache({ ttlMs, maxEntries = 100, persistAs = null } = {}) {
  const entries = new Map(); // key -> { value, expiresAt }
  const inFlight = new Map(); // key -> Promise

  const prune = () => {
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const remember = (key, value, expiresAt) => {
    entries.set(key, { value, expiresAt });
    prune();
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
          // Lớp BỀN nằm GIỮA bộ nhớ và mạng, không song song với chúng: đọc đĩa
          // tốn vài mili giây, còn một lượt khứ hồi Việt Nam ↔ Heroku (Mỹ) tốn
          // ~265ms kể cả khi backend trả lời tức thì. Đây chính là thứ làm cho
          // F5 không còn kéo theo một tràng request.
          //
          // Mốc hết hạn lấy theo bản ghi trên đĩa, KHÔNG tính lại từ bây giờ:
          // tính lại là một bản đã nằm đó 14 phút được sống thêm 15 phút nữa ở
          // mỗi lần tải trang, tức TTL không bao giờ đến hạn.
          if (persistAs) {
            const stored = await readCached(persistAs, key);
            if (stored) {
              remember(key, stored.value, stored.expiresAt);
              return stored.value;
            }
          }

          const value = await loader();
          const expiresAt = Date.now() + ttlMs;
          remember(key, value, expiresAt);
          // Không await lượt ghi đĩa: người dùng đã có câu trả lời trong tay rồi,
          // ghi được hay không chỉ ảnh hưởng tới lần mở trang SAU.
          if (persistAs) void writeCached(persistAs, key, value, expiresAt);
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
      // Phải xoá cả bản trên đĩa, nếu không thì lần tải trang sau bộ đệm sống
      // dậy với đúng câu trả lời vừa bị làm cho sai.
      if (persistAs) void deleteCached(persistAs, key);
    },

    clear() {
      entries.clear();
      inFlight.clear();
      if (persistAs) void clearNamespace(persistAs);
    },
  };
}

// ── Các bộ đệm dùng chung ────────────────────────────────────────────────────

/**
 * Hạn dùng MẶC ĐỊNH của những bộ đệm "nội dung", tức phần lớn app: bảng giá, danh
 * sách Bộ nhớ dùng chung, nội dung tệp xem trước, danh sách phiên bản…
 *
 * Những dữ liệu này chỉ đổi khi CHÍNH người đang ngồi đó làm một thao tác ghi — mà
 * mọi thao tác ghi đều tự đốt bộ đệm liên quan ngay tại chỗ (`afterFileMutation`).
 * Nói cách khác TTL ở đây không phải để bắt kịp thay đổi của bản thân người dùng;
 * nó chỉ là trần cho thay đổi đến từ NGƯỜI KHÁC (thành viên Bộ nhớ dùng chung) hoặc
 * từ một thiết bị khác của cùng người.
 *
 * 60 phút (trước là 15). Đọc con số này cho đúng: KHÁC với bộ đệm danh sách trong
 * `FileContext`, ở đây KHÔNG có lượt gọi nền nào chạy sau lưng — trong TTL là im
 * lặng hoàn toàn. Nên 60 phút nghĩa đúng là: đồng nghiệp tải lên một phiên bản
 * mới, và màn hình này có thể không biết cho tới một tiếng sau. Đó là một quyết
 * định sản phẩm đã cân nhắc, không phải một con số tiện tay.
 *
 * KHÔNG áp cho các màn hình bảo mật (phiên đăng nhập, danh sách người được chia sẻ):
 * người dùng mở chúng ra chính là để xem trạng thái THẬT ngay lúc đó. Và cũng không
 * áp cho danh sách Bộ nhớ dùng chung — xem `sharedDrivesCache`.
 */
const CONTENT_TTL_MS = 60 * 60 * 1000;

/**
 * Bảng giá gói dịch vụ. Gần như tĩnh (đổi khi vận hành sửa bảng giá), nhưng
 * trang Gói dịch vụ tải lại nó mỗi lần người dùng ghé qua.
 */
export const plansCache = createTtlCache({
  ttlMs: 60 * 60 * 1000,
  maxEntries: 4,
  // Bảng giá là thứ TĨNH nhất trong app và giống hệt nhau với mọi người dùng —
  // đúng loại dữ liệu đáng nằm lại trên đĩa để một lần F5 không phải hỏi lại.
  persistAs: 'plans',
});

/**
 * URL xem trước có chữ ký. Backend phát hạn 1 TIẾNG cho ảnh/PDF và 4 giờ cho
 * video/audio (`storage.service.ts`, `resolvePreviewUrlTtlSeconds`), nên 55 phút
 * là biên an toàn cho cả hai nhánh — hết hạn thì xin URL mới.
 *
 * Con số này BÁM THEO hạn ngắn nhất mà backend phát, không phải là một lựa chọn
 * độc lập: để nó vượt quá hạn chữ ký là tự tay phát cho người dùng một link chết,
 * và triệu chứng sẽ là "ảnh hiện lúc được lúc không" chứ không phải một lỗi rõ
 * ràng. Sửa hạn ở backend thì phải sửa cả ở đây.
 *
 * CỐ Ý KHÔNG lưu xuống đĩa: giá trị ở đây tự hết hạn theo đồng hồ của nhà cung cấp
 * lưu trữ chứ không theo đồng hồ của ta, nên lưu bền một chữ ký chỉ để hôm sau đọc
 * lên một cái link chết. Thứ ĐÁNG bền ở nhánh ảnh là thành phẩm thumbnail, và nó
 * đã nằm sẵn trên IndexedDB (`thumbnailStore`).
 */
export const previewUrlCache = createTtlCache({ ttlMs: 55 * 60 * 1000, maxEntries: 120 });

/**
 * Nội dung văn bản của tệp, cho khung xem trước code / text / markdown.
 * Ngắn hơn vì nội dung tệp có thể bị thay bằng một lần upload đè.
 */
export const fileTextCache = createTtlCache({
  ttlMs: CONTENT_TTL_MS,
  maxEntries: 40,
  // Bền được vì đây là NỘI DUNG chứ không phải một cái link có hạn; và một lần
  // upload đè lên chính tệp đó đã tự đốt ô này (`invalidateAfterFileMutation`).
  persistAs: 'file-text',
});

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
 * `POST /ai/ask` đã trả về `quota` mới ở mỗi câu trả lời rồi, nên bộ đệm này không
 * bao giờ là thứ hiển thị một hạn mức đã tiêu mà chưa cập nhật — nó chỉ chặn phần
 * lặp vô ích. Vì vậy 5 phút thay cho 1 phút không làm mất tính đúng đắn của gì cả.
 * Không lưu xuống đĩa: 5 phút thì một lần F5 hỏi lại là chuyện nhỏ, còn "AI đang
 * bật hay tắt" là cấu hình phía vận hành, không nên đóng băng qua nhiều phiên.
 */
export const aiStatusCache = createTtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 2 });

/**
 * Nhật ký hoạt động. Khoá là fileId, hoặc `'global'` cho nhật ký toàn tài khoản.
 *
 * Hai chỗ dùng — `FileInfoDrawer` và `ActivityLogDrawer` — đều gọi lại API mỗi lần
 * mở, kể cả khi vừa đóng đúng tệp đó một giây trước. MỌI thao tác ghi trong app đều
 * đốt sạch bộ đệm này (`invalidateAfterFileMutation`), nên nó không bao giờ giấu đi
 * một dòng log do chính người đang ngồi đó sinh ra — thứ duy nhất nó có thể làm chậm
 * là log của người khác trong Bộ nhớ dùng chung. Đó là lý do nâng được lên 5 phút.
 *
 * Không lưu xuống đĩa: nhật ký là thứ CHỈ có thêm, một bản cũ đọc lên sau khi F5 sẽ
 * thiếu đúng những dòng mới nhất — phần mà người ta mở nhật ký ra để xem.
 */
export const activityLogsCache = createTtlCache({ ttlMs: 5 * 60 * 1000, maxEntries: 20 });

/**
 * Danh sách phiên bản của một tệp. Chỉ đổi khi có ai tải lên một bản mới đè lên.
 * Không lưu xuống đĩa: nhẹ, hiếm khi mở, và mở lại sau F5 thì một lượt gọi là đủ.
 */
export const fileVersionsCache = createTtlCache({ ttlMs: CONTENT_TTL_MS, maxEntries: 20 });

/**
 * Danh sách người được chia sẻ trực tiếp một tệp (`ShareModal`).
 * Ngắn: đây là màn hình quyền truy cập, người dùng mở nó ra để thấy trạng thái THẬT.
 */
export const shareAccessCache = createTtlCache({ ttlMs: 30 * 1000, maxEntries: 20 });

/**
 * Danh sách Bộ nhớ dùng chung. `SharedDrivesPage` gọi lại mỗi lần vào route — và
 * đây là route người dùng ra vào nhiều nhất sau My Drive, nên nó được lưu bền.
 * Mọi thao tác tạo/sửa/xoá drive đã tự gọi `sharedDrivesCache.clear()` (xem
 * `sharedDrivesApi` trong `services/api.js`), mà `clear()` nay xoá cả bản trên đĩa.
 */
export const sharedDrivesCache = createTtlCache({
  // CỐ Ý ở 15 phút, không theo `CONTENT_TTL_MS` (60 phút) như các bộ đệm nội dung
  // khác: đây là danh sách duy nhất mà thay đổi quan trọng đến TỪ NGƯỜI KHÁC — được
  // mời vào một drive mới, hoặc bị gỡ khỏi một drive. Không thao tác nào của chính
  // người dùng đốt được ô đệm ấy, nên TTL là trần DUY NHẤT; và vì nó lưu bền, một
  // lần F5 cũng không gỡ. Để 60 phút là để người được mời ngồi nhìn một danh sách
  // thiếu mất drive vừa được mời vào.
  ttlMs: 15 * 60 * 1000,
  maxEntries: 2,
  persistAs: 'shared-drives',
});

/**
 * Các tệp lớn nhất (`QuickCleanupModal`) — gọi lại mỗi lần mở modal. Lưu bền được
 * vì mọi thao tác ghi lên tệp đều đốt nó (`invalidateAfterFileMutation`).
 */
export const largestFilesCache = createTtlCache({
  ttlMs: CONTENT_TTL_MS,
  maxEntries: 4,
  persistAs: 'largest-files',
});

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
 *
 * Trả về promise của phần xoá trên ĐĨA (không bao giờ reject). Phần lớn chỗ gọi bỏ qua
 * nó; `AuthContext.logout` thì chờ (có trần) vì ngay sau đó trang bị tải lại, và một
 * giao dịch IndexedDB đang dở sẽ bị huỷ theo trang — để lại dữ liệu của người vừa rời đi.
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
  // trong phiên của người kế tiếp.
  //
  // Lớp THỨ HAI giữ đúng những byte ấy: cache của Service Worker (`public/sw.js`).
  // Xoá cùng lúc, cùng một lý do — bỏ sót nó là mở lại đúng lỗ hổng mà dòng trên
  // vừa đóng, chỉ khác chỗ lưu.
  //
  // Cùng lý do, cho lớp bền dùng chung: danh sách tệp, nội dung xem trước, danh
  // sách Bộ nhớ dùng chung. `clear()` của từng bộ ở trên chỉ xoá namespace của
  // NGƯỜI DÙNG HIỆN TẠI, mà lúc đăng xuất token có thể đã bị gỡ khỏi localStorage
  // rồi — nên phải quét sạch, xem `clearPersistentCache`.
  return Promise.allSettled([clearThumbnails(), clearThumbnailCache(), clearPersistentCache()]);
}

/**
 * Dọn rác trên đĩa một lần mỗi phiên: bản ghi hết hạn của những khoá sẽ không bao
 * giờ được hỏi lại nữa (thư mục đã xoá, một bộ lọc dùng đúng một lần) thì không có
 * đường nào tự biến mất. Chạy ngay lúc import, không chờ ai gọi — và không await,
 * vì đây là việc dọn nhà, không phải việc người dùng đang đợi.
 */
void prunePersistentCache();
