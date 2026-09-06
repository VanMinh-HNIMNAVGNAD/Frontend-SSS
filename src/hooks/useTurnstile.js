import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  CAPTCHA_TOKEN_FIELD,
  IS_TURNSTILE_ENABLED,
  TURNSTILE_EXPIRED_KEY,
  TURNSTILE_LOAD_TIMEOUT_MS,
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
 * ── VÌ SAO HOOK PHẢI BIẾT WIDGET ĐÃ TẢI XONG HAY CHƯA ───────────────────────
 *
 * Bản trước chỉ theo dõi đúng một thứ: có token hay không. Điều đó bỏ sót cả
 * quãng đời TRƯỚC khi có token, mà đó lại là quãng người dùng nhìn thấy:
 *
 *   mount ──(tải script cloudflare)──▶ render widget ──(giải)──▶ có token
 *         └──────────── 'mounting' ───┘└──── 'ready' ────┘
 *
 * Trong pha 'mounting' màn hình chỉ là một ô trống 65px. Nút submit lúc đó bị
 * khoá (vì chưa có token) nhưng KHÔNG có gì nói cho người dùng biết vì sao, và
 * nếu script bị adblock/tường lửa chặn thì nó khoá vĩnh viễn trong im lặng.
 *
 * Vì vậy `phase` được tách riêng khỏi `token`:
 *   • `isReady`    — widget đã render thật, ô xác minh đã hiện ra;
 *   • `isVerified` — đã render XONG *và* đã có token.
 *
 * `isVerified` đòi cả hai chứ không chỉ token: token do Cloudflare cấp có thể
 * tới trước khi widget vẽ xong trạng thái "tích xanh", và một nút submit bật
 * lên trong lúc ô xác minh còn đang quay là thứ người dùng đọc thành "chưa xác
 * minh mà vẫn bấm được".
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
   * Vòng đời của widget, do <TurnstileWidget /> báo về:
   *
   *   'idle'     — không có widget nào đang gắn trên cây React. Đây là trạng
   *                thái BÌNH THƯỜNG chứ không phải lỗi: <OtpForm /> chỉ hiện ô
   *                CAPTCHA khi đồng hồ "Gửi lại mã" về 0, nên suốt 60 giây đầu
   *                widget cố tình không tồn tại.
   *   'mounting' — đã gắn, đang chờ script Cloudflare tải + render.
   *   'ready'    — widget đã render, người dùng nhìn thấy ô xác minh thật.
   */
  const [phase, setPhase] = useState('idle');

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

  // ── Vòng đời widget ───────────────────────────────────────────────────────

  const handleMount = useCallback(() => {
    // Không hạ cấp 'ready' → 'mounting'. Effect của component con (<Turnstile />)
    // chạy TRƯỚC effect của component cha (<TurnstileWidget />), nên khi script
    // Cloudflare đã nằm sẵn trong trang — trường hợp chuyển từ /login sang
    // /register — onWidgetLoad về đích trước cả handleMount này.
    setPhase((prev) => (prev === 'ready' ? prev : 'mounting'));
  }, []);

  const handleWidgetLoad = useCallback(() => {
    setPhase('ready');
    // Xoá câu "không tải được" nếu đồng hồ chờ đã kịp bắn trước khi widget về đích.
    setError('');
  }, []);

  const handleUnmount = useCallback(() => {
    setPhase('idle');
    setError('');
    // Widget bị gỡ khỏi DOM ⇒ không còn ô xác minh nào để người dùng làm lại.
    // Giữ token cũ ở đây là mời gọi gửi đi một chuỗi mà màn hình không hề thể
    // hiện là đã xác minh.
    setToken(null);
  }, []);

  // Script Cloudflare không tải được (adblock, tường lửa công ty, mạng chặn
  // challenges.cloudflare.com) thì KHÔNG có callback nào bắn cả — không lỗi,
  // không timeout, không gì hết. Đồng hồ này là đường duy nhất để trạng thái đó
  // nói được thành lời thay vì để người dùng nhìn nút xám mãi.
  useEffect(() => {
    if (phase !== 'mounting') return undefined;
    const id = setTimeout(() => setError(t('turnstile.loadFailed')), TURNSTILE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase, t]);

  // ── Kết quả giải challenge ────────────────────────────────────────────────

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

  // `timeout-callback`: challenge chạy quá lâu rồi bỏ cuộc. Widget tự thử lại
  // (`retry: auto`) nhưng bản trước không nối callback này, nên người dùng chỉ
  // thấy ô xác minh tự nhiên quay lại từ đầu mà không hiểu vì sao.
  const handleTimeout = useCallback(() => {
    setToken(null);
    setError(t('turnstile.timeout', { suffix: '' }));
  }, [t]);

  // `unsupported-callback`: trình duyệt quá cũ, Turnstile từ chối chạy. Đây là
  // ngõ cụt — không thử lại được — nên phải nói thẳng thay vì để nút khoá câm.
  const handleUnsupported = useCallback(() => {
    setToken(null);
    setError(t('turnstile.unsupported'));
  }, [t]);

  /**
   * Xoá token hiện tại và yêu cầu widget lấy token mới.
   *
   * `widgetRef.current?.reset()` tự no-op (chỉ console.warn) khi script
   * Turnstile chưa tải xong hoặc khi CAPTCHA đang tắt vì thiếu khoá — không cần
   * bọc thêm điều kiện ở phía form.
   *
   * KHÔNG đụng vào `phase`: reset chỉ chạy lại challenge bên trong một widget
   * ĐÃ render xong, ô xác minh vẫn nằm nguyên đó.
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

  // CAPTCHA tắt (thiếu khoá) thì cả hai cờ luôn true, nếu không cả form sẽ kẹt
  // vĩnh viễn trên máy chưa cấu hình khoá. Việc chặn thật nằm ở backend, nơi
  // verify token với Cloudflare (và nó fail-closed: thiếu TURNSTILE_SECRET_KEY
  // là trả 503 chứ không cho qua).
  const isReady = IS_TURNSTILE_ENABLED ? phase === 'ready' : true;

  return {
    token,
    error,

    /**
     * Ô xác minh đã hiện ra trên màn hình hay chưa.
     *
     * Dùng để phân biệt hai câu nói với người dùng — "đang tải, chờ chút" khác
     * hẳn "hãy tích vào ô xác minh" — và để đặt nhãn nút submit. Không dùng cờ
     * này một mình để cho phép gửi form: xem `isVerified`.
     */
    isReady,

    /**
     * Đủ điều kiện để GỬI form hay chưa — CHỈ dùng để bật/tắt nút submit.
     *
     * Đòi ĐỒNG THỜI widget đã render xong và đã có token. Xem khối giải thích ở
     * đầu file. Đây không phải lớp bảo vệ: bot bỏ qua UI và gọi thẳng API là
     * chuyện bình thường, chặn thật nằm ở backend.
     */
    isVerified: IS_TURNSTILE_ENABLED ? phase === 'ready' && Boolean(token) : true,

    reset,
    payload,

    /** Spread thẳng vào <TurnstileWidget {...captcha.widgetProps} /> */
    widgetProps: {
      widgetRef,
      action,
      error,
      isReady: phase === 'ready',
      onMount: handleMount,
      onUnmount: handleUnmount,
      onWidgetLoad: handleWidgetLoad,
      onSuccess: handleSuccess,
      onExpire: handleExpire,
      onError: handleError,
      onTimeout: handleTimeout,
      onUnsupported: handleUnsupported,
    },
  };
}
