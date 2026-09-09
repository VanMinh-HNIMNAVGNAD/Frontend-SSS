/**
 * Bộ đệm THUMBNAIL BỀN, nằm trên IndexedDB.
 *
 * Vì sao cần thêm một lớp nữa khi đã có `ttlCache` và `Map` trong
 * `useFileThumbnail`: hai lớp kia đều nằm trong RAM của tab, nên mọi thứ tan biến
 * khi tải lại trang, và bản thân ảnh thì chưa bao giờ được đệm — hook cũ trả thẳng
 * URL có chữ ký cho `<img src>`, mỗi lần thẻ được dựng lại là một lượt đi mạng, và
 * chữ ký đổi sau 10 phút nên bộ đệm của trình duyệt cũng mất khoá.
 *
 * Ở đây lưu THÀNH PHẨM đã thu nhỏ (data URL ~20KB) chứ không lưu URL, nên:
 *   • xem lại một thư mục không tốn một byte mạng nào, kể cả sau khi F5;
 *   • không phụ thuộc vào vòng đời chữ ký;
 *   • một tấm ảnh 4MB được tải về ĐÚNG MỘT LẦN cho cả đời cái thẻ 200px, thay vì
 *     mỗi lần mở lại thư mục.
 *
 * Chỉ nhận thành phẩm TỰ CHỨA (`data:`) — xem `isPersistable`. URL có chữ ký mà
 * lưu xuống đây thì lần sau đọc lên là một cái link đã hết hạn.
 *
 * Mọi hàm ở đây đều KHÔNG ném lỗi: chế độ riêng tư, quota đầy, hoặc trình duyệt
 * chặn lưu trữ đều chỉ làm bộ đệm rỗng, không được phép làm hỏng việc hiển thị.
 */

const DB_NAME = 'driver-thumbnails';
const DB_VERSION = 1;
const STORE = 'thumbs';

/**
 * Số bản ghi giữ lại. Mỗi bản ~15–25KB nên 3000 bản ≈ 60MB.
 *
 * Nâng từ 500 (≈10MB) sau khi kiểm thử thực tế: 500 bản chỉ đủ cho khoảng mười
 * thư mục ảnh, nên duyệt qua vài thư mục là những thư mục đầu đã bị đẩy ra, và
 * quay lại chúng là tải ảnh gốc từ đầu — đúng cảm giác "mới có tí đã phải load
 * lại". Trần này là thứ quyết định bộ đệm ảnh phục vụ được BAO NHIÊU thư mục,
 * chứ không phải TTL: bản ghi ở đây không hết hạn theo thời gian mà theo vân tay
 * nội dung tệp (xem `thumbnailFingerprint`), nên một tấm ảnh không đổi thì bản
 * thu nhỏ của nó đúng mãi mãi.
 *
 * 60MB vẫn nhỏ so với hạn mức lưu trữ nguồn gốc của một trang web (thường là một
 * phần đáng kể dung lượng đĩa trống, cỡ hàng GB). Và trình duyệt không xoá giữa
 * chừng: khi chật, nó thu hồi theo cả nguồn gốc chứ không gặm dần từng bản ghi.
 */
const MAX_ENTRIES = 3000;

/** Dọn khi vượt ngưỡng bao nhiêu bản, để không phải dọn ở mỗi lần ghi. */
const PRUNE_SLACK = 200;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      // `indexedDB` có thể KHÔNG tồn tại (một số WebView) hoặc chỉ đọc thuộc tính
      // đã ném SecurityError (Firefox khi người dùng chặn hoàn toàn cookie/lưu trữ).
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        // Dọn theo "lâu không dùng nhất" nên cần chỉ mục trên lastUsedAt.
        store.createIndex('lastUsedAt', 'lastUsedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Nghẽn vì một tab khác đang giữ phiên bản cũ: không chờ vô hạn, cứ coi như
    // không có bộ đệm — tệ nhất là tải lại thumbnail, không phải treo giao diện.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** Một promise cho MỘT giao dịch, resolve kể cả khi lỗi (giá trị `fallback`). */
function runTx(db, mode, work, fallback = null) {
  return new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch {
      resolve(fallback);
      return;
    }
    let result = fallback;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => resolve(fallback);
    tx.onabort = () => resolve(fallback);
    try {
      work(tx.objectStore(STORE), (value) => {
        result = value;
      });
    } catch {
      resolve(fallback);
    }
  });
}

/**
 * Thành phẩm này có đáng lưu xuống đĩa không.
 *
 * `thumbUrl` trỏ ra ngoài (http) thì KHÔNG: đó là URL có chữ ký, hết hạn sau 15
 * phút, lưu lại chỉ để lần sau nhận về một ô ảnh vỡ. Trường hợp này là thumbnail
 * video — nó vẫn nằm trong bộ đệm RAM, chỉ không sống qua lần tải lại trang.
 */
export function isPersistable(value) {
  // Không có `thumbType` = tệp này không có thumbnail, HOẶC lượt dựng vừa rồi thất
  // bại. Không phân biệt được hai trường hợp, nên không lưu cả hai: lưu cái thứ hai
  // xuống đĩa là biến một lần mất mạng thành một ô icon vĩnh viễn. Còn cái thứ nhất
  // (zip, audio, …) thì `loadThumbnail` trả về mà không gọi API nào, nên lưu cũng
  // chẳng tiết kiệm được gì.
  if (!value?.thumbType) return false;
  if (!value.thumbUrl) return true; // text / sheet / markdown: nội dung tự chứa sẵn
  return value.thumbUrl.startsWith('data:');
}

/**
 * Đọc thành phẩm đã đệm.
 *
 * `fingerprint` là dấu vân tay của NỘI DUNG tệp (xem `thumbnailFingerprint`).
 * Lệch vân tay = tệp đã bị thay bằng phiên bản mới → bỏ bản cũ đi.
 */
export async function readThumbnail(key, fingerprint) {
  if (!key) return null;
  const db = await openDb();
  if (!db) return null;

  const record = await runTx(db, 'readonly', (store, setResult) => {
    const req = store.get(key);
    req.onsuccess = () => setResult(req.result || null);
  });

  if (!record || record.fingerprint !== fingerprint) return null;

  // Chạm vào dấu thời gian để bản đang được dùng không bị dọn. Không await: đây
  // là dữ liệu phục vụ việc DỌN, chậm một nhịp không ảnh hưởng kết quả đọc.
  void runTx(db, 'readwrite', (store) => {
    store.put({ ...record, lastUsedAt: Date.now() });
  });

  return record.value;
}

/** Ghi thành phẩm, kèm dọn bớt nếu store đã phình quá ngưỡng. */
export async function writeThumbnail(key, fingerprint, value) {
  if (!key || !isPersistable(value)) return;
  const db = await openDb();
  if (!db) return;

  const count = await runTx(
    db,
    'readwrite',
    (store, setResult) => {
      store.put({ key, fingerprint, value, lastUsedAt: Date.now() });
      const req = store.count();
      req.onsuccess = () => setResult(req.result);
    },
    0,
  );

  if (count > MAX_ENTRIES + PRUNE_SLACK) await pruneThumbnails();
}

/** Xoá những bản lâu không dùng nhất cho về đúng `MAX_ENTRIES`. */
async function pruneThumbnails() {
  const db = await openDb();
  if (!db) return;

  await runTx(db, 'readwrite', (store) => {
    const total = store.count();
    total.onsuccess = () => {
      let toDelete = total.result - MAX_ENTRIES;
      if (toDelete <= 0) return;
      // Đi từ đầu chỉ mục lastUsedAt = từ bản cũ nhất.
      const cursorReq = store.index('lastUsedAt').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || toDelete <= 0) return;
        cursor.delete();
        toDelete -= 1;
        cursor.continue();
      };
    };
  });
}

/**
 * Đốt sạch. BẮT BUỘC gọi khi đăng xuất / đổi tài khoản: đây là nội dung tệp của
 * một người dùng cụ thể, nằm trên đĩa máy dùng chung thì không được phép loé lên
 * trong phiên của người kế tiếp.
 */
export async function clearThumbnails() {
  const db = await openDb();
  if (!db) return;
  await runTx(db, 'readwrite', (store) => {
    store.clear();
  });
}

/**
 * Dấu vân tay nội dung của một tệp.
 *
 * Cần vì `file.id` KHÔNG đổi khi người dùng tải một phiên bản mới đè lên cùng một
 * tệp — chỉ dựa vào id thì thumbnail cũ sống mãi.
 *
 * Ưu tiên `storageKey`: mỗi lần tải lên sinh một key mới (`randomUUID()` ở
 * backend, xem `getPresignedUploadUrl`) nên nó là dấu vân tay CHÍNH XÁC của nội
 * dung, và không đổi theo bất cứ thứ gì phía giao diện.
 *
 * Chỉ khi thiếu key mới lùi về `size` + `updatedAt`. Lưu ý `updatedAt` ở đây đã
 * bị `formatApiItem` chuyển thành chuỗi theo locale, nên đổi ngôn ngữ giao diện sẽ
 * làm mất hiệu lực một lượt bộ đệm — chấp nhận được cho một nhánh dự phòng.
 */
export function thumbnailFingerprint(file) {
  if (file?.storageKey) return file.storageKey;
  const stamp = file?.updatedAt || file?.modifiedAt || file?.createdAt || '';
  return `${file?.size ?? file?.sizeBytes ?? ''}|${stamp}`;
}
