import { useEffect, useState } from 'react';
import { ArrowRight, Check, MailCheck, RotateCw } from 'lucide-react';
import OtpInput from './OtpInput';
import TurnstileWidget from './TurnstileWidget';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OtpForm — màn nhập mã, dùng chung cho đăng ký / đăng nhập / quên mật khẩu
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gom vào một chỗ vì các luồng cần y hệt nhau: 6 ô nhập, đồng hồ đếm ngược cho nút "Gửi
 * lại mã", lắc đỏ khi sai, xanh lá + dấu tích khi đúng. Chép tay thành nhiều bản là kiểu
 * chỗ mà sau vài lần sửa sẽ lệch nhau đúng một hành vi.
 *
 * KHÔNG tự gọi API: cha quyết định mã này để đăng ký hay đăng nhập. Component chỉ lo phần
 * hiển thị, thu mã, và diễn hoạt trạng thái.
 *
 * @param {object}   props
 * @param {string}   props.email       Địa chỉ đã nhận mã (hiện ra để người dùng đối chiếu)
 * @param {Function} props.onSubmit    (otp) => Promise — ném lỗi nếu mã sai
 * @param {Function} props.onResend    () => Promise
 * @param {Function} [props.onBack]
 * @param {Function} [props.onSuccess] Gọi SAU khi diễn hoạt thành công xong (mặc định 1.5s)
 * @param {boolean}  [props.isLoading]
 * @param {string}   [props.error]     Câu lỗi từ backend
 * @param {number}   [props.resendCooldown] Giây phải chờ trước khi được gửi lại
 * @param {object}   [props.captcha]   Nguyên giá trị trả về của useTurnstile() ở trang cha.
 *   BẮT BUỘC với mọi luồng mà endpoint "gửi lại mã" có kiểm CAPTCHA (đăng ký, đăng nhập,
 *   quên mật khẩu) — xem khối giải thích ngay trên phần render widget bên dưới.
 * @param {string}   [props.submitLabel]
 * @param {string}   [props.successMessage]
 */
export default function OtpForm({
  email,
  onSubmit,
  onResend,
  onBack,
  onSuccess,
  isLoading = false,
  error = '',
  resendCooldown = 60,
  captcha = null,
  submitLabel = 'Xác nhận',
  successMessage = 'Xác minh thành công!',
}) {
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'error' | 'success'
  const [secondsLeft, setSecondsLeft] = useState(resendCooldown);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Đồng hồ đếm ngược cho nút "Gửi lại mã". Backend cũng chặn phía nó
  // (OTP_RESEND_COOLDOWN_SECONDS) và ĐÓ mới là ràng buộc thật — đồng hồ này chỉ để người
  // dùng biết còn bao lâu thay vì bấm rồi ăn lỗi 429.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const id = setInterval(() => setSecondsLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleSubmit = async (code) => {
    if (code.length !== 6 || isSubmitting || status === 'success') return;

    setIsSubmitting(true);
    setStatus('idle');
    try {
      await onSubmit(code);

      // Giữ màn hình xanh lá 1.5 giây trước khi chuyển trang: đủ để người dùng thấy việc
      // mình vừa làm đã thành công, thay vì trang nhảy đi trong lúc họ còn đang nhìn ô nhập.
      setStatus('success');
      setTimeout(() => onSuccess?.(), 1500);
    } catch {
      // Câu lỗi thật do cha truyền xuống qua prop `error`; ở đây chỉ lo phần diễn hoạt.
      setStatus('error');
      setOtp('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (next) => {
    setOtp(next);
    // Gõ tiếp sau khi sai thì bỏ viền đỏ — giữ nguyên sẽ khiến người dùng tưởng mã mới
    // cũng đã sai.
    if (status === 'error') setStatus('idle');
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || isLoading || status === 'success') return;
    // Chưa có token thì ĐỪNG gửi: backend từ chối bằng lỗi validate của DTO
    // ("Vui lòng hoàn tất xác minh CAPTCHA"), một câu nói về field trong body chứ không
    // nói được cho người dùng biết họ cần làm gì.
    if (captcha && !captcha.isVerified) return;
    setOtp('');
    setStatus('idle');
    await onResend();
    setSecondsLeft(resendCooldown);
  };

  const busy = isLoading || isSubmitting;
  const isComplete = otp.length === 6;

  // ── Màn thành công ────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center animate-[otpPop_0.35s_ease-out]">
            <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
          </div>
          <p className="text-base font-bold text-emerald-300">{successMessage}</p>
        </div>
        <OtpInput value={otp} onChange={() => {}} status="success" disabled />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit(otp);
      }}
      className="space-y-5"
    >
      <div className="flex flex-col items-center text-center gap-2">
        <MailCheck className="w-10 h-10 text-blue-400" />
        <p className="text-sm font-medium text-slate-300">
          Nhập mã 6 chữ số vừa gửi tới
          <br />
          <span className="font-bold text-white break-all">{email}</span>
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center font-semibold">
          {error}
        </div>
      )}

      <OtpInput
        value={otp}
        onChange={handleChange}
        onComplete={handleSubmit}
        status={status}
        disabled={busy}
      />

      <button
        type="submit"
        disabled={busy || !isComplete}
        // Nút SÁNG LÊN khi đủ 6 số: `disabled:opacity-40` cộng với bóng đổ chỉ xuất hiện ở
        // trạng thái bật tạo ra khác biệt thấy rõ mà không cần thêm chữ nào.
        className={`w-full h-12 rounded-xl text-white text-base font-bold tracking-wide transition-all duration-200 flex items-center justify-center gap-2.5 ${
          isComplete && !busy
            ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 cursor-pointer'
            : 'bg-blue-600/40 cursor-not-allowed'
        }`}
      >
        <span>{busy ? 'Đang xác minh...' : submitLabel}</span>
        <ArrowRight className="w-5 h-5" />
      </button>

      {/*
        Ô CAPTCHA cho riêng nút "Gửi lại mã".
        ────────────────────────────────────────────────────────────────────────
        "Gửi lại mã" gọi LẠI CHÍNH endpoint đã gửi mã lần đầu, nên nó cũng cần một
        `captchaToken` — mà token thì DÙNG MỘT LẦN: cái dùng cho lần gửi đầu đã bị
        Cloudflare ghi nhận và trang cha đã gọi captcha.reset() sau khi submit. Thiếu
        widget ở màn này thì payload() luôn trả object rỗng và mọi lần bấm "Gửi lại mã"
        đều ăn 400 — đúng lỗi đã gặp.

        Chỉ mount khi đồng hồ đã về 0, vì hai lý do: màn nhập mã không bị chèn thêm một ô
        CAPTCHA trong lúc người dùng đang gõ, và token được lấy ngay trước lúc dùng thay vì
        nằm chờ hết cả phút cooldown.
      */}
      {captcha && secondsLeft === 0 && status !== 'success' && (
        <TurnstileWidget {...captcha.widgetProps} />
      )}

      <div className="flex items-center justify-between text-sm font-medium">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="text-slate-400 hover:text-white transition disabled:opacity-50 cursor-pointer"
          >
            ← Quay lại
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={secondsLeft > 0 || busy || (captcha ? !captcha.isVerified : false)}
          className="flex items-center gap-1.5 text-blue-400 hover:underline font-bold disabled:text-slate-500 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
          {secondsLeft > 0 ? `Gửi lại sau ${secondsLeft}s` : 'Gửi lại mã'}
        </button>
      </div>
    </form>
  );
}
