/**
 * UploadContext — Context riêng cho upload queue.
 * Tách khỏi FileContext để các component không liên quan đến upload
 * KHÔNG bị re-render khi percent thay đổi liên tục.
 *
 * Chiến lược tối ưu render:
 *  1. uploadQueue state chỉ nằm ở đây — FileContext không còn giữ nó.
 *  2. updateJob throttle bằng ngưỡng 2% + gộp MỌI tệp vào một requestAnimationFrame.
 *  3. UploadProgress chỉ subscribe vào UploadContext, không phải FileContext.
 *  4. Số byte đã gửi của từng tệp (để tính tốc độ / thời gian còn lại) nằm ở ref, KHÔNG ở
 *     state: mỗi sự kiện tiến độ của trình duyệt chỉ ghi vào một Map, bảng tiến trình tự
 *     đọc nó theo nhịp 1 giây.
 */
import {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

const UploadContext = createContext(null);

/**
 * Context THỨ HAI chỉ chứa các hàm điều khiển hàng đợi — không chứa state.
 *
 * FileContext cần enqueueJob/updateJob/… nhưng KHÔNG cần đọc `uploadQueue`.
 * Nếu nó lấy chung một context với state thì mỗi bước tiến độ (mỗi 2%) lại làm
 * FileProvider render lại — đúng thứ gây cảm giác "cả trang tải lại liên tục"
 * trong lúc upload. Giá trị của context này ổn định vĩnh viễn.
 */
const UploadActionsContext = createContext(null);

export function UploadProvider({ children }) {
  // Upload Queue State — mỗi job: { id, fileName, percent, status, error? }
  // status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error' | 'paused' | 'canceled'
  //
  // Tệp đã xong / đã huỷ VẪN nằm trong hàng đợi tới khi cả đợt xong (##89) — bảng tiến trình
  // dọn một lượt cho cả đợt. Gỡ từng dòng ngay khi xong là thứ làm danh sách dồn lên và thanh
  // tổng tụt lại sau mỗi tệp: tổng được tính trên một tập hợp cứ co lại dần.
  const [uploadQueue, setUploadQueue] = useState([]);

  /**
   * Ref luôn giữ bản mới nhất của uploadQueue để updateJob đọc đồng bộ
   * mà không cần dependency vào state (tránh stale closure).
   */
  const uploadQueueRef = useRef([]);
  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  /**
   * jobId → % mới nhất chờ ghi vào state ở khung hình kế tiếp. MỘT requestAnimationFrame
   * cho mọi tệp: mười tệp chạy song song là mười sự kiện tiến độ mỗi khung hình, mà mỗi lần
   * ghi là dựng lại cả mảng hàng đợi (cả nghìn phần tử khi tải một thư mục lớn).
   */
  const pendingPercentRef = useRef(new Map());
  const percentRafRef = useRef(null);

  /**
   * jobId → { loaded, baseline } — byte đã đẩy lên của từng tệp, chính xác tới từng sự kiện
   * tiến độ (khác `percent` ở state: đã làm tròn và bỏ qua bước dưới 2%).
   *
   * `baseline` = phần đã có trên cloud TRƯỚC lượt này (tải tiếp một phiên dở sau F5). Phần đó
   * tính vào tiến độ nhưng không phải byte vừa đi trên mạng — tính vào tốc độ thì tệp 1GB tải
   * tiếp từ 900MB sẽ hiện "900 MB/s" trong giây đầu tiên.
   */
  const jobBytesRef = useRef(new Map());

  // Cleanup RAF khi unmount
  useEffect(() => () => {
    if (percentRafRef.current) cancelAnimationFrame(percentRafRef.current);
  }, []);

  const flushPendingPercents = useCallback(() => {
    percentRafRef.current = null;
    const pending = pendingPercentRef.current;
    if (pending.size === 0) return;
    pendingPercentRef.current = new Map();
    setUploadQueue((prev) =>
      prev.map((job) => (pending.has(job.id) ? { ...job, percent: pending.get(job.id) } : job)),
    );
  }, []);

  /**
   * Cập nhật 1 job trong queue theo id.
   *
   * Tối ưu:
   *  - Non-percent patches (status, fileName, error, …) → áp dụng ngay, bỏ % đang chờ của job đó.
   *  - Percent-only patches → throttle theo ngưỡng 2% VÀ gộp vào một RAF cho mọi job.
   */
  const updateJob = useCallback((id, patch) => {
    const keys = Object.keys(patch);
    const isPercentOnly = keys.length > 0 && keys.every((k) => k === 'percent');

    if (!isPercentOnly) {
      // % đang chờ của job này đã cũ so với patch sắp ghi (vd. 'done' kèm 100%).
      pendingPercentRef.current.delete(id);
      setUploadQueue((prev) =>
        prev.map((job) => (job.id === id ? { ...job, ...patch } : job)),
      );
      return;
    }

    // Percent-only: kiểm tra ngưỡng 2% so với giá trị ĐANG CHỜ (nếu có) hoặc đang hiện
    const newPercent = patch.percent;
    const waiting = pendingPercentRef.current.get(id);
    let currentPercent = waiting;
    if (currentPercent === undefined) {
      const currentJob = uploadQueueRef.current.find((j) => j.id === id);
      currentPercent =
        currentJob && typeof currentJob.percent === 'number' ? currentJob.percent : -1;
    }

    if (
      typeof newPercent === 'number' &&
      newPercent < 100 &&
      newPercent - currentPercent < 2
    ) {
      // Dưới ngưỡng 2% — bỏ qua hoàn toàn
      return;
    }

    pendingPercentRef.current.set(id, newPercent);
    if (!percentRafRef.current) {
      percentRafRef.current = requestAnimationFrame(flushPendingPercents);
    }
  }, [flushPendingPercents]); // không dependency state — dùng ref để đọc state hiện tại

  /**
   * Ghi số byte đã đẩy lên của một job. KHÔNG setState — xem `jobBytesRef`.
   * `{ baseline: true }`: đây là phần đã có sẵn trên cloud (tải tiếp), không phải byte vừa gửi.
   */
  const trackJobBytes = useCallback((id, loaded, { baseline = false } = {}) => {
    const bytes = Math.max(0, Number(loaded) || 0);
    const entry = jobBytesRef.current.get(id);
    if (baseline || !entry) {
      jobBytesRef.current.set(id, { loaded: bytes, baseline: baseline ? bytes : 0 });
      return;
    }
    entry.loaded = bytes;
    // Gửi lại từ đầu (proxy, phiên hết hạn) thì phần "có sẵn" cũng không còn nữa.
    if (bytes < entry.baseline) entry.baseline = bytes;
  }, []);

  /** `{ loaded, baseline }` của một job, hoặc null nếu chưa có byte nào. */
  const readJobBytes = useCallback((id) => jobBytesRef.current.get(id) || null, []);

  /** Thêm job vào queue */
  const enqueueJob = useCallback((job) => {
    setUploadQueue((prev) => [...prev, job]);
  }, []);

  /** Xóa một job khỏi queue */
  const removeJob = useCallback((id) => {
    jobBytesRef.current.delete(id);
    pendingPercentRef.current.delete(id);
    setUploadQueue((prev) => prev.filter((j) => j.id !== id));
  }, []);

  /**
   * Dọn những job đã KẾT THÚC (xong / lỗi / huỷ) — "đóng" bảng tiến trình. Job còn đang chạy
   * hay đang chờ thì giữ: đóng bảng không được là cách vô tình bỏ dở việc của người dùng.
   */
  const clearQueue = useCallback(() => {
    const finished = new Set(['done', 'error', 'canceled']);
    setUploadQueue((prev) => {
      const kept = prev.filter((j) => !finished.has(j.status));
      prev.forEach((j) => {
        if (finished.has(j.status)) {
          jobBytesRef.current.delete(j.id);
          pendingPercentRef.current.delete(j.id);
        }
      });
      return kept.length === prev.length ? prev : kept;
    });
  }, []);

  /** Reset job về pending (retry) */
  const resetJob = useCallback((id, resetPatch) => {
    pendingPercentRef.current.delete(id);
    if (resetPatch && resetPatch.percent === 0) jobBytesRef.current.delete(id);
    setUploadQueue((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...resetPatch } : j)),
    );
  }, []);

  const actions = useMemo(
    () => ({
      setUploadQueue,
      uploadQueueRef,
      updateJob,
      trackJobBytes,
      readJobBytes,
      enqueueJob,
      removeJob,
      clearQueue,
      resetJob,
    }),
    [updateJob, trackJobBytes, readJobBytes, enqueueJob, removeJob, clearQueue, resetJob],
  );

  const value = useMemo(() => ({ uploadQueue, ...actions }), [uploadQueue, actions]);

  return (
    <UploadActionsContext.Provider value={actions}>
      <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
    </UploadActionsContext.Provider>
  );
}

/** Hàng đợi + hàm điều khiển. Component nào VẼ tiến độ thì dùng hook này. */
export const useUpload = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used within UploadProvider');
  return ctx;
};

/** Chỉ các hàm điều khiển — dùng khi không cần vẽ tiến độ, để không re-render theo %. */
export const useUploadActions = () => {
  const ctx = useContext(UploadActionsContext);
  if (!ctx) throw new Error('useUploadActions must be used within UploadProvider');
  return ctx;
};
