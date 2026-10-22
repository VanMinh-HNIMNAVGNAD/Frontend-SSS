/**
 * Class dùng chung cho các màn xác thực: đăng nhập, đăng ký, quên mật khẩu, màn chặn
 * điều khoản.
 *
 * Trước đây các màn này tô cứng nền xanh navy (#0a0e17 / #111726) bất kể người dùng
 * chọn Sáng hay Tối, nên người dùng giao diện sáng đi từ một trang tối sang một app
 * sáng — còn ô CAPTCHA (theo `useTheme`) thì trắng lốp giữa một thẻ tối. Nay mọi màu
 * đi theo class `dark` trên <html> như phần còn lại của app, và bản tối dùng đúng
 * token `--app-*` của app thay vì một bảng màu riêng.
 *
 * Bản sáng cố ý có bóng đổ NHIỀU LỚP ở thẻ chính: trên nền gần trắng, một viền 1px
 * không đủ tách thẻ khỏi nền, mắt không biết đâu là chủ thể.
 *
 * Gom về một chỗ vì ba trang lặp nguyên văn từng chuỗi class — sửa màu ở một trang
 * mà quên hai trang kia là chuyện đã xảy ra (thẻ trang quên mật khẩu lệch hẳn tông).
 */

// Liquid glass (22/10/2026): thẻ là kính nổi có blur (`glass-strong`, index.css) trên nền ambient
// xám/trắng + vài khối sáng mềm của `AuthBackground` — viền sáng + bóng nhiều lớp của utility đó
// đã làm việc tách thẻ khỏi nền mà trước đây phải tự viết ở đây.
export const AUTH_CARD = 'w-full glass-strong rounded-[28px] p-6 sm:p-8 relative z-10';

export const AUTH_TITLE =
  'text-2xl font-bold text-center text-slate-900 dark:text-white tracking-tight mb-6';

export const AUTH_LABEL = 'text-sm text-slate-700 dark:text-slate-200 block mb-2 font-bold';

export const AUTH_INPUT_ICON =
  'w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none';

export const AUTH_INPUT =
  'w-full h-12 pl-12 pr-4 rounded-2xl text-base font-semibold text-slate-900 dark:text-white ' +
  'glass-input focus:bg-white/90 dark:focus:bg-white/10 ' +
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 outline-none transition ' +
  'placeholder-slate-400 dark:placeholder-slate-500';

/** Nút Google/GitHub. Dùng kèm `group` để icon và nhãn sáng lên khi rê chuột. */
export const AUTH_SOCIAL_BUTTON =
  'group flex-1 h-12 rounded-2xl glass-soft ' +
  'enabled:hover:bg-white/85 dark:enabled:hover:bg-white/[0.1] ' +
  'transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer ' +
  'disabled:opacity-45 disabled:cursor-not-allowed';

export const AUTH_SOCIAL_LABEL =
  'text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors duration-200';

export const AUTH_GITHUB_ICON =
  'w-6 h-6 text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors duration-200 fill-current';

export const AUTH_DIVIDER_LINE = 'w-full border-t border-glass-divider';

/**
 * Chữ giữa đường kẻ là một viên kính nhỏ. Trước đây nền của nó phải TRÙNG nền thẻ để khỏi thành
 * mảng vá — thẻ kính trong suốt thì không trùng được, nên làm hẳn thành một con chip có chủ đích.
 */
export const AUTH_DIVIDER_TEXT =
  'px-3 py-0.5 rounded-full bg-white/80 dark:bg-[#323236] ring-1 ring-black/[0.06] dark:ring-white/10 ' +
  'text-slate-500 dark:text-slate-400 font-bold tracking-wider';

export const AUTH_ERROR =
  'p-3 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-700 dark:text-red-300 text-center font-semibold';

export const AUTH_PRIMARY_BUTTON =
  'w-full h-12 rounded-2xl btn-accent hover:brightness-105 text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

/** Chữ phụ: gợi ý, câu "chưa có tài khoản?". */
export const AUTH_MUTED = 'text-slate-600 dark:text-slate-400';

export const AUTH_LINK = 'text-blue-600 dark:text-blue-400 hover:underline font-bold';

/** Dòng nhấn mạnh trong câu phụ, ví dụ địa chỉ email vừa nhận mã. */
export const AUTH_STRONG = 'font-bold text-slate-900 dark:text-white break-all';

export const AUTH_SUCCESS_BADGE =
  'w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/40 flex items-center justify-center animate-[otpPop_0.35s_ease-out]';

export const AUTH_SUCCESS_ICON = 'w-8 h-8 text-emerald-600 dark:text-emerald-400';

export const AUTH_SUCCESS_TEXT = 'text-base font-bold text-emerald-700 dark:text-emerald-300';
