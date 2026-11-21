import { Crown, Sparkle, Star, Flower, Fire } from '@phosphor-icons/react';
import { isAvatarFrameId } from '../../constants/avatarFrames';

/**
 * Đồ trang trí đặt quanh viền trả phí. Toạ độ tính theo `em` của khung (1em = cỡ ảnh), nên
 * vương miện / cánh hoa phóng to thu nhỏ cùng ảnh. `cls` thêm nhịp lấp lánh / đung đưa
 * (`styles/avatar-frames.css`).
 */
const DECOR = {
  gold: [
    { Icon: Crown, size: 0.4, color: '#f59e0b', style: { top: '-0.2em', right: '-0.08em', transform: 'rotate(28deg)' }, cls: '' },
  ],
  galaxy: [
    { Icon: Star, size: 0.2, color: '#fde68a', style: { top: '-0.02em', left: '0.02em' }, cls: 'is-twinkle' },
    { Icon: Sparkle, size: 0.24, color: '#f0abfc', style: { bottom: '-0.03em', right: '-0.02em' }, cls: 'is-twinkle is-late' },
    { Icon: Star, size: 0.13, color: '#e9d5ff', style: { top: '0.1em', right: '-0.06em' }, cls: 'is-twinkle is-late' },
  ],
  sakura: [
    { Icon: Flower, size: 0.28, color: '#f472b6', style: { top: '-0.06em', left: '-0.04em' }, cls: 'is-sway' },
    { Icon: Flower, size: 0.2, color: '#f9a8d4', style: { bottom: '0em', right: '-0.03em' }, cls: 'is-sway' },
  ],
  flame: [
    { Icon: Fire, size: 0.32, color: '#f97316', style: { bottom: '-0.08em', right: '-0.04em' }, cls: 'is-sway' },
  ],
  diamond: [
    { Icon: Sparkle, size: 0.26, color: '#e0f2fe', style: { top: '-0.06em', right: '0.02em' }, cls: 'is-twinkle' },
    { Icon: Sparkle, size: 0.17, color: '#c4b5fd', style: { bottom: '0.02em', left: '-0.04em' }, cls: 'is-twinkle is-late' },
  ],
  aurora: [
    { Icon: Sparkle, size: 0.2, color: '#a5f3fc', style: { top: '-0.02em', right: '0.02em' }, cls: 'is-twinkle' },
  ],
};

/** Dưới cỡ này đồ trang trí chỉ còn là vài chấm nhoè — bỏ, giữ mỗi vòng viền. */
const DECOR_MIN_SIZE = 28;

/**
 * Ảnh đại diện + viền (21/11/2026). Không có ảnh thì hiện chữ cái đầu của `name`.
 *
 * @param {object} props
 * @param {string} [props.src]    URL ảnh
 * @param {string} [props.name]   tên / email — lấy chữ cái đầu khi không có ảnh
 * @param {string|null} [props.frame] id viền (`constants/avatarFrames.js`); null = không viền
 * @param {number} props.size     cỡ ảnh tính bằng px (viền nằm TRONG cỡ này)
 * @param {boolean} [props.still] tắt chuyển động (ví dụ lưới chọn viền có nhiều ô)
 * @param {string} [props.sizeClass] cỡ theo breakpoint bằng class `text-[..px]` thay cho `size`
 *   cố định (`size` khi đó chỉ còn dùng để quyết định có vẽ đồ trang trí hay không)
 */
export default function FramedAvatar({ src, name, frame, size, sizeClass = '', still = false, className = '', children }) {
  const id = isAvatarFrameId(frame) ? frame : null;
  const initial = (name || 'U').trim().charAt(0).toUpperCase() || 'U';
  const decor = id && size >= DECOR_MIN_SIZE ? DECOR[id] : null;

  return (
    <span
      className={`af ${still ? 'is-static' : ''} ${sizeClass} ${className}`}
      data-frame={id ?? undefined}
      style={sizeClass ? undefined : { fontSize: `${size}px` }}
    >
      {id && <span className="af__glow" aria-hidden="true" />}
      {id && <span className="af__ring" aria-hidden="true" />}
      <span className="af__photo">
        {src ? <img src={src} alt="" referrerPolicy="no-referrer" draggable={false} /> : initial}
        {children}
      </span>
      {decor?.map(({ Icon, size: s, color, style, cls }, i) => (
        <span key={i} className={`af__decor ${cls}`} style={style} aria-hidden="true">
          <Icon weight="fill" size={`${s}em`} color={color} />
        </span>
      ))}
    </span>
  );
}
