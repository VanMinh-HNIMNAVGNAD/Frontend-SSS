import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { LEGAL_DOCS, LEGAL_PATHS } from '../../constants/legal';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TermsAcceptanceGate — màn chặn "chưa đồng ý điều khoản thì chưa dùng app"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AI THẤY MÀN NÀY, và vì sao họ không thể đã đồng ý từ trước:
 *
 *   • Tài khoản tạo bằng Google / Facebook / GitHub. Luồng OAuth KHÔNG có ô tích
 *     nào để đi qua: bấm nút là rời trang sang nhà cung cấp, không có request
 *     nào của mình đi kèm để backend kiểm `acceptedTerms` như ở luồng mật khẩu
 *     (xem `handleSocialRegister` trong RegisterPage.jsx). Đây là chỗ duy nhất
 *     xin được sự đồng ý của họ.
 *   • Mọi tài khoản có trước 10/09/2026. Trước hôm đó `drwkmxjennie.fun` không
 *     có trang điều khoản nào, nên không ai từng đồng ý với thứ gì — migration
 *     027 cố ý KHÔNG backfill hai cột đó (điền `created_at` vào là ghi một điều
 *     không đúng). Họ sẽ gặp màn này ĐÚNG MỘT LẦN.
 *
 * ── VÌ SAO KHÔNG PHẢI MỘT MODAL ĐÓNG ĐƯỢC ──────────────────────────────────
 *
 * Không có nút X, không đóng bằng Esc, không đóng bằng cách bấm ra ngoài. Một
 * màn xin đồng ý mà bỏ qua được thì không phải là xin đồng ý. Người không muốn
 * đồng ý vẫn có một đường ra thật và nó nằm ngay trên màn hình: nút Đăng xuất.
 *
 * Cái này KHÔNG phải lớp bảo vệ dữ liệu — người dùng đã có phiên hợp lệ, họ gọi
 * API trực tiếp thì vẫn chạy. Nó là chỗ HỎI và GHI LẠI câu trả lời. Chặn thật ở
 * tầng API sẽ phải là một guard trên mọi endpoint, và cái giá của nó (mọi luồng
 * đều có thêm một nhánh 403 mới) không đổi được gì về ý nghĩa pháp lý: điều có
 * giá trị là đã hỏi, đã được đồng ý, và đã ghi lại thời điểm.
 *
 * Đặt trong `components/security/` cạnh TurnstileWidget và LegalConsent: cả ba
 * là các cánh cổng vào tài khoản, không phải thành phần giao diện thường.
 */
export default function TermsAcceptanceGate() {
  const { t } = useLanguage();
  const { needsTermsAcceptance, acceptTerms, logout } = useAuth();

  // isLoading của AuthContext dùng chung cho mọi luồng (nạp hồ sơ, đăng nhập...),
  // nên giữ cờ riêng ở đây: nếu không, nút này bị khoá vì một lượt refresh hồ sơ
  // xảy ra ở nơi khác.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  if (!needsTermsAcceptance) return null;

  const handleAccept = async () => {
    setLocalError('');
    setIsSubmitting(true);
    try {
      // Thành công thì AuthContext setUser bằng hồ sơ mới, `needsTermsAcceptance`
      // thành false, và component này tự biến mất ở lượt render kế tiếp — không
      // cần state "đã xong" nào ở đây.
      await acceptTerms();
    } catch (err) {
      console.error('Ghi nhận đồng ý điều khoản thất bại:', err);
      setLocalError(err.message || t('legal.gate.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const legalLink = (docId, label) => (
    <Link
      to={LEGAL_PATHS[docId]}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold underline decoration-blue-400/40 underline-offset-2"
    >
      <ScrollText className="w-3.5 h-3.5 shrink-0" />
      {label}
    </Link>
  );

  return (
    // z-index cao hơn mọi lớp khác của app (drawer, modal xem trước, thanh tiến
    // trình tải): màn này phải nằm TRÊN tất cả, nếu không nó chỉ là một tấm che
    // mà người dùng bấm xuyên qua được.
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0a0e17]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div className="w-full max-w-[520px] bg-[#111726] border border-white/[0.12] rounded-2xl p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
        <h2
          id="terms-gate-title"
          className="text-xl font-bold text-white tracking-tight"
        >
          {t('legal.gate.title')}
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {t('legal.gate.body')}
        </p>

        {/* Hai liên kết mở TAB MỚI — đây là màn chặn, điều hướng cùng tab thì
            người dùng đi đọc điều khoản xong không còn đường quay lại nút Đồng ý. */}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {legalLink(LEGAL_DOCS.TERMS, t('legal.terms'))}
          {legalLink(LEGAL_DOCS.PRIVACY, t('legal.privacy'))}
        </div>

        {localError && (
          <div className="mt-5 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300 text-center font-semibold">
            {localError}
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3">
          {/* Đường ra cho người KHÔNG đồng ý. Phải có mặt: một màn hình chỉ có
              đúng một lựa chọn thì "đồng ý" không còn là một lựa chọn. */}
          <button
            type="button"
            onClick={logout}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl text-slate-300 font-bold text-sm bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('legal.gate.decline')}
          </button>

          <button
            type="button"
            onClick={handleAccept}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm tracking-wide transition shadow-lg shadow-blue-600/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t('legal.gate.submitting') : t('legal.gate.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
