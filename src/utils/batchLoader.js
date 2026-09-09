/**
 * Gộp nhiều lời gọi lẻ, cùng loại, xảy ra sát nhau thành MỘT request.
 *
 * Bài toán cụ thể: chế độ Lưới render tới 50 thẻ trong cùng một lần, mỗi thẻ tự
 * hỏi URL xem trước của tệp mình. Đó là 50 request rời, mà phía backend mỗi cái
 * tốn một lượt đi Postgres từ dyno Mỹ sang ap-southeast-1 (233ms/lượt). Gộp lại
 * thì cả trang chỉ còn một request và hai câu SQL.
 *
 * Khác `createTtlCache` ở chỗ nào: `ttlCache` gộp những lời gọi TRÙNG KHÍT (cùng
 * một id hỏi hai lần) và ghi nhớ kết quả. Cái này gộp những lời gọi KHÁC NHAU
 * (50 id khác nhau) thành một lượt truyền. Hai thứ bù cho nhau, và dùng chồng lên
 * nhau được: `ttlCache.get(id, () => batcher.load(id))`.
 *
 * Cửa sổ gom cố ý rất ngắn (mặc định 16ms ≈ một khung hình). Đủ để mọi thẻ trong
 * một lần render cùng vào một lô, mà không đủ để người dùng cảm thấy chậm đi.
 */

/**
 * @param {object}   options
 * @param {(keys: string[]) => Promise<Map<string, any>>} options.fetchMany
 *        Nhận danh sách khoá, trả về Map khoá → giá trị. Khoá KHÔNG có trong Map
 *        được coi là "không có kết quả" và resolve thành `null` — không phải lỗi.
 * @param {number}   [options.windowMs=16]      Cửa sổ gom.
 * @param {number}   [options.maxBatchSize=100] Trần một lô; vượt thì cắt lô và gửi ngay.
 */
export function createBatchLoader({ fetchMany, windowMs = 16, maxBatchSize = 100 }) {
  /** Những khoá đang chờ gửi, kèm resolve/reject của từng người gọi. */
  let pending = new Map(); // key -> { resolve, reject }[]
  let timer = null;

  const flush = () => {
    timer = null;
    const batch = pending;
    pending = new Map();
    if (batch.size === 0) return;

    const keys = [...batch.keys()];

    fetchMany(keys)
      .then((result) => {
        for (const [key, waiters] of batch) {
          // Thiếu khoá trong kết quả = không có giá trị, KHÔNG phải lỗi. Với
          // thumbnail thì đó là "tệp này không xem trước được" — một câu trả lời
          // hợp lệ, và phía gọi vẽ icon theo loại tệp.
          const value = result?.get?.(key) ?? null;
          for (const w of waiters) w.resolve(value);
        }
      })
      .catch((err) => {
        // Cả lô hỏng thì mọi người gọi trong lô đều nhận lỗi. Không tự thử lại ở
        // đây: phía gọi (`useFileThumbnail`) đã có đường lùi riêng, và thử lại
        // ngầm một lô 50 phần tử là cách tốt nhất để nhân đôi một sự cố.
        for (const waiters of batch.values()) {
          for (const w of waiters) w.reject(err);
        }
      });
  };

  return {
    /** Xin giá trị của một khoá. Trả promise resolve khi lô chứa nó về. */
    load(key) {
      const k = String(key);
      return new Promise((resolve, reject) => {
        const waiters = pending.get(k);
        if (waiters) {
          // Cùng một khoá được hỏi hai lần trong cùng cửa sổ: đi chung một chỗ
          // trong lô, hai người cùng chờ.
          waiters.push({ resolve, reject });
        } else {
          pending.set(k, [{ resolve, reject }]);
        }

        // Đầy lô thì gửi ngay, không chờ hết cửa sổ.
        if (pending.size >= maxBatchSize) {
          clearTimeout(timer);
          flush();
          return;
        }
        if (!timer) timer = setTimeout(flush, windowMs);
      });
    },
  };
}
