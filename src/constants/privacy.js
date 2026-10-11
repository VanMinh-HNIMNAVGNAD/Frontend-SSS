// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình "Quyền riêng tư & Bảo mật" (tab trong SettingsModal.jsx)
// ─────────────────────────────────────────────────────────────────────────────
// HAI KHOÁ DƯỚI ĐÂY KHÔNG CÙNG HẠNG:
//
//   • PRIVACY_DISCOVERABLE_KEY — ĐÃ NỐI BACKEND. Nguồn sự thật là cột
//     `users.is_discoverable_by_email` (migration
//     backend/scripts/migrations/012-users-discoverable-by-email.sql), ghi qua
//     PATCH /api/v1/users/me (`UpdateProfileDto.isDiscoverableByEmail`) và được
//     THỰC THI ở FilesService.addShareAccess: người tắt cờ này thì luồng thêm
//     quyền theo email trả về đúng lỗi "không tìm thấy người dùng" như email
//     không tồn tại. localStorage chỉ còn là cache đọc-trước để modal không nháy
//     giá trị mặc định lúc vừa mở — KHÔNG phải nơi quyết định.
//
//   • PRIVACY_SHARE_ROLE_KEY — vẫn LƯU THUẦN CLIENT: bảng `users` chưa có cột
//     nào cho nó, mà `UpdateProfileDto` bật `forbidNonWhitelisted: true` nên
//     PATCH kèm trường chưa khai báo sẽ bị ValidationPipe chặn (400) chứ không
//     lặng lẽ bỏ qua. Khoá thật là `PRIVACY_SHARE_ROLE_KEY:<userId>` — mỗi tài
//     khoản một giá trị trên cùng trình duyệt (xem `bindShareRoleOwner`).
//
// TODO(backend): muốn đồng bộ nốt quyền chia sẻ mặc định thì làm ĐỦ 4 bước, theo
// đúng thứ tự đã dùng cho khoá trên:
//   1. Thêm cột vào `users` + file .sql trong backend/scripts/migrations/
//      (dự án chạy `synchronize: false` — xem ##8 trong .ai/task-ledger.md,
//      thiếu bước này là lặp lại đúng sự cố 500 DB_SCHEMA_MISMATCH; nhớ khai cả
//      @Column trong User entity).
//   2. Khai báo field tương ứng trong `UpdateProfileDto` (bắt buộc, vì
//      forbidNonWhitelisted sẽ chặn nếu không có).
//   3. Trả field này về trong response của GET /api/v1/users/me.
//   4. SettingsModal.jsx: đổi handler sang gọi API; giữ localStorage làm
//      cache đọc-trước để không nháy giá trị mặc định lúc modal vừa mở.
//
// BƯỚC NẠP TỪ SERVER: đã làm cho PRIVACY_DISCOVERABLE_KEY — AuthContext.jsx có
// một useEffect([user]) gọi writeDiscoverableByEmail() mỗi khi hồ sơ về (cả
// GET /auth/me lẫn login), nên máy mới / vừa xoá dữ liệu trình duyệt không còn vẽ
// công tắc theo mặc định BẬT trong khi DB đang là false. Vẫn CÒN THIẾU cho
// PRIVACY_SHARE_ROLE_KEY, và chỉ làm được sau khi khoá đó đi hết 4 bước trên (chưa
// có cột thì cũng chưa có gì để nạp về).
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
 * Người khác có tìm được mình qua email khi chia sẻ tệp hay không — đọc từ CACHE
 * localStorage, chỉ dùng để VẼ công tắc. Nơi quyết định thật là cột
 * `users.is_discoverable_by_email` mà backend đọc trong addShareAccess.
 *
 * Chưa từng lưu = BẬT, khớp với DEFAULT true của cột đó (migration 012). Chỉ khi
 * người dùng chủ động tắt mới ghi chuỗi 'false'.
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
 * Ghi CACHE hiển thị của công tắc "Hiển thị thông tin cá nhân".
 *
 * Hai bên gọi, cùng một ý nghĩa "giá trị vừa biết chắc từ server hoặc từ thao tác
 * của người dùng": AuthContext (nạp về từ hồ sơ) và SettingsModal (người dùng vừa
 * gạt công tắc). Có hàm này để không bên nào gõ lại tên khoá — lệch một ký tự là
 * ghi một nơi đọc một nẻo mà không ai báo lỗi.
 *
 * Ghi dạng CHUỖI 'true' / 'false' vì readDiscoverableByEmail() so sánh với chuỗi
 * 'false'; truyền thẳng boolean vào setItem thì trình duyệt tự ép kiểu và nhánh
 * TẮT vẫn đọc ra BẬT. Nuốt lỗi giống readDiscoverableByEmail(): localStorage có
 * thể ném khi trình duyệt chặn storage, mà đây chỉ là cache hiển thị — hỏng cache
 * thì lần sau vẽ theo mặc định, không được phép làm vỡ luồng đăng nhập.
 *
 * @param {boolean} value
 */
export function writeDiscoverableByEmail(value) {
  try {
    localStorage.setItem(PRIVACY_DISCOVERABLE_KEY, value ? 'true' : 'false');
  } catch {
    /* trình duyệt chặn storage — phiên này vẫn chạy đúng, chỉ là không nhớ được */
  }
}

// ── Quyền chia sẻ mặc định: lưu THEO TỪNG TÀI KHOẢN (##79) ─────────────────────
// Trước đây một khoá cho cả trình duyệt: A chọn "Được chỉnh sửa" rồi đăng xuất, B đăng nhập
// trên cùng máy thì hộp "Thêm người" của B mặc định cấp quyền SỬA — B mời ai cũng vô tình cho
// người đó sửa tệp của mình. Nay khoá mang id tài khoản; AuthContext gắn id qua
// `bindShareRoleOwner` mỗi khi hồ sơ về. Chưa gắn (chưa đăng nhập) ⇒ luôn 'VIEWER', không ghi.
let shareRoleOwnerId = null;
const shareRoleKey = () => (shareRoleOwnerId ? `${PRIVACY_SHARE_ROLE_KEY}:${shareRoleOwnerId}` : null);

/**
 * Gắn quyền mặc định vào tài khoản đang đăng nhập (`null` khi đăng xuất). Xoá luôn khoá
 * CŨ dùng chung cả trình duyệt: không biết nó là của ai, nên không được áp cho ai.
 *
 * @param {string|null|undefined} userId
 */
export function bindShareRoleOwner(userId) {
  shareRoleOwnerId = userId || null;
  try {
    localStorage.removeItem(PRIVACY_SHARE_ROLE_KEY);
  } catch {
    /* trình duyệt chặn storage — không có gì để dọn */
  }
}

/**
 * Quyền mặc định của ô vai trò trong hộp "Thêm người có quyền truy cập" (chia sẻ riêng).
 * Link công khai KHÔNG dùng giá trị này: backend không đọc `role` của link — link luôn
 * chỉ xem/tải.
 *
 * Luôn trả về một giá trị hợp lệ: chưa từng lưu, giá trị lạ còn sót lại từ bản
 * cũ, chưa đăng nhập, hay localStorage bị chặn đều rơi về 'VIEWER' — nhánh lỗi
 * phải nghiêng về quyền THẤP hơn, không bao giờ tự nâng lên 'EDITOR'.
 *
 * @returns {'VIEWER'|'EDITOR'}
 */
export function readDefaultShareRole() {
  const key = shareRoleKey();
  if (!key) return DEFAULT_SHARE_ROLE;
  try {
    const saved = localStorage.getItem(key);
    return SHARE_ROLES.includes(saved) ? saved : DEFAULT_SHARE_ROLE;
  } catch {
    return DEFAULT_SHARE_ROLE;
  }
}

/**
 * Ghi quyền mặc định cho tài khoản đang đăng nhập. Chưa đăng nhập thì không ghi gì.
 *
 * @param {'VIEWER'|'EDITOR'} role
 */
export function writeDefaultShareRole(role) {
  const key = shareRoleKey();
  if (!key || !SHARE_ROLES.includes(role)) return;
  try {
    localStorage.setItem(key, role);
  } catch {
    /* trình duyệt chặn storage — phiên này vẫn chạy đúng, chỉ là không nhớ được */
  }
}
