// ─────────────────────────────────────────────────────────────────────────────
// Trang khởi động mặc định (Default Startup Page)
// ─────────────────────────────────────────────────────────────────────────────
// Khoá localStorage do SettingsModal.jsx GHI và AppRouter.jsx ĐỌC. Khai báo ở
// một chỗ duy nhất để 2 nơi không bao giờ lệch tên khoá — cùng cách làm với
// SHORTCUTS_ENABLED_KEY trong hooks/useGlobalShortcuts.js.
// Cài đặt này thuần client (localStorage), KHÔNG lưu DB.

export const STARTUP_PAGE_KEY = 'driveR_settings_startup_page';

/** Các giá trị hợp lệ — trùng đúng với <option> trong SettingsModal.jsx và với
 *  path con của route /app trong AppRouter.jsx */
export const STARTUP_PAGES = ['my-drive', 'home', 'recent'];

export const DEFAULT_STARTUP_PAGE = 'my-drive';

/**
 * Đọc lựa chọn đã lưu, trả về slug route tương ứng.
 *
 * Luôn trả về một giá trị hợp lệ: chưa từng lưu (null), giá trị lạ còn sót lại
 * từ bản cũ, hay localStorage bị trình duyệt chặn (chế độ riêng tư / cookie bị
 * khoá — getItem có thể ném lỗi) đều rơi về 'my-drive'. Hàm này chạy ngay trên
 * đường redirect vào app nên không được phép ném lỗi, nếu không app sẽ trắng.
 *
 * @returns {'my-drive'|'home'|'recent'}
 */
export function readStartupPage() {
  try {
    const saved = localStorage.getItem(STARTUP_PAGE_KEY);
    return STARTUP_PAGES.includes(saved) ? saved : DEFAULT_STARTUP_PAGE;
  } catch {
    return DEFAULT_STARTUP_PAGE;
  }
}
