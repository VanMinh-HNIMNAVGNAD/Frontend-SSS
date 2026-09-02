import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthBackground from '../components/ui/AuthBackground';
import TurnstileWidget from '../components/security/TurnstileWidget';
import OtpForm from '../components/security/OtpForm';
import useTurnstile from '../hooks/useTurnstile';
import { TURNSTILE_ACTIONS } from '../constants/turnstile';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ForgotPasswordPage — đặt lại mật khẩu bằng OTP gửi qua email
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ba bước, khớp đúng ba endpoint của backend:
 *
 *   'email'    POST /auth/forgot-password   { email, captchaToken }  → gửi mã
 *   'otp'      POST /auth/verify-reset-otp  { email, otp }           → resetToken (15 phút)
 *   'password' POST /auth/reset-password    { resetToken, newPassword }
 *
 * LƯU Ý VỀ BƯỚC 1: backend LUÔN trả câu thành công, kể cả khi email không tồn tại trong hệ
 * thống. Đó là chủ ý chống dò tài khoản, nên trang này cũng phải chuyển sang màn nhập mã
 * trong mọi trường hợp — hiện thông báo "email không tồn tại" ở đây sẽ phá sạch tác dụng
 * của việc backend giấu.
 */
export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp, resetPassword, isLoading } = useAuth();

  // 'email' → 'otp' → 'password' → 'done'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.FORGOT_PASSWORD });

  const validateEmail = (val) =>
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)
      ? ''
      : t('auth.email.invalid');

  // ── BƯỚC 1: xin mã ───────────────────────────────────────────────────────────
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');

    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!captcha.isVerified) {
      setError(t('auth.captcha.required'));
      return;
    }

    try {
      await forgotPassword(email, captcha.payload());
      setStep('otp');
    } catch (err) {
      // Chỉ tới đây khi CAPTCHA trượt hoặc hạ tầng hỏng (503) — hai ca đó KHÔNG tiết lộ
      // email có tồn tại hay không, nên hiện lỗi ra là an toàn.
      setError(err.message || t('otp.sendFailed'));
    } finally {
      captcha.reset();
    }
  };

  // ── BƯỚC 2: đổi mã lấy resetToken ────────────────────────────────────────────
  // NÉM tiếp lỗi để OtpForm lắc đỏ; nuốt ở đây thì mã sai trông y như mã đúng.
  const handleVerifyOtp = async (otp) => {
    setError('');
    const res = await verifyResetOtp(email, otp);
    const token = res?.resetToken ?? res?.data?.resetToken;
    if (!token) {
      throw new Error(t('forgot.noResetToken'));
    }
    setResetToken(token);
  };

  const handleResendOtp = async () => {
    setError('');
    // Token CAPTCHA dùng MỘT LẦN: cái đã dùng cho lần gửi đầu bị captcha.reset() xoá ngay
    // sau khi submit. Không có token mới thì payload() trả object rỗng và backend trả 400
    // ("Vui lòng hoàn tất xác minh CAPTCHA") — chặn tại đây để người dùng đọc được câu
    // đúng việc họ cần làm. <OtpForm captcha={captcha}> là nơi hiện ô CAPTCHA để lấy token.
    if (!captcha.isVerified) {
      setError(t('auth.captcha.requiredResend'));
      return;
    }
    try {
      await forgotPassword(email, captcha.payload());
    } catch (err) {
      setError(err.message || t('forgot.resendFailed'));
    } finally {
      captcha.reset();
    }
  };

  // ── BƯỚC 3: đặt mật khẩu mới ─────────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError(t('auth.password.tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.password.mismatch'));
      return;
    }

    try {
      await resetPassword(resetToken, newPassword);
      setStep('done');
      // Backend đã thu hồi mọi phiên đang mở, nên bắt buộc phải đăng nhập lại.
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.message || t('forgot.resetFailed'));
    }
  };

  const heading = {
    email: t('forgot.title.email'),
    otp: t('forgot.title.otp'),
    password: t('forgot.title.password'),
    done: 'Xong!',
  }[step];

  const inputClass =
    'w-full h-12 pl-12 pr-4 rounded-xl text-base font-semibold text-white bg-transparent border border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition placeholder-slate-500';

  return (
    <AuthBackground>
      <div className="w-full max-w-[460px] bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/50 ring-1 ring-white/5 relative z-10">
        <h1 className="text-2xl font-bold text-center text-white tracking-tight mb-6">
          {heading}
        </h1>

        {error && step !== 'otp' && (
          <div className="p-3 mb-5 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center font-semibold">
            {error}
          </div>
        )}

        {/* ── BƯỚC 1 ── */}
        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <p className="text-sm font-medium text-slate-400 text-center">
              Nhập email của bạn. Nếu tài khoản tồn tại, chúng tôi sẽ gửi mã xác minh 6 chữ
              số tới hộp thư đó.
            </p>

            <div>
              <label className="text-sm text-slate-300 block mb-2 font-bold">Email</label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  required
                  autoFocus
                  className={inputClass}
                />
              </div>
            </div>

            <div className="pt-1">
              <TurnstileWidget {...captcha.widgetProps} />
            </div>

            <button
              type="submit"
              disabled={isLoading || !captcha.isVerified}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25 cursor-pointer"
            >
              <span>{isLoading ? t('forgot.sending') : t('forgot.sendCode')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className="text-center text-sm font-medium text-slate-400 pt-2">
              Nhớ ra mật khẩu rồi?{' '}
              <Link to="/login" className="text-blue-400 hover:underline font-bold">
                Đăng nhập
              </Link>
            </div>
          </form>
        )}

        {/* ── BƯỚC 2 ── */}
        {step === 'otp' && (
          <OtpForm
            email={email}
            onSubmit={handleVerifyOtp}
            onResend={handleResendOtp}
            captcha={captcha}
            onBack={() => {
              setStep('email');
              setError('');
              captcha.reset();
            }}
            onSuccess={() => setStep('password')}
            isLoading={isLoading}
            error={error}
            submitLabel={t('otp.confirmCode')}
            successMessage={t('otp.success')}
          />
        )}

        {/* ── BƯỚC 3 ── */}
        {step === 'password' && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="flex flex-col items-center text-center gap-2 mb-1">
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
              <p className="text-sm font-medium text-slate-300">
                Đặt mật khẩu mới cho
                <br />
                <span className="font-bold text-white break-all">{email}</span>
              </p>
            </div>

            <div>
              <label className="text-sm text-slate-300 block mb-2 font-bold">{t('auth.password.newLabel')}</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-300 block mb-2 font-bold">
                Nhập lại mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 text-center">
              Sau khi đổi, mọi thiết bị đang đăng nhập sẽ bị đăng xuất.
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-base font-bold tracking-wide transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25 cursor-pointer"
            >
              <span>{isLoading ? t('forgot.saving') : t('forgot.submit')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        )}

        {/* ── XONG ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center animate-[otpPop_0.35s_ease-out]">
              <ShieldCheck className="w-8 h-8 text-emerald-400" strokeWidth={2.5} />
            </div>
            <p className="text-base font-bold text-emerald-300">{t('forgot.done')}</p>
            <p className="text-sm font-medium text-slate-400">
              Đang chuyển sang trang đăng nhập...
            </p>
          </div>
        )}
      </div>
    </AuthBackground>
  );
}
