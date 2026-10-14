/**
 * Tình trạng bộ nhớ của một người, tính từ BYTE chứ không từ con số phần trăm của backend
 * (##87).
 *
 * Lỗi cũ: backend kẹp phần trăm ở 100 (`/files/analytics`, `/users/me`), và mọi chỗ hiển thị
 * chỉ có ngưỡng "≥ 90% → Gần đầy!". Người hết gói 100 GB, đang dùng 12 GB trên hạn mức Miễn
 * phí 2 GB (600%, KHÔNG tải lên được nữa) vẫn chỉ đọc "Gần đầy!" — như thể còn chỗ. Còn
 * `percentage` của phản hồi đăng nhập/refresh thì KHÔNG kẹp, nên hồ sơ có lúc hiện "(615%)"
 * và "-515% còn trống". Một hàm chung để thanh bên, trang Gói dịch vụ và hồ sơ cùng nói một
 * chuyện.
 *
 * `level`:
 *   'over'       — dùng NHIỀU HƠN hạn mức (thường là gói vừa hết hạn): không tải lên được.
 *   'full'       — dùng đúng bằng hạn mức: không tải lên được.
 *   'almostFull' — từ 90%.
 *   'warning'    — từ 70%.
 *   'ok'         — còn lại.
 *
 * @param {number|string} usedBytes
 * @param {number|string} limitBytes  0/thiếu = chưa biết hạn mức (đang tải) ⇒ luôn 'ok'.
 */
export function getStorageStatus(usedBytes, limitBytes) {
  const used = Math.max(0, Number(usedBytes) || 0);
  const limit = Math.max(0, Number(limitBytes) || 0);

  if (limit <= 0) {
    return { level: 'ok', percent: 0, barPercent: 0, overBytes: 0, freeBytes: 0, isFull: false };
  }

  const ratio = used / limit;
  // Làm tròn XUỐNG dưới 100%: 99,6% mà hiện "100%" cạnh chữ "Gần đầy" là hai thông tin cãi
  // nhau. Từ 100% trở lên làm tròn bình thường — "615%" là con số thật, giấu nó đi chính là
  // cái lỗi đang sửa.
  const percent = ratio < 1 ? Math.min(99, Math.floor(ratio * 100)) : Math.round(ratio * 100);
  const level =
    used > limit ? 'over' : used === limit ? 'full' : ratio >= 0.9 ? 'almostFull' : ratio >= 0.7 ? 'warning' : 'ok';

  return {
    level,
    percent,
    barPercent: Math.min(100, ratio * 100),
    overBytes: Math.max(0, used - limit),
    freeBytes: Math.max(0, limit - used),
    isFull: level === 'over' || level === 'full',
  };
}
