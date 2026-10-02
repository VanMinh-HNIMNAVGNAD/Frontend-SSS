/**
 * `localStorage` / `sessionStorage` không bao giờ ném lỗi.
 *
 * Trình duyệt chặn dữ liệu trang (Chrome "Chặn mọi cookie", iframe sandbox, một số chế độ
 * riêng tư) thì CHỈ VIỆC ĐỌC thuộc tính `window.localStorage` đã ném `SecurityError`.
 * `AuthProvider` đọc token ngay lúc dựng, nên trước 02/10/2026 cả app — kể cả `/login` — là
 * một trang trắng với những người này (ledger ##64).
 *
 * Khi storage bị chặn, giá trị được giữ trong bộ nhớ của tab: đăng nhập và dùng app vẫn
 * được trong phiên đó, chỉ là tải lại trang thì mất — đúng mức mà trình duyệt cho phép.
 */

const memory = { local: new Map(), session: new Map() };

function backend(kind) {
  try {
    const store = kind === 'session' ? window.sessionStorage : window.localStorage;
    // Một số trình duyệt cho đọc thuộc tính nhưng ném ở lượt ghi đầu tiên (quota 0).
    const probe = '__cloudsss_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

const cache = {};
function storeFor(kind) {
  if (!(kind in cache)) cache[kind] = backend(kind);
  return cache[kind];
}

function make(kind) {
  const fallback = memory[kind];
  return {
    getItem(key) {
      // Bản trong bộ nhớ đi TRƯỚC: nó chỉ có khi lượt ghi vào storage thật vừa hỏng (đầy
      // quota), và lúc đó storage thật hoặc trống hoặc còn giá trị CŨ — vd. token của tài
      // khoản trước. Đọc storage trước là trả về đúng giá trị cũ ấy.
      if (fallback.has(key)) return fallback.get(key);
      const store = storeFor(kind);
      if (store) {
        try {
          return store.getItem(key);
        } catch {
          /* bị chặn giữa chừng: coi như không có */
        }
      }
      return null;
    },
    setItem(key, value) {
      const text = String(value);
      const store = storeFor(kind);
      if (store) {
        try {
          store.setItem(key, text);
          fallback.delete(key);
          return;
        } catch {
          /* đầy quota hoặc bị chặn giữa chừng: giữ trong bộ nhớ, bỏ bản cũ ở storage */
          try {
            store.removeItem(key);
          } catch {
            /* không xoá được thì bản trong bộ nhớ vẫn thắng ở getItem */
          }
        }
      }
      fallback.set(key, text);
    },
    removeItem(key) {
      fallback.delete(key);
      const store = storeFor(kind);
      if (!store) return;
      try {
        store.removeItem(key);
      } catch {
        /* không còn gì để làm */
      }
    },
  };
}

export const safeLocalStorage = make('local');
export const safeSessionStorage = make('session');

/** `true` khi trình duyệt không cho lưu dữ liệu trang — để giao diện nói rõ hệ quả. */
export function isPersistentStorageBlocked() {
  return storeFor('local') === null;
}
