import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { authApi, userApi, startSessionKeeper, bindPageOwner } from '../services/api';
import { writeDiscoverableByEmail, bindShareRoleOwner } from '../constants/privacy';
import { LEGAL_VERSION, needsTermsAcceptance } from '../constants/legal';
import { subjectOf } from '../utils/jwt';
import { resetSharedCaches } from '../utils/ttlCache';
import { useLanguage } from './LanguageContext';
import { safeLocalStorage, safeSessionStorage } from '../utils/safeStorage';

const AuthContext = createContext(null);

/**
 * Lời nhắn gửi cho CHÍNH trang sau lần tải lại của một lượt chuyển / đăng xuất tài khoản (##89):
 * trang tải lại nên toast hiện trước đó không sống được. sessionStorage — chỉ tab này, tự mất
 * khi đóng tab — và mang `userId` để chỉ hiện khi đúng tài khoản đó đã vào được.
 */
const ACCOUNT_NOTICE_KEY = 'driver:accountNotice';

function leaveAccountNotice(notice) {
  safeSessionStorage.setItem(ACCOUNT_NOTICE_KEY, JSON.stringify(notice));
}

function takeAccountNotice() {
  const raw = safeSessionStorage.getItem(ACCOUNT_NOTICE_KEY);
  if (!raw) return null;
  safeSessionStorage.removeItem(ACCOUNT_NOTICE_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Dọn bộ đệm trên ĐĨA (IndexedDB, cache Service Worker) trước khi rời trang — có trần thời gian:
 * đĩa treo không được giữ người dùng ở lại trong phiên vừa rời. Xem `endSession`.
 */
function purgeDiskCaches() {
  return Promise.race([
    resetSharedCaches(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

export function AuthProvider({ children }) {
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => safeLocalStorage.getItem('accessToken'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Trang này vừa được backend đưa về từ callback OAuth và đang cầm một mã chờ đổi?
  //
  // Đọc URL trong initializer của useState (lần render ĐẦU), không đọc trong effect: lượt
  // đổi mã là một request mạng, còn effect nạp hồ sơ bên dưới chạy trước đó và sẽ
  // `setIsLoading(false)` vì localStorage còn trống. Không có cờ này thì người vừa đăng
  // nhập OAuth thấy màn /login nháy lên một nhịp rồi mới vào được app.
  const [oauthPending, setOauthPending] = useState(
    () => new URLSearchParams(window.location.search).has('oauth_code'),
  );

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      // Token hết hạn (gần như mọi lần mở app) thì refresh trước và lấy hồ sơ đi kèm, khỏi
      // gọi `/auth/me` — xem `authApi.getSessionProfile` (##85).
      const profile = await authApi.getSessionProfile();
      // getProfile() trả { user: {...} } (wrapped bởi transform.interceptor)
      // login() đã xử lý đúng: data.user || data — áp dụng nhất quán ở đây
      const nextUser = profile.user ?? profile;

      // Hồ sơ trả về PHẢI đúng chủ của token đang nằm trong localStorage. Hai thứ
      // này lệch nhau được là vì localStorage dùng chung cho mọi tab cùng origin:
      // đăng nhập tài khoản khác ở tab B là tab A lập tức gửi request bằng token
      // của B trong khi vẫn đang vẽ hồ sơ của A. Trước đây chỗ này setUser() thẳng
      // → tab A âm thầm biến thành tài khoản B.
      const tokenSubject = subjectOf(safeLocalStorage.getItem('accessToken'));
      if (tokenSubject && nextUser?.id && nextUser.id !== tokenSubject) {
        console.error('[Auth] Hồ sơ trả về không khớp token đang giữ — huỷ phiên.');
        throw new Error('Phiên đăng nhập không khớp tài khoản');
      }

      setUser(nextUser);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setUser(null);
      setAccessToken(null);
      safeLocalStorage.removeItem('accessToken');
      resetSharedCaches();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Đang đổi mã OAuth: token trong localStorage (nếu có) là của phiên TRƯỚC — rất có thể của
    // một tài khoản KHÁC (quay về từ Google/GitHub sau "Thêm tài khoản", ##89). Nạp hồ sơ bằng nó
    // là vẽ dữ liệu của người cũ trong lúc chờ, rồi đua với lượt đổi mã: hồ sơ cũ về SAU thì chốt
    // "hồ sơ không khớp token" đăng xuất luôn phiên mới. Chờ lượt đổi mã xong rồi mới nạp.
    if (oauthPending) return;
    if (accessToken) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }
  }, [accessToken, fetchProfile, oauthPending]);

  // Giữ phiên sống trong lúc người dùng đang làm việc (lỗi #10): làm mới access token
  // TRƯỚC khi nó hết hạn, thay vì đợi một request nào đó lĩnh 401 rồi mới chữa.
  //
  // Không phụ thuộc vào `accessToken` để chạy lại mỗi lần token đổi: bản thân
  // `startSessionKeeper` đọc token trực tiếp từ localStorage ở mỗi nhịp, và các lượt
  // refresh chỉ ghi vào localStorage (không đi qua state này). Chỉ cần bật khi có phiên
  // và tắt khi đăng xuất.
  useEffect(() => {
    if (!accessToken) return undefined;
    return startSessionKeeper();
  }, [accessToken]);

  // Token trong localStorage bị TAB KHÁC ghi đè (đăng nhập tài khoản khác, hoặc
  // đăng xuất). Sự kiện 'storage' chỉ bắn sang các tab KHÁC tab vừa ghi — đúng
  // thứ cần: tab này đang giữ hồ sơ cũ trong React state, còn mọi request từ đây
  // đã đi bằng token mới (interceptor đọc lại localStorage ở từng request), nên
  // im lặng là biến thành người khác lúc nào không hay.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'accessToken') return;

      const nextToken = e.newValue;
      if (!nextToken) {
        // Tab khác đăng xuất → tab này cũng phải rời phiên, và cũng bằng TẢI LẠI như
        // `endSession`: chỉ xoá `user` thì panel AI / danh sách tệp của người vừa đăng xuất
        // vẫn nằm trên màn /login của tab này cho ai ngồi vào máy tiếp theo (##69).
        // `reload()` giữ nguyên URL: route /app tự đưa về /login, còn tab đang ở trang chia
        // sẻ công khai thì ở lại đó.
        setAccessToken(null);
        setUser(null);
        window.location.reload();
        return;
      }

      // Cùng một chủ (chỉ là token vừa được làm mới) thì không đụng gì tới UI.
      if (subjectOf(nextToken) === subjectOf(e.oldValue)) return;

      // Đổi chủ: nạp lại từ đầu thay vì vá state từng mảnh — FileContext,
      // UploadContext... đều đang giữ dữ liệu của tài khoản cũ.
      window.location.reload();
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Nạp cache hiển thị của công tắc "Hiển thị thông tin cá nhân" từ hồ sơ server.
  //
  // Đặt ở useEffect([user]) thay vì chèn vào fetchProfile() và login(): cả hai đều kết
  // thúc bằng setUser(), nên lắng nghe `user` là bắt được CẢ HAI đường bằng một chỗ ghi
  // duy nhất — kể cả đường thứ ba sau này (refreshUser, hay OAuth token trên URL cũng đi
  // qua fetchProfile). Chép logic vào từng hàm thì thêm một luồng nạp hồ sơ mới là lại
  // quên một chỗ.
  //
  // Vấn đề được sửa CHỈ là hiển thị: việc chặn đã đúng vì backend đọc thẳng cột
  // users.is_discoverable_by_email. Nhưng máy mới hoặc vừa xoá dữ liệu trình duyệt có
  // localStorage trống → readDiscoverableByEmail() rơi về mặc định BẬT và SettingsModal
  // vẽ ra công tắc BẬT trong khi DB đang là false; người dùng tưởng mình đang cho tìm
  // qua email, thực ra đang bị chặn.
  //
  // typeof === 'boolean' chứ không phải `!== undefined` hay truthy: `user` là null lúc
  // chưa đăng nhập, và backend cũ chưa trả field này thì giá trị là undefined — ghi bừa
  // lúc đó sẽ đè cache đúng bằng một giá trị bịa ra. Chỉ ghi khi server thật sự có nói.
  useEffect(() => {
    if (typeof user?.isDiscoverableByEmail === 'boolean') {
      writeDiscoverableByEmail(user.isDiscoverableByEmail);
    }
  }, [user]);

  // Quyền chia sẻ mặc định là cài đặt của TÀI KHOẢN, không của trình duyệt (##79): người đăng
  // nhập sau trên cùng máy không được thừa hưởng "Được chỉnh sửa" của người trước.
  useEffect(() => {
    bindShareRoleOwner(user?.id ?? null);
  }, [user?.id]);

  /**
   * @param {string} email
   * @param {string} password
   * @param {object} [extraPayload] Field phụ ghép vào body — hiện dùng cho
   *   `{ captchaToken }` mà `useTurnstile().payload()` trả về. Nhận nguyên một
   *   object thay vì thêm tham số `captchaToken` riêng: backend còn hai endpoint
   *   nữa sẽ bắt CAPTCHA (docs/sercurity.md mục 5), và cách này không phải sửa
   *   lại chữ ký mỗi lần thêm field.
   */
  // Người dùng mà TRANG NÀY đã nạp dữ liệu cho (id), kể cả sau khi `user` về null. Chỉ một
  // lần tải lại trang mới xoá được nó — đúng như dữ liệu trong RAM mà nó canh. Xem
  // `applySession`.
  const pageOwnerRef = useRef(null);
  useEffect(() => {
    if (user?.id) {
      pageOwnerRef.current = user.id;
      // Từ giờ trang này chỉ gửi request bằng token của đúng tài khoản này (##89) — xem
      // `bindPageOwner` ở services/api.js.
      bindPageOwner(user.id);
    }
  }, [user?.id]);

  // Lời nhắn của lượt chuyển / đăng xuất tài khoản vừa rồi (trang vừa tải lại).
  useEffect(() => {
    if (!user?.id) return;
    const notice = takeAccountNotice();
    if (!notice || notice.userId !== user.id) return;
    if (notice.kind === 'switched') {
      toast.success(t('account.switch.done', { email: user.email }), { id: 'account-notice' });
    } else if (notice.kind === 'signedOut') {
      toast.success(t('account.signedOut.switched', { from: notice.from, email: user.email }), {
        id: 'account-notice',
        duration: 6000,
      });
    } else if (notice.kind === 'deleted') {
      toast.success(t('profile.delete.done'), { id: 'account-notice', duration: 6000 });
    }
  }, [user?.id, user?.email, t]);

  /**
   * Lưu phiên vừa nhận được. Dùng chung cho bước 2 của đăng nhập (`verifyLoginOtp`) —
   * tách ra để chỗ nào phát sinh phiên cũng ghi localStorage + state theo đúng một cách.
   *
   * Phiên MỚI thuộc người KHÁC người trang này đã phục vụ (vd đang đăng nhập A, mở /login
   * qua một link trong app rồi đăng nhập B, không qua nút Đăng xuất) ⇒ tải lại trang vào
   * /app. Panel AI, danh sách tệp, hàng đợi upload… của A đang nằm trong RAM và không gắn
   * với user nào; vá từng chỗ là sớm muộn sót một chỗ (##69).
   */
  const applySession = useCallback((data) => {
    const token = data.accessToken || data.token;
    if (token) {
      safeLocalStorage.setItem('accessToken', token);
      setAccessToken(token);
    }
    const userProfile = data.user || data;
    const nextOwner = subjectOf(token) ?? userProfile?.id ?? null;
    if (pageOwnerRef.current && nextOwner && nextOwner !== pageOwnerRef.current) {
      // Đăng nhập THÊM một tài khoản (##89): tài khoản trước vẫn ở lại trong hộp phiên.
      leaveAccountNotice({ kind: 'switched', userId: nextOwner });
      window.location.replace('/app');
      return userProfile;
    }
    setUser(userProfile);
    return userProfile;
  }, []);

  /**
   * BƯỚC CUỐI của đăng nhập OAuth: đổi `?oauth_code=` trên URL lấy phiên thật.
   *
   * Trước đây backend đặt cookie refresh ngay trong callback OAuth rồi đưa access token về
   * đây qua `?token=`. Cả hai nửa đều sai:
   *   • Cookie: callback là một lượt điều hướng TOP-LEVEL tới `*.herokuapp.com`, nên trình
   *     duyệt xếp cookie vào phân vùng của herokuapp.com (CHIPS của Chrome, Tổng bảo vệ
   *     cookie của Firefox). Mọi `POST /auth/refresh` sau đó là XHR từ frontend nên mang
   *     phân vùng khác và không bao giờ thấy cookie ấy — người đăng nhập OAuth sống đúng
   *     một hạn access token rồi bị đá ra, không có đường phục hồi.
   *   • Token trên URL: nó nằm lại trong lịch sử trình duyệt và có thể lọt vào `Referer`.
   *
   * Gọi bằng XHR từ đây thì cookie được đặt trong ĐÚNG phân vùng sẽ dùng nó, và trên URL
   * chỉ còn một mã sống 60 giây, dùng một lần.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oauth_code');

    // Đường CŨ, giữ lại cho cửa sổ deploy: frontend lên Vercel trước backend, nên trong
    // khoảng đó backend vẫn còn đưa về `?token=`. Xoá được sau khi backend đã deploy.
    const legacyToken = params.get('token');

    if (!code) {
      if (legacyToken) {
        safeLocalStorage.setItem('accessToken', legacyToken);
        setAccessToken(legacyToken);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return;
    }

    // Xoá mã khỏi URL NGAY, trước mọi `await`: mã là dùng-một-lần, nên một lượt đổi thứ
    // hai (StrictMode gọi effect hai lần ở dev, hay người dùng bấm F5) chắc chắn nhận 401.
    // Xoá đồng bộ ở đây thì lần đọc thứ hai không còn thấy gì.
    window.history.replaceState({}, document.title, window.location.pathname);

    // KHÔNG có cleanup huỷ lượt đổi mã, và đó là chủ ý. `<StrictMode>` ở dev chạy effect
    // hai lần (effect → cleanup → effect) trong cùng một commit; một cờ `cancelled` bật ở
    // cleanup sẽ giết đúng lượt đổi mã DUY NHẤT, còn lượt thứ hai thì đọc URL đã bị xoá
    // nên không làm gì — kết quả là app treo ở màn tải, chỉ ở dev.
    //
    // Không cần cleanup vì lượt đổi mã cũng chỉ chạy MỘT lần: `replaceState` ở trên là
    // đồng bộ, nên lượt effect thứ hai thấy URL đã sạch và thoát ngay ở nhánh `!code`.
    // Provider này thực tế không unmount trong đời một lần tải trang.
    authApi
      .exchangeOAuthCode(code)
      .then((data) => applySession(data))
      .catch((err) => {
        console.error('[Auth] Đổi mã đăng nhập OAuth thất bại:', err);
        // Mã hết hạn / đã dùng (401) hay dịch vụ nghẽn (503) — cả hai đều là "chưa đăng
        // nhập được", nên đưa về /login kèm lý do thay vì để người dùng đứng ở /app trống.
        window.location.replace('/login?error=oauth_exchange_failed');
      })
      .finally(() => setOauthPending(false));
  }, [applySession]);

  /**
   * BƯỚC 1 của đăng nhập: gửi email + mật khẩu + captchaToken.
   *
   * KHÔNG còn trả về hồ sơ người dùng — backend nay trả `{ requiresOtp: true }` và mã đã
   * được gửi tới email. Người gọi phải chuyển sang màn nhập mã rồi gọi `verifyLoginOtp()`.
   *
   * Vẫn xử lý nhánh `accessToken` để phòng trường hợp gọi tới một backend bản cũ chưa bật
   * OTP — khi đó đăng nhập xong ngay ở bước này.
   */
  const login = useCallback(async (email, password, extraPayload = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await authApi.login({ email, password, ...extraPayload });

      if (data?.requiresOtp) {
        return { requiresOtp: true, email: data.email || email, expiresInSeconds: data.expiresInSeconds };
      }

      return { requiresOtp: false, user: applySession(data) };
    } catch (err) {
      setError(err.message || t('login.failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applySession, t]);

  /** BƯỚC 2 của đăng nhập: đổi mã OTP lấy phiên thật. */
  const verifyLoginOtp = useCallback(async (email, otp) => {
    try {
      setIsLoading(true);
      setError(null);
      return applySession(await authApi.verifyLoginOtp({ email, otp }));
    } catch (err) {
      setError(err.message || t('otp.verifyFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applySession, t]);

  /**
   * BƯỚC 1 của đăng ký: gửi TOÀN BỘ thông tin tài khoản + captchaToken để xin mã.
   *
   * Backend băm mật khẩu rồi cất tạm trong Redis 10 phút, nên bước 2 chỉ cần email + mã —
   * màn nhập OTP không phải giữ lại mật khẩu.
   */
  const sendRegisterOtp = useCallback(async (email, password, fullName, extraPayload = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      return await authApi.sendRegisterOtp({ email, password, fullName, ...extraPayload });
    } catch (err) {
      setError(err.message || t('otp.sendFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  /** BƯỚC 2 của đăng ký: đổi mã lấy tài khoản thật. */
  const verifyRegisterOtp = useCallback(async (email, otp) => {
    try {
      setIsLoading(true);
      setError(null);
      return await authApi.verifyRegisterOtp({ email, otp });
    } catch (err) {
      setError(err.message || t('register.failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // ── QUÊN MẬT KHẨU (3 bước) ──────────────────────────────────────────────────
  //
  // Ba hàm này KHÔNG đặt `error` vào context như login/register: trang quên mật khẩu tự
  // giữ câu lỗi của riêng nó. Dùng chung `error` sẽ khiến lỗi còn sót từ một lần đăng nhập
  // hỏng trước đó hiện ra ngay khi vừa mở trang.

  /** BƯỚC 1: xin mã. `extraPayload` mang `{ captchaToken }`. */
  const forgotPassword = useCallback(async (email, extraPayload = {}) => {
    setIsLoading(true);
    try {
      return await authApi.forgotPassword({ email, ...extraPayload });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** BƯỚC 2: đổi mã lấy `resetToken` sống 15 phút. */
  const verifyResetOtp = useCallback(async (email, otp) => {
    setIsLoading(true);
    try {
      return await authApi.verifyResetOtp({ email, otp });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** BƯỚC 3: đổi `resetToken` lấy mật khẩu mới. Backend thu hồi mọi phiên đang mở. */
  const resetPassword = useCallback(async (resetToken, newPassword) => {
    setIsLoading(true);
    try {
      return await authApi.resetPassword({ resetToken, newPassword });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Đăng xuất. `await` lượt gọi server TRƯỚC khi xoá state cục bộ, nhưng không để
   * lỗi mạng chặn việc đăng xuất tại chỗ: cái người dùng thấy phải luôn là "đã ra".
   *
   * Bắt buộc phải gọi POST /auth/logout: cookie `refreshToken` là HttpOnly (JS
   * không xoá được) và phiên vẫn còn trong DB. Bỏ qua bước này thì máy dùng chung
   * giữ nguyên cookie 7 ngày, và lần refresh sau đó dựng lại đúng phiên vừa "đăng
   * xuất" — cho tài khoản khác đang ngồi trên chính trình duyệt đó.
   *
   * KẾT THÚC BẰNG TẢI LẠI TRANG tới `redirectTo`, không phải `navigate`. Panel AI
   * (`AiPanelProvider`), danh sách tệp + dung lượng (`FileContext`), hàng đợi upload… nằm
   * TRÊN router và không gắn với user nào, nên chuyển trang kiểu SPA giữ nguyên chúng: đo
   * ngày 02/10/2026, người đăng nhập kế tiếp trong cùng tab bấm vào bong bóng AI là đọc
   * nguyên cuộc trò chuyện của người trước, và thấy danh sách tệp của họ cho tới khi
   * request của mình về (##69). Tải lại là cách duy nhất không phải nhớ từng chỗ.
   */
  //
  // `onlyUserId` (##89): chỉ đăng xuất tài khoản đó khỏi trình duyệt này. Còn tài khoản khác đang
  // đăng nhập thì backend chuyển luôn sang tài khoản dùng gần nhất (`switchedTo`) và trang tải lại
  // vào `/app` bằng phiên đó, kèm `notice` cho trang sau.
  const endSession = useCallback(async (redirectTo, { onlyUserId, notice } = {}) => {
    let switchedTo = null;
    try {
      const res = await authApi.logout(onlyUserId ? { userId: onlyUserId } : undefined);
      switchedTo = onlyUserId && res?.switchedTo?.accessToken ? res.switchedTo : null;
    } catch (err) {
      console.error('[Auth] Gọi /auth/logout thất bại (vẫn xoá phiên cục bộ):', err);
    } finally {
      if (!switchedTo) {
        safeLocalStorage.removeItem('accessToken');
        setAccessToken(null);
        setUser(null);
      }
      // Các bộ đệm trên ĐĨA (IndexedDB, cache Service Worker) sống qua lần tải lại — phải
      // xoá xong rồi mới rời trang, nếu không giao dịch đang dở bị huỷ theo trang. Có trần
      // thời gian: đĩa treo không được giữ người dùng ở lại trong phiên vừa đăng xuất.
      await purgeDiskCaches();
      if (switchedTo) {
        // Ghi token của tài khoản kế tiếp SAU khi dọn đĩa, sát lúc rời trang: ghi sớm hơn thì
        // trong lúc chờ đĩa, chốt chặn đổi chủ (services/api.js) chặn request của trang này và tự
        // tải lại ngay tại URL cũ — thư mục của tài khoản vừa rời — thay vì vào /app.
        safeLocalStorage.setItem('accessToken', switchedTo.accessToken);
        if (notice) leaveAccountNotice({ ...notice, userId: switchedTo.user?.id });
        window.location.replace('/app');
      } else {
        window.location.replace(redirectTo);
      }
    }
  }, []);

  // Bọc lại để không nhận tham số: `onClick={logout}` truyền sự kiện chuột vào đây.
  // Không kèm tài khoản nào ⇒ đăng xuất MỌI tài khoản trên trình duyệt này.
  const logout = useCallback(() => endSession('/login'), [endSession]);

  // ── NHIỀU TÀI KHOẢN TRÊN MỘT TRÌNH DUYỆT (##89) ─────────────────────────────────────
  //
  // Danh sách chỉ nằm trong RAM của trang này (không localStorage): tên và email của những
  // người cùng dùng máy không được nằm lại trên đĩa sau khi họ đã đăng xuất.
  //
  // `null` = chưa hỏi, hoặc backend chưa có tính năng — giao diện ẩn mục chuyển tài khoản.
  const [signedInAccounts, setSignedInAccounts] = useState(null);
  const [maxSignedInAccounts, setMaxSignedInAccounts] = useState(0);

  /** Hỏi lại backend danh sách tài khoản đang đăng nhập trên trình duyệt này. */
  const refreshSignedInAccounts = useCallback(async () => {
    try {
      const data = await authApi.listAccounts();
      setSignedInAccounts(data ? data.accounts || [] : null);
      setMaxSignedInAccounts(data?.maxAccounts || 0);
      return data;
    } catch (err) {
      console.warn('[Auth] Không tải được danh sách tài khoản đang đăng nhập:', err);
      return null;
    }
  }, []);

  /**
   * Chuyển sang một tài khoản khác đang đăng nhập trên trình duyệt này.
   *
   * KẾT THÚC BẰNG TẢI LẠI vào /app, cùng lý do `applySession` khi đổi chủ (##69): danh sách tệp,
   * panel AI, hàng đợi upload… trong RAM là của tài khoản cũ. Bộ đệm trên đĩa KHÔNG cần xoá — mọi
   * khoá đã mang id tài khoản (`cacheScope`), tài khoản mới không đọc trúng được bản của tài khoản
   * cũ — nên quay lại tài khoản cũ vẫn mở nhanh. NÉM lỗi ra ngoài để menu nói được vì sao.
   */
  const switchAccount = useCallback(async (userId) => {
    const session = await authApi.switchAccount(userId);
    if (!session?.accessToken) throw new Error(t('common.genericError'));
    safeLocalStorage.setItem('accessToken', session.accessToken);
    leaveAccountNotice({ kind: 'switched', userId: session.user?.id ?? userId });
    window.location.replace('/app');
  }, [t]);

  /**
   * Đăng xuất MỘT tài khoản khỏi trình duyệt này.
   *  • Tài khoản đang dùng: như `logout`, nhưng còn tài khoản khác thì vào luôn tài khoản đó.
   *  • Tài khoản khác: thu hồi phiên của nó, ở lại tài khoản hiện tại. Vẫn xoá bộ đệm trên đĩa —
   *    tên tệp của người vừa rời máy không được nằm lại (xoá luôn của người đang dùng; cái giá
   *    chỉ là lần mở thư mục kế tiếp chậm hơn một nhịp).
   */
  const signOutAccount = useCallback(async (userId) => {
    if (!userId) return;
    if (userId === user?.id) {
      await endSession('/login', {
        onlyUserId: userId,
        notice: { kind: 'signedOut', from: user?.email },
      });
      return;
    }
    await authApi.logout({ userId });
    await purgeDiskCaches();
    await refreshSignedInAccounts();
  }, [user?.id, user?.email, endSession, refreshSignedInAccounts]);

  /**
   * Người đang đăng nhập bấm đồng ý ở màn chặn (`TermsAcceptanceGate`).
   *
   * `setUser` bằng hồ sơ server TRẢ VỀ, không phải vá `termsAcceptedAt` vào state
   * cũ: endpoint trả nguyên hình dạng của `GET /auth/me`, nên nhận nguyên khối là
   * không có chỗ nào để lệch. Chính lượt setUser này là thứ dỡ màn chặn — điều
   * kiện chặn đọc từ `user`.
   *
   * NÉM tiếp lỗi ra ngoài: màn chặn cần biết để hiện câu lỗi và bật lại nút. Nuốt
   * ở đây thì người dùng bấm "Đồng ý" và không có gì xảy ra cả.
   */
  const acceptTerms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await authApi.acceptTerms({
        acceptedTerms: true,
        termsVersion: LEGAL_VERSION,
      });
      setUser(data.user ?? data);
    } catch (err) {
      setError(err.message || t('legal.gate.failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const currentUserId = user?.id;
  const deleteAccount = useCallback(async (credentials) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await userApi.deleteMyAccount(credentials);
      // Trang tải lại nên toast "đã xoá" của modal không sống được — trang đăng nhập tự báo
      // theo `?notice=`. Chỉ rời ĐÚNG tài khoản vừa xoá (##89): còn tài khoản khác đăng nhập trên
      // trình duyệt này thì vào luôn tài khoản đó, lời báo đi theo `notice`.
      await endSession('/login?notice=account_deleted', {
        onlyUserId: currentUserId,
        notice: { kind: 'deleted' },
      });
      return res;
    } catch (err) {
      setError(err.message || t('account.deleteFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [endSession, t, currentUserId]);

  // Bọc trong useMemo: object literal trần ở đây là một reference MỚI sau mỗi
  // lần AuthProvider render, nên mọi component gọi useAuth() — Sidebar, Header,
  // FileProvider, từng modal — đều re-render theo, kể cả khi phiên đăng nhập
  // không đổi gì. Mọi hàm bên dưới đã là useCallback nên chúng không tự làm hỏng
  // memo này; identity chỉ đổi khi user/token/isLoading/error hoặc ngôn ngữ đổi.
  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: !!user && !!accessToken,
    isLoading,
    error,
    login,
    verifyLoginOtp,
    sendRegisterOtp,
    verifyRegisterOtp,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    logout,
    deleteAccount,
    refreshUser: fetchProfile,

    // Nhiều tài khoản trên một trình duyệt (##89)
    signedInAccounts,
    maxSignedInAccounts,
    refreshSignedInAccounts,
    switchAccount,
    signOutAccount,

    /**
     * Phải hiện màn "đồng ý điều khoản" trước khi cho dùng app hay không.
     *
     * Tính ở đây thay vì để từng component tự đọc `user.termsAcceptedAt`: điều
     * kiện này có một cái bẫy thật (phân biệt `null` với `undefined` — xem
     * `needsTermsAcceptance` trong constants/legal.js) và nó chỉ đúng nếu MỌI nơi
     * đọc đều nhớ cái bẫy đó.
     *
     * `isAuthenticated &&` vì màn chặn chỉ có nghĩa với người đã có phiên: người
     * chưa đăng nhập thì `user` là null, mà cổng của họ nằm ở trang đăng ký.
     */
    needsTermsAcceptance: !!user && !!accessToken && needsTermsAcceptance(user),
    acceptTerms,
  }), [
    user, accessToken, isLoading, error,
    login, verifyLoginOtp, sendRegisterOtp, verifyRegisterOtp,
    forgotPassword, verifyResetOtp, resetPassword, logout, deleteAccount, fetchProfile,
    acceptTerms,
    signedInAccounts, maxSignedInAccounts, refreshSignedInAccounts, switchAccount, signOutAccount,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
