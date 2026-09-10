import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { LEGAL_DOCS, LEGAL_PATHS } from '../../constants/legal';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LegalConsent — ô "tôi đồng ý" của trang đăng ký, và câu ghi chú ở trang đăng nhập
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nằm cạnh TurnstileWidget trong `components/security/` là CÓ Ý: hai thứ này là
 * hai nửa của cùng một cánh cổng vào tài khoản. Turnstile trả lời "có phải người
 * thật không", ô này trả lời "người đó có đồng ý với điều khoản không". Trang
 * đăng ký chỉ mở khi CẢ HAI đều xong (xem RegisterPage.jsx).
 *
 * ── VÌ SAO LINK PHẢI MỞ TAB MỚI ─────────────────────────────────────────────
 *
 * `target="_blank"`. Người dùng đang điền dở form — nickname, email, mật khẩu,
 * và một ô CAPTCHA đã giải xong — mà bấm vào "Điều khoản sử dụng" thì điều hướng
 * cùng tab sẽ xoá sạch cả bốn thứ đó: state của trang là state trong bộ nhớ, và
 * token Turnstile thì không lấy lại được, phải giải lại từ đầu. Đó chính là chỗ
 * người ta bỏ luôn việc đăng ký. Kèm `rel="noopener noreferrer"` vì đó là điều
 * bắt buộc đi cùng `target="_blank"`.
 */

/**
 * Dựng câu có chèn liên kết từ một khoá dịch.
 *
 * Bản dịch giữ nguyên hình dạng một CÂU HOÀN CHỈNH với hai chỗ trống —
 * 'Tôi đã đọc và đồng ý với {terms} và {privacy}.' — rồi hàm này cắt câu tại
 * các chỗ trống và thay bằng <Link>.
 *
 * VÌ SAO KHÔNG GHÉP CHUỖI: `t('a') + <Link/> + t('b')` là khoá cứng trật tự từ
 * của tiếng Việt vào mọi ngôn ngữ. Tiếng Anh đặt hai liên kết ở vị trí khác, và
 * ngôn ngữ thứ ba sau này lại khác nữa. Đây cũng đúng lý do `t()` trong
 * LanguageContext nhận tham số thay vì để nơi gọi tự ghép.
 *
 * `t(key)` gọi KHÔNG kèm tham số nên trả về nguyên bản mẫu, chỗ trống còn đó để
 * cắt. `scripts/check-i18n.mjs` vẫn soi được khoá vì nó là chuỗi literal, và nó
 * cũng canh luôn hai bản dịch có cùng bộ chỗ trống.
 *
 * @param {string} template Câu mẫu còn nguyên {terms} / {privacy}
 * @param {Record<string, { to: string, label: string }>} links
 */
function withLegalLinks(template, links) {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    const link = name ? links[name] : null;
    // Chỗ trống lạ (bản dịch gõ sai tên) được GIỮ NGUYÊN dạng {tên} để lỗi nhìn
    // thấy được, thay vì lặng lẽ mất một liên kết bắt buộc phải có.
    if (!link) return part;
    return (
      <Link
        key={index}
        to={link.to}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 font-bold underline decoration-blue-400/40 underline-offset-2"
      >
        {link.label}
      </Link>
    );
  });
}

/** Hai liên kết dùng chung cho cả ô tích và câu ghi chú. */
function useLegalLinks() {
  const { t } = useLanguage();
  return {
    terms: { to: LEGAL_PATHS[LEGAL_DOCS.TERMS], label: t('legal.terms') },
    privacy: { to: LEGAL_PATHS[LEGAL_DOCS.PRIVACY], label: t('legal.privacy') },
  };
}

/**
 * Ô tích bắt buộc ở trang ĐĂNG KÝ.
 *
 * KHÔNG tự nhớ trạng thái: `checked` do trang đăng ký giữ, vì chính trang đó mới
 * là nơi quyết định có cho submit hay không và cần đọc giá trị lúc gửi request.
 *
 * KHÔNG mặc định tích sẵn — sự đồng ý phải là một hành động của người dùng, ô
 * đã tích sẵn thì không còn là đồng ý.
 *
 * @param {{ checked: boolean, onChange: (next: boolean) => void, disabled?: boolean }} props
 */
export function LegalConsentCheckbox({ checked, onChange, disabled = false }) {
  const { t } = useLanguage();
  const links = useLegalLinks();

  return (
    <label className="flex items-start gap-3 cursor-pointer select-none group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        // `required` để trình duyệt cũng chặn ở lớp HTML: nút submit đã bị khoá
        // theo state rồi, nhưng người dùng bấm Enter trong ô mật khẩu là một
        // đường submit khác, và câu nhắc mặc định của trình duyệt xuất hiện ngay
        // cạnh ô tích — gần hơn khối lỗi đỏ ở đầu form.
        required
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-white/20 bg-transparent text-blue-600 focus:ring-2 focus:ring-blue-500/40 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
      />
      <span className="text-[13px] leading-relaxed font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
        {withLegalLinks(t('legal.consent.checkbox'), links)}
      </span>
    </label>
  );
}

/**
 * Câu ghi chú ở trang ĐĂNG NHẬP (và mọi chỗ chỉ cần dẫn đường tới hai tài liệu).
 *
 * Không có ô tích ở đây, và đó là chủ ý: người đăng nhập đã đồng ý ở lần đăng ký
 * rồi, bắt tích lại mỗi lần vào là làm phiền mà không thêm được gì. Nhưng liên
 * kết thì VẪN phải có mặt — bảng điều khiển của Meta đòi điều khoản phải tiếp cận
 * được từ luồng đăng nhập, và người dùng cần một đường tới chúng mà không phải
 * đăng nhập trước.
 */
export function LegalNotice() {
  const { t } = useLanguage();
  const links = useLegalLinks();

  return (
    <p className="text-center text-[12px] leading-relaxed font-medium text-slate-500">
      {withLegalLinks(t('legal.consent.notice'), links)}
    </p>
  );
}
