import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi, userApi, startSessionKeeper } from '../services/api';
import { writeDiscoverableByEmail } from '../constants/privacy';
import { LEGAL_VERSION, needsTermsAcceptance } from '../constants/legal';
import { subjectOf } from '../utils/jwt';
import { resetSharedCaches } from '../utils/ttlCache';
import { useLanguage } from './LanguageContext';
import { safeLocalStorage } from '../utils/safeStorage';

const AuthContext = createContext(null);

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
      const profile = await authApi.getProfile();
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
    if (accessToken) {
      fetchProfile();
    } else if (!oauthPending) {
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
        // Tab khác đăng xuất → tab này cũng phải rời phiên.
        setAccessToken(null);
        setUser(null);
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

  /**
   * @param {string} email
   * @param {string} password
   * @param {object} [extraPayload] Field phụ ghép vào body — hiện dùng cho
   *   `{ captchaToken }` mà `useTurnstile().payload()` trả về. Nhận nguyên một
   *   object thay vì thêm tham số `captchaToken` riêng: backend còn hai endpoint
   *   nữa sẽ bắt CAPTCHA (docs/sercurity.md mục 5), và cách này không phải sửa
   *   lại chữ ký mỗi lần thêm field.
   */
  /**
   * Lưu phiên vừa nhận được. Dùng chung cho bước 2 của đăng nhập (`verifyLoginOtp`) —
   * tách ra để chỗ nào phát sinh phiên cũng ghi localStorage + state theo đúng một cách.
   */
  const applySession = useCallback((data) => {
    const token = data.accessToken || data.token;
    if (token) {
      safeLocalStorage.setItem('accessToken', token);
      setAccessToken(token);
    }
    const userProfile = data.user || data;
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
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('[Auth] Gọi /auth/logout thất bại (vẫn xoá phiên cục bộ):', err);
    } finally {
      safeLocalStorage.removeItem('accessToken');
      setAccessToken(null);
      setUser(null);
      // Các bộ đệm ở phạm vi module (URL xem trước, nội dung tệp, danh sách
      // phiên) không chết theo việc unmount cây React — phải đốt bằng tay, nếu
      // không người đăng nhập tiếp theo trên máy này sẽ đọc trúng dữ liệu cũ.
      resetSharedCaches();
    }
  }, []);

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

  const deleteAccount = useCallback(async (password) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await userApi.deleteMyAccount(password);
      await logout();
      return res;
    } catch (err) {
      setError(err.message || t('account.deleteFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [logout, t]);

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
