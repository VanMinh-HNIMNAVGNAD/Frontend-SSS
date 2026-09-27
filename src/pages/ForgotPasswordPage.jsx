import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthBackground from '../components/ui/AuthBackground';
import TurnstileWidget from '../components/security/TurnstileWidget';
import OtpForm from '../components/security/OtpForm';
import {
  AUTH_CARD, AUTH_TITLE, AUTH_LABEL, AUTH_INPUT, AUTH_INPUT_ICON, AUTH_ERROR, AUTH_PRIMARY_BUTTON, AUTH_MUTED,
  AUTH_LINK, AUTH_STRONG, AUTH_SUCCESS_BADGE, AUTH_SUCCESS_ICON, AUTH_SUCCESS_TEXT,
} from '../components/ui/authStyles';
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
      setError(t(captcha.isReady ? 'auth.captcha.required' : 'auth.captcha.loading'));
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
      setError(t(captcha.isReady ? 'auth.captcha.requiredResend' : 'auth.captcha.loading'));
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

  return (
    <AuthBackground>
      <div className={AUTH_CARD}>
        <h1 className={AUTH_TITLE}>
          {heading}
        </h1>

        {error && step !== 'otp' && (
          <div className={`${AUTH_ERROR} mb-5`}>
            {error}
          </div>
        )}

        {/* ── BƯỚC 1 ── */}
        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <p className={`text-sm font-medium ${AUTH_MUTED} text-center`}>
              {t('forgot.emailStepHint')}
            </p>

            <div>
              <label className={AUTH_LABEL}>{t('auth.email.label')}</label>
              <div className="relative">
                <Mail className={AUTH_INPUT_ICON} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email.placeholder')}
                  required
                  autoFocus
                  className={AUTH_INPUT}
                />
              </div>
            </div>

            <div className="pt-1">
              <TurnstileWidget {...captcha.widgetProps} />
            </div>

            <button
              type="submit"
              disabled={isLoading || !captcha.isVerified}
              className={AUTH_PRIMARY_BUTTON}
            >
              {/* Nút bị khoá cho tới khi ô xác minh render xong VÀ giải xong (xem
                  useTurnstile.isVerified). Nhãn đổi theo để lý do bị khoá đọc được
                  ngay trên nút, thay vì chỉ là một khối xám không giải thích gì. */}
              <span>
                {isLoading
                  ? t('forgot.sending')
                  : captcha.isReady
                    ? t('forgot.sendCode')
                    : t('turnstile.loading')}
              </span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <div className={`text-center text-sm font-medium ${AUTH_MUTED} pt-2`}>
              {t('forgot.rememberPassword')}{' '}
              <Link to="/login" className={AUTH_LINK}>
                {t('common.login')}
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
              <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('forgot.setNewFor')}
                <br />
                <span className={AUTH_STRONG}>{email}</span>
              </p>
            </div>

            <div>
              <label className={AUTH_LABEL}>{t('auth.password.newLabel')}</label>
              <div className="relative">
                <Lock className={AUTH_INPUT_ICON} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  className={AUTH_INPUT}
                />
              </div>
            </div>

            <div>
              <label className={AUTH_LABEL}>
                {t('forgot.confirmLabel')}
              </label>
              <div className="relative">
                <Lock className={AUTH_INPUT_ICON} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={AUTH_INPUT}
                />
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
              {t('forgot.signOutWarning')}
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className={AUTH_PRIMARY_BUTTON}
            >
              <span>{isLoading ? t('forgot.saving') : t('forgot.submit')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        )}

        {/* ── XONG ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className={AUTH_SUCCESS_BADGE}>
              <ShieldCheck className={AUTH_SUCCESS_ICON} strokeWidth={2.5} />
            </div>
            <p className={AUTH_SUCCESS_TEXT}>{t('forgot.done')}</p>
            <p className={`text-sm font-medium ${AUTH_MUTED}`}>
              {t('forgot.redirecting')}
            </p>
          </div>
        )}
      </div>
    </AuthBackground>
  );
}
