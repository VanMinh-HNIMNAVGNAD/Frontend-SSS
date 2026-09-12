import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthBackground from '../components/ui/AuthBackground';
import TurnstileWidget from '../components/security/TurnstileWidget';
import useTurnstile from '../hooks/useTurnstile';
import { TURNSTILE_ACTIONS } from '../constants/turnstile';
import { API_BASE_URL } from '../constants/api';
import OtpForm from '../components/security/OtpForm';
import { LegalNotice } from '../components/security/LegalConsent';

export default function LoginPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { login, verifyLoginOtp, isLoading, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const location = useLocation();

  // Token CAPTCHA của form này. `action` phải đúng TURNSTILE_ACTIONS.LOGIN ('login'):
  // backend sẽ đối chiếu nhãn này khi bật `expectedAction`, lệch một chữ là mọi lần
  // đăng nhập trượt với `action-mismatch`. Xem constants/turnstile.js.
  const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.LOGIN });

  // Bước đang đứng: 'credentials' (email+mật khẩu+CAPTCHA) → 'otp' (mã 6 số).
  // Backend chỉ phát phiên ở bước 'otp', nên state này thuần tuý là chuyện hiển thị.
  const [step, setStep] = useState('credentials');

  // Đọc query param ?error= khi bị đưa về đây kèm một lý do:
  //   • oauth_cancelled        — người dùng tự bấm "Huỷ" ở hộp thoại của nhà cung cấp.
  //     KHÔNG phải sự cố, nên câu chữ không được nói "thất bại";
  //   • oauth_no_email         — nhà cung cấp không trả về email (GitHub cho phép giấu
  //     email trong cài đặt riêng tư). Thử lại bao nhiêu lần cũng vậy, nên câu chữ
  //     phải chỉ sang cách đăng nhập khác;
  //   • oauth_failed           — nhà cung cấp OAuth từ chối (bước 1);
  //   • oauth_exchange_failed  — mã đổi phiên hết hạn hoặc đã dùng (bước 2). Xảy ra khi
  //     người dùng bấm F5 ở trang vừa quay về, hoặc để tab đó quá 60 giây;
  //   • oauth_unavailable      — backend không phát được mã vì Redis đang chết. Đây là lỗi
  //     hạ tầng, không phải lỗi của người dùng, nên câu chữ phải nói "thử lại sau";
  //   • account_locked         — tài khoản bị khoá (`isActive = false`). Bắt buộc phải hiện:
  //     trước đây người bị khoá đăng nhập OAuth thì vào được /app một nhịp rồi bị đá ra
  //     không lời nào, nên họ thử đi thử lại mãi mà không biết chuyện gì đang xảy ra.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('error');
    if (reason === 'oauth_cancelled') {
      setLocalError(t('login.oauthCancelled'));
    } else if (reason === 'oauth_no_email') {
      setLocalError(t('login.oauthNoEmail'));
    } else if (reason === 'oauth_failed') {
      setLocalError(t('login.oauthFailed'));
    } else if (reason === 'oauth_exchange_failed') {
      setLocalError(t('login.oauthExpired'));
    } else if (reason === 'oauth_unavailable') {
      setLocalError(t('login.oauthUnavailable'));
    } else if (reason === 'account_locked') {
      setLocalError(t('login.accountLocked'));
    }
  }, [location.search, t]);

  const validateEmail = (val) => {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(val)) {
      return t('auth.email.invalid');
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    const emailErr = validateEmail(email);
    if (emailErr) {
      setLocalError(emailErr);
      return;
    }

    // Chặn sớm cho đỡ tốn một vòng gọi API chắc chắn 400. Đây CHỈ là tiện ích
    // giao diện — lớp chặn thật nằm ở backend, nơi token được đem hỏi Cloudflare.
    //
    // Hai câu khác nhau vì hai tình huống khác nhau: ô xác minh CHƯA HIỆN RA thì
    // bảo người dùng "hãy tích vào ô" là chỉ vào một chỗ trống.
    if (!captcha.isVerified) {
      setLocalError(t(captcha.isReady ? 'auth.captcha.required' : 'auth.captcha.loading'));
      return;
    }

    try {
      // `payload()` trả `{ captchaToken }`, hoặc object rỗng khi CAPTCHA bị tắt vì
      // thiếu VITE_TURNSTILE_SITE_KEY (khi đó backend sẽ từ chối — fail-closed).
      const result = await login(email, password, captcha.payload());

      // Mật khẩu đúng mới là yếu tố thứ nhất: backend đã gửi mã và chưa phát phiên nào.
      if (result?.requiresOtp) {
        setStep('otp');
        return;
      }

      // Backend bản cũ chưa bật OTP thì đăng nhập xong ngay tại đây.
      navigate('/app');
    } catch (err) {
      console.error('Đăng nhập thất bại:', err);
    } finally {
      // BẮT BUỘC, kể cả khi đăng nhập hỏng: token Turnstile dùng MỘT LẦN. Không
      // reset thì lần bấm thứ hai gửi lại token đã chết và người dùng nhận lỗi
      // 'timeout-or-duplicate' chẳng liên quan gì tới việc họ vừa làm.
      captcha.reset();
    }
  };

  /**
   * NÉM tiếp lỗi ra ngoài thay vì nuốt: `OtpForm` cần biết để lắc đỏ và xoá ô nhập. Câu lỗi
   * thật (mã sai / hết hạn / còn mấy lượt) đã nằm ở `authError` do AuthContext đặt.
   */
  const handleVerifyOtp = async (otp) => {
    setLocalError('');
    await verifyLoginOtp(email, otp);
  };

  /**
   * Gửi lại mã = chạy lại BƯỚC 1, vì mã đăng nhập chỉ được phát sau khi mật khẩu đúng.
   * Cần một token CAPTCHA mới: token cũ đã bị Cloudflare ghi nhận là đã dùng.
   */
  const handleResendOtp = async () => {
    setLocalError('');
    // Token CAPTCHA dùng MỘT LẦN: cái đã dùng cho lần gửi đầu bị captcha.reset() xoá ngay
    // sau khi submit. Không có token mới thì payload() trả object rỗng và backend trả 400
    // ("Vui lòng hoàn tất xác minh CAPTCHA") — chặn tại đây để người dùng đọc được câu
    // đúng việc họ cần làm. <OtpForm captcha={captcha}> là nơi hiện ô CAPTCHA để lấy token.
    if (!captcha.isVerified) {
      setLocalError(t(captcha.isReady ? 'auth.captcha.requiredResend' : 'auth.captcha.loading'));
      return;
    }
    try {
      await login(email, password, captcha.payload());
    } catch (err) {
      console.error('Gửi lại mã thất bại:', err);
    } finally {
      captcha.reset();
    }
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setLocalError('');
    captcha.reset();
  };

  /**
   * Vì sao các nút OAuth đang bị khoá — chuỗi rỗng nghĩa là không khoá.
   *
   * Tính một lần rồi dùng cho cả `title` của ba nút lẫn câu lỗi khi người dùng
   * cố bấm, để tooltip và thông báo không bao giờ nói hai điều khác nhau.
   *
   * Hai câu khác nhau cho hai tình huống khác nhau: ô xác minh CHƯA HIỆN RA thì
   * bảo người dùng "hãy tích vào ô" là chỉ vào một chỗ trống.
   */
  const captchaBlockReason = captcha.isVerified
    ? ''
    : t(captcha.isReady ? 'auth.captcha.required' : 'auth.captcha.loading');

  const handleSocialLogin = (providerName) => {
    // CÙNG MỘT CÁNH CỔNG với form mật khẩu. Không có nhánh này thì hai nút
    // Google/GitHub là đường vòng bỏ qua toàn bộ CAPTCHA: một cú bấm là
    // rời trang sang nhà cung cấp trong lúc ô xác minh còn đang quay, và cả quãng
    // "chưa tải xong / chưa tích" mà form mật khẩu chặn rất kỹ trở thành vô nghĩa.
    //
    // Nút đã có `disabled` ở JSX rồi vẫn phải chặn lại ở đây: `disabled` chỉ là
    // một thuộc tính DOM — sửa bằng devtools, hay gọi thẳng handler qua React
    // DevTools, là qua được. Chỗ chặn phải nằm ngay trước lệnh điều hướng.
    if (captchaBlockReason) {
      setLocalError(captchaBlockReason);
      return;
    }

    if (providerName === 'Google') {
      window.location.href = `${API_BASE_URL}/auth/google`;
    } else if (providerName === 'GitHub') {
      window.location.href = `${API_BASE_URL}/auth/github`;
    } else {
      setLocalError(t('login.oauth.comingSoon', { provider: providerName }));
    }
  };

  const displayError = localError || authError;

  return (
    <AuthBackground>
      {/* Auth Card */}
      <div className="w-full bg-[#111726]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/5 relative z-10">
        <h1 className="text-2xl font-bold text-center text-white tracking-tight mb-6">
          {step === 'otp' ? t('login.otpTitle') : t('login.title')}
        </h1>

        {step === 'otp' ? (
          <OtpForm
            email={email}
            onSubmit={handleVerifyOtp}
            onResend={handleResendOtp}
            captcha={captcha}
            onBack={handleBackToCredentials}
            onSuccess={() => navigate('/app')}
            isLoading={isLoading}
            error={displayError}
            submitLabel={t('login.submit')}
            successMessage={t('login.success')}
          />
        ) : (
        <>
        {/* Social login buttons */}
        <div className="flex gap-3 mb-6">
          {/* Google */}
          <button
            type="button"
            onClick={() => handleSocialLogin('Google')}
            disabled={!captcha.isVerified}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]"
            title={captchaBlockReason || t('login.oauth.google')}
          >
            <svg className="w-6 h-6 grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-200" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors duration-200">Google</span>
          </button>

          {/* GitHub */}
          <button
            type="button"
            onClick={() => handleSocialLogin('GitHub')}
            disabled={!captcha.isVerified}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]"
            title={captchaBlockReason || t('login.oauth.github')}
          >
            <svg className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors duration-200 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors duration-200">GitHub</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900/90 px-3 text-slate-400 font-bold tracking-wider">
              {t('login.orEmail')}
            </span>
          </div>
        </div>

        {displayError && (
          <div className="p-3 mb-5 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center font-semibold">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm text-slate-300 block mb-2 font-bold">{t('auth.email.label')}</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email.placeholder')}
                required
                className="w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-2 font-bold">{t('auth.password.label')}</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500"
              />
            </div>
          </div>

          {/* Ô CAPTCHA. Tự ẩn khi thiếu VITE_TURNSTILE_SITE_KEY, lúc đó
              captcha.isVerified luôn true nên form vẫn submit được. */}
          <div className="pt-1">
            <TurnstileWidget {...captcha.widgetProps} />
          </div>

          {/* CTA — điểm nhấn DUY NHẤT trong toàn bộ card */}
          <button
            type="submit"
            disabled={isLoading || !captcha.isVerified}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25 cursor-pointer"
          >
            {/* Nút bị khoá cho tới khi ô xác minh render xong VÀ giải xong (xem
                useTurnstile.isVerified). Nhãn đổi theo để lý do bị khoá đọc được
                ngay trên nút, thay vì chỉ là một khối xám không giải thích gì. */}
            <span>
              {isLoading
                ? t('login.submitting')
                : captcha.isReady
                  ? t('login.submit')
                  : t('turnstile.loading')}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="text-center text-sm font-medium text-slate-400 pt-2 space-y-2">
            <div>
              <Link to="/forgot-password" className="text-slate-400 hover:text-blue-400 hover:underline">
                {t('login.forgotPassword')}
              </Link>
            </div>
            <div>
              {t('login.noAccount')}{' '}
              <Link to="/register" className="text-blue-400 hover:underline font-bold">
                {t('login.registerNow')}
              </Link>
            </div>

            {/*
              Điều khoản + Quyền riêng tư phải TIẾP CẬN ĐƯỢC TỪ LUỒNG ĐĂNG NHẬP —
              mọi nhà cung cấp OAuth đều đòi vậy khi xét duyệt, và đó cũng là chỗ hợp
              lý nhất để người dùng tìm chúng: họ đến trang này thường xuyên hơn trang
              đăng ký nhiều.

              KHÔNG có ô tích ở đây, chỉ một câu ghi chú. Người đăng nhập đã đồng ý
              từ lần đăng ký; bắt tích lại mỗi lần vào là làm phiền mà không thêm
              được gì. Nhưng ba nút OAuth trên trang này TẠO ĐƯỢC tài khoản mới cho
              người chưa có (AuthService.validateOAuthUser), nên câu "tiếp tục nghĩa
              là bạn đồng ý" ở đây không phải câu trang trí — nó là hình thức đồng ý
              cho đúng nhóm người đó. Xem components/security/LegalConsent.jsx.
            */}
            <div className="pt-2">
              <LegalNotice />
            </div>
          </div>
        </form>
        </>
        )}
      </div>
    </AuthBackground>
  );
}
