import axios from 'axios';

import { API_BASE_URL } from '../constants/api';
import { decodeJwt, subjectOf } from '../utils/jwt';
import {
  plansCache,
  previewUrlCache,
  fileTextCache,
  sessionsCache,
  aiStatusCache,
  activityLogsCache,
  fileVersionsCache,
  shareAccessCache,
  sharedDrivesCache,
  largestFilesCache,
  invalidateAfterFileMutation,
} from '../utils/ttlCache';
import { recordRequestStart, recordRequestEnd } from '../utils/requestMetrics';
import { createBatchLoader } from '../utils/batchLoader';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ───────────────── Thanh tiến trình toàn cục (thao tác chậm mà im lặng) ─────────────────
//
// Vì sao đếm ở TẦNG API chứ không thêm cờ loading cho từng nút: các thao tác bị
// người dùng phàn nàn là "bấm rồi không biết web có chạy hay không" (đánh dấu sao,
// sao chép liên kết, xoá, dán, chia sẻ...) nằm rải ở hàng chục component, và mỗi
// lượt gọi Heroku (US) → Supabase (ap-southeast-1) tốn ~1s. Đếm request đang bay ở
// một chỗ thì MỌI thao tác đi qua axios đều có tín hiệu, kể cả thao tác thêm sau này.
//
// Không lẫn với `UploadProgress`: tải tệp lên đã có bảng tiến trình riêng theo phần
// trăm, kéo dài hàng phút — để nó cắm thanh này ở đỉnh trang suốt thời gian đó là
// biến chỉ báo "đang xử lý" thành đồ trang trí luôn bật.
let inFlightCount = 0;
const busyListeners = new Set();

function notifyBusy() {
  for (const listener of busyListeners) listener(inFlightCount);
}

/** Đăng ký nhận số request đang bay. Trả về hàm huỷ đăng ký. */
export function subscribeApiBusy(listener) {
  busyListeners.add(listener);
  listener(inFlightCount);
  return () => busyListeners.delete(listener);
}

/**
 * Các đường KHÔNG được kéo thanh tiến trình toàn cục.
 *
 * Hai lý do khác nhau, cùng một hệ quả nếu bỏ sót:
 *
 * 1/ ĐÃ CÓ CHỈ BÁO RIÊNG — luồng upload có bảng phần trăm, cửa sổ xem trước có
 *    spinner của chính nó, khung AI có dấu "đang nghĩ". Đếm thêm ở đây là vẽ hai
 *    chỉ báo cho cùng một việc.
 *
 * 2/ CỐ Ý IM LẶNG — thumbnail và lượt đồng bộ nền sau khi upload xong không phải
 *    thao tác người dùng chờ đợi. Đây chính là thứ làm thanh "load liên tục" khi
 *    tải một thư mục: mỗi tệp xong được chèn một card, card gọi `preview-url` để
 *    dựng thumbnail, và 40 tệp thành 40 lần bật/tắt thanh. Bản thân các đường
 *    upload thì đã bị loại từ trước, nên thủ phạm không nằm ở luồng upload.
 *
 * Chấp nhận cả chuỗi (so bằng `includes`) và RegExp — `/files/:id/content` có id
 * ở giữa nên không viết được thành một chuỗi con cố định.
 */
const NO_PROGRESS_BAR_PATHS = [
  '/files/upload-proxy',
  '/files/upload-chunk/',
  '/files/upload-url',
  '/files/confirm-upload',
  // Thống kê dung lượng: chạy nền sau mỗi thao tác ghi, thanh quota tự có skeleton.
  '/files/analytics',
  // URL xem trước — dùng cho THUMBNAIL (im lặng) và cửa sổ xem trước (đã có spinner
  // riêng, xem `loading` trong FilePreviewModal). Khớp cả `/shares/:token/preview-url`.
  '/preview-url',
  // Nội dung văn bản cho thumbnail text/code, cùng lý do như trên.
  /\/files\/[^/]+\/content$/,
  // Khung AI: `ask` là request hàng chục giây, giữ thanh ở 92% suốt thời gian đó
  // biến chỉ báo "đang xử lý" thành đèn báo luôn sáng.
  '/ai/status',
  '/ai/ask',
];

function tracksProgress(config) {
  if (config?.meta?.noProgressBar) return false;
  const url = config?.url || '';
  return !NO_PROGRESS_BAR_PATHS.some((p) =>
    typeof p === 'string' ? url.includes(p) : p.test(url),
  );
}

/**
 * Giảm bộ đếm ĐÚNG MỘT LẦN cho mỗi lượt tăng.
 * `__progressTracked` là cần thiết vì một request 401 được phát lại (`api(original)`)
 * sẽ đi qua request interceptor lần nữa: không có cờ này thì lượt phát lại làm bộ đếm
 * lệch và thanh tiến trình mắc cạn ở trạng thái "đang chạy" mãi.
 */
function releaseProgress(config) {
  if (!config?.__progressTracked) return;
  config.__progressTracked = false;
  inFlightCount = Math.max(0, inFlightCount - 1);
  notifyBusy();
}

// Request Interceptor: Inject JWT Bearer Token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tracksProgress(config)) {
      config.__progressTracked = true;
      inFlightCount += 1;
      notifyBusy();
    }
    // Đo TẤT CẢ request, kể cả những đường không kéo thanh tiến trình — chính
    // những đường im lặng đó (thumbnail, đồng bộ nền) mới là chỗ cần đếm.
    config.__metricsMark = recordRequestStart(config);
    return config;
  },
  (error) => Promise.reject(error),
);

// ─────────────────────── Làm mới access token (lỗi #10) ───────────────────────
//
// Access token sống 15 phút (JWT_EXPIRATION ở backend/src/config/configuration.ts).
// Trước đây interceptor gặp 401 là xoá token rồi `location.href = '/login'` NGAY —
// tức cứ 15 phút dùng app là bị đá ra một lần, dù backend đã có sẵn refresh token
// 7 ngày trong cookie HttpOnly và endpoint POST /auth/refresh. Frontend chưa từng
// gọi endpoint đó (grep 'auth/refresh' toàn src/ ra 0 kết quả).
//
// Nay: 401 → thử refresh MỘT lần → phát lại đúng request vừa lỗi. Chỉ khi refresh
// cũng thất bại (refresh token hết hạn / phiên bị thu hồi) thì mới đăng xuất.

/**
 * Đường dẫn mà 401 KHÔNG có nghĩa là "token hết hạn":
 *   • /auth/refresh — chính nó 401 thì refresh đã chết, thử lại là vòng lặp vô tận.
 *   • login / OTP / quên mật khẩu — 401 ở đây là sai mật khẩu hoặc sai mã, người
 *     dùng cần thấy thông báo lỗi chứ không phải bị điều hướng.
 *   • /shares/ — khách vãng lai xem link chia sẻ, chưa từng có phiên nào để làm mới.
 */
/**
 * Mã lỗi backend cho tài khoản bị khoá (`ErrorCode.AUTH_ACCOUNT_LOCKED`).
 * Đối chiếu bằng MÃ chứ không bằng câu tiếng Việt: câu chữ còn đổi, và bản tiếng Anh
 * sẽ không khớp `includes('khóa')` nữa.
 */
const ACCOUNT_LOCKED_CODE = 'AUTH_2005_ACCOUNT_LOCKED';

/** Tài khoản bị khoá có phải là lý do của lỗi này không? */
function isAccountLocked(errorLike) {
  return errorLike?.response?.data?.errorCode === ACCOUNT_LOCKED_CODE;
}

const NO_REFRESH_PATHS = [
  '/auth/refresh',
  '/auth/login',
  // 401 ở đây nghĩa là mã đổi phiên đã hết hạn / đã dùng — CHƯA từng có phiên nào để làm
  // mới. Không loại trừ thì nó kéo theo một lượt refresh (cũng 401) rồi `forceLogout`, tức
  // một lỗi đăng nhập biến thành một cú đá-ra-ngoài kèm câu thông báo sai.
  '/auth/oauth/exchange',
  '/auth/verify-login-otp',
  '/auth/send-register-otp',
  '/auth/verify-register-otp',
  '/auth/forgot-password',
  '/auth/verify-reset-otp',
  '/auth/reset-password',
  '/shares/',
];

/**
 * Promise của lượt refresh ĐANG chạy, hoặc null.
 *
 * Cần một biến chung vì màn hình nào cũng phát nhiều request song song: mở trang
 * là `/files` + `/files/analytics` + `/auth/me` cùng bay đi. Token hết hạn thì cả
 * ba nhận 401 gần như cùng lúc; không có chốt này thì có ba lượt POST /auth/refresh
 * chạy chồng nhau, và nếu sau này bật rotation ở backend thì hai lượt sau sẽ dùng
 * refresh token đã bị thay → phiên bị đăng xuất oan.
 */
let refreshPromise = null;

/**
 * Gọi /auth/refresh bằng axios GỐC để không đi qua interceptor này lần nữa.
 *
 * CHỐT CHẶN ĐỔI CHỦ: danh tính của lượt refresh do COOKIE quyết định, không phải
 * do access token vừa hết hạn. Trình duyệt chỉ giữ MỘT cookie `refreshToken` cho
 * cả origin, nên nếu cookie đang là của tài khoản khác (đăng nhập tài khoản khác
 * ở tab/lần trước, cookie cũ chưa bị xoá vì đăng xuất chỉ xoá localStorage) thì
 * backend trả về access token HỢP LỆ của NGƯỜI KHÁC. Ghi thẳng token đó vào
 * localStorage nghĩa là người dùng đột nhiên đang đăng nhập bằng tài khoản lạ mà
 * không hề bấm gì — đúng triệu chứng "mở hồ sơ thì tên đổi sang người khác".
 *
 * Nên: so `sub` của token cũ với token mới, khác nhau thì VỨT token mới và đăng
 * xuất sạch, không bao giờ âm thầm đổi phiên.
 */
/**
 * Lỗi của một lượt refresh, kèm câu trả lời cho đúng một câu hỏi: **có nên đăng xuất
 * người dùng không?**
 *
 * Phân biệt này là phần còn thiếu của lỗi #10. Trước đây MỌI lỗi refresh đều dẫn tới
 * `forceLogout()`, kể cả khi nguyên nhân chỉ là mất Wi-Fi một giây, dyno Heroku free
 * đang ngủ dậy (lượt gọi đầu tiên hay timeout), hay backend trả 502. Người dùng đang
 * làm việc bị ném về `/login` bằng một lần `location.href` — mất sạch việc đang dở, và
 * đúng như phàn nàn "đang dùng web mà tự nhiên bị dis ra ngoài".
 *
 * Chỉ 401/403 từ chính `/auth/refresh` mới là bằng chứng phiên đã chết (hết hạn do
 * không dùng, bị thu hồi từ thiết bị khác, hoặc cookie bị trình duyệt chặn). Mọi thứ
 * khác là sự cố tạm thời: giữ nguyên phiên, để lượt sau thử lại.
 */
class RefreshFailure extends Error {
  constructor(message, { isAuthFailure, isLocked = false }) {
    super(message);
    this.name = 'RefreshFailure';
    this.isAuthFailure = isAuthFailure;
    // Phiên chết vì tài khoản bị KHOÁ, không phải vì hết hạn. Đăng xuất trong cả hai
    // trường hợp, nhưng chỉ trường hợp này mới có gì để nói với người dùng.
    this.isLocked = isLocked;
  }
}

function refreshAccessToken() {
  if (!refreshPromise) {
    const previousSubject = subjectOf(localStorage.getItem('accessToken'));
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
      // Backend bọc response ({ statusCode, data }) nên phải bóc hai lớp.
      .then((res) => {
        const token = res.data?.data?.accessToken ?? res.data?.accessToken;
        if (!token) {
          // Backend trả 2xx mà không có token là hỏng hợp đồng API, không phải phiên
          // chết — đăng xuất ở đây chỉ che mất một lỗi cần được sửa.
          throw new RefreshFailure('Refresh không trả về accessToken', {
            isAuthFailure: false,
          });
        }

        const nextSubject = subjectOf(token);
        // Chỉ chặn khi ĐỌC ĐƯỢC cả hai và chúng KHÁC nhau: không đọc được thì coi
        // như không có gì để đối chiếu, chặn ở đó chỉ đăng xuất oan.
        if (previousSubject && nextSubject && previousSubject !== nextSubject) {
          console.error('[API] /auth/refresh trả token của tài khoản khác — huỷ phiên.');
          // Đây thì PHẢI đăng xuất: giữ lại một phiên không rõ của ai còn tệ hơn.
          throw new RefreshFailure('Phiên đăng nhập không khớp tài khoản', {
            isAuthFailure: true,
          });
        }

        localStorage.setItem('accessToken', token);
        return token;
      })
      .catch((err) => {
        if (err instanceof RefreshFailure) throw err;

        const status = err?.response?.status;
        const isAuthFailure = status === 401 || status === 403;
        if (!isAuthFailure) {
          // Ghi log để lần sau lỗi #10 tái diễn thì biết ngay là mạng hay là phiên.
          console.warn(
            `[API] /auth/refresh thất bại tạm thời (${status ?? 'không có phản hồi'}) — GIỮ phiên, sẽ thử lại.`,
          );
        }
        throw new RefreshFailure(err?.message || 'Làm mới phiên thất bại', {
          isAuthFailure,
          isLocked: isAccountLocked(err),
        });
      })
      .finally(() => {
        // Trả về null NGAY khi xong (kể cả lỗi) để lần 401 sau còn thử lại được
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Xoá phiên cục bộ + đưa về /login, trừ các trang không cần đăng nhập.
 *
 * `reason` đi kèm dưới dạng `?error=` để `LoginPage` nói được VÌ SAO người dùng vừa bị
 * đá ra. Không có nó thì tài khoản bị khoá chỉ thấy màn đăng nhập trắng trơn, thử lại,
 * lại bị đá ra — vòng lặp đó là phàn nàn đã dẫn tới thay đổi này.
 */
function forceLogout(reason) {
  localStorage.removeItem('accessToken');
  const path = window.location.pathname;
  // Khách vãng lai trên trang chia sẻ KHÔNG bao giờ bị redirect về /login
  const isPublicSharePage = path.startsWith('/share');
  if (!isPublicSharePage && path !== '/login' && path !== '/register' && path !== '/') {
    window.location.href = reason ? `/login?error=${reason}` : '/login';
  }
}

// ───────────── Làm mới CHỦ ĐỘNG trước khi token hết hạn (lỗi #10) ─────────────
//
// Cơ chế 401-rồi-refresh-rồi-phát-lại ở dưới là lưới an toàn, không phải giải pháp:
// nó sửa được hậu quả nhưng vẫn để người dùng nếm mùi. Cứ 15 phút, request đầu tiên
// sau khi token hết hạn phải đi hai lượt mạng (401 → refresh → phát lại) qua dyno
// Heroku ở Mỹ; và nếu ĐÚNG lúc đó mạng chớp một nhịp thì lượt refresh thất bại.
//
// Làm mới trước khi hết hạn thì người đang dùng web không bao giờ gặp một cái 401 nào.
//
// Vì sao là interval 60 giây chứ không phải một setTimeout hẹn đúng mốc `exp`:
// setTimeout không chạy khi máy ngủ (đóng nắp laptop, điện thoại tắt màn hình) — mở lại
// là timer bắn muộn hàng giờ, sau khi token đã chết từ lâu. Interval + đối chiếu `exp`
// thật thì lần tích tắc đầu tiên sau khi máy thức đã tự nhận ra và làm mới.
const KEEPER_TICK_MS = 60 * 1000;
// Làm mới khi token còn dưới 2 phút: đủ rộng để một lần refresh chậm (dyno ngủ dậy có
// thể mất hơn 10 giây) vẫn xong trước khi token thật sự hết hạn.
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000;

/** Token trong localStorage có sắp hết hạn (hoặc đã hết) không? */
function accessTokenNeedsRefresh() {
  const token = localStorage.getItem('accessToken');
  if (!token) return false; // chưa đăng nhập — không có gì để làm mới

  const exp = decodeJwt(token)?.exp;
  // Không đọc được `exp` thì KHÔNG tự ý refresh: token có thể do một backend khác phát
  // ra theo định dạng khác, và refresh mù mỗi 60 giây là tự spam chính mình.
  if (!exp) return false;

  return exp * 1000 - Date.now() <= REFRESH_BEFORE_EXPIRY_MS;
}

function refreshIfNeeded() {
  if (!accessTokenNeedsRefresh()) return;
  // Lỗi đã được `refreshAccessToken` log và xử lý (giữ hay huỷ phiên); ở đây chỉ cần
  // không để một promise bị reject nổi lên thành "unhandled rejection".
  refreshAccessToken().catch(() => {});
}

/**
 * Bật cơ chế giữ phiên. Trả về hàm tắt.
 *
 * Ba nguồn kích hoạt, mỗi nguồn bắt một tình huống khác nhau:
 *   • interval — người dùng ngồi làm việc liên tục;
 *   • `visibilitychange` — quay lại tab bỏ đó vài giờ (kiểm NGAY, không đợi hết một
 *     nhịp 60 giây, vì cú bấm đầu tiên của người dùng thường tới trước nhịp đó);
 *   • `online` — vừa có mạng lại sau khi mất kết nối.
 */
export function startSessionKeeper() {
  const timer = setInterval(refreshIfNeeded, KEEPER_TICK_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') refreshIfNeeded();
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', refreshIfNeeded);
  refreshIfNeeded();

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', refreshIfNeeded);
  };
}

// Response Interceptor: Handle 401 Unauthorized token expiration
api.interceptors.response.use(
  (response) => {
    releaseProgress(response.config);
    recordRequestEnd(response.config?.__metricsMark);
    // Standardize backend wrapped response ({ statusCode, data, message })
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const original = error.config;
    releaseProgress(original);
    recordRequestEnd(original?.__metricsMark, { failed: true });
    const url = original?.url || '';
    const canRefresh =
      error.response?.status === 401 &&
      original &&
      // `_retried`: mỗi request chỉ được phát lại ĐÚNG một lần. Nếu lần phát lại
      // (đã mang token mới) vẫn 401 thì vấn đề không phải hết hạn token.
      !original._retried &&
      !NO_REFRESH_PATHS.some((p) => url.includes(p));

    if (canRefresh) {
      try {
        await refreshAccessToken();
        original._retried = true;
        // Header Authorization cũ mang token đã hết hạn; xoá đi để request
        // interceptor gắn lại token mới vừa lưu.
        if (original.headers) delete original.headers.Authorization;
        return api(original);
      } catch (refreshError) {
        // Phiên chết thật (hết hạn do không dùng / bị thu hồi / cookie bị chặn) thì mới
        // đăng xuất. Lỗi mạng hay 5xx thì giữ phiên và để request này báo lỗi như một
        // lỗi bình thường — người dùng thử lại là xong, không mất việc đang làm.
        if (refreshError?.isAuthFailure) {
          forceLogout(refreshError.isLocked ? 'account_locked' : undefined);
        }
      }
    } else if (error.response?.status === 401) {
      forceLogout(isAccountLocked(error) ? 'account_locked' : undefined);
    }

    // Với `responseType: 'blob'` (vd. filesApi.downloadZip) axios trả body lỗi
    // dưới dạng Blob, nên `data.message` luôn undefined và toast rơi về đúng câu
    // "Request failed with status code 500". Đọc blob ra JSON để lấy lại message.
    let data = error.response?.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = undefined;
      }
    }

    // Backend (AllExceptionsFilter) luôn trả `message` là câu tiếng Việt;
    // `details` có thể là mảng lỗi validate nên dùng làm phương án dự phòng.
    const raw =
      data?.message ||
      (Array.isArray(data?.details) ? data.details : null) ||
      error.message ||
      'Đã có lỗi xảy ra';
    const message = Array.isArray(raw)
      ? raw
          .map((item) => (typeof item === 'string' ? item : (item?.errors || []).join(' ')))
          .filter(Boolean)
          .join(' ')
      : String(raw);

    console.error('[API Error]', error.response?.status, error.config?.url, message);

    // Giữ lại metadata của backend cho caller cần phân biệt loại lỗi
    const normalizedError = new Error(message);
    normalizedError.status = error.response?.status;
    normalizedError.errorCode = data?.errorCode;
    normalizedError.details = data?.details;
    // Giữ lại `code` của axios và dấu "request này đi tới backend CỦA MÌNH".
    //
    // Không giữ thì mọi lỗi ra khỏi đây đều là một `Error` trơn, và mất đúng hai
    // thông tin không thể suy lại được ở nơi gọi:
    //   • "mạng máy người dùng vừa đứt" (`ERR_NETWORK`, không có phản hồi nào) khác
    //     hẳn "server đã trả lời và từ chối" — hai thứ cần hai cách xử lý ngược nhau,
    //     xem `isBackendUnreachable` bên dưới;
    //   • lượt bị huỷ. Các chỗ kiểm `err.name === 'CanceledError'` trước đây KHÔNG
    //     bao giờ đúng với lỗi đi qua interceptor này, vì `new Error()` đặt lại
    //     `name` thành 'Error'.
    normalizedError.code = error.code;
    normalizedError.apiRequest = true;
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      normalizedError.name = 'CanceledError';
    }
    return Promise.reject(normalizedError);
  },
);

// Auth APIs
export const authApi = {
  // Đăng ký hai bước: bước 1 gửi CẢ thông tin tài khoản + captchaToken (dữ liệu được cất
  // tạm trong Redis 10 phút); bước 2 chỉ cần { email, otp }.
  // `POST /auth/register` cũ KHÔNG CÒN — nó là đường tạo tài khoản không cần xác minh email.
  sendRegisterOtp: (data) => api.post('/auth/send-register-otp', data),
  verifyRegisterOtp: (data) => api.post('/auth/verify-register-otp', data),

  // Đăng nhập hai bước: /auth/login KHÔNG còn trả accessToken mà trả { requiresOtp: true };
  // phiên chỉ ra đời ở /auth/verify-login-otp.
  login: (data) => api.post('/auth/login', data),
  verifyLoginOtp: (data) => api.post('/auth/verify-login-otp', data),

  // Bước cuối của đăng nhập OAuth: đổi mã dùng một lần (backend đưa về trên URL dưới dạng
  // `?oauth_code=`) lấy accessToken + cookie refresh.
  //
  // PHẢI là XHR từ chính frontend, và đó là toàn bộ lý do bước này tồn tại. Trước đây
  // backend đặt cookie refresh ngay trong callback OAuth — nhưng callback đó là một lượt
  // điều hướng top-level tới `*.herokuapp.com`, nên trình duyệt xếp cookie vào phân vùng
  // của herokuapp.com (CHIPS của Chrome, Tổng bảo vệ cookie của Firefox). Mọi lượt
  // `POST /auth/refresh` sau đó là XHR từ `drwkmxjennie.fun` nên mang phân vùng khác và
  // KHÔNG BAO GIỜ thấy cookie đó: người đăng nhập OAuth sống đúng một hạn access token
  // rồi bị đá ra. Gọi từ đây thì cookie được đặt trong đúng phân vùng sẽ dùng nó.
  //
  // `withCredentials` đã bật ở `axios.create` phía trên — thiếu nó thì trình duyệt nhận
  // `Set-Cookie` rồi bỏ đi, và triệu chứng giống hệt lỗi vừa sửa.
  exchangeOAuthCode: (code) => api.post('/auth/oauth/exchange', { code }),

  // Quên mật khẩu ba bước: xin mã → đổi mã lấy resetToken → đổi token lấy mật khẩu mới.
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  verifyResetOtp: (data) => api.post('/auth/verify-reset-otp', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  getProfile: () => api.get('/auth/me'),

  // Đăng xuất PHẢI đi qua server: cookie `refreshToken` là HttpOnly nên JS không
  // xoá được, và bản thân phiên còn nằm trong bảng user_sessions. Trước đây
  // AuthContext.logout() chỉ xoá localStorage → cookie sống tiếp 7 ngày, và lần
  // 401 kế tiếp của BẤT KỲ ai dùng máy này đều refresh ra được phiên của người đã
  // "đăng xuất" trước đó.
  logout: () => api.post('/auth/logout'),
};

// User Profile APIs
export const userApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (data) => api.patch('/users/me', data),
  // Phải nằm ở userApi (không phải authApi): endpoint thuộc /users/me và
  // UserProfileModal chỉ import userApi.
  updatePassword: (data) => api.patch('/users/me/password', data),
  updateAvatar: (formData) => api.post('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  recalculateQuota: () => api.patch('/users/me/recalculate-quota'),
  // Bộ đệm 30 giây — vừa đủ để đóng/mở lại hồ sơ cá nhân không thành một chuỗi
  // request, vừa đủ ngắn để màn hình bảo mật này không hiển thị thông tin cũ.
  getMySessions: () => sessionsCache.get('me', () => api.get('/users/me/sessions')),

  // Hai hàm thu hồi bên dưới làm câu trả lời đang đệm thành sai ngay lập tức,
  // nên phải đốt đệm — nếu không, danh sách vẫn hiện phiên vừa bị đá ra.
  revokeSession: async (sessionId) => {
    const res = await api.delete(`/users/me/sessions/${sessionId}`);
    sessionsCache.invalidate('me');
    return res;
  },
  revokeAllOtherSessions: async () => {
    const res = await api.delete('/users/me/sessions');
    sessionsCache.invalidate('me');
    return res;
  },
  deleteMyAccount: (password) => api.delete('/users/me', { data: { password } }),
};

/**
 * Đốt bộ đệm sau khi một lượt TẢI LÊN hoàn tất.
 *
 * Tách khỏi `afterFileMutation` vì lúc gọi ta chưa biết id của tệp mới — backend
 * mới là nơi cấp id, và nó nằm trong response. Đọc id từ response rồi đốt theo id
 * đó: nếu đây là một phiên bản mới của tệp đã có thì danh sách phiên bản, nội dung
 * văn bản và URL xem trước đã đệm của nó đều thành sai.
 *
 * Ba luồng upload (`confirmUpload`, `uploadProxy`, `chunkedApi.complete`) đều phải
 * đi qua đây — bỏ sót một luồng là bỏ sót đúng luồng mà người dùng đang dùng.
 */
function afterUpload(promise) {
  return promise.then((res) => {
    invalidateAfterFileMutation(res?.file?.id ?? res?.id ?? null);
    return res;
  });
}

/**
 * Chạy một mutation rồi đốt các bộ đệm mà nó làm sai — nhưng CHỈ khi nó thành công.
 *
 * Nhận vào promise đã bắt đầu (chứ không phải một hàm) để dùng được dưới dạng
 * một-dòng ngay tại chỗ khai báo endpoint, giữ nguyên hình dạng của `filesApi`.
 */
function afterFileMutation(fileId, promise) {
  return promise.then((res) => {
    invalidateAfterFileMutation(fileId);
    return res;
  });
}

/**
 * Như `afterFileMutation`, nhưng cho các thao tác về QUYỀN: thêm/bớt người, tạo
 * link. Chỉ danh sách quyền của đúng tệp đó thành sai — nên chỉ đốt chừng đó, thay
 * vì đốt cả nhật ký và bảng tệp lớn nhất.
 */
function afterShareMutation(fileId, promise) {
  return promise.then((res) => {
    shareAccessCache.invalidate(String(fileId));
    return res;
  });
}

// Files & Folders Hierarchy APIs
export const filesApi = {
  /**
   * Danh sách tệp/thư mục.
   *
   * `background: true` dành cho lượt đồng bộ IM LẶNG sau khi hàng đợi upload rỗng
   * (`fetchFiles(0, { silent: true })`): người dùng không bấm gì cả, nên lượt gọi
   * đó không được phép bật thanh tiến trình ở đỉnh trang.
   */
  getFilesAndFolders: (params = {}, { background = false } = {}) =>
    api.get('/files', background ? { params, meta: { noProgressBar: true } } : { params }),
  createFolder: (data) => api.post('/folders', data),
  createFoldersBatch: (paths, parentId, sharedDriveId) => api.post('/files/folders/batch', { paths, parentId, sharedDriveId }),
  // ── Thao tác GHI ────────────────────────────────────────────────────────────
  //
  // Mỗi hàm dưới đây tự đốt các bộ đệm mà nó vừa làm sai, ngay tại chỗ, qua
  // `afterFileMutation`. Để phía gọi tự nhớ thì chỉ cần một nút mới ở đâu đó trong
  // app là bộ đệm bắt đầu trả dữ liệu cũ — loại lỗi rất khó lần ra vì nó chỉ hiện
  // trong khoảng TTL rồi biến mất khi người ta thử lại.
  //
  // Đốt SAU khi thành công, không đốt trước: request lỗi thì câu trả lời cũ vẫn
  // đúng, xoá nó đi chỉ tạo thêm một lượt gọi vô ích.
  renameItem: (id, data) => afterFileMutation(id, api.patch(`/files/${id}/rename`, data)),
  moveItem: (id, data) => afterFileMutation(id, api.patch(`/files/${id}/move`, data)),
  copyItem: (id, data) => afterFileMutation(id, api.post(`/files/${id}/copy`, data)),
  toggleStar: (id) => afterFileMutation(id, api.patch(`/files/${id}/star`)),
  /** Cập nhật màu tùy chỉnh. Truyền color=null để reset về mặc định. */
  updateColor: (id, color) => afterFileMutation(id, api.patch(`/files/${id}/color`, { color })),
  moveToTrash: (id) => afterFileMutation(id, api.patch(`/files/${id}/trash`)),
  restoreFromTrash: (id) => afterFileMutation(id, api.patch(`/files/${id}/restore`)),
  // Gỡ cờ "Nội dung rác". KHÁC `restoreFromTrash`: tệp spam có `is_trash = false`
  // sẵn rồi, nên gọi /restore cho nó là một câu UPDATE không đổi gì — đó chính là
  // lý do "khôi phục xong không thấy tệp đâu".
  markNotSpam: (id) => afterFileMutation(id, api.patch(`/files/${id}/not-spam`)),
  // Xoá sạch thùng rác đụng tới nhiều tệp cùng lúc, không có một id nào để chỉ ra.
  emptyTrash: () => afterFileMutation(null, api.delete('/files/trash/empty')),
  deletePermanently: (id) => afterFileMutation(id, api.delete(`/files/${id}/permanent`)),
  getStorageAnalytics: () => api.get('/files/analytics'),
  // Qua bộ đệm 60 giây: `QuickCleanupModal` gọi lại nguyên bảng mỗi lần mở.
  getLargestFiles: (limit = 3) =>
    largestFilesCache.get(`limit:${limit}`, () => api.get('/files/largest', { params: { limit } })),
  downloadZip: (fileIds) => api.post('/files/download-zip', { fileIds }, { responseType: 'blob' }),
  // Qua bộ đệm: `FileInfoDrawer` gọi lại cả hai thứ này mỗi lần mở, kể cả khi vừa
  // đóng đúng tệp đó. Mọi thao tác ghi lên tệp đều đốt bộ đệm (xem phần mutation
  // ngay dưới), nên dữ liệu không thể cũ một cách vô hạn.
  getFileVersions: (id) =>
    fileVersionsCache.get(String(id), () => api.get(`/files/${id}/versions`)),

  getActivityLogs: (fileId) => {
    const url = fileId ? `/files/${fileId}/activity-logs` : '/files/activity-logs';
    return activityLogsCache.get(fileId ? String(fileId) : 'global', () => api.get(url));
  },
};

/**
 * Gộp việc xin URL xem trước của cả một trang danh sách thành MỘT request.
 *
 * Trước: 50 thẻ = 50 × `GET /files/:id/preview-url`, mỗi cái tốn ở backend một
 * câu SELECT + một HEAD tới GCS + một câu UPDATE (`access_count`). Nay: một
 * `POST /files/preview-urls` cho cả trang, backend làm 2 câu SQL và 0 lượt đi cloud.
 *
 * ## Đường lùi khi backend chưa có endpoint này
 *
 * Frontend (Vercel) và backend (Heroku) là HAI repo git riêng nên hai lần deploy
 * không bao giờ đồng thời. Nếu frontend lên trước, `POST /files/preview-urls` sẽ
 * nhận 404 — và nếu không xử lý thì TOÀN BỘ thumbnail của app chết trong khoảng
 * thời gian giữa hai lần deploy. Nên: lần đầu gặp 404/405, hạ cờ `batchSupported`
 * và từ đó mọi lượt xin URL tự quay về đường lẻ, vĩnh viễn cho phiên đó.
 *
 * Nhờ vậy thứ tự deploy không còn quan trọng, và thay đổi này rollback được bằng
 * cách revert riêng một phía.
 */
let batchSupported = true;

const previewUrlBatch = createBatchLoader({
  windowMs: 16,
  // Khớp `ArrayMaxSize(100)` của `GetPreviewUrlsDto` ở backend. Lệch lên là ăn 400.
  maxBatchSize: 100,
  fetchMany: async (ids) => {
    if (batchSupported) {
      try {
        const res = await api.post(
          '/files/preview-urls',
          { ids },
          { meta: { noProgressBar: true } },
        );
        return new Map((res?.items || []).map((item) => [String(item.id), item]));
      } catch (err) {
        // `err.status`, KHÔNG phải `err.response.status`.
        //
        // Response interceptor ở dưới chuẩn hoá mọi lỗi thành `new Error(message)`
        // rồi gán `status` PHẲNG lên nó — `err.response` không còn tồn tại khi lỗi
        // tới tay caller. Đọc sai chỗ thì `status` là `undefined`, điều kiện dưới
        // luôn đúng, cả lô bị `throw` và MỌI thumbnail trong thư mục thành icon;
        // tệ hơn nữa là `batchSupported` không bao giờ bị hạ nên mỗi lần mở thư mục
        // lại bắn thêm một request 404. Đây từng là lỗi thật trên production, phát
        // hiện ra lúc frontend đã deploy mà backend thì chưa.
        //
        // Vẫn đọc kèm `err.response?.status` để hàm này còn đúng nếu có ai gọi nó
        // với một lỗi axios thô (vd. trong test).
        const status = err?.status ?? err?.response?.status;
        if (status !== 404 && status !== 405) throw err;
        batchSupported = false;
        console.warn(
          '[api] Backend chưa có POST /files/preview-urls — quay về đường lẻ cho cả phiên.',
        );
      }
    }

    // Đường lùi: gọi lẻ từng id. Chậm như trước khi có batch, nhưng vẫn CHẠY.
    const entries = await Promise.all(
      ids.map((id) =>
        api
          .get(`/files/${id}/preview-url`, { meta: { noProgressBar: true } })
          .then((res) => [String(id), res])
          .catch(() => [String(id), null]),
      ),
    );
    return new Map(entries.filter(([, value]) => value));
  },
});

// ───────────────── Lỗi mạng của máy người dùng vs. server từ chối ─────────────────

/**
 * Request tới BACKEND CỦA MÌNH chưa từng nhận được phản hồi nào.
 *
 * Nghĩa là mạng phía người dùng đứt hoặc vừa đổi (wifi nối lại, bật/tắt VPN, đổi
 * IP/DNS, chuyển wifi↔4G — Chromium báo `net::ERR_NETWORK_CHANGED` và huỷ mọi socket
 * đang bay), KHÔNG phải server từ chối. Phân biệt được hai thứ này là điều kiện để
 * chọn đúng cách xử lý, vì chúng cần hai cách ngược nhau: server từ chối thì thử lại
 * vô ích, còn mạng nhấp một nhịp thì thử lại là đúng và thường thành công ngay.
 *
 * `apiRequest` là điều kiện KHÔNG được bỏ: một lỗi `ERR_NETWORK` khi PUT thẳng lên
 * cloud có thể là bucket cấu hình CORS sai — trình duyệt che nguyên nhân thật và báo
 * y hệt một cú đứt mạng. Ở đó thì đường lùi qua proxy mới là câu trả lời đúng. Còn
 * request tới backend của mình thì không có sự nhập nhằng đó: CORS của nó đã được
 * chứng minh đúng (xem `.ai/environment.md`), nên không có phản hồi = không có mạng.
 */
export function isBackendUnreachable(err) {
  if (!err?.apiRequest) return false;
  // Huỷ do người dùng bấm — không phải sự cố.
  if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return false;
  // Có mã HTTP nghĩa là request ĐÃ tới server và server đã trả lời. Đó là câu trả
  // lời, không phải lỗi mạng, dù câu trả lời có là 500.
  if (err.status !== undefined) return false;
  return err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
}

/** Chờ giữa hai lần thử. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chạy một request ĐIỀU KHIỂN (nhỏ, không mang byte của tệp) và thử lại khi mạng
 * người dùng nhấp một nhịp.
 *
 * CHỈ dùng cho request điều khiển, và chỉ khi lượt gọi lặp lại không gây hậu quả:
 * mạng đứt không phân biệt được với "server đã xử lý xong nhưng phản hồi mất trên
 * đường về", nên mỗi lần thử lại đều có thể là lần thực thi thứ hai. Xem chú thích
 * ở từng nơi gọi để biết hậu quả đó là gì.
 *
 * Backoff 400ms rồi 1200ms: đủ để đi qua một cú đổi wifi/VPN (thường dưới một giây)
 * mà không giữ người dùng chờ quá lâu nếu mạng thật sự đã mất.
 */
async function retryWhenOffline(call, { attempts = 3, baseDelayMs = 400 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= attempts || !isBackendUnreachable(err)) throw err;
      console.warn(
        `[api] Mất mạng giữa một request điều khiển — thử lại lần ${attempt}/${attempts - 1}.`,
      );
      await wait(baseDelayMs * (attempt === 1 ? 1 : 3));
    }
  }
}

// Multi-Cloud Storage APIs
export const storageApi = {
  /**
   * Xin một presigned URL để đẩy tệp thẳng lên cloud.
   *
   * Có thử lại khi mất mạng, và ở đây thử lại là AN TOÀN TUYỆT ĐỐI: backend chỉ đọc
   * (kiểm quyền ghi + tìm thư mục cha) rồi ký một URL, không ghi hàng nào vào DB —
   * hàng chỉ ra đời ở `confirm-upload`. Một URL đã ký mà không ai dùng thì không để
   * lại gì trên bucket cả.
   *
   * Vì sao cần: đây chính là request đã chết trong sự cố 09/09/2026. Nó chỉ là một
   * request bé xin URL, nhưng nó chết thì cả tệp bị đẩy sang đường proxy.
   */
  getUploadUrl: (data) => retryWhenOffline(() => api.post('/files/upload-url', data)),
  confirmUpload: (data) => afterUpload(api.post('/files/confirm-upload', data)),
  getDownloadUrl: (id) => api.get(`/files/${id}/download-url`),
  /**
   * URL xem trước có chữ ký, qua bộ đệm.
   *
   * Trước đây mỗi lần mở cửa sổ xem trước là một lượt xin URL mới, kể cả khi
   * người dùng vừa đóng đúng tệp đó một giây trước — và trên Trang chủ, cùng
   * một tệp hiện ở ba khu vực nên ba thẻ xin ba lần. URL do backend phát sống
   * 15 phút, giữ lại 10 phút là an toàn.
   */
  /**
   * URL xem trước, qua bộ đệm. HAI đường, và phải chọn đúng đường.
   *
   * `needsPlayback: false` (mặc định — đường của THUMBNAIL): gộp cả trang thành
   * một request. Trả về `previewUrl` và metadata cơ bản.
   *
   * `needsPlayback: true` (đường của TRÌNH PHÁT): gọi lẻ, vì `playbackHint` và
   * `fmp4` chỉ có ở endpoint lẻ — backend phải đọc byte range thật trên cloud mới
   * biết tệp mp4 này trình duyệt phát ngay được hay phải tải hết trước
   * (`mp4-container.ts`). Đường gộp cố ý bỏ bước đó: nó là việc đọc cloud cho MỖI
   * tệp, không thể làm cho 50 thumbnail.
   *
   * KHOÁ ĐỆM KHÁC NHAU (`id` vs `id:pb`) — đây là phần dễ sai nhất. Hai đường trả
   * về hai payload khác nhau; dùng chung một ô đệm thì một lượt dựng thumbnail sẽ
   * nhét bản KHÔNG có `playbackHint` vào ô, rồi cửa sổ xem trước mở lên nhận đúng
   * bản đó và mất sạch thông tin phát lại — một hồi quy im lặng, chỉ hiện ra ở
   * video trên Chromium.
   */
  getPreviewUrl: (id, { needsPlayback = false } = {}) =>
    needsPlayback
      ? previewUrlCache.get(`${id}:pb`, () => api.get(`/files/${id}/preview-url`))
      : previewUrlCache.get(String(id), () => previewUrlBatch.load(id)),

  /**
   * Đường LẺ, gọi thẳng, KHÔNG gộp và KHÔNG qua bộ đệm.
   *
   * Chỉ dùng để sửa khi `storage_provider` trong DB lệch với nơi object thật nằm —
   * chỉ endpoint lẻ ở backend còn dò lại provider (xem `getPresignedPreviewUrlsBatch`).
   * Không đệm là có ý: nó được gọi đúng lúc bản đã đệm vừa tỏ ra là sai.
   */
  getPreviewUrlDirect: (id) => api.get(`/files/${id}/preview-url`),

  /**
   * Bỏ URL xem trước đã đệm của MỘT tệp để lần gọi sau xin chữ ký mới.
   *
   * Dùng khi thẻ <video>/<audio> báo lỗi: nghi phạm số một là chữ ký đã hết hạn
   * giữa lúc phát (xem `resolvePreviewUrlTtlSeconds` ở backend), mà URL cũ vẫn
   * còn trong bộ đệm nên thử lại bằng nó thì chỉ ăn đúng cái 403 lần nữa.
   */
  invalidatePreviewUrl: (id) => {
    // Đốt CẢ HAI ô: người gọi (thẻ media báo lỗi) không cần biết bản đang hỏng là
    // bản của đường gộp hay đường trình phát.
    previewUrlCache.invalidate(String(id));
    previewUrlCache.invalidate(`${id}:pb`);
  },

  /** Nội dung văn bản cho khung xem trước code / text / markdown. Xem chú thích trên. */
  getFileTextContent: (id) => fileTextCache.get(String(id), () => api.get(`/files/${id}/content`)),

  /**
   * Xin URL PUT để đẩy thumbnail vừa dựng lên R2. CHỈ CHỦ TỆP được cấp.
   *
   * `items`: `[{ fileId, variant, sizeBytes }]`. `sizeBytes` phải là dung lượng
   * CHÍNH XÁC của blob sắp gửi — nó nằm trong chữ ký, lệch là R2 trả 403.
   *
   * `noProgressBar`: đây là việc chạy nền sau khi người dùng đã thấy thumbnail rồi.
   */
  getThumbnailUploadUrls: (items) =>
    api.post('/files/thumbnails/upload-urls', { items }, { meta: { noProgressBar: true } }),

  /**
   * Huỷ một phiên tải lên đang dở và dọn rác trên cloud.
   * `resumableUrl` chỉ có với luồng chunked; backend tự kiểm tra nó có đúng là
   * session URI của GCS hay không.
   */
  abortUpload: (data) => api.post('/files/upload/abort', data),

  // Direct PUT Upload to Presigned URL (Cloudflare R2 / Backblaze B2 / GCS)
  // `signal` là AbortSignal của job — nút "Huỷ" cắt đúng request đang chạy.
  uploadDirectToCloud: async (presignedUrl, file, onUploadProgress, signal) => {
    return axios.put(presignedUrl, file, {
      signal,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
  },
  uploadProxy: async (file, parentId, targetProvider, onUploadProgress, sharedDriveId, signal) => {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId) formData.append('parentId', parentId);
    if (sharedDriveId) formData.append('sharedDriveId', sharedDriveId);
    if (targetProvider) formData.append('targetProvider', targetProvider);

    return afterUpload(api.post('/files/upload-proxy', formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    }));
  },
};

// Chunked / Resumable Upload API (GCS native resumable upload)
// Luồng: init → uploadChunkDirect (PUT lên GCS, lặp N lần) → complete
export const chunkedApi = {
  /**
   * Khởi tạo GCS resumable session.
   * Response: { uploadId, resumableUrl, storageKey, chunkSize, totalChunks, totalSizeBytes }
   */
  init: (data) =>
    // Thử lại khi mất mạng. Hậu quả nếu lượt đầu đã chạy xong mà phản hồi mất trên
    // đường về: thừa một phiên resumable trên GCS, không byte nào được ghi vào nó và
    // GCS tự xoá phiên dở sau 7 ngày. Đổi lại, một cú nhấp mạng không còn giết cả một
    // tệp lớn đang chờ tới lượt — đường chunked KHÔNG có đường lùi nào khác.
    retryWhenOffline(() => api.post('/files/upload-chunk/init', data)),

  /**
   * PUT 1 chunk trực tiếp lên GCS resumable URL.
   * GCS xác định vị trí chunk qua Content-Range header.
   * Không qua backend — gọi GCS endpoint trực tiếp.
   */
  uploadChunkDirect: async (resumableUrl, chunk, start, totalSize, onProgress, signal) => {
    const end = start + chunk.size - 1;
    return axios.put(resumableUrl, chunk, {
      signal,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      validateStatus: (status) => status === 200 || status === 201 || status === 308, // 308 = chunk nhận OK, chờ thêm
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const chunkPercent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(chunkPercent);
        }
      },
    });
  },

  /**
   * Hoàn tất: backend verify userId qua GCS metadata → tạo FileItem DB record.
   */
  complete: (data) => afterUpload(api.post('/files/upload-chunk/complete', data)),

  /**
   * Hỏi GCS đã nhận tới byte nào của phiên này.
   *
   * Đi vòng qua backend là CỐ Ý: câu trả lời nằm ở header `Range`, mà trình
   * duyệt chỉ đọc được header đó nếu bucket khai báo nó trong CORS. Backend
   * không bị ràng buộc ấy.
   *
   * Response: { expired, completed, receivedBytes }
   */
  status: (data) => api.post('/files/upload-chunk/status', data),
};

// Sharing APIs — Public share link & access management
export const sharingApi = {
  /** Lấy thông tin tệp qua token chia sẻ (không cần đăng nhập) */
  getSharedItem: (token) => api.get(`/shares/${token}`),
  /** Xác thực mật khẩu cho link chia sẻ công khai */
  verifySharePassword: (token, password) => api.post(`/shares/${token}/verify-password`, { password }),
  /** Sinh presigned preview URL (inline) qua token chia sẻ */
  getSharedPreviewUrl: (token, fileId, authToken) =>
    api.get(`/shares/${token}/preview-url`, {
      params: fileId ? { fileId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Sinh presigned download URL qua token chia sẻ */
  getSharedDownloadUrl: (token, fileId, authToken) =>
    api.get(`/shares/${token}/download-url`, {
      params: fileId ? { fileId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Lấy danh sách file/folder con trong thư mục được chia sẻ (không cần đăng nhập) */
  getSharedChildren: (token, folderId, authToken) =>
    api.get(`/shares/${token}/children`, {
      params: folderId ? { folderId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Tạo link chia sẻ công khai cho một tệp (yêu cầu đăng nhập) */
  createShareLink: (id, data) => afterShareMutation(id, api.post(`/files/${id}/share`, data)),
  /**
   * Lấy danh sách người được chia sẻ trực tiếp (yêu cầu đăng nhập).
   * Qua bộ đệm 30 giây — `ShareModal` gọi lại mỗi lần mở. Ba hàm ghi ngay dưới tự
   * đốt bộ đệm của đúng tệp đó, nên đóng-mở lại sau khi thêm người là thấy ngay.
   */
  getShareAccess: (id) => shareAccessCache.get(String(id), () => api.get(`/files/${id}/share-access`)),
  /** Thêm quyền truy cập cho người dùng cụ thể (yêu cầu đăng nhập) */
  addShareAccess: (id, data) => afterShareMutation(id, api.post(`/files/${id}/share-access`, data)),
  /** Thu hồi quyền truy cập của một người dùng (yêu cầu đăng nhập) */
  removeShareAccess: (id, userId) =>
    afterShareMutation(id, api.delete(`/files/${id}/share-access/${userId}`)),
};

// Shared Drives APIs
/**
 * Đốt bộ đệm danh sách Bộ nhớ dùng chung sau một thao tác ghi lên drive.
 *
 * Danh sách này là MỘT câu trả lời duy nhất (không theo id) nên mọi thay đổi —
 * tạo, đổi tên, xoá, đánh dấu sao, thêm/bớt thành viên — đều làm nó sai hết.
 */
function afterDriveMutation(promise) {
  return promise.then((res) => {
    sharedDrivesCache.clear();
    return res;
  });
}

export const sharedDrivesApi = {
  create: (data) => afterDriveMutation(api.post('/shared-drives', data)),

  // Qua bộ đệm 60 giây: `SharedDrivesPage` gọi lại nguyên danh sách mỗi lần vào
  // route. Mọi hàm ghi dưới đây tự đốt bộ đệm nên không thể thấy dữ liệu cũ sau
  // khi vừa tự tay sửa.
  getAll: () => sharedDrivesCache.get('all', () => api.get('/shared-drives')),

  getOne: (id) => api.get(`/shared-drives/${id}`),
  // Đổi tên / sửa mô tả — chỉ ADMIN của drive. data: { name?, description? }
  update: (id, data) => afterDriveMutation(api.patch(`/shared-drives/${id}`, data)),
  // ⚠️ Xóa cả drive, kéo theo MỌI tệp/thư mục bên trong (FK ON DELETE CASCADE).
  // Chỉ người tạo drive gọi được. Trả về { deletedItems }.
  remove: (id) => afterDriveMutation(api.delete(`/shared-drives/${id}`)),
  // Dấu sao RIÊNG của từng người (lưu ở hàng shared_drive_members của người gọi, migration
  // 011): bật/tắt chỉ ảnh hưởng chính mình. Mọi role đều gọi được. Trả về { id, isStarred }
  // với `id` là id của DRIVE.
  toggleStar: (id) => afterDriveMutation(api.patch(`/shared-drives/${id}/star`)),
  // data: { email, role } — hoặc { userId, role } cho caller cũ
  addMember: (id, data) => afterDriveMutation(api.post(`/shared-drives/${id}/members`, data)),
  removeMember: (id, userId) =>
    afterDriveMutation(api.delete(`/shared-drives/${id}/members/${userId}`)),
};

// Billing / Thanh toán (payOS)
//
// payOS là cổng DUY NHẤT: nó phát mã VietQR nên mọi app ngân hàng Việt Nam đều quét được,
// không cần tích hợp riêng từng ví. Vì vậy không có tham số chọn cổng ở đây.
export const billingApi = {
  // Bảng giá lấy từ DB (chỉ gói is_active). Trả [{ id, name, storageBytes, storageGB,
  // priceMonthly, priceYearly }] đã sắp theo priceMonthly tăng dần.
  // Qua bộ đệm 60 phút CÓ LƯU BỀN (sống qua F5): bảng giá chỉ đổi khi vận hành sửa
  // nó, nhưng trang Gói dịch vụ tải lại nguyên bảng mỗi lần người dùng ghé qua.
  //
  // Phần còn lại của trang này CỐ Ý không cache: `getMySubscription` và
  // `getTransactions` là dữ liệu tiền bạc, hiện một trạng thái thanh toán cũ 15
  // phút là đúng kiểu sai lầm khiến người dùng trả tiền hai lần.
  getPlans: () => plansCache.get('all', () => api.get('/billing/plans')),

  // Gói ĐANG CHẠY của chính mình, hoặc null nếu chưa từng mua (đang ở hạn mức mặc định).
  // Trả { planId, planName, storageBytes, billingCycle, status, cancelAtPeriodEnd, startDate,
  // endDate, remainingDays }.
  //
  // Cần cái này để biết thẻ nào là "đang sử dụng": suy từ `storageInfo.limitBytes` thì hai gói
  // cùng dung lượng khác giá sẽ cùng bị đánh dấu, và một hạn mức chỉnh tay làm mọi thẻ mất dấu.
  //
  // `status` vẫn là 'ACTIVE' khi khách đã hẹn dừng gói — muốn biết gói còn tự gia hạn hay không
  // thì phải đọc `cancelAtPeriodEnd`, không đọc `status`.
  getMySubscription: () => api.get('/billing/subscription'),

  // Tắt TỰ ĐỘNG GIA HẠN gói đang chạy. Gói KHÔNG bị đóng ngay: status vẫn 'ACTIVE' và dung
  // lượng giữ nguyên đến hết `endDate` — những ngày đó khách đã trả tiền rồi.
  //
  // Đừng lẫn với `cancelTransaction` (huỷ một hoá đơn CHƯA trả tiền). Ở đây không có giao dịch
  // nào để huỷ bên payOS.
  //
  // Trả nguyên hình dạng của `getMySubscription` (đã có `cancelAtPeriodEnd: true`) + `message`
  // (câu thông báo kèm ngày kết thúc, đã format theo giờ VN) + `alreadyCancelled`.
  // `alreadyCancelled: true` = gói đã hẹn dừng từ trước, lần gọi này không đổi gì — vẫn 200,
  // gọi lại nhiều lần KHÔNG lỗi.
  //
  // 404 nếu không có gói ACTIVE nào, 400 nếu gói đã qua hạn.
  //
  // MUỐN BẬT LẠI: mua tiếp CHÍNH gói đó. Webhook thanh toán xoá cờ và cộng chu kỳ mới vào
  // `endDate` cũ nên không mất ngày nào — `getQuote` báo trước ca này bằng `resumesAutoRenew`.
  cancelSubscriptionRenewal: (reason) =>
    api.post('/billing/subscription/cancel', reason ? { reason } : {}),

  // Báo giá THỬ một gói + kỳ. Không tạo giao dịch, không gọi payOS.
  //
  // Số tiền thật của một lần ĐỔI GÓI không bằng giá niêm yết — backend trừ phần chưa dùng của
  // gói cũ (`applyProration`). Endpoint này trả đúng phép tính mà create-payment-link sẽ dùng,
  // nên modal xác nhận hiện được cùng con số với trang payOS.
  //
  // Trả { listAmount, creditAmount, creditedDays, amountToPay, isRenewal, flooredToMinimum,
  // minimumAmount, previousPlanName, previousCycle, previousCancelAtPeriodEnd,
  // resumesAutoRenew, canPurchase, blockedReason }.
  //
  // `resumesAutoRenew: true` = khách đang hẹn dừng chính gói này, trả tiền là RÚT LẠI lệnh
  // huỷ. Modal xác nhận phải nói trước điều đó, không thì khách vừa bấm huỷ gia hạn lại thấy
  // nó tự bật lại mà không hiểu vì sao.
  getQuote: (params) => api.get('/billing/quote', { params }),

  // data: { planId, billingCycle: 'monthly' | 'yearly' }
  //
  // CỐ Ý không gửi `amount`: backend tự tra giá theo planId, và AppValidationPipe
  // (whitelist: true) trả 400 nếu payload có thêm field lạ. Chữ ký payOS ký đúng con số
  // được gửi lên nên nó KHÔNG phát hiện được client tự hạ giá — đó là lý do số tiền chỉ
  // được sinh ở server.
  //
  // Trả { transactionId, orderCode, amount, checkoutUrl, qrCode, accountNumber,
  // accountName, bin, description, expiredAt }. Link sống 15 phút.
  createPaymentLink: (data) => api.post('/billing/payos/create-payment-link', data),

  // 50 giao dịch gần nhất của chính mình, mới nhất trước.
  getTransactions: () => api.get('/billing/transactions'),

  // Trang /billing/success gọi cái này. Nó KHÔNG chỉ đọc DB: giao dịch còn PENDING thì
  // backend hỏi thẳng payOS rồi ghi nhận kết quả — nhờ vậy luồng mua gói chạy được cả khi
  // webhook URL chưa được đăng ký (máy dev không có HTTPS public).
  getTransactionStatus: (orderCode) => api.get(`/billing/transactions/${orderCode}`),

  // Huỷ một hoá đơn CHƯA thanh toán (PENDING/PROCESSING). Backend huỷ link bên payOS rồi
  // ghi status CANCELLED — huỷ mỗi ở DB thì khách vẫn quét được QR cũ và trả tiền cho một
  // giao dịch đã đóng.
  //
  // Chỉ gọi được với giao dịch của chính mình. Trả 400 nếu giao dịch đã PAID/CANCELLED/EXPIRED,
  // 404 nếu orderCode không thuộc về người gọi.
  //
  // Chỉ huỷ được giao dịch PENDING. PROCESSING bị backend từ chối bằng 400 CÓ CHỦ Ý: lúc đó
  // cổng thanh toán đang ghi nhận một khoản chuyển khoản.
  cancelTransaction: (orderCode, reason) =>
    api.post(`/billing/transactions/${orderCode}/cancel`, reason ? { reason } : {}),
};

// ───────────────────────── Đọc một dòng SSE do backend phát ─────────────────────────
//
// KHÔNG dùng axios được cho đường này: axios trên trình duyệt chạy trên XMLHttpRequest
// và chỉ giao body khi request đã xong, tức đúng thứ mình đang cố bỏ. Cũng không dùng
// `EventSource` được: nó chỉ biết GET, không gắn được header `Authorization`, và không
// gửi được body — mà câu hỏi AI là một POST có payload.
//
// Nên: `fetch` + đọc `response.body` theo từng khối. Đổi lại phải tự làm ba việc mà
// interceptor của axios vốn đã làm hộ — làm mới token khi 401, dựng lại đối tượng lỗi
// theo cùng hình dạng, và nhận diện lượt bị người dùng huỷ.

/**
 * Dựng một lỗi có CÙNG hình dạng với lỗi mà interceptor của axios trả ra, cộng thêm
 * `response` cho các nơi gọi đang đọc `err.response.status` / `err.response.data`.
 * Hai hình dạng cùng tồn tại là chuyện đã có từ trước ở codebase này; ở đây mang cả
 * hai để nơi gọi không phải biết mình vừa đi qua đường nào.
 */
function errorFromPayload(payload, fallbackMessage) {
  const status = payload?.statusCode ?? payload?.status;
  const err = new Error(payload?.message || fallbackMessage || 'Đã có lỗi xảy ra');
  err.status = status;
  err.errorCode = payload?.errorCode ?? payload?.error;
  err.details = payload?.details;
  err.response = { status, data: payload ?? undefined };
  return err;
}

/** Lỗi "người dùng bấm Dừng", mang đúng `name`/`code` mà axios dùng. */
function canceledError() {
  const err = new Error('Đã huỷ');
  err.name = 'CanceledError';
  err.code = 'ERR_CANCELED';
  return err;
}

/**
 * POST một request và đọc phản hồi SSE, gọi `onEvent(name, data)` cho từng sự kiện.
 *
 * Tự làm mới token và gửi lại ĐÚNG MỘT LẦN khi gặp 401 — cùng luật với interceptor
 * của axios (`_retried`): nếu lần thứ hai vẫn 401 thì vấn đề không phải token hết hạn,
 * và thử lại tiếp chỉ là spam chính mình.
 */
async function postSse(path, payload, { signal, onEvent }) {
  const open = async () => {
    const token = localStorage.getItem('accessToken');
    return fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  };

  let res;
  try {
    res = await open();
    if (res.status === 401) {
      // Cùng cách xử lý với interceptor: làm mới rồi gửi lại một lần. Lỗi refresh THẬT
      // (401/403 từ chính /auth/refresh) mới đăng xuất; mất mạng một nhịp thì giữ phiên
      // và để lượt hỏi này báo lỗi bình thường.
      try {
        await refreshAccessToken();
      } catch (refreshError) {
        if (refreshError?.isAuthFailure) {
          forceLogout(refreshError.isLocked ? 'account_locked' : undefined);
        }
        throw refreshError;
      }
      res = await open();
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw canceledError();
    throw err;
  }

  if (!res.ok) {
    // Lỗi TRƯỚC khi dòng mở ra vẫn là một phản hồi HTTP bình thường (401 của guard,
    // 400 của pipe validate…), nên body là JSON của AllExceptionsFilter.
    let body;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const err = errorFromPayload(body, `Request failed with status code ${res.status}`);
    if (err.status === undefined) {
      err.status = res.status;
      err.response = { status: res.status, data: body };
    }
    console.error('[API Error]', res.status, path, err.message);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frame SSE kết thúc bằng một dòng trắng. Giữ phần dư trong `buffer`: một frame
      // có thể bị cắt ngang giữa hai khối TCP, và parse nửa frame thì mất chữ.
      let cut;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);

        let name = 'message';
        const dataLines = [];
        for (const line of frame.split('\n')) {
          // Dòng bắt đầu bằng ':' là comment theo đặc tả — backend dùng nó cho `ping`
          // và cho byte đầu tiên. Bỏ qua, nhưng chính chúng giữ dòng này sống.
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) continue;

        let data;
        try {
          data = JSON.parse(dataLines.join('\n'));
        } catch {
          // Một frame méo không được làm mất cả câu trả lời đang chạy.
          console.warn('[API] Bỏ qua frame SSE không đọc được ở', path);
          continue;
        }
        onEvent(name, data);
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw canceledError();
    throw err;
  }
}

// ───────────────────────────── Hỏi AI (Vertex AI / Gemini) ─────────────────────────────
//
// Ngữ cảnh do BACKEND dựng, không phải frontend: nội dung tệp nằm trên cloud storage
// và chỉ backend mới có quyền đọc nó. Frontend chỉ gửi `itemId` — nhờ vậy quyền truy
// cập được kiểm đúng một lần, ở nơi vốn đã kiểm cho xem trước/tải xuống.
export const aiApi = {
  // { enabled, model } — gọi lúc mở khung chat để biết nên hiện khung nhập hay
  // hiện dòng "chưa bật AI", thay vì để người dùng gõ xong mới nhận 503.
  // Qua bộ đệm 60 giây: khung AI được gắn `key={item.id}` nên mỗi lần mở là một
  // instance mới và hỏi lại trạng thái. Hạn mức hiển thị vẫn tươi vì `ask` trả
  // `quota` mới sau mỗi câu trả lời.
  getStatus: () => aiStatusCache.get('status', () => api.get('/ai/status')),

  /**
   * Hỏi một câu về tệp/thư mục, chờ trọn câu trả lời.
   *
   * KHÔNG DÙNG TỪ GIAO DIỆN — dùng `askStream` bên dưới. Đường này chạm trần 30 giây
   * của router Heroku (`H12`): log production 09/09/2026 cho thấy lượt hỏi thành công
   * đã mất 14,9–15,2s, và lượt nào vượt 30s thì trình duyệt báo một lỗi CORS sai
   * nguyên nhân. Giữ lại vì nó là nơi ĐẶC TẢ payload mà `askStream` dùng chung.
   *
   * @param {object}   payload
   * @param {string=}  payload.itemId  Mục được bấm chuột phải. Bỏ trống = hỏi chay.
   * @param {string=}  payload.action  'summarize' | 'explain' | 'keywords' | 'quiz' | 'improve' | 'chat'
   * @param {string=}  payload.prompt  Câu người dùng gõ (bắt buộc khi action = 'chat')
   * @param {Array=}   payload.history [{ role: 'user' | 'model', text }] — cũ → mới, KHÔNG gồm câu đang hỏi
   * @param {string=}  payload.lang    'vi' | 'en'
   * @param {string=}  payload.conversationId  Cuộc trò chuyện đang mở; bỏ trống ở câu
   *                   đầu tiên rồi dùng `conversationId` mà backend trả về cho các câu
   *                   sau, để cả khung chat được lưu thành MỘT cuộc trong lịch sử.
   * @param {AbortSignal=} signal      Nút Dừng cắt đúng request đang chạy
   *
   * Trả { answer, question, context: { mode, name, chars, seconds, truncated, childCount,
   * reason }, model, conversationId }.
   * `context.mode` cho biết AI thực sự đọc được gì ('file-text' | 'file-binary' |
   * 'file-video' | 'folder-listing' | 'metadata') để giao diện khỏi hứa suông là đã đọc
   * nội dung. Với 'file-video', `seconds` là số giây ĐẦU của video mà AI xem được —
   * backend cắt ở 10 phút, và cắt ngắn hơn nữa khi hạn mức token còn ít.
   */
  ask: (payload, signal) => api.post('/ai/ask', payload, { signal }),

  /**
   * Y HỆT `ask` về đầu vào và về dữ liệu trả về, chỉ khác là câu trả lời tới theo
   * từng đoạn. Giao diện dùng đường NÀY; `ask` ở trên giữ lại cho script và test.
   *
   * VÌ SAO: `POST /ai/ask` chạm trần 30 giây của router Heroku (`H12`) và khi đó
   * trình duyệt báo "blocked by CORS policy" — trang lỗi 503 do chính router sinh ra
   * không đi qua middleware CORS của Nest nên thiếu `Access-Control-Allow-Origin`.
   * Trần đó chỉ đo tới byte đầu tiên, nên phát theo đoạn là bỏ hẳn nó. Xem
   * `AiController.askStream` ở backend.
   *
   * @param {object}   payload  Giống `ask`.
   * @param {object}   handlers
   * @param {AbortSignal=} handlers.signal   Nút Dừng. Huỷ thì ném lỗi `CanceledError`
   *                   giống axios, nên nơi gọi không phải phân biệt hai đường.
   * @param {function=} handlers.onMeta      ({ context, model, grounded }) — gọi NGAY
   *                   khi backend dựng xong ngữ cảnh, TRƯỚC đoạn chữ đầu tiên. Đây là
   *                   lúc biết AI đọc được gì (`context.mode`) để nói thật với người dùng.
   * @param {function=} handlers.onDelta     (text) — một đoạn chữ mới, cần NỐI vào
   *                   phần đã có chứ không phải thay thế nó.
   *
   * Trả về payload cuối cùng, cùng hình dạng `ask`: { answer, question, context,
   * model, grounded, conversationId, quota }. `answer` là câu trả lời TRỌN VẸN, nên
   * nơi gọi có thể bỏ qua `onDelta` nếu không cần hiệu ứng chữ chạy.
   */
  askStream: async (payload, { signal, onMeta, onDelta } = {}) => {
    let result = null;
    let streamError = null;

    await postSse('/ai/ask/stream', payload, {
      signal,
      onEvent: (name, data) => {
        if (name === 'meta') onMeta?.(data);
        else if (name === 'delta') onDelta?.(data?.text ?? '');
        else if (name === 'done') result = data;
        else if (name === 'error') streamError = errorFromPayload(data);
      },
    });

    if (streamError) {
      console.error('[API Error]', streamError.status, '/ai/ask/stream', streamError.message);
      throw streamError;
    }
    if (!result) {
      // Dòng đóng mà không có `done` cũng không có `error`: dyno chết giữa lúc sinh,
      // hoặc mạng đứt. Nói đúng như vậy — người dùng thử lại là hợp lý, khác hẳn với
      // một lỗi có nguyên nhân rõ mà thử lại cũng vô ích.
      throw new Error('Kết nối tới AI bị ngắt giữa lúc đang trả lời, vui lòng thử lại');
    }
    return result;
  },

  /**
   * Lịch sử: MỌI cuộc trò chuyện của mình, mới nhất trước.
   *
   * `before` là con trỏ thời gian lấy từ `nextBefore` của trang trước, KHÔNG phải số
   * trang: danh sách xê dịch mỗi lần hỏi thêm một câu, nên phân trang kiểu offset sẽ
   * lặp hoặc bỏ sót hàng.
   *
   * Trả { items: [{ id, title, fileId, itemName, itemType, messageCount, createdAt,
   * updatedAt }], nextBefore }. `nextBefore` là null khi đã hết trang.
   */
  listConversations: ({ limit, before } = {}) =>
    api.get('/ai/conversations', { params: { limit, before } }),

  /** Toàn bộ nội dung một cuộc: { id, title, itemName, itemType, fileId, messages: [...] }. */
  getConversation: (id) => api.get(`/ai/conversations/${id}`),

  /** Xoá một cuộc trò chuyện. Không ảnh hưởng tới hạn mức đã dùng. */
  deleteConversation: (id) => api.delete(`/ai/conversations/${id}`),
};

export default api;

