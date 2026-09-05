import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi, userApi, startSessionKeeper } from '../services/api';
import { writeDiscoverableByEmail } from '../constants/privacy';
import { subjectOf } from '../utils/jwt';
import { resetSharedCaches } from '../utils/ttlCache';
import { useLanguage } from './LanguageContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('accessToken'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
      const tokenSubject = subjectOf(localStorage.getItem('accessToken'));
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
      localStorage.removeItem('accessToken');
      resetSharedCaches();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      localStorage.setItem('accessToken', tokenFromUrl);
      setAccessToken(tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }
  }, [accessToken, fetchProfile]);

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
      localStorage.setItem('accessToken', token);
      setAccessToken(token);
    }
    const userProfile = data.user || data;
    setUser(userProfile);
    return userProfile;
  }, []);

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
      localStorage.removeItem('accessToken');
      setAccessToken(null);
      setUser(null);
      // Các bộ đệm ở phạm vi module (URL xem trước, nội dung tệp, danh sách
      // phiên) không chết theo việc unmount cây React — phải đốt bằng tay, nếu
      // không người đăng nhập tiếp theo trên máy này sẽ đọc trúng dữ liệu cũ.
      resetSharedCaches();
    }
  }, []);

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
  }), [
    user, accessToken, isLoading, error,
    login, verifyLoginOtp, sendRegisterOtp, verifyRegisterOtp,
    forgotPassword, verifyResetOtp, resetPassword, logout, deleteAccount, fetchProfile,
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
