// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình "Quyền riêng tư & Bảo mật" (tab trong SettingsModal.jsx)
// ─────────────────────────────────────────────────────────────────────────────
// GIAI ĐOẠN TẠM THỜI — LƯU THUẦN CLIENT:
// Hai cấu hình dưới đây hiện CHỈ nằm trong localStorage của trình duyệt, KHÔNG
// gọi API và KHÔNG lưu DB. Lý do (tính đến 25/08/2026):
//   • Bảng `users` chưa có cột nào để lưu hai giá trị này.
//   • `UpdateProfileDto` bật `forbidNonWhitelisted: true`, nên PATCH
//     /api/v1/users/me kèm trường lạ sẽ bị chặn ở tầng ValidationPipe (400),
//     chứ không phải lặng lẽ bỏ qua.
//
// TODO(backend): khi Schema được mở rộng, làm ĐỦ 4 bước rồi mới nối API:
//   1. Thêm cột vào `users` + file .sql trong backend/scripts/migrations/
//      (dự án chạy `synchronize: false` — xem ##8 trong .ai/task-ledger.md,
//      thiếu bước này là lặp lại đúng sự cố 500 DB_SCHEMA_MISMATCH).
//   2. Khai báo field tương ứng trong `UpdateProfileDto` (bắt buộc, vì
//      forbidNonWhitelisted sẽ chặn nếu không có).
//   3. Trả hai field này về trong response của GET /api/v1/users/me.
//   4. SettingsModal.jsx: đổi handler sang gọi API; giữ localStorage làm
//      cache đọc-trước để không nháy giá trị mặc định lúc modal vừa mở.
//
// Đặt tên khoá ở ĐÂY chứ không gõ chuỗi trực tiếp trong component: bên GHI
// (SettingsModal) và bên ĐỌC (luồng chia sẻ, sau này là luồng đồng bộ hồ sơ)
// cùng import một hằng số, lệch một ký tự là ghi một nơi đọc một nẻo mà không
// ai báo lỗi. Cùng quy ước với STARTUP_PAGE_KEY (constants/routes.js) và
// SHORTCUTS_ENABLED_KEY (hooks/useGlobalShortcuts.js).

export const PRIVACY_DISCOVERABLE_KEY = 'driveR_settings_privacy_discoverable';
export const PRIVACY_SHARE_ROLE_KEY = 'driveR_settings_privacy_share_role';

/** Quyền hợp lệ — trùng đúng với <option> trong SettingsModal.jsx và với giá
 *  trị `role` mà sharingApi.addShareAccess() gửi lên backend */
export const SHARE_ROLES = ['VIEWER', 'EDITOR'];

/** Mặc định an toàn: link tạo nhanh chỉ cho XEM, không cho sửa */
export const DEFAULT_SHARE_ROLE = 'VIEWER';

/**
 * Người khác có tìm được mình qua email khi chia sẻ tệp hay không.
 *
 * Chưa từng lưu = BẬT (đúng hành vi hiện tại của app: mọi người vẫn tìm được
 * nhau qua email). Chỉ khi người dùng chủ động tắt mới ghi chuỗi 'false'.
 * Bọc try/catch vì localStorage có thể ném lỗi khi trình duyệt chặn storage
 * (chế độ ẩn danh, iframe, cookie bị khoá).
 *
 * @returns {boolean}
 */
export function readDiscoverableByEmail() {
  try {
    return localStorage.getItem(PRIVACY_DISCOVERABLE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Quyền mặc định gán cho người được chia sẻ khi tạo link nhanh.
 *
 * Luôn trả về một giá trị hợp lệ: chưa từng lưu, giá trị lạ còn sót lại từ bản
 * cũ, hay localStorage bị chặn đều rơi về 'VIEWER' — nhánh lỗi phải nghiêng về
 * quyền THẤP hơn, không bao giờ tự nâng lên 'EDITOR'.
 *
 * @returns {'VIEWER'|'EDITOR'}
 */
export function readDefaultShareRole() {
  try {
    const saved = localStorage.getItem(PRIVACY_SHARE_ROLE_KEY);
    return SHARE_ROLES.includes(saved) ? saved : DEFAULT_SHARE_ROLE;
  } catch {
    return DEFAULT_SHARE_ROLE;
  }
}
