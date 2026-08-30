import { Turnstile } from '@marsidev/react-turnstile';
import { ShieldAlert } from 'lucide-react';
import useTheme from '../../hooks/useTheme';
import { useLanguage } from '../../context/LanguageContext';
import {
  IS_TURNSTILE_ENABLED,
  TURNSTILE_SITE_KEY,
  TURNSTILE_SIZE,
} from '../../constants/turnstile';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TurnstileWidget — ô CAPTCHA của Cloudflare, đã nối sẵn theme + ngôn ngữ app
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Phần hiển thị của cặp <TurnstileWidget /> + useTurnstile(); toàn bộ state
 * (token, lỗi, reset) nằm ở hook, xem hooks/useTurnstile.js. Đừng dùng thẳng
 * <Turnstile /> của thư viện ở các form: qua đây mới có sẵn khoá, theme, ngôn
 * ngữ và cách hiển thị lỗi thống nhất.
 *
 *   const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.REGISTER });
 *   <TurnstileWidget {...captcha.widgetProps} />
 *
 * @param {object}   props
 * @param {import('react').RefObject<any>} props.widgetRef Tay cầm tới widget
 *   (dùng cho .reset()) — useTurnstile truyền vào qua widgetProps
 * @param {string}  [props.action]    Nhãn thống kê, xem TURNSTILE_ACTIONS
 * @param {string}  [props.error]     Câu lỗi tiếng Việt do hook dựng sẵn
 * @param {Function}[props.onSuccess] Nhận token khi giải xong
 * @param {Function}[props.onExpire]  Token hết hạn
 * @param {Function}[props.onError]   Nhận mã lỗi của Turnstile
 * @param {string}  [props.className] Class cho khối bao ngoài
 */
export default function TurnstileWidget({
  widgetRef,
  action,
  error = '',
  onSuccess,
  onExpire,
  onError,
  className = '',
}) {
  // useTheme là store cấp module (không cần Provider) nên widget dùng được ở cả
  // trang đăng nhập lẫn trong modal.
  const { resolved } = useTheme();
  const { language } = useLanguage();

  // Chưa cấu hình khoá → không render gì. useTurnstile đã cho isVerified = true
  // trong trường hợp này nên form vẫn submit được; cảnh báo build production
  // thiếu khoá nằm ở constants/turnstile.js.
  if (!IS_TURNSTILE_ENABLED) return null;

  return (
    <div className={`w-full flex flex-col items-center justify-center min-h-[65px] ${className}`}>
      <div className="w-full flex items-center justify-center overflow-hidden rounded-xl">
        <Turnstile
          ref={widgetRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={onSuccess}
          onExpire={onExpire}
          onError={onError}
          options={{
            action,
            // Bám theo giao diện THỰC TẾ đang hiển thị (`resolved`) chứ không dùng
            // 'auto' của Turnstile: 'auto' đọc prefers-color-scheme của hệ điều
            // hành, nên người chọn tay Sáng/Tối trong Cài đặt sẽ thấy ô CAPTCHA
            // ngược tông với cả trang.
            theme: resolved,
            // 'vi' và 'en' đều nằm trong danh sách ngôn ngữ Turnstile hỗ trợ, khớp
            // đúng SUPPORTED của LanguageContext.
            language,
            size: TURNSTILE_SIZE,
          }}
          // Object `options` tạo mới mỗi lần render là AN TOÀN: thư viện tách từng
          // field ra làm dependency (action, theme, language, size...) chứ không so
          // sánh cả object, nên widget không bị dựng lại sau mỗi lần gõ phím trong
          // form.
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-400 text-center"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
