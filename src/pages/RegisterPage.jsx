import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Lock, Mail, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthBackground from '../components/ui/AuthBackground';
import TurnstileWidget from '../components/security/TurnstileWidget';
import useTurnstile from '../hooks/useTurnstile';
import { TURNSTILE_ACTIONS } from '../constants/turnstile';
import { API_BASE_URL } from '../constants/api';
import OtpForm from '../components/security/OtpForm';
import { LegalConsentCheckbox } from '../components/security/LegalConsent';
import { LEGAL_VERSION } from '../constants/legal';

export default function RegisterPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { sendRegisterOtp, verifyRegisterOtp, isLoading, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [localError, setLocalError] = useState('');
  const location = useLocation();

  const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.REGISTER });

  /**
   * Người dùng đã tích ô đồng ý điều khoản chưa.
   *
   * BẮT ĐẦU TỪ `false` VÀ KHÔNG BAO GIỜ TỰ BẬT. Một ô tích sẵn không phải là sự
   * đồng ý — nó chỉ là một thứ người dùng chưa kịp bỏ tích.
   *
   * State này KHÔNG được reset khi quay lại từ bước OTP (handleBackToForm): người
   * dùng đã đồng ý một lần rồi, bắt tích lại vì họ bấm "quay lại" là làm phiền vô
   * cớ. Khác hẳn token CAPTCHA — thứ đó buộc phải lấy mới vì Cloudflare chỉ nhận
   * một lần.
   */
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // 'form' (điền thông tin + CAPTCHA) → 'otp' (nhập mã). Tài khoản chỉ được tạo ở bước 'otp'.
  const [step, setStep] = useState('form');

  // Đọc query param ?error=oauth_failed khi OAuth redirect về với lỗi
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('error') === 'oauth_failed') {
      setLocalError(t('register.oauthFailed'));
    }
  }, [location.search, t]);

  /**
   * Phần thân request cho bước 1 của đăng ký: token CAPTCHA + bằng chứng đồng ý.
   *
   * Gộp vào một hàm vì có HAI nơi gọi (`handleSubmit` và `handleResendOtp`) mà
   * `SendRegisterOtpDto` ở backend bật `forbidNonWhitelisted`: chỉ cần một nơi
   * quên `acceptedTerms` là nơi đó nhận 400 trong khi nơi kia vẫn chạy tốt — đúng
   * loại lệch mà không test nào ở frontend bắt được.
   *
   * `termsVersion` gửi kèm để về sau còn trả lời được câu "người này đã đồng ý với
   * bản điều khoản nào" — xem LEGAL_VERSION trong constants/legal.js.
   */
  const consentPayload = () => ({
    ...captcha.payload(),
    acceptedTerms: true,
    termsVersion: LEGAL_VERSION,
  });

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

    if (password.length < 6) {
      setLocalError(t('auth.password.tooShort'));
      return;
    }

    // Hai điều kiện của cổng đăng ký nằm chung trong `signupBlockReason` (xem chỗ
    // khai báo): chưa tích đồng ý, hoặc CAPTCHA chưa xong.
    if (signupBlockReason) {
      setLocalError(signupBlockReason);
      return;
    }

    // BƯỚC 1: gửi cả thông tin tài khoản để backend băm mật khẩu và cất tạm vào Redis.
    // Chưa có tài khoản nào được tạo ở đây.
    try {
      await sendRegisterOtp(email, password, fullName, consentPayload());
      setStep('otp');
    } catch (err) {
      console.error('Không gửi được mã xác minh:', err);
    } finally {
      // Token Turnstile dùng một lần, phải làm mới kể cả khi bước 1 hỏng.
      captcha.reset();
    }
  };

  /**
   * BƯỚC 2: đổi mã lấy tài khoản thật.
   *
   * NÉM tiếp lỗi ra ngoài thay vì nuốt: `OtpForm` cần biết để lắc đỏ. Nuốt ở đây thì mã sai
   * trông y như mã đúng.
   */
  const handleVerifyOtp = async (otp) => {
    setLocalError('');
    await verifyRegisterOtp(email, otp);
  };

  /** Gửi lại mã = chạy lại bước 1, cần một token CAPTCHA mới. */
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
      // `consentPayload()` chứ không phải `captcha.payload()`: DTO của backend
      // đòi `acceptedTerms` ở MỌI lần gọi endpoint này, kể cả lần gửi lại mã.
      // Thiếu nó là 400 ngay, mà lúc đó người dùng đang ở màn nhập OTP và câu lỗi
      // sẽ chẳng liên quan gì tới việc họ vừa làm.
      await sendRegisterOtp(email, password, fullName, consentPayload());
    } catch (err) {
      console.error('Gửi lại mã thất bại:', err);
    } finally {
      captcha.reset();
    }
  };

  const handleBackToForm = () => {
    setStep('form');
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

  /**
   * Toàn bộ lý do trang này chưa cho tạo tài khoản — chuỗi rỗng nghĩa là mở cổng.
   *
   * MỘT BIẾN CHO CẢ HAI ĐIỀU KIỆN, dùng ở cả `title` của ba nút OAuth, cả câu lỗi
   * khi người dùng cố bấm, cả `disabled` của nút submit: tooltip, thông báo và
   * trạng thái nút không bao giờ nói ba điều khác nhau.
   *
   * ĐIỀU KHOẢN XÉT TRƯỚC CAPTCHA. Đây là thứ tự người dùng đọc trên màn hình (ô
   * tích nằm trên ô xác minh), và nó cũng là thứ tự đúng về mặt ý nghĩa: chưa
   * đồng ý thì việc có phải người thật hay không còn chưa cần hỏi tới.
   */
  const signupBlockReason = !acceptedTerms ? t('legal.consent.required') : captchaBlockReason;

  const handleSocialRegister = (providerName) => {
    // CÙNG MỘT CÁNH CỔNG với form mật khẩu. Không có nhánh này thì hai nút
    // Google/GitHub là đường vòng bỏ qua toàn bộ CAPTCHA: một cú bấm là
    // rời trang sang nhà cung cấp trong lúc ô xác minh còn đang quay, và cả quãng
    // "chưa tải xong / chưa tích" mà form mật khẩu chặn rất kỹ trở thành vô nghĩa.
    //
    // Nút đã có `disabled` ở JSX rồi vẫn phải chặn lại ở đây: `disabled` chỉ là
    // một thuộc tính DOM — sửa bằng devtools, hay gọi thẳng handler qua React
    // DevTools, là qua được. Chỗ chặn phải nằm ngay trước lệnh điều hướng.
    //
    // Ô ĐỒNG Ý ĐIỀU KHOẢN CŨNG NẰM SAU CỔNG NÀY, và đây là chỗ DUY NHẤT chặn được
    // nó cho luồng OAuth: một cú bấm là rời trang sang nhà cung cấp, không có request
    // nào của mình đi kèm để backend kiểm `acceptedTerms` như ở luồng mật khẩu.
    // Đổi lại, câu ghi chú "tiếp tục nghĩa là bạn đồng ý" ở trang đăng nhập là
    // lớp thứ hai cho những ai tạo tài khoản mới bằng OAuth từ bên đó.
    if (signupBlockReason) {
      setLocalError(signupBlockReason);
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
          {step === 'otp' ? t('register.otpTitle') : t('register.title')}
        </h1>

        {step === 'otp' ? (
          <OtpForm
            email={email}
            onSubmit={handleVerifyOtp}
            onResend={handleResendOtp}
            captcha={captcha}
            onBack={handleBackToForm}
            onSuccess={() => navigate('/login')}
            isLoading={isLoading}
            error={displayError}
            submitLabel={t('register.submit')}
            successMessage={t('register.success')}
          />
        ) : (
        <>
        {/* Social register buttons */}
        <div className="flex gap-3 mb-6">
          {/* Google */}
          <button
            type="button"
            onClick={() => handleSocialRegister('Google')}
            disabled={Boolean(signupBlockReason)}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]"
            title={signupBlockReason || t('register.oauth.google')}
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
            onClick={() => handleSocialRegister('GitHub')}
            disabled={Boolean(signupBlockReason)}
            className="group flex-1 h-12 rounded-xl text-white bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]"
            title={signupBlockReason || t('register.oauth.github')}
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
              HOẶC EMAIL
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
            <label className="text-sm text-slate-300 block mb-2 font-bold">Nickname</label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('auth.nickname.placeholder')}
                required
                className="w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500"
              />
            </div>
          </div>

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

          {/* Ô đồng ý điều khoản — nửa còn lại của cổng đăng ký, cùng hạng với
              ô CAPTCHA ngay bên dưới. Đặt TRƯỚC nó theo đúng thứ tự mà
              `signupBlockReason` xét: đồng ý trước, xác minh sau. Hai liên kết
              trong câu mở ra tab mới để không xoá mất những gì vừa gõ — xem
              components/security/LegalConsent.jsx. */}
          <div className="pt-1">
            <LegalConsentCheckbox
              checked={acceptedTerms}
              onChange={setAcceptedTerms}
              disabled={isLoading}
            />
          </div>

          {/* Ô CAPTCHA. Tự ẩn khi thiếu VITE_TURNSTILE_SITE_KEY, lúc đó
              captcha.isVerified luôn true nên form vẫn submit được. */}
          <div className="pt-1">
            <TurnstileWidget {...captcha.widgetProps} />
          </div>

          {/* CTA — điểm nhấn DUY NHẤT trong toàn bộ card */}
          <button
            type="submit"
            disabled={isLoading || Boolean(signupBlockReason)}
            title={signupBlockReason || undefined}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25 cursor-pointer"
          >
            {/* Nút bị khoá cho tới khi ĐÃ TÍCH ĐỒNG Ý và ô xác minh render xong VÀ
                giải xong (xem `signupBlockReason` + useTurnstile.isVerified). Nhãn
                đổi theo để lý do bị khoá đọc được ngay trên nút, thay vì chỉ là
                một khối xám không giải thích gì; lý do đầy đủ nằm ở `title` và ở
                câu lỗi khi người dùng cố submit. */}
            <span>
              {isLoading
                ? t('register.submitting')
                : !acceptedTerms
                  ? t('legal.consent.cta')
                  : captcha.isReady
                    ? t('register.submit')
                    : t('turnstile.loading')}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="text-center text-sm font-medium text-slate-400 pt-2">
            {t('register.hasAccount')}{' '}
            <Link to="/login" className="text-blue-400 hover:underline font-bold">
              {t('register.loginNow')}
            </Link>
          </div>
        </form>
        </>
        )}
      </div>
    </AuthBackground>
  );
}
