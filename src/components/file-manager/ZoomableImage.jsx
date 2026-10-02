import { useState, useRef, useEffect, useCallback } from 'react';
import { useWheelZoom, zoomAt, INITIAL_VIEW, DOUBLE_CLICK_ZOOM } from '../../hooks/useZoomPan';

// ─────────────────────────────────────────────────────────────────────────────
// XEM ẢNH CÓ THU PHÓNG + KÉO — dùng chung cho FilePreviewModal và SharePage
// ─────────────────────────────────────────────────────────────────────────────
// • Lăn chuột / chụm touchpad: phóng quanh con trỏ chuột, phản hồi tức thời không giật lag.
// • Kéo (khi zoom > 100%): di chuyển tự do, không bị khóa cứng chiều ngang hay dọc.
// • Bấm đúp: chuyển đổi giữa 100% (vừa khung) và 250% tại vị trí bấm, có animation mượt.
// • Phím tắt / thanh công cụ: phóng to (+), thu nhỏ (-), xoay (R), reset (vừa khung).

/**
 * Props thêm cho ảnh nạp theo tầng (`hooks/usePreviewImage.js`):
 *  • `fitToBox` — vẽ ảnh VỪA KHUNG theo tỉ lệ, kể cả khi bản đang hiện nhỏ hơn khung
 *    (thumbnail 384px, bản 2048px). Không có nó thì <img> giữ cỡ tự nhiên: thumbnail hiện
 *    bé tí giữa màn hình rồi "nhảy" to ra khi bản nét về.
 *  • `fullSize`  — `{ width, height }` của ẢNH GỐC: khung không vượt quá cỡ này (ảnh gốc
 *    nhỏ hơn khung thì không phóng to quá cỡ thật), và giữ nguyên khi đổi nguồn ảnh.
 *  • `onDemand`  — `(px) => void`: với mức phóng hiện tại, cạnh dài cần bao nhiêu điểm ảnh
 *    THẬT trên màn hình (đã nhân `devicePixelRatio`). Nơi gọi dùng để biết khi nào phải
 *    nạp ảnh gốc.
 */
export default function ZoomableImage({
  src,
  alt,
  view,
  onViewChange,
  rotation = 0,
  className = '',
  fitToBox = false,
  fullSize = null,
  onDemand,
}) {
  const [box, setBox] = useState(null);
  const imgRef = useRef(null);
  // Cỡ tự nhiên của ảnh ĐANG hiện, và cỡ vùng nội dung của khung — để tính cỡ vừa khung.
  const [natural, setNatural] = useState(null);
  const [boxSize, setBoxSize] = useState(null);

  useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const cs = getComputedStyle(box);
      const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setBoxSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  // Cỡ vẽ (CSS px) khi ở 100%: theo tỉ lệ của ảnh gốc nếu biết, không thì của ảnh đang hiện.
  const aspectSource = fullSize?.width && fullSize?.height
    ? { w: fullSize.width, h: fullSize.height }
    : natural;
  let layout = null;
  if (fitToBox && aspectSource && boxSize && boxSize.w > 0 && boxSize.h > 0) {
    const scale = Math.min(
      boxSize.w / aspectSource.w,
      boxSize.h / aspectSource.h,
      // Ảnh gốc nhỏ hơn khung: vẽ đúng cỡ thật, như <img> thường.
      fullSize ? 1 : Infinity,
    );
    layout = { width: Math.round(aspectSource.w * scale), height: Math.round(aspectSource.h * scale) };
  }

  // Báo nhu cầu độ nét. `onDemand` đi qua ref: nó thường là hàm mới ở mỗi render của nơi
  // gọi, đưa vào deps là chạy lại effect ở MỌI render.
  const onDemandRef = useRef(onDemand);
  useEffect(() => {
    onDemandRef.current = onDemand;
  });
  const layoutW = layout?.width ?? 0;
  const layoutH = layout?.height ?? 0;
  useEffect(() => {
    const img = imgRef.current;
    if (!onDemandRef.current || !img) return;
    // Đo ở đây (sau khi vẽ) chứ không lúc render: chưa có `layout` thì cỡ vẽ do CSS quyết.
    const w = layoutW || img.offsetWidth;
    const h = layoutH || img.offsetHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    onDemandRef.current(Math.max(w, h) * view.zoom * dpr);
  }, [view.zoom, layoutW, layoutH, natural, boxSize]);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const wheelTimerRef = useRef(null);

  /** Toạ độ con trỏ so với tâm khung. */
  const anchorOf = useCallback((e) => {
    if (!box) return [0, 0];
    const r = box.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  }, [box]);

  /**
   * Giới hạn độ lệch (x, y) để ảnh không bị kéo bay mất khỏi khung.
   * - Khi ảnh lớn hơn khung: cho phép dịch chuyển để xem hết các mép (nửa phần tràn + đệm).
   * - Khi ảnh nhỏ hơn khung: cho phép ảnh dịch chuyển linh hoạt theo con trỏ chuột khi zoom.
   */
  const clampPan = useCallback((v) => {
    const img = imgRef.current;
    if (!img || !box) return v;
    const sideways = rotation % 180 !== 0;
    const baseW = sideways ? img.offsetHeight : img.offsetWidth;
    const baseH = sideways ? img.offsetWidth : img.offsetHeight;
    if (!baseW || !baseH) return v;

    const w = baseW * v.zoom;
    const h = baseH * v.zoom;
    const boxW = box.clientWidth;
    const boxH = box.clientHeight;

    if (v.zoom <= 1) {
      return { ...v, x: 0, y: 0 };
    }

    // Cho phép di chuyển trong cả 2 trường hợp (lớn hơn hoặc nhỏ hơn khung)
    // cộng thêm đệm 60px để người dùng kéo rê thoải mái, không bị khựng đập tường.
    const mx = Math.max((w - boxW) / 2, (boxW - w) / 2, 0) + 60;
    const my = Math.max((h - boxH) / 2, (boxH - h) / 2, 0) + 60;

    return {
      ...v,
      x: Math.max(-mx, Math.min(mx, v.x)),
      y: Math.max(-my, Math.min(my, v.y)),
    };
  }, [box, rotation]);

  // Lăn chuột phóng to/thu nhỏ tại vị trí con trỏ chuột
  useWheelZoom(box, (factor, e) => {
    setIsInteracting(true);
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, 140);

    const [ax, ay] = anchorOf(e);
    onViewChange((v) => clampPan(zoomAt(v, v.zoom * factor, ax, ay)));
  });

  useEffect(() => {
    return () => {
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, []);

  const handlePointerDown = (e) => {
    if (view.zoom <= 1 || e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, id: e.pointerId };
    setDragging(true);
    setIsInteracting(true);
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onViewChange((v) => clampPan({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };

  const endDrag = (e) => {
    if (dragRef.current) {
      try {
        if (e?.pointerId != null) e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      dragRef.current = null;
      setDragging(false);
      setIsInteracting(false);
    }
  };

  const handleDoubleClick = (e) => {
    const [ax, ay] = anchorOf(e);
    setIsInteracting(false); // Bật animation chuyển động mượt khi bấm đúp
    onViewChange((v) => (v.zoom > 1 ? INITIAL_VIEW : clampPan(zoomAt(v, DOUBLE_CLICK_ZOOM, ax, ay))));
  };

  const cursor = view.zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in';

  return (
    <div
      ref={setBox}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={handleDoubleClick}
      className={`w-full h-full flex items-center justify-center overflow-hidden touch-none select-none ${cursor} ${className}`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          setNatural((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
        }}
        style={{
          ...(layout ? { width: layout.width, height: layout.height } : null),
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${rotation}deg)`,
          // Đang lăn chuột hoặc kéo: tắt transition để chuyển động tức thời 60fps/120fps không lag giật
          // Thao tác toolbar hoặc double-click: chuyển động mượt mà
          transition: isInteracting ? 'none' : 'transform 180ms cubic-bezier(0.2, 0, 0.2, 1)',
          willChange: 'transform',
        }}
        className={`${layout ? '' : 'max-w-full max-h-full '}object-contain shadow-2xl shadow-black/50 pointer-events-none select-none`}
      />
    </div>
  );
}
