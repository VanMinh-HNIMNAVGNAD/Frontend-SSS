/**
 * Gom những việc cùng loại thành lô, theo nhịp "đang có lô bay thì cứ gom tiếp".
 *
 * Dùng cho bước `confirm-uploads` của hàng đợi tải lên. Khác `createBatchLoader`
 * (gom trong một cửa sổ cố định rồi gửi) ở chỗ nào: ở đây các tệp PUT xong RẢI RÁC
 * theo thời gian, không cùng một khung hình. Cửa sổ cố định sẽ cắt chúng thành những
 * lô 1–2 tệp, mỗi lô vẫn trả đủ ~10 lượt đi Postgres. Còn nhịp dưới đây tự co giãn:
 * mạng nhanh thì nhiều tệp xong trong lúc một lô đang bay → lô sau to; mạng chậm thì
 * lô nhỏ nhưng cũng chẳng ai phải chờ.
 *
 * Luật gửi:
 *  - còn làn trống (`inFlight < maxInFlight`): chờ `windowMs` cho có bạn rồi gửi;
 *  - đủ `maxBatchSize`: gửi ngay;
 *  - một lô vừa về mà còn việc đang chờ: gửi luôn — chúng đã chờ suốt lượt vừa rồi.
 *
 * @param {object} options
 * @param {(items: any[]) => Promise<any[]>} options.run
 *        Nhận mảng việc, trả mảng kết quả CÙNG THỨ TỰ. Phần tử là `Error` = việc đó
 *        hỏng (người gọi nhận reject); còn lại là giá trị resolve. `run` throw = cả
 *        lô hỏng, mọi người gọi trong lô cùng nhận lỗi đó.
 * @param {number} [options.maxBatchSize=50]  Khớp `UPLOAD_BATCH_MAX_ITEMS` ở backend.
 * @param {number} [options.maxInFlight=2]
 * @param {number} [options.windowMs=200]
 */
export function createPipelinedBatcher({ run, maxBatchSize = 50, maxInFlight = 2, windowMs = 200 }) {
  /** @type {{ key: string, item: any, resolve: Function, reject: Function }[]} */
  let pending = [];
  const inFlightKeys = new Set();
  let inFlight = 0;
  let timer = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const flush = () => {
    clearTimer();
    if (pending.length === 0 || inFlight >= maxInFlight) return;

    const batch = pending.splice(0, maxBatchSize);
    inFlight += 1;
    batch.forEach((entry) => inFlightKeys.add(entry.key));

    Promise.resolve()
      .then(() => run(batch.map((entry) => entry.item)))
      .then((results) => {
        batch.forEach((entry, i) => {
          const result = results?.[i];
          if (result instanceof Error) entry.reject(result);
          else entry.resolve(result);
        });
      })
      .catch((err) => {
        batch.forEach((entry) => entry.reject(err));
      })
      .finally(() => {
        inFlight -= 1;
        batch.forEach((entry) => inFlightKeys.delete(entry.key));
        if (pending.length > 0) flush();
      });
  };

  const schedule = () => {
    if (inFlight >= maxInFlight) return; // lô đang bay về sẽ tự gọi `flush`
    if (pending.length >= maxBatchSize) {
      flush();
      return;
    }
    if (!timer) timer = setTimeout(flush, windowMs);
  };

  return {
    /** Xếp một việc vào lô. Promise resolve/reject theo kết quả của đúng việc đó. */
    add(key, item) {
      return new Promise((resolve, reject) => {
        pending.push({ key: String(key), item, resolve, reject });
        schedule();
      });
    },

    /**
     * Rút một việc CHƯA gửi ra khỏi lô; người gọi nhận reject với `reason`.
     * Trả `false` nếu việc đó không còn trong hàng chờ (đã gửi đi, hoặc chưa từng có).
     */
    cancel(key, reason) {
      const k = String(key);
      const index = pending.findIndex((entry) => entry.key === k);
      if (index === -1) return false;
      const [entry] = pending.splice(index, 1);
      entry.reject(reason ?? new Error('canceled'));
      if (pending.length === 0) clearTimer();
      return true;
    },

    /** Việc này đang nằm trong một lô đã gửi đi và chưa có trả lời. */
    isInFlight(key) {
      return inFlightKeys.has(String(key));
    },

    /** Số việc chưa có kết quả: đang chờ gửi + đang bay. */
    size() {
      return pending.length + inFlightKeys.size;
    },
  };
}
