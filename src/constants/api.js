// ─────────────────────────────────────────────────────────────────────────────
// API base URL — nguồn chân lý DUY NHẤT cho địa chỉ backend
// ─────────────────────────────────────────────────────────────────────────────
// Trước đây mỗi nơi cần gọi backend tự viết lại:
//
//     import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'
//
// ở services/api.js, LoginPage, RegisterPage và SharePage. Giá trị dự phòng
// `localhost` đó đã từng lên thẳng production: `frontend/.env` bị .gitignore nên
// KHÔNG BAO GIỜ tới được Vercel, Vercel build mà thiếu biến thì cả bốn chỗ lặng
// lẽ rơi về localhost, và người dùng chỉ phát hiện ra khi bấm "Đăng nhập với
// Google" rồi nhận "Unable to connect to localhost:5000".
//
// Hai lớp phòng vệ thay cho giá trị dự phòng im lặng đó:
//
//   1. vite.config.js CHẶN BUILD nếu thiếu VITE_API_BASE_URL. Deploy hỏng ngay
//      trên Vercel còn hơn ship một bundle trỏ về máy lập trình viên.
//   2. File này chỉ dự phòng localhost khi CHẠY DEV. Ở bản build production mà
//      vẫn thiếu biến (tức lớp 1 đã bị vượt qua bằng cách nào đó) thì ném lỗi
//      với thông điệp rõ ràng, thay vì gọi vào hư không.
//
// LƯU Ý: biến VITE_* chỉ được nhúng LÚC BUILD. Đổi env trên Vercel mà không
// redeploy thì bundle cũ vẫn giữ nguyên giá trị cũ.
// ─────────────────────────────────────────────────────────────────────────────

/** Địa chỉ backend dùng cho máy dev khi `frontend/.env` chưa khai gì. */
const DEV_FALLBACK = 'http://localhost:5000/api/v1';

/**
 * `VITE_API_URL` là tên CŨ, giữ lại để bản deploy nào còn khai tên đó không chết
 * đột ngột. Code mới luôn dùng `VITE_API_BASE_URL`.
 */
const raw = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();

if (!raw && import.meta.env.PROD) {
  throw new Error(
    '[api] Thiếu VITE_API_BASE_URL trong bản build này. Khai biến đó ở Vercel ' +
      '(Settings > Environment Variables) rồi REDEPLOY — biến VITE_* chỉ được ' +
      'nhúng lúc build nên đổi env không thôi là chưa đủ.',
  );
}

/**
 * URL gốc của API, ĐÃ CẮT dấu `/` thừa ở cuối.
 *
 * Cắt vì mọi nơi dùng đều ghép kiểu `${API_BASE_URL}/auth/google`; để nguyên
 * `.../api/v1/` thì thành `//auth/google` — một số router coi đó là đường dẫn
 * khác và trả 404.
 */
export const API_BASE_URL = (raw || DEV_FALLBACK).replace(/\/+$/, '');
