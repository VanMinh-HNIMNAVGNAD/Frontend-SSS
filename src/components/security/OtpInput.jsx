import { useEffect, useRef } from 'react';

import { useLanguage } from '../../context/LanguageContext';

const LENGTH = 6;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OtpInput — 6 ô vuông nhập mã, mỗi ô một chữ số
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Component "được điều khiển": nó không giữ state, chỉ nhận `value` (chuỗi 0–6 ký tự) và
 * báo ra `onChange`. Giữ state ở cha để cha còn xoá mã sau khi gửi lại, và để trạng thái
 * đúng/sai (`status`) do cha quyết định.
 *
 * Ba việc dễ làm sai mà component này lo sẵn:
 *  1. Dán 6 số cùng lúc — người dùng gần như luôn copy mã từ email chứ không gõ tay.
 *  2. Backspace ở ô trống phải lùi về ô trước, nếu không muốn xoá phải bấm mũi tên.
 *  3. Con trỏ luôn nhảy tới ô trống đầu tiên, không cho gõ lộn xộn giữa chừng.
 *
 * @param {object}   props
 * @param {string}   props.value      Mã hiện tại (0–6 chữ số)
 * @param {Function} props.onChange   (chuỗi mới) => void
 * @param {Function} [props.onComplete] Gọi khi vừa đủ 6 số — để tự submit
 * @param {'idle'|'error'|'success'} [props.status]
 * @param {boolean}  [props.disabled]
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  status = 'idle',
  disabled = false,
}) {
  const { t } = useLanguage();
  const inputsRef = useRef([]);

  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');
  const focusIndex = Math.min(value.length, LENGTH - 1);

  // Con trỏ nhảy vào ô đầu khi mở màn: người dùng vừa chuyển từ hòm thư sang, bắt họ bấm
  // thêm một lần nữa là thừa.
  useEffect(() => {
    if (!disabled) inputsRef.current[0]?.focus();
    // Chỉ chạy một lần lúc gắn — sau đó việc di chuyển con trỏ do handleChange lo.
  }, [disabled]);

  const setValue = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) {
      onComplete?.(clean);
    }
    return clean;
  };

  const handleChange = (index, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;

    // Gõ vào ô thứ i thì ghi đè đúng ký tự thứ i rồi đẩy con trỏ sang phải. Dùng
    // `value.slice` chứ không dựa vào `digits` (đã đệm khoảng trắng) để không sinh ra
    // khoảng trắng lọt vào giữa mã.
    const before = value.slice(0, index);
    const after = value.slice(index + 1);
    const next = setValue(`${before}${typed[0]}${after}`);

    const target = Math.min(index + 1, LENGTH - 1);
    if (next.length < LENGTH) inputsRef.current[target]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        // Ô đang có số: xoá đúng ô đó, con trỏ ở nguyên chỗ.
        setValue(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        // Ô trống: lùi lại và xoá ô trước — hành vi người dùng luôn mong đợi.
        setValue(value.slice(0, index - 1) + value.slice(index));
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  /**
   * Dán cả mã cùng lúc. Bắt ở tầng ô nhập chứ không để trình duyệt tự xử lý: mặc định nó
   * nhét toàn bộ chuỗi vào MỘT ô (maxLength=1 nên chỉ còn ký tự đầu), tức là dán mã từ
   * email sẽ mất 5 chữ số.
   *
   * `replace(/\D/g)` để mã kèm khoảng trắng hoặc gạch ngang ("123 456") vẫn dán được.
   */
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    const next = setValue(pasted);
    inputsRef.current[Math.min(next.length, LENGTH - 1)]?.focus();
  };

  // Màu viền theo trạng thái. Trạng thái được truyền đạt bằng CẢ màu lẫn icon (ở OtpForm)
  // chứ không chỉ màu — người mù màu vẫn phân biệt được đúng/sai.
  const boxClass = (index) => {
    const base =
      'w-full aspect-square max-w-[52px] rounded-xl text-center text-2xl font-bold text-white bg-white/[0.03] border outline-none transition-all duration-200';
    if (status === 'success') {
      return `${base} border-emerald-500 ring-2 ring-emerald-500/40 text-emerald-300`;
    }
    if (status === 'error') {
      return `${base} border-red-500 ring-2 ring-red-500/30 text-red-300`;
    }
    const filled = Boolean(value[index]);
    return `${base} ${
      filled ? 'border-blue-500/60' : 'border-white/10'
    } focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30`;
  };

  return (
    <div
      className={`flex justify-center gap-2 sm:gap-3 ${
        status === 'error' ? 'animate-[otpShake_0.4s_ease-in-out]' : ''
      }`}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          // `type="text"` + `inputMode="numeric"`: `type="number"` cho gõ 'e', '+', '-' và
          // hiện mũi tên tăng/giảm hoàn toàn vô nghĩa ở đây.
          type="text"
          inputMode="numeric"
          // Trình duyệt/iOS tự điền mã từ SMS hoặc email vào ô ĐẦU TIÊN nhờ thuộc tính này;
          // handlePaste lo phần rải ra 6 ô.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={digit.trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          // Không cho bấm nhảy cóc vào ô giữa khi các ô trước còn trống — mã phải điền
          // tuần tự, nếu không sẽ sinh ra khoảng trống trong chuỗi.
          onClick={() => inputsRef.current[focusIndex]?.focus()}
          aria-label={t('otp.digitAria', { index: index + 1 })}
          className={boxClass(index)}
        />
      ))}
    </div>
  );
}
