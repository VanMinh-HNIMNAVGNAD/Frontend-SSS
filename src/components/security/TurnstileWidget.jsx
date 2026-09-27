import { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Loader2, ShieldAlert } from 'lucide-react';
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
 * (token, lỗi, vòng đời, reset) nằm ở hook, xem hooks/useTurnstile.js. Đừng dùng
 * thẳng <Turnstile /> của thư viện ở các form: qua đây mới có sẵn khoá, theme,
 * ngôn ngữ, trạng thái đang tải và cách hiển thị lỗi thống nhất.
 *
 *   const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.REGISTER });
 *   <TurnstileWidget {...captcha.widgetProps} />
 *
 * @param {object}   props
 * @param {import('react').RefObject<any>} props.widgetRef Tay cầm tới widget
 *   (dùng cho .reset()) — useTurnstile truyền vào qua widgetProps
 * @param {string}  [props.action]    Nhãn thống kê, xem TURNSTILE_ACTIONS
 * @param {string}  [props.error]     Câu lỗi đã dịch sẵn do hook dựng
 * @param {boolean} [props.isReady]   Widget đã render xong chưa — quyết định có
 *   che lớp "đang tải" lên trên hay không
 * @param {Function}[props.onMount]      Widget vừa gắn vào cây React
 * @param {Function}[props.onUnmount]    Widget vừa bị gỡ khỏi cây React
 * @param {Function}[props.onWidgetLoad] Cloudflare đã render xong ô xác minh
 * @param {Function}[props.onSuccess]    Nhận token khi giải xong
 * @param {Function}[props.onExpire]     Token hết hạn
 * @param {Function}[props.onError]      Nhận mã lỗi của Turnstile
 * @param {Function}[props.onTimeout]    Challenge chạy quá lâu, widget bỏ cuộc
 * @param {Function}[props.onUnsupported] Trình duyệt không chạy được Turnstile
 * @param {string}  [props.className] Class cho khối bao ngoài
 */
export default function TurnstileWidget({
  widgetRef,
  action,
  error = '',
  isReady = false,
  onMount,
  onUnmount,
  onWidgetLoad,
  onSuccess,
  onExpire,
  onError,
  onTimeout,
  onUnsupported,
  className = '',
}) {
  // useTheme là store cấp module (không cần Provider) nên widget dùng được ở cả
  // trang đăng nhập lẫn trong modal.
  const { resolved } = useTheme();
  const { language, t } = useLanguage();

  // Báo vòng đời về cho useTurnstile. Phải nằm TRƯỚC nhánh `return null` bên
  // dưới — hook không được gọi có điều kiện.
  //
  // Cặp mount/unmount này là thứ cho phép hook phân biệt "widget đang tải" với
  // "không có widget nào cả". Không có nó, <OtpForm /> — nơi ô CAPTCHA chỉ hiện
  // khi đồng hồ gửi lại về 0 — sẽ bị đồng hồ chờ trong hook kết luận nhầm là
  // script tải hỏng suốt 60 giây đầu.
  useEffect(() => {
    if (!IS_TURNSTILE_ENABLED) return undefined;
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);

  // Chưa cấu hình khoá → không render gì. useTurnstile đã cho isVerified = true
  // trong trường hợp này nên form vẫn submit được; cảnh báo build production
  // thiếu khoá nằm ở constants/turnstile.js.
  if (!IS_TURNSTILE_ENABLED) return null;

  return (
    <div className={`w-full flex flex-col items-center justify-center min-h-[65px] ${className}`}>
      <div className="relative w-full flex items-center justify-center overflow-hidden rounded-xl">
        <Turnstile
          ref={widgetRef}
          siteKey={TURNSTILE_SITE_KEY}
          onWidgetLoad={onWidgetLoad}
          onSuccess={onSuccess}
          onExpire={onExpire}
          onError={onError}
          onTimeout={onTimeout}
          onUnsupported={onUnsupported}
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

        {/* Trong lúc script Cloudflare chưa về, chỗ này chỉ là một ô trống 65px —
            nút submit bị khoá mà không ai biết vì sao. Lớp phủ này nói ra điều đó.
            `pointer-events-none` để nó không nuốt cú bấm vào widget ở đúng khoảnh
            khắc widget vừa hiện ra. */}
        {!isReady && (
          <div
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs font-semibold text-slate-500 dark:text-slate-400 pointer-events-none"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('turnstile.loading')}</span>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 text-center"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
