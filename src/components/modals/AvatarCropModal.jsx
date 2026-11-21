import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  X,
  CircleNotch as Loader2,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  ArrowClockwise,
  ArrowsOut,
  ArrowsIn,
} from '@phosphor-icons/react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Chọn vùng làm ảnh đại diện (21/11/2026).
 *
 * Trước đây ảnh gốc đi thẳng lên Cloudinary và bị cắt vuông `gravity: 'face'` — ảnh chân dung dọc
 * mất nửa dưới, người dùng không có cách nào chọn lại. Nay người dùng kéo / phóng to / xoay trong
 * khung tròn, và có thể thu nhỏ tới mức THẤY CẢ ẢNH (phần trống phía sau được lấp bằng chính ảnh đó
 * làm mờ). Kết quả là một ảnh vuông 512×512 vẽ trên canvas, đúng y khung đang thấy — backend chỉ
 * còn thu về cỡ chuẩn, không cắt thêm gì.
 *
 * Toạ độ: ảnh đặt ở TÂM khung, dịch `offset` (px của khung), xoay `rotation` (bội 90°), phóng
 * `coverScale × zoom`. `zoom = 1` là vừa lấp đầy khung (cạnh ngắn = khung); `zoom = minZoom` là
 * thấy trọn ảnh (cạnh dài = khung).
 */

const OUTPUT = 512;
const MAX_ZOOM = 5;
/** Mờ của nền lấp chỗ trống, tính theo px của khung xem trước (canvas nhân theo tỉ lệ). */
const FILL_BLUR = 10;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export default function AvatarCropModal({ file, busy = false, onCancel, onConfirm, onLoadError }) {
  const { t } = useLanguage();
  const viewportRef = useRef(null);
  const [img, setImg] = useState(null); // { el, url, w, h }
  const [box, setBox] = useState(280); // cạnh khung xem trước (px)
  // Trạng thái THÔ; thứ hiển thị là `view` = bản đã kẹp vào giới hạn hiện tại (khung đổi cỡ / xoay
  // làm giới hạn đổi theo mà không cần một effect ghi lại state).
  const [rawView, setView] = useState({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  // Ảnh → object URL. HEIC… trình duyệt không đọc được thì `onLoadError` (cha tải ảnh gốc lên như cũ).
  // URL tạo và thu hồi trong CÙNG một effect (StrictMode chạy effect hai lần: URL tạo ở useMemo sẽ
  // bị lượt dọn đầu thu hồi mất rồi ảnh không tải được).
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  });
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    let alive = true;
    const el = new Image();
    el.onload = () => alive && setImg({ el, url, w: el.naturalWidth, h: el.naturalHeight });
    el.onerror = () => alive && onLoadErrorRef.current?.();
    el.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const src = img?.url ?? null;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => setBox(el.clientWidth || 280);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Kích thước ảnh SAU khi xoay — xoay 90° thì rộng/cao đổi chỗ.
  const turned = rawView.rotation % 180 !== 0;
  const ew = img ? (turned ? img.h : img.w) : 1;
  const eh = img ? (turned ? img.w : img.h) : 1;
  const coverScale = box / Math.min(ew, eh);
  const minZoom = Math.min(ew, eh) / Math.max(ew, eh); // thấy trọn ảnh

  /** Giữ ảnh trong khung: ảnh lớn hơn khung thì không để hở mép, nhỏ hơn thì không trôi ra ngoài. */
  const clampView = useCallback(
    (v) => {
      const k = coverScale * v.zoom;
      const limX = Math.abs(ew * k - box) / 2;
      const limY = Math.abs(eh * k - box) / 2;
      return { ...v, x: clamp(v.x, -limX, limX), y: clamp(v.y, -limY, limY) };
    },
    [coverScale, ew, eh, box],
  );

  /** Kẹp cả mức phóng (ảnh xoay đổi `minZoom`) lẫn vị trí. */
  const norm = useCallback(
    (v) => clampView({ ...v, zoom: clamp(v.zoom, minZoom, MAX_ZOOM) }),
    [clampView, minZoom],
  );
  const view = norm(rawView);
  const scale = coverScale * view.zoom;

  /** Phóng to quanh TÂM khung: phần đang ở giữa vẫn ở giữa. */
  const zoomTo = useCallback(
    (next) => {
      setView((raw) => {
        const v = norm(raw);
        const zoom = clamp(next, minZoom, MAX_ZOOM);
        const r = zoom / v.zoom;
        return clampView({ ...v, zoom, x: v.x * r, y: v.y * r });
      });
    },
    [minZoom, clampView, norm],
  );

  // Lăn chuột để phóng to — listener không-passive mới chặn được trang cuộn theo.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setView((raw) => {
        const v = norm(raw);
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), minZoom, MAX_ZOOM);
        const r = zoom / v.zoom;
        return clampView({ ...v, zoom, x: v.x * r, y: v.y * r });
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [minZoom, clampView, norm]);

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    gesture.current = {
      view,
      pts: pts.map((p) => ({ ...p })),
      dist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
    };
  };

  const onPointerDown = (e) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.dist > 0) {
      // Chụm hai ngón: phóng theo tỉ lệ khoảng cách, dịch theo trung điểm.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const zoom = clamp(g.view.zoom * (dist / g.dist), minZoom, MAX_ZOOM);
      const r = zoom / g.view.zoom;
      const mx = (pts[0].x + pts[1].x) / 2 - (g.pts[0].x + g.pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2 - (g.pts[0].y + g.pts[1].y) / 2;
      setView(clampView({ ...g.view, zoom, x: g.view.x * r + mx, y: g.view.y * r + my }));
    } else {
      const start = g.pts[0];
      const now = pts[0];
      setView(clampView({ ...g.view, x: g.view.x + (now.x - start.x), y: g.view.y + (now.y - start.y) }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture();
    else gesture.current = null;
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 5;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setView((raw) => {
        const v = norm(raw);
        return clampView({ ...v, x: v.x + dx, y: v.y + dy });
      });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(view.zoom * 1.1);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomTo(view.zoom / 1.1);
    }
  };

  // Esc đóng hộp này, không đóng luôn hồ sơ phía dưới.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  const rotate = () => setView((v) => ({ ...v, rotation: (v.rotation + 90) % 360, x: 0, y: 0 }));

  const covers = ew * scale >= box - 0.5 && eh * scale >= box - 0.5;

  const handleConfirm = async () => {
    if (!img || busy) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    const f = OUTPUT / box;
    ctx.imageSmoothingQuality = 'high';

    const drawAt = (x, y, k) => {
      ctx.save();
      ctx.translate(OUTPUT / 2 + x * f, OUTPUT / 2 + y * f);
      ctx.rotate((view.rotation * Math.PI) / 180);
      ctx.scale(k * f, k * f);
      ctx.drawImage(img.el, -img.w / 2, -img.h / 2);
      ctx.restore();
    };

    if (!covers) {
      // Chỗ trống quanh ảnh: chính ảnh đó phóng lấp khung rồi làm mờ (Safari cũ không có
      // `ctx.filter` → nền xám trung tính thay vì một bản ảnh sắc nét lệch tâm).
      if (typeof ctx.filter === 'string') {
        ctx.filter = `blur(${FILL_BLUR * f}px)`;
        drawAt(0, 0, coverScale * 1.15);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      } else {
        ctx.fillStyle = '#d4d4d8';
        ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      }
    }
    drawAt(view.x, view.y, scale);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
    if (!blob) {
      onLoadError?.();
      return;
    }
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    onConfirm?.(new File([blob], `avatar.${ext}`, { type: blob.type }));
  };

  const imgStyle = (x, y, k) => ({
    width: img?.w,
    height: img?.h,
    maxWidth: 'none',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${view.rotation}deg) scale(${k})`,
  });

  const sliderPos = ((Math.log(view.zoom) - Math.log(minZoom)) / (Math.log(MAX_ZOOM) - Math.log(minZoom))) * 1000;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 glass-overlay animate-fade-in" onClick={() => !busy && onCancel?.()} />
      <div
        className="glass-strong relative rounded-[28px] w-full max-w-sm overflow-hidden p-5 space-y-4 animate-glass-in text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('profile.avatarCrop.title')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('profile.avatarCrop.title')}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('profile.avatarCrop.hint')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 -mr-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40"
            aria-label={t('common.close')}
          >
            <X weight="bold" className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={viewportRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative mx-auto w-[min(280px,calc(100vw-6rem))] aspect-square rounded-2xl overflow-hidden bg-zinc-300 dark:bg-zinc-800 touch-none select-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label={t('profile.avatarCrop.area')}
        >
          {src && img && (
            <>
              {!covers && (
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="absolute left-1/2 top-1/2 pointer-events-none"
                  style={{ ...imgStyle(0, 0, coverScale * 1.15), filter: `blur(${FILL_BLUR}px) brightness(.88)` }}
                />
              )}
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 pointer-events-none"
                style={imgStyle(view.x, view.y, scale)}
              />
            </>
          )}
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
          {/* Phần nằm ngoài vòng tròn tối đi: đúng vùng sẽ hiện ở mọi chỗ trong app. */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none ring-2 ring-white/90"
            style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.5)' }}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => zoomTo(view.zoom / 1.2)}
            className="p-1.5 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)]"
            aria-label={t('profile.avatarCrop.zoomOut')}
          >
            <MagnifyingGlassMinus className="w-5 h-5" />
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Number.isFinite(sliderPos) ? sliderPos : 0}
            onChange={(e) => {
              const p = Number(e.target.value) / 1000;
              zoomTo(Math.exp(Math.log(minZoom) + p * (Math.log(MAX_ZOOM) - Math.log(minZoom))));
            }}
            className="flex-1 accent-[var(--accent)]"
            aria-label={t('profile.avatarCrop.zoom')}
          />
          <button
            type="button"
            onClick={() => zoomTo(view.zoom * 1.2)}
            className="p-1.5 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)]"
            aria-label={t('profile.avatarCrop.zoomIn')}
          >
            <MagnifyingGlassPlus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, zoom: minZoom, x: 0, y: 0 }))}
            className="chip px-3 py-1.5 text-xs font-semibold"
          >
            <ArrowsIn weight="bold" className="w-3.5 h-3.5" />
            {t('profile.avatarCrop.fitWhole')}
          </button>
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, zoom: 1, x: 0, y: 0 }))}
            className="chip px-3 py-1.5 text-xs font-semibold"
          >
            <ArrowsOut weight="bold" className="w-3.5 h-3.5" />
            {t('profile.avatarCrop.fill')}
          </button>
          <button type="button" onClick={rotate} className="chip px-3 py-1.5 text-xs font-semibold">
            <ArrowClockwise weight="bold" className="w-3.5 h-3.5" />
            {t('profile.avatarCrop.rotate')}
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-full text-sm font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!img || busy}
            className="px-5 py-2 rounded-full btn-accent hover:brightness-105 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('profile.avatarCrop.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
