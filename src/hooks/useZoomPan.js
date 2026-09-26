import { useState, useEffect, useRef, useCallback } from 'react';

// Trạng thái thu phóng/kéo cho trình xem ảnh — xem chú thích đầu
// components/file-manager/ZoomableImage.jsx.

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;
export const DOUBLE_CLICK_ZOOM = 2.5;

export const INITIAL_VIEW = { zoom: 1, x: 0, y: 0 };

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Phóng tới `nextZoom` mà giữ nguyên điểm ảnh đang nằm tại (ax, ay) — toạ độ so
 * với tâm khung. Điểm đó trong hệ toạ độ của ảnh là (a − t) / z; muốn nó đứng yên
 * sau khi đổi z thì t' = a − (a − t) · z'/z. Anchor (0, 0) = phóng quanh tâm khung.
 * Từ 100% trở xuống ảnh đã lọt trong khung nên đưa về giữa (0, 0).
 */
export function zoomAt(view, nextZoom, ax = 0, ay = 0) {
  const zoom = clampZoom(nextZoom);
  if (zoom <= 1) return { zoom, x: 0, y: 0 };
  const k = zoom / view.zoom;
  return { zoom, x: ax - (ax - view.x) * k, y: ay - (ay - view.y) * k };
}

/** State thu phóng cho thanh công cụ + phím tắt; truyền `view`/`setView` xuống ZoomableImage. */
export function useZoomPan() {
  const [view, setView] = useState(INITIAL_VIEW);
  const zoomIn = useCallback(() => setView((v) => zoomAt(v, v.zoom + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setView((v) => zoomAt(v, v.zoom - ZOOM_STEP)), []);
  const zoomBy = useCallback((factor) => setView((v) => zoomAt(v, v.zoom * factor)), []);
  const reset = useCallback(() => setView(INITIAL_VIEW), []);
  return { view, setView, zoomIn, zoomOut, zoomBy, reset };
}

/**
 * Gắn listener `wheel` KHÔNG passive lên `el` và gọi `onZoom(factor, event)`.
 *
 * Phải tự gắn: `onWheel` của React là passive nên `preventDefault()` vô hiệu —
 * trang phía sau vẫn cuộn, và Ctrl + lăn chuột vẫn phóng CẢ TRANG trình duyệt.
 * `el` là phần tử (lấy qua callback ref), không phải ref object: khung ảnh chỉ
 * xuất hiện sau khi tải xong URL, ref object lúc effect chạy vẫn còn null.
 *
 * `requireCtrl`: chỉ phóng khi giữ Ctrl/⌘ (hoặc chụm touchpad — trình duyệt báo
 * cử chỉ đó là wheel kèm ctrlKey); lăn thường để nguyên cho việc cuộn, dùng cho PDF.
 */
export function useWheelZoom(el, onZoom, { requireCtrl = false } = {}) {
  const handlerRef = useRef(onZoom);
  useEffect(() => {
    handlerRef.current = onZoom;
  });

  useEffect(() => {
    if (!el) return;
    const onWheel = (e) => {
      if (requireCtrl && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Quy mọi deltaMode về px. Chuẩn hóa để nấc chuột lăn mượt mà, phản hồi tức thì
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const d = Math.max(-100, Math.min(100, e.ctrlKey ? px * 4 : px));
      // Tỉ lệ zoom theo hàm exp để mượt mà cả khi phóng to lẫn thu nhỏ
      handlerRef.current(Math.exp(-d * 0.0025), e);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [el, requireCtrl]);
}
