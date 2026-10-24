/**
 * Tên gói cước để HIỂN THỊ theo ngôn ngữ giao diện (##81).
 *
 * Tên gói là dữ liệu do quản trị đặt trong DB và luôn theo mẫu "Gói <tên Việt> (<tên Anh>)" —
 * `Gói Miễn Phí (Free)`, `Gói Cá Nhân (Pro)`… (xem migration 021/030, các migration ấy cũng
 * dò gói theo đúng phần trong ngoặc). Giao diện English hiện thẳng tên đó thì lại lẫn tiếng
 * Việt ở trang Thanh toán, khung AI, hồ sơ. Chọn English → lấy phần trong ngoặc; tên không theo
 * mẫu (gói quản trị tự đặt tên khác) giữ nguyên.
 *
 * Từ migration 042 gói đang bán chỉ còn tên tiếng Anh ("Pro Plus"…) nên đi thẳng qua nhánh giữ
 * nguyên ở cả hai ngôn ngữ; mẫu trên còn cần cho gói ngừng bán mang tên cũ trong lịch sử giao dịch.
 *
 * Backend làm đúng việc này khi chèn tên gói vào câu báo (`common/i18n/translate-message.ts`).
 */
const PLAN_NAME_PATTERN = /^Gói\s+.+\(([^()]+)\)\s*$/i;

export function displayPlanName(name, language) {
  if (typeof name !== 'string' || language !== 'en') return name;
  const match = PLAN_NAME_PATTERN.exec(name.trim());
  return match ? match[1].trim() : name;
}
