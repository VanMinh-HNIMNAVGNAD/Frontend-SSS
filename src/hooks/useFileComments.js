import { useCallback, useEffect, useState } from 'react';
import { commentsApi } from '../services/api';

/**
 * Nhận xét của MỘT tệp cho cửa sổ xem trước: nạp một lần khi mở tệp (để nút "Nhận xét" hiện
 * được số lượng), rồi thêm/sửa/xoá cập nhật thẳng vào danh sách — không nạp lại cả list.
 *
 * Backend chưa có endpoint (Nest trả 404 "Cannot GET …") → `supported = false` cho cả phiên
 * và nút "Nhận xét" ẩn đi, thay vì hiện một bảng lúc nào cũng báo lỗi.
 */
let commentsSupported = true;

export function useFileComments(fileId) {
  // Dữ liệu GẮN KÈM id tệp: lật sang tệp khác là bản cũ tự hết hiệu lực khi render.
  const [data, setData] = useState(null); // { fileId, items, error }
  const [reloadTick, setReloadTick] = useState(0);
  const current = data?.fileId === fileId ? data : null;

  useEffect(() => {
    if (!fileId || !commentsSupported) return undefined;
    let cancelled = false;
    commentsApi
      .list(fileId)
      .then((res) => {
        if (!cancelled) setData({ fileId, items: res?.items ?? [], error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = String(err?.message ?? '');
        if (err?.status === 404 && /Cannot GET/i.test(message)) commentsSupported = false;
        setData({ fileId, items: [], error: message || 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, reloadTick]);

  const patchItems = useCallback(
    (fn) => setData((d) => (d && d.fileId === fileId ? { ...d, items: fn(d.items) } : d)),
    [fileId],
  );

  const create = useCallback(
    async (content) => {
      const created = await commentsApi.create(fileId, content);
      patchItems((items) => [...items, created]);
      return created;
    },
    [fileId, patchItems],
  );

  const update = useCallback(
    async (commentId, content) => {
      const updated = await commentsApi.update(fileId, commentId, content);
      patchItems((items) => items.map((c) => (c.id === commentId ? updated : c)));
      return updated;
    },
    [fileId, patchItems],
  );

  const remove = useCallback(
    async (commentId) => {
      await commentsApi.remove(fileId, commentId);
      patchItems((items) => items.filter((c) => c.id !== commentId));
    },
    [fileId, patchItems],
  );

  const reload = useCallback(() => {
    setData(null);
    setReloadTick((n) => n + 1);
  }, []);

  return {
    supported: commentsSupported,
    loading: Boolean(fileId) && commentsSupported && !current,
    error: current?.error ?? null,
    items: current?.items ?? [],
    count: current?.items?.length ?? 0,
    create,
    update,
    remove,
    reload,
  };
}
