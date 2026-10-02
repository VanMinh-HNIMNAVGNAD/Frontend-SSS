/**
 * Kho khoá–giá trị BỀN trên IndexedDB, có hạn dùng, dùng chung cho mọi bộ đệm
 * cần sống qua F5 và qua việc đóng/mở lại trình duyệt.
 *
 * ## Vì sao cần thêm một lớp nữa
 *
 * Trước đây app có ba lớp đệm, và HAI trong ba nằm hoàn toàn trong RAM của tab:
 *
 *   • `ttlCache` (bảng giá, danh sách Bộ nhớ dùng chung, nhật ký…) — mất khi F5;
 *   • `listCacheRef` trong `FileContext` (danh sách tệp/thư mục) — mất khi F5;
 *   • `thumbnailStore` (ảnh thu nhỏ) — BỀN, vì nằm trên IndexedDB.
 *
 * Hệ quả là mỗi lần tải lại trang, mọi thư mục vừa xem xong đều phải hỏi lại máy
 * chủ từ đầu — mà máy chủ đặt ở Mỹ còn người dùng ở Việt Nam. Ảnh thì đã bền sẵn,
 * nên người dùng thấy đúng cái nghịch cảnh: ảnh hiện ngay lập tức, còn cái danh
 * sách chứa những tấm ảnh đó thì vẫn dựng skeleton.
 *
 * Module này là phần "bền" được tách ra khỏi `thumbnailStore` để mọi bộ đệm dùng
 * chung, thay vì chép lại một bản IndexedDB thứ hai. Thumbnail vẫn giữ kho riêng:
 * dữ liệu của nó không hết hạn theo thời gian mà theo VÂN TAY nội dung tệp, và nó
 * chiếm nhiều chỗ hơn phần còn lại cộng lại — trộn chung thì việc dọn của bên này
 * sẽ ăn mất bản ghi của bên kia.
 *
 * ## Hai quy tắc bắt buộc
 *
 * 1/ MỌI khoá đều mang tiền tố là id người dùng (xem `cacheScope`). Đây là dữ liệu
 *    riêng nằm trên đĩa của một máy có thể dùng chung; không có tiền tố này thì
 *    người đăng nhập kế tiếp sẽ thấy tên tệp của người trước loé lên.
 * 2/ KHÔNG hàm nào ở đây được phép ném lỗi. Chế độ riêng tư, quota đầy, trình
 *    duyệt chặn lưu trữ — tất cả chỉ làm bộ đệm rỗng, không được làm hỏng app.
 *
 * ## Cái gì KHÔNG được lưu xuống đây
 *
 * Bất cứ thứ gì tự nó hết hạn theo thời gian thực: URL có chữ ký (`previewUrl`)
 * hết hạn sau 15 phút, lưu xuống đĩa chỉ để lần sau đọc lên một cái link chết.
 * Và các màn hình bảo mật (danh sách phiên đăng nhập, danh sách người được chia
 * sẻ) — người dùng mở chúng ra để xem trạng thái THẬT.
 */

import { subjectOf } from './jwt';
import { safeLocalStorage } from './safeStorage';

const DB_NAME = 'driver-cache';
const DB_VERSION = 1;
const STORE = 'entries';

/** Dấu phân tách ba đoạn của khoá: `<scope>|<namespace>|<key>`. */
const SEP = '|';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      // `indexedDB` có thể KHÔNG tồn tại (một số WebView) hoặc chỉ đọc thuộc tính
      // đã ném SecurityError (Firefox khi người dùng chặn hoàn toàn lưu trữ).
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Nghẽn vì một tab khác đang giữ phiên bản cũ: không chờ vô hạn. Tệ nhất là
    // phiên này chạy không có bộ đệm bền, không phải treo giao diện.
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
 * Tiền tố khoá của người dùng đang đăng nhập.
 *
 * Đọc thẳng từ `accessToken` trong localStorage chứ không nhận từ React state:
 * module này bị gọi từ `services/api.js` và từ các bộ đệm ở phạm vi module, những
 * chỗ không có context nào trong tay. `subjectOf` trả `null` với token hỏng hoặc
 * khi chưa đăng nhập — lúc đó dùng `anon`, và những bản ghi đó sẽ không bao giờ
 * bị một người dùng đã đăng nhập đọc trúng.
 */
export function cacheScope() {
  try {
    return subjectOf(safeLocalStorage.getItem('accessToken')) || 'anon';
  } catch {
    return 'anon';
  }
}

function fullKey(namespace, key) {
  return `${cacheScope()}${SEP}${namespace}${SEP}${key}`;
}

function namespacePrefix(namespace) {
  return `${cacheScope()}${SEP}${namespace}${SEP}`;
}

/**
 * Đọc một bản ghi còn hạn. Trả `null` khi không có, hết hạn, hoặc storage không
 * dùng được. Bản ghi hết hạn được xoá luôn tại chỗ để không tích lại trên đĩa.
 */
export async function readCached(namespace, key) {
  const db = await openDb();
  if (!db) return null;

  const id = fullKey(namespace, key);
  const record = await runTx(db, 'readonly', (store, setResult) => {
    const req = store.get(id);
    req.onsuccess = () => setResult(req.result || null);
  });

  if (!record) return null;
  if (Date.now() >= record.expiresAt) {
    void runTx(db, 'readwrite', (store) => store.delete(id));
    return null;
  }
  return { value: record.value, expiresAt: record.expiresAt };
}

/**
 * Đọc TOÀN BỘ một namespace còn hạn, trong đúng một giao dịch.
 *
 * Dành cho bộ đệm cần nạp lại cả bộ ngay lúc khởi động (danh sách tệp): hỏi từng
 * khoá một thì phải biết trước có những khoá nào, mà chính danh sách khoá ấy mới
 * là thứ cần đọc lên.
 */
export async function readNamespace(namespace) {
  const db = await openDb();
  if (!db) return [];

  const prefix = namespacePrefix(namespace);
  let range;
  try {
    range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  } catch {
    return [];
  }

  const rows = await runTx(
    db,
    'readonly',
    (store, setResult) => {
      const out = [];
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          setResult(out);
          return;
        }
        const record = cursor.value;
        if (record && Date.now() < record.expiresAt) {
          out.push({
            key: String(record.key).slice(prefix.length),
            value: record.value,
            expiresAt: record.expiresAt,
          });
        }
        cursor.continue();
      };
    },
    [],
  );

  return rows;
}

/** Ghi một bản ghi kèm mốc hết hạn tuyệt đối. */
export async function writeCached(namespace, key, value, expiresAt) {
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return;
  const db = await openDb();
  if (!db) return;

  await runTx(db, 'readwrite', (store) => {
    // Giá trị phải đi qua được structured clone. Object thuần từ JSON thì luôn
    // được; nhưng nếu nơi gọi lỡ nhét vào một thứ không clone được (hàm, Error,
    // node DOM) thì `put` ném ngay trong `work` — `runTx` đã bọc try/catch nên
    // lượt ghi hỏng đó chỉ mất bộ đệm, không nổi lên thành lỗi cho người dùng.
    store.put({ key: fullKey(namespace, key), value, expiresAt });
  });
}

/** Ghi nhiều bản ghi trong MỘT giao dịch — dùng cho lượt xả cache theo lô. */
export async function writeManyCached(namespace, rows) {
  if (!rows?.length) return;
  const db = await openDb();
  if (!db) return;

  const now = Date.now();
  await runTx(db, 'readwrite', (store) => {
    for (const row of rows) {
      if (!Number.isFinite(row?.expiresAt) || now >= row.expiresAt) continue;
      store.put({ key: fullKey(namespace, row.key), value: row.value, expiresAt: row.expiresAt });
    }
  });
}

export async function deleteCached(namespace, key) {
  const db = await openDb();
  if (!db) return;
  await runTx(db, 'readwrite', (store) => store.delete(fullKey(namespace, key)));
}

/** Xoá cả một namespace CỦA NGƯỜI DÙNG HIỆN TẠI. */
export async function clearNamespace(namespace) {
  const db = await openDb();
  if (!db) return;

  const prefix = namespacePrefix(namespace);
  let range;
  try {
    range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  } catch {
    return;
  }
  await runTx(db, 'readwrite', (store) => store.delete(range));
}

/**
 * Đốt sạch mọi namespace của MỌI người dùng.
 *
 * Gọi khi đăng xuất: xoá theo tiền tố người dùng hiện tại là không đủ, vì token
 * có thể đã bị gỡ khỏi localStorage trước khi hàm này chạy (lúc đó `cacheScope()`
 * đã trả về `anon`, và bản ghi của người vừa đăng xuất sẽ nằm lại trên đĩa).
 */
export async function clearPersistentCache() {
  const db = await openDb();
  if (!db) return;
  await runTx(db, 'readwrite', (store) => store.clear());
}

/**
 * Dọn mọi bản ghi đã hết hạn, một lần mỗi phiên.
 *
 * Không có việc này thì đĩa chỉ có phình thêm: một bản ghi hết hạn chỉ bị xoá khi
 * có ai đó tình cờ đọc trúng đúng khoá của nó, mà khoá của một thư mục đã xoá hay
 * một bộ lọc dùng một lần thì sẽ không bao giờ được hỏi lại nữa.
 */
export async function prunePersistentCache() {
  const db = await openDb();
  if (!db) return;

  const now = Date.now();
  await runTx(db, 'readwrite', (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (!cursor.value || cursor.value.expiresAt <= now) cursor.delete();
      cursor.continue();
    };
  });
}
