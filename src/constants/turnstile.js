// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Turnstile — cấu hình phía frontend
// ─────────────────────────────────────────────────────────────────────────────
// VAI TRÒ CỦA FRONTEND Ở ĐÂY LÀ *LẤY TOKEN*, KHÔNG PHẢI *XÁC MINH*.
//
// Luồng đúng (backend/docs/sercurity.md, mục 5 và mục 10.1):
//
//   Widget Turnstile  ──token──▶  form  ──body.captchaToken──▶  backend
//                                                                  │
//                                          verify với Cloudflare ◀──┘
//
// Có token trong tay KHÔNG có nghĩa là người dùng đã hợp lệ: token chỉ thành
// bằng chứng sau khi backend gọi siteverify bằng TURNSTILE_SECRET_KEY. Vì vậy
// mọi cờ `isVerified` ở frontend (xem hooks/useTurnstile.js) chỉ dùng để BẬT/TẮT
// nút bấm cho đỡ gửi request chắc chắn hỏng — không bao giờ được coi là lớp bảo
// vệ. Bot bỏ qua UI và gọi thẳng API là chuyện bình thường.
//
// Token dùng MỘT LẦN và hết hạn sau ~5 phút. Gửi lại đúng token cho request thứ
// hai sẽ bị Cloudflare trả `timeout-or-duplicate` → luôn reset widget sau khi
// submit (useTurnstile trả sẵn hàm reset()).
//
// KHOÁ: `VITE_TURNSTILE_SITE_KEY` là khoá CÔNG KHAI, nằm trong bundle là đúng
// thiết kế. Khoá bí mật `TURNSTILE_SECRET_KEY` chỉ được đọc ở backend — TUYỆT
// ĐỐI không thêm tiền tố VITE_ cho nó, vì mọi biến VITE_* đều được nhúng thẳng
// vào file JS mà trình duyệt tải về.
//
// Biến môi trường đọc từ `frontend/.env`. (Trước đây là `.env` ở gốc repo qua
// `envDir: '..'`; môi trường đã được tách nên bí mật của backend không còn nằm
// trong tầm nhìn của Vite.)

/** Khoá công khai của widget. Chuỗi rỗng = chưa cấu hình. */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

/**
 * Có bật CAPTCHA ở phiên bản build này hay không.
 *
 * Thiếu khoá thì widget KHÔNG render và các form vẫn submit được — chủ ý để máy
 * lập trình viên chưa có khoá vẫn chạy được app. Đây không phải lỗ hổng: backend
 * mới là nơi từ chối request thiếu `captchaToken`. Nhưng nó IM LẶNG, nên có
 * console.warn ở dưới để không ai vô tình build production thiếu khoá mà không
 * hay biết.
 */
export const IS_TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

if (!IS_TURNSTILE_ENABLED && import.meta.env.PROD) {
  console.warn(
    '[Turnstile] Thiếu VITE_TURNSTILE_SITE_KEY trong frontend/.env — CAPTCHA đã bị tắt ở bản build này.',
  );
}

/**
 * Tên field gửi lên backend. Đặt hằng số thay vì gõ chuỗi ở từng form: đây là
 * tên do backend quy định (`captchaToken`, xem docs/sercurity.md mục 10.1 và
 * 12.1), gõ sai một ký tự thì backend đọc ra undefined và trả 400 — không nơi
 * nào ở frontend báo lỗi giúp.
 */
export const CAPTCHA_TOKEN_FIELD = 'captchaToken';

/**
 * `action` gắn vào widget: chỉ là NHÃN THỐNG KÊ hiện trong dashboard Cloudflare
 * và trả về trong kết quả siteverify. Không ảnh hưởng độ khó của challenge.
 *
 * Danh sách bám theo các endpoint nhạy cảm mà tài liệu bảo mật liệt kê. Chỉ
 * dùng chữ thường, số, `_`, `-`; tối đa 32 ký tự — sai định dạng thì widget báo
 * lỗi 110420 chứ không lặng lẽ bỏ qua.
 */
export const TURNSTILE_ACTIONS = {
  REGISTER: 'send-register-otp',
  LOGIN: 'login',
  FORGOT_PASSWORD: 'forgot-password',
};

/**
 * Kích thước widget. 'flexible' co theo bề rộng ô chứa (tối thiểu 300px) nên
 * hợp với các form đăng nhập/đăng ký hẹp của driveR; 'normal' cố định 300x65.
 */
export const TURNSTILE_SIZE = 'flexible';

/**
 * Đổi mã lỗi của Turnstile thành câu tiếng Việt cho người dùng cuối.
 *
 * Chỉ so TIỀN TỐ nhóm chứ không liệt kê từng mã: Cloudflare thêm mã mới theo
 * thời gian, mà cả nhóm luôn cùng một cách xử lý về phía người dùng ("thử lại"
 * hay "báo quản trị"). Ngoài ra `error-callback` đôi khi được truyền một CÂU
 * TIẾNG ANH tự do (khi tham số render sai) thay vì mã số — nhánh cuối gom cả ca
 * đó, nên không được parse chuỗi này.
 *
 * Mã gốc luôn được ghép vào cuối câu để còn tra được khi người dùng chụp màn
 * hình gửi lên.
 *
 * Trả về KHOÁ DỊCH + tham số, không trả câu đã dựng: file này là module hằng số
 * ngoài React nên không gọi được `useLanguage()`. Bản cũ trả thẳng câu tiếng Việt
 * nên lỗi CAPTCHA luôn hiện tiếng Việt kể cả khi giao diện đã sang English.
 * `useTurnstile` (là hook, có `t`) dựng câu cuối cùng.
 *
 * @param {string|undefined} code Mã lỗi từ Turnstile
 * @returns {{ key: string, params: { suffix: string } }}
 */
export function describeTurnstileError(code) {
  const raw = code == null ? '' : String(code);
  // Mã gốc chỉ là dữ liệu, không cần dịch — nhưng phần bọc " (mã ...)" thì cần,
  // nên nó đi qua một khoá riêng và được nhúng vào câu chính qua {suffix}.
  const suffix = raw ? { key: 'turnstile.codeSuffix', code: raw } : null;
  const of = (key) => ({ key, params: { suffix } });

  // Cấu hình sai — người dùng bấm bao nhiêu lần cũng không qua được
  if (raw.startsWith('1101') || raw.startsWith('1102') || raw.startsWith('400')) {
    return of('turnstile.misconfigured');
  }
  if (raw.startsWith('11042') || raw.startsWith('11043') || raw.startsWith('105')) {
    return of('turnstile.badParams');
  }

  // Trình duyệt / môi trường của người dùng
  if (raw.startsWith('1105')) {
    return of('turnstile.badBrowser');
  }
  if (raw.startsWith('2001')) {
    return of('turnstile.clockSkew');
  }

  // Hết hạn / quá thời gian — thử lại là qua
  if (raw.startsWith('1106')) {
    return of('turnstile.timeout');
  }

  return of('turnstile.generic');
}

/** Khoá dịch cho lúc token hết hạn (widget tự làm mới, người dùng không cần làm gì) */
export const TURNSTILE_EXPIRED_KEY = 'turnstile.expired';

/**
 * Bao lâu (ms) mà widget vẫn chưa render xong thì coi như script Cloudflare
 * KHÔNG tải được và báo cho người dùng.
 *
 * Cần con số này vì trạng thái "chưa tải xong" và "tải hỏng vĩnh viễn" nhìn y
 * hệt nhau: cả hai đều là một ô trống 65px và một nút submit bị khoá. Không có
 * đồng hồ đếm, người bị tường lửa/adblock chặn challenges.cloudflare.com sẽ
 * ngồi nhìn nút xám suốt mà không một dòng chữ nào giải thích.
 *
 * 15 giây: rộng hơn nhiều so với thời gian tải thật (~1-3s kể cả mạng 3G) nên
 * không báo nhầm, mà vẫn ngắn hơn ngưỡng kiên nhẫn của người dùng.
 */
export const TURNSTILE_LOAD_TIMEOUT_MS = 15000;
