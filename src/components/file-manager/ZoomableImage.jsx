import { useState, useRef } from 'react';
import { useWheelZoom, zoomAt, INITIAL_VIEW, DOUBLE_CLICK_ZOOM } from '../../hooks/useZoomPan';

// ─────────────────────────────────────────────────────────────────────────────
// XEM ẢNH CÓ THU PHÓNG + KÉO — dùng chung cho FilePreviewModal và SharePage
// ─────────────────────────────────────────────────────────────────────────────
// Bản cũ chỉ đặt `transform: scale(zoom)` lên <img> nằm giữa một khung flex
// `overflow-auto`, và hỏng theo ba đường:
//
//   1. `transform` không đổi kích thước bố cục, nên khung không biết ảnh đã to ra:
//      phần tràn lên trên / sang trái nằm ở toạ độ âm và KHÔNG cuộn tới được, còn
//      thanh cuộn (nếu có) không khớp với ảnh đang thấy.
//   2. Luôn phóng quanh TÂM ảnh, không theo con trỏ — muốn xem một góc thì phóng
//      xong lại phải đi tìm, mà đi tìm thì vướng đúng lỗi (1).
//   3. Khung có `cursor-grab` nhưng không có dòng code kéo nào; lăn chuột cũng
//      không làm gì. Con trỏ hứa một điều mà ảnh không làm.
//
// Nay khung là `overflow-hidden` và vị trí ảnh do chính ta giữ: { zoom, x, y },
// với (x, y) là độ lệch tâm ảnh so với tâm khung, tính bằng px màn hình (hooks/useZoomPan.js).
//   • Lăn chuột / chụm hai ngón trên touchpad → phóng quanh ĐIỂM DƯỚI CON TRỎ.
//   • Kéo (khi đã phóng > 100%) → di chuyển ảnh, có chặn để ảnh không trôi mất.
//   • Bấm đúp → phóng 250% tại chỗ bấm, bấm đúp lần nữa → về vừa khung.
// zoom = 1 nghĩa là "vừa khung" (ảnh đã được `max-w/max-h-full` co lại), không
// phải 100% điểm ảnh gốc.

export default function ZoomableImage({ src, alt, view, onViewChange, rotation = 0, className = '' }) {
  const [box, setBox] = useState(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  /** Toạ độ con trỏ so với tâm khung. */
  const anchorOf = (e) => {
    const r = box.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  };

  /**
   * Chặn để mép ảnh không kéo vào quá mép khung: lệch tối đa là nửa phần ảnh
   * vượt khung. Kích thước bố cục của <img> (offsetWidth) không tính transform,
   * nên nhân zoom vào; xoay 90°/270° thì rộng và cao đổi chỗ.
   */
  const clampPan = (v) => {
    const img = imgRef.current;
    if (!img || !box) return v;
    const sideways = rotation % 180 !== 0;
    const w = (sideways ? img.offsetHeight : img.offsetWidth) * v.zoom;
    const h = (sideways ? img.offsetWidth : img.offsetHeight) * v.zoom;
    const mx = Math.max(0, (w - box.clientWidth) / 2);
    const my = Math.max(0, (h - box.clientHeight) / 2);
    return { ...v, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };

  useWheelZoom(box, (factor, e) => {
    const [ax, ay] = anchorOf(e);
    onViewChange((v) => clampPan(zoomAt(v, v.zoom * factor, ax, ay)));
  });

  const handlePointerDown = (e) => {
    if (view.zoom <= 1 || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    setDragging(true);
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onViewChange((v) => clampPan({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const handleDoubleClick = (e) => {
    const [ax, ay] = anchorOf(e);
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
      className={`w-full h-full flex items-center justify-center overflow-hidden touch-none ${cursor} ${className}`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${rotation}deg)`,
          // Đang kéo thì ảnh phải bám tay ngay, có transition là thấy ảnh lết theo sau.
          transition: dragging ? 'none' : 'transform 90ms ease-out',
          willChange: 'transform',
        }}
        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10"
      />
    </div>
  );
}
