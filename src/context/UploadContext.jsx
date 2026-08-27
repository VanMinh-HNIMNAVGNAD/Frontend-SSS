/**
 * UploadContext — Context riêng cho upload queue.
 * Tách khỏi FileContext để các component không liên quan đến upload
 * KHÔNG bị re-render khi percent thay đổi liên tục.
 *
 * Chiến lược tối ưu render:
 *  1. uploadQueue state chỉ nằm ở đây — FileContext không còn giữ nó.
 *  2. updateJob throttle bằng ngưỡng 2% + requestAnimationFrame batching.
 *  3. UploadProgress chỉ subscribe vào UploadContext, không phải FileContext.
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
  // status: 'pending' | 'uploading' | 'confirming' | 'done' | 'error'
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
   * Pending RAF frame để batch percent updates.
   * Key: jobId → { rafId, latestPercent }
   */
  const rafBatchRef = useRef(new Map());

  // Cleanup RAF frames khi unmount
  useEffect(() => {
    const batch = rafBatchRef.current;
    return () => {
      batch.forEach(({ rafId }) => cancelAnimationFrame(rafId));
      batch.clear();
    };
  }, []);

  /**
   * Cập nhật 1 job trong queue theo id.
   *
   * Tối ưu:
   *  - Non-percent patches (status, fileName, error, …) → áp dụng ngay, flush pending RAF.
   *  - Percent-only patches → throttle theo ngưỡng 2% VÀ batch bằng RAF.
   *    Trong 1 animation frame có thể nhiều chunk callback → chỉ gọi setState 1 lần/frame.
   */
  const updateJob = useCallback((id, patch) => {
    const keys = Object.keys(patch);
    const isPercentOnly = keys.length > 0 && keys.every((k) => k === 'percent');

    if (!isPercentOnly) {
      // Non-percent update: flush bất kỳ RAF pending nào của job này
      const pending = rafBatchRef.current.get(id);
      if (pending) {
        cancelAnimationFrame(pending.rafId);
        rafBatchRef.current.delete(id);
      }
      // Áp dụng ngay
      setUploadQueue((prev) =>
        prev.map((job) => (job.id === id ? { ...job, ...patch } : job)),
      );
      return;
    }

    // Percent-only: kiểm tra ngưỡng 2%
    const currentJob = uploadQueueRef.current.find((j) => j.id === id);
    const currentPercent =
      currentJob && typeof currentJob.percent === 'number' ? currentJob.percent : -1;
    const newPercent = patch.percent;

    if (
      typeof newPercent === 'number' &&
      newPercent < 100 &&
      newPercent - currentPercent < 2
    ) {
      // Dưới ngưỡng 2% — bỏ qua hoàn toàn
      return;
    }

    // Vượt ngưỡng 2% (hoặc đạt 100%): batch bằng RAF
    const existing = rafBatchRef.current.get(id);
    if (existing) {
      // Cập nhật giá trị mới nhất, giữ nguyên RAF đã đặt
      existing.latestPercent = newPercent;
      return;
    }

    const entry = { rafId: null, latestPercent: newPercent };
    entry.rafId = requestAnimationFrame(() => {
      rafBatchRef.current.delete(id);
      setUploadQueue((prev) =>
        prev.map((job) =>
          job.id === id ? { ...job, percent: entry.latestPercent } : job,
        ),
      );
    });
    rafBatchRef.current.set(id, entry);
  }, []); // không dependency — dùng ref để đọc state hiện tại

  /** Thêm job vào queue */
  const enqueueJob = useCallback((job) => {
    setUploadQueue((prev) => [...prev, job]);
  }, []);

  /** Xóa một job khỏi queue */
  const removeJob = useCallback((id) => {
    setUploadQueue((prev) => prev.filter((j) => j.id !== id));
  }, []);

  /** Xóa toàn bộ queue */
  const clearQueue = useCallback(() => {
    setUploadQueue([]);
  }, []);

  /** Reset job về pending (retry) */
  const resetJob = useCallback((id, resetPatch) => {
    setUploadQueue((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...resetPatch } : j)),
    );
  }, []);

  const actions = useMemo(
    () => ({
      setUploadQueue,
      uploadQueueRef,
      updateJob,
      enqueueJob,
      removeJob,
      clearQueue,
      resetJob,
    }),
    [updateJob, enqueueJob, removeJob, clearQueue, resetJob],
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
