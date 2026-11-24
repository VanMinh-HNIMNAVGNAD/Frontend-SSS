/**
 * Viền ảnh đại diện (21/11/2026). Id phải khớp `backend/src/users/avatar-frames.ts` — backend chỉ
 * nhận id có trong danh sách và chặn viền `paid` với người chưa có gói trả phí.
 * Hình vẽ của từng viền nằm ở `styles/avatar-frames.css` (`.af[data-frame='<id>']`), đồ trang trí
 * (vương miện, cánh hoa…) ở `components/ui/FramedAvatar.jsx`. Tên hiển thị: `avatarFrame.name.<id>`.
 */
export const FREE_AVATAR_FRAMES = [
  'classic',
  'ocean',
  'mint',
  'sunset',
  'lavender',
  'rose',
  'citrus',
  'mono',
  'dashed',
  'twin',
  'forest',
  'candy',
  'dots',
  'pulse',
  'spinner',
];

export const PAID_AVATAR_FRAMES = [
  'aurora',
  'neon',
  'gold',
  'galaxy',
  'sakura',
  'flame',
  'diamond',
  'rainbow',
  'comet',
  'frost',
  'thunder',
  'heart',
  'cyber',
  'sun',
  'moon',
  'butterfly',
];

const PAID = new Set(PAID_AVATAR_FRAMES);
const ALL = new Set([...FREE_AVATAR_FRAMES, ...PAID_AVATAR_FRAMES]);

export const isAvatarFrameId = (id) => typeof id === 'string' && ALL.has(id);
export const isPaidAvatarFrame = (id) => typeof id === 'string' && PAID.has(id);

/**
 * Gói đang chạy (`GET /billing/subscription`) có phải gói trả phí không — chỉ để vẽ khoá trên lưới
 * chọn viền; backend mới là chốt chặn thật (`UsersService.updateAvatarFrame`).
 */
export function isPaidSubscription(sub) {
  if (!sub || typeof sub !== 'object' || !sub.planName) return false;
  if (sub.endDate && new Date(sub.endDate).getTime() <= Date.now()) return false;
  return !/(^|\W)(free|mi[eễ]n ph[ií])(\W|$)/i.test(sub.planName);
}
