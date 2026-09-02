import { useCallback, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  CAPTCHA_TOKEN_FIELD,
  IS_TURNSTILE_ENABLED,
  TURNSTILE_EXPIRED_KEY,
  describeTurnstileError,
} from '../constants/turnstile';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * useTurnstile — giữ token CAPTCHA cho MỘT form
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ghép cặp với <TurnstileWidget /> (components/security/TurnstileWidget.jsx):
 * hook giữ state + ref, widget chỉ lo phần hiển thị. Tách ra để form không phải
 * tự nhớ ba việc dễ quên: xoá token khi hết hạn, xoá token khi lỗi, và reset
 * widget sau mỗi lần submit.
 *
 * CÁCH DÙNG:
 *
 *   const captcha = useTurnstile({ action: TURNSTILE_ACTIONS.REGISTER });
 *
 *   <TurnstileWidget {...captcha.widgetProps} />
 *   <button disabled={!captcha.isVerified}>Tạo tài khoản</button>
 *
 *   try {
 *     await authApi.register({ email, password, fullName, ...captcha.payload() });
 *   } finally {
 *     captcha.reset();   // BẮT BUỘC — token dùng một lần, xem constants/turnstile.js
 *   }
 *
 * Đặt reset() trong `finally` chứ không chỉ ở nhánh thành công: request hỏng
 * (email trùng, mạng đứt) thì người dùng sẽ bấm gửi lại, mà token cũ đã bị
 * Cloudflare ghi nhận là đã dùng → lần thứ hai backend trả
 * `timeout-or-duplicate` và người dùng thấy một lỗi hoàn toàn không liên quan
 * đến việc họ vừa làm.
 *
 * @param {{ action?: string }} [options] `action` chỉ là nhãn thống kê — xem
 *   TURNSTILE_ACTIONS trong constants/turnstile.js
 */
export default function useTurnstile({ action } = {}) {
  const { t } = useLanguage();

  /** Tay cầm tới widget để gọi .reset() — do <TurnstileWidget /> gắn vào */
  const widgetRef = useRef(null);
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');

  /**
   * Dựng câu lỗi từ mô tả `{ key, params }` mà `describeTurnstileError` trả về.
   * `params.suffix` lại là một mô tả lồng (khoá + mã) nên phải dịch trước rồi
   * mới nhúng vào câu ngoài.
   */
  const messageOf = useCallback(
    ({ key, params }) => {
      const suffix = params?.suffix ? t(params.suffix.key, { code: params.suffix.code }) : '';
      return t(key, { suffix });
    },
    [t],
  );

  const handleSuccess = useCallback((newToken) => {
    setToken(newToken);
    setError('');
  }, []);

  // Hết hạn KHÔNG phải lỗi của người dùng: widget mặc định `refresh-expired:
  // auto` nên nó tự lấy token mới, chỉ cần bỏ token cũ đi để nút submit không
  // gửi lên một chuỗi đã chết.
  const handleExpire = useCallback(() => {
    setToken(null);
    setError(t(TURNSTILE_EXPIRED_KEY));
  }, [t]);

  const handleError = useCallback(
    (code) => {
      setToken(null);
      setError(messageOf(describeTurnstileError(code)));
    },
    [messageOf],
  );

  /**
   * Xoá token hiện tại và yêu cầu widget lấy token mới.
   *
   * `widgetRef.current?.reset()` tự no-op (chỉ console.warn) khi script
   * Turnstile chưa tải xong hoặc khi CAPTCHA đang tắt vì thiếu khoá — không cần
   * bọc thêm điều kiện ở phía form.
   */
  const reset = useCallback(() => {
    setToken(null);
    setError('');
    widgetRef.current?.reset();
  }, []);

  /**
   * Phần thân request cần ghép vào body: `{ captchaToken: '...' }`.
   *
   * Trả về object RỖNG khi CAPTCHA tắt — để không gửi lên `captchaToken: null`,
   * vốn là thứ ValidationPipe của backend từ chối khác hẳn với "không có
   * field". Dùng spread ở nơi gọi: `{ email, ...captcha.payload() }`.
   */
  const payload = useCallback(
    () => (IS_TURNSTILE_ENABLED && token ? { [CAPTCHA_TOKEN_FIELD]: token } : {}),
    [token],
  );

  return {
    token,
    error,

    /**
     * Đã có token để gửi hay chưa — CHỈ dùng để bật/tắt nút submit.
     *
     * CAPTCHA tắt (thiếu khoá) thì luôn true, nếu không cả form sẽ kẹt vĩnh viễn
     * trên máy chưa cấu hình khoá. Việc chặn thật nằm ở backend, nơi verify
     * token với Cloudflare.
     */
    isVerified: IS_TURNSTILE_ENABLED ? Boolean(token) : true,

    reset,
    payload,

    /** Spread thẳng vào <TurnstileWidget {...captcha.widgetProps} /> */
    widgetProps: {
      widgetRef,
      action,
      error,
      onSuccess: handleSuccess,
      onExpire: handleExpire,
      onError: handleError,
    },
  };
}
