import { useState, useRef, useEffect, useCallback } from 'react';
import { useWheelZoom, zoomAt, INITIAL_VIEW, DOUBLE_CLICK_ZOOM } from '../../hooks/useZoomPan';

// ─────────────────────────────────────────────────────────────────────────────
// XEM ẢNH CÓ THU PHÓNG + KÉO — dùng chung cho FilePreviewModal và SharePage
// ─────────────────────────────────────────────────────────────────────────────
// • Lăn chuột / chụm touchpad: phóng quanh con trỏ chuột, phản hồi tức thời không giật lag.
// • Kéo (khi zoom > 100%): di chuyển tự do, không bị khóa cứng chiều ngang hay dọc.
// • Bấm đúp: chuyển đổi giữa 100% (vừa khung) và 250% tại vị trí bấm, có animation mượt.
// • Phím tắt / thanh công cụ: phóng to (+), thu nhỏ (-), xoay (R), reset (vừa khung).

export default function ZoomableImage({ src, alt, view, onViewChange, rotation = 0, className = '' }) {
  const [box, setBox] = useState(null);
  const imgRef = useRef(null);
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
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${rotation}deg)`,
          // Đang lăn chuột hoặc kéo: tắt transition để chuyển động tức thời 60fps/120fps không lag giật
          // Thao tác toolbar hoặc double-click: chuyển động mượt mà
          transition: isInteracting ? 'none' : 'transform 180ms cubic-bezier(0.2, 0, 0.2, 1)',
          willChange: 'transform',
        }}
        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10 pointer-events-none select-none"
      />
    </div>
  );
}
