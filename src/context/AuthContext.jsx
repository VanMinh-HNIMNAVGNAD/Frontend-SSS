import { createContext, useContext, useState, useEffect } from 'react';
import { authApi, userApi } from '../services/api';
import { writeDiscoverableByEmail } from '../constants/privacy';
import { useLanguage } from './LanguageContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('accessToken'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const profile = await authApi.getProfile();
      // getProfile() trả { user: {...} } (wrapped bởi transform.interceptor)
      // login() đã xử lý đúng: data.user || data — áp dụng nhất quán ở đây
      setUser(profile.user ?? profile);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('accessToken');
    } finally {
      setIsLoading(false);
    }
  };

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
  }, [accessToken]);

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
  const applySession = (data) => {
    const token = data.accessToken || data.token;
    if (token) {
      localStorage.setItem('accessToken', token);
      setAccessToken(token);
    }
    const userProfile = data.user || data;
    setUser(userProfile);
    return userProfile;
  };

  /**
   * BƯỚC 1 của đăng nhập: gửi email + mật khẩu + captchaToken.
   *
   * KHÔNG còn trả về hồ sơ người dùng — backend nay trả `{ requiresOtp: true }` và mã đã
   * được gửi tới email. Người gọi phải chuyển sang màn nhập mã rồi gọi `verifyLoginOtp()`.
   *
   * Vẫn xử lý nhánh `accessToken` để phòng trường hợp gọi tới một backend bản cũ chưa bật
   * OTP — khi đó đăng nhập xong ngay ở bước này.
   */
  const login = async (email, password, extraPayload = {}) => {
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
  };

  /** BƯỚC 2 của đăng nhập: đổi mã OTP lấy phiên thật. */
  const verifyLoginOtp = async (email, otp) => {
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
  };

  /**
   * BƯỚC 1 của đăng ký: gửi TOÀN BỘ thông tin tài khoản + captchaToken để xin mã.
   *
   * Backend băm mật khẩu rồi cất tạm trong Redis 10 phút, nên bước 2 chỉ cần email + mã —
   * màn nhập OTP không phải giữ lại mật khẩu.
   */
  const sendRegisterOtp = async (email, password, fullName, extraPayload = {}) => {
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
  };

  /** BƯỚC 2 của đăng ký: đổi mã lấy tài khoản thật. */
  const verifyRegisterOtp = async (email, otp) => {
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
  };

  // ── QUÊN MẬT KHẨU (3 bước) ──────────────────────────────────────────────────
  //
  // Ba hàm này KHÔNG đặt `error` vào context như login/register: trang quên mật khẩu tự
  // giữ câu lỗi của riêng nó. Dùng chung `error` sẽ khiến lỗi còn sót từ một lần đăng nhập
  // hỏng trước đó hiện ra ngay khi vừa mở trang.

  /** BƯỚC 1: xin mã. `extraPayload` mang `{ captchaToken }`. */
  const forgotPassword = async (email, extraPayload = {}) => {
    setIsLoading(true);
    try {
      return await authApi.forgotPassword({ email, ...extraPayload });
    } finally {
      setIsLoading(false);
    }
  };

  /** BƯỚC 2: đổi mã lấy `resetToken` sống 15 phút. */
  const verifyResetOtp = async (email, otp) => {
    setIsLoading(true);
    try {
      return await authApi.verifyResetOtp({ email, otp });
    } finally {
      setIsLoading(false);
    }
  };

  /** BƯỚC 3: đổi `resetToken` lấy mật khẩu mới. Backend thu hồi mọi phiên đang mở. */
  const resetPassword = async (resetToken, newPassword) => {
    setIsLoading(true);
    try {
      return await authApi.resetPassword({ resetToken, newPassword });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setUser(null);
  };

  const deleteAccount = async (password) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await userApi.deleteMyAccount(password);
      logout();
      return res;
    } catch (err) {
      setError(err.message || t('account.deleteFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
