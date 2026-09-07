import axios from 'axios';

import { API_BASE_URL } from '../constants/api';
import { decodeJwt, subjectOf } from '../utils/jwt';
import { plansCache, previewUrlCache, fileTextCache, sessionsCache } from '../utils/ttlCache';

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

/** Các đường đã có chỉ báo tiến trình riêng — đếm thêm ở đây chỉ gây nhiễu. */
const NO_PROGRESS_BAR_PATHS = [
  '/files/upload-proxy',
  '/files/upload-chunk/',
  '/files/upload-url',
  '/files/confirm-upload',
];

function tracksProgress(config) {
  if (config?.meta?.noProgressBar) return false;
  const url = config?.url || '';
  return !NO_PROGRESS_BAR_PATHS.some((p) => url.includes(p));
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
    // Standardize backend wrapped response ({ statusCode, data, message })
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const original = error.config;
    releaseProgress(original);
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

// Files & Folders Hierarchy APIs
export const filesApi = {
  getFilesAndFolders: (params = {}) => api.get('/files', { params }),
  createFolder: (data) => api.post('/folders', data),
  createFoldersBatch: (paths, parentId, sharedDriveId) => api.post('/files/folders/batch', { paths, parentId, sharedDriveId }),
  renameItem: (id, data) => api.patch(`/files/${id}/rename`, data),
  moveItem: (id, data) => api.patch(`/files/${id}/move`, data),
  copyItem: (id, data) => api.post(`/files/${id}/copy`, data),
  toggleStar: (id) => api.patch(`/files/${id}/star`),
  /** Cập nhật màu tùy chỉnh. Truyền color=null để reset về mặc định. */
  updateColor: (id, color) => api.patch(`/files/${id}/color`, { color }),
  moveToTrash: (id) => api.patch(`/files/${id}/trash`),
  restoreFromTrash: (id) => api.patch(`/files/${id}/restore`),
  // Gỡ cờ "Nội dung rác". KHÁC `restoreFromTrash`: tệp spam có `is_trash = false`
  // sẵn rồi, nên gọi /restore cho nó là một câu UPDATE không đổi gì — đó chính là
  // lý do "khôi phục xong không thấy tệp đâu".
  markNotSpam: (id) => api.patch(`/files/${id}/not-spam`),
  emptyTrash: () => api.delete('/files/trash/empty'),
  deletePermanently: (id) => api.delete(`/files/${id}/permanent`),
  getStorageAnalytics: () => api.get('/files/analytics'),
  getLargestFiles: (limit = 3) => api.get('/files/largest', { params: { limit } }),
  downloadZip: (fileIds) => api.post('/files/download-zip', { fileIds }, { responseType: 'blob' }),
  getFileVersions: (id) => api.get(`/files/${id}/versions`),
  getActivityLogs: (fileId) => {
    const url = fileId ? `/files/${fileId}/activity-logs` : '/files/activity-logs';
    return api.get(url);
  },
};

// Multi-Cloud Storage APIs
export const storageApi = {
  getUploadUrl: (data) => api.post('/files/upload-url', data),
  confirmUpload: (data) => api.post('/files/confirm-upload', data),
  getDownloadUrl: (id) => api.get(`/files/${id}/download-url`),
  /**
   * URL xem trước có chữ ký, qua bộ đệm.
   *
   * Trước đây mỗi lần mở cửa sổ xem trước là một lượt xin URL mới, kể cả khi
   * người dùng vừa đóng đúng tệp đó một giây trước — và trên Trang chủ, cùng
   * một tệp hiện ở ba khu vực nên ba thẻ xin ba lần. URL do backend phát sống
   * 15 phút, giữ lại 10 phút là an toàn.
   */
  getPreviewUrl: (id) => previewUrlCache.get(String(id), () => api.get(`/files/${id}/preview-url`)),

  /**
   * Bỏ URL xem trước đã đệm của MỘT tệp để lần gọi sau xin chữ ký mới.
   *
   * Dùng khi thẻ <video>/<audio> báo lỗi: nghi phạm số một là chữ ký đã hết hạn
   * giữa lúc phát (xem `resolvePreviewUrlTtlSeconds` ở backend), mà URL cũ vẫn
   * còn trong bộ đệm nên thử lại bằng nó thì chỉ ăn đúng cái 403 lần nữa.
   */
  invalidatePreviewUrl: (id) => previewUrlCache.invalidate(String(id)),

  /** Nội dung văn bản cho khung xem trước code / text / markdown. Xem chú thích trên. */
  getFileTextContent: (id) => fileTextCache.get(String(id), () => api.get(`/files/${id}/content`)),

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

    return api.post('/files/upload-proxy', formData, {
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
    });
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
    api.post('/files/upload-chunk/init', data),

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
  complete: (data) =>
    api.post('/files/upload-chunk/complete', data),

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
  createShareLink: (id, data) => api.post(`/files/${id}/share`, data),
  /** Lấy danh sách người được chia sẻ trực tiếp (yêu cầu đăng nhập) */
  getShareAccess: (id) => api.get(`/files/${id}/share-access`),
  /** Thêm quyền truy cập cho người dùng cụ thể (yêu cầu đăng nhập) */
  addShareAccess: (id, data) => api.post(`/files/${id}/share-access`, data),
  /** Thu hồi quyền truy cập của một người dùng (yêu cầu đăng nhập) */
  removeShareAccess: (id, userId) => api.delete(`/files/${id}/share-access/${userId}`),
};

// Shared Drives APIs
export const sharedDrivesApi = {
  create: (data) => api.post('/shared-drives', data),
  getAll: () => api.get('/shared-drives'),
  getOne: (id) => api.get(`/shared-drives/${id}`),
  // Đổi tên / sửa mô tả — chỉ ADMIN của drive. data: { name?, description? }
  update: (id, data) => api.patch(`/shared-drives/${id}`, data),
  // ⚠️ Xóa cả drive, kéo theo MỌI tệp/thư mục bên trong (FK ON DELETE CASCADE).
  // Chỉ người tạo drive gọi được. Trả về { deletedItems }.
  remove: (id) => api.delete(`/shared-drives/${id}`),
  // Dấu sao RIÊNG của từng người (lưu ở hàng shared_drive_members của người gọi, migration
  // 011): bật/tắt chỉ ảnh hưởng chính mình. Mọi role đều gọi được. Trả về { id, isStarred }
  // với `id` là id của DRIVE.
  toggleStar: (id) => api.patch(`/shared-drives/${id}/star`),
  // data: { email, role } — hoặc { userId, role } cho caller cũ
  addMember: (id, data) => api.post(`/shared-drives/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/shared-drives/${id}/members/${userId}`),
};

// Billing / Thanh toán (payOS)
//
// payOS là cổng DUY NHẤT: nó phát mã VietQR nên mọi app ngân hàng Việt Nam đều quét được,
// không cần tích hợp riêng từng ví. Vì vậy không có tham số chọn cổng ở đây.
export const billingApi = {
  // Bảng giá lấy từ DB (chỉ gói is_active). Trả [{ id, name, storageBytes, storageGB,
  // priceMonthly, priceYearly }] đã sắp theo priceMonthly tăng dần.
  // Qua bộ đệm 10 phút: bảng giá chỉ đổi khi vận hành sửa nó, nhưng trang Gói
  // dịch vụ tải lại nguyên bảng mỗi lần người dùng ghé qua.
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

// ───────────────────────────── Hỏi AI (Vertex AI / Gemini) ─────────────────────────────
//
// Ngữ cảnh do BACKEND dựng, không phải frontend: nội dung tệp nằm trên cloud storage
// và chỉ backend mới có quyền đọc nó. Frontend chỉ gửi `itemId` — nhờ vậy quyền truy
// cập được kiểm đúng một lần, ở nơi vốn đã kiểm cho xem trước/tải xuống.
export const aiApi = {
  // { enabled, model } — gọi lúc mở khung chat để biết nên hiện khung nhập hay
  // hiện dòng "chưa bật AI", thay vì để người dùng gõ xong mới nhận 503.
  getStatus: () => api.get('/ai/status'),

  /**
   * Hỏi một câu về tệp/thư mục.
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

