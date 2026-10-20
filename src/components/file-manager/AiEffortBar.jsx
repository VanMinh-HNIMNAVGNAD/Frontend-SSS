import { useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Thanh "Mức suy luận" của khung Hỏi AI (20/10/2026) — Thấp / Vừa / Cao / Tối đa.
 *
 * Bốn VẠCH cao dần, kiểu cột sóng điện thoại: số vạch sáng là mức đang chọn, bấm vạch nào là chọn
 * mức đó. Không phải một menu thả như nút chọn model: bốn lựa chọn có thứ tự thì nhìn một lần là
 * biết đang ở nấc nào và còn bao nhiêu nấc, còn menu thì phải mở ra mới thấy.
 *
 * Mức là của TỪNG MODEL (khung chat nhớ riêng cho mỗi model — xem `GeminiModal`), vì cùng một chữ
 * "Cao" quy ra tham số khác nhau ở mỗi model và tốn thời gian khác nhau hẳn: Gemini 4 Argon ở mức
 * Cao có thể nghĩ vài phút, 3.5 Flash chỉ vài giây. Backend quy đổi — giao diện chỉ gửi một chữ.
 *
 * Bàn phím: là một `radiogroup` — Tab vào mức đang chọn, mũi tên trái/phải (lên/xuống) đổi mức,
 * đúng cách trình đọc màn hình đọc một nhóm lựa chọn loại trừ nhau.
 *
 * Props:
 *  - levels    các mức model này chỉnh được, thấp → cao (`status.models[].efforts`).
 *  - value     mức đang chọn.
 *  - onChange  (level) => void.
 *  - disabled  đang có lượt trả lời chạy — lượt đó đã đi bằng mức cũ rồi.
 */
const HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4.5'];

export default function AiEffortBar({ levels, value, onChange, disabled = false }) {
    const { t } = useLanguage();
    const buttonsRef = useRef([]);
    const index = Math.max(0, levels.indexOf(value));
    const current = levels[index];

    const select = (next) => {
        const level = levels[next];
        if (!level || disabled) return;
        onChange(level);
        buttonsRef.current[next]?.focus();
    };

    const onKeyDown = (event) => {
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
        if (step) {
            event.preventDefault();
            select(Math.min(levels.length - 1, Math.max(0, index + step)));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            select(event.key === 'Home' ? 0 : levels.length - 1);
        }
    };

    // Mức Tối đa đổi màu cảnh báo: nó là mức duy nhất mà người dùng cần biết trước là sẽ chờ lâu
    // và tốn hạn mức nhất — nói bằng màu ngay trên thanh, không bắt họ rê chuột đọc chú thích.
    const isMax = current === 'max';
    const activeTone = isMax ? 'bg-amber-500 dark:bg-amber-400' : 'bg-blue-600 dark:bg-blue-400';

    return (
        <div
            role="radiogroup"
            aria-label={t('ai.effort.label')}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            title={`${t('ai.effort.label')}: ${t(`ai.effort.${current}`)} — ${t(`ai.effort.${current}.hint`)}`}
            className={`shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 ${
                disabled ? 'opacity-50' : ''
            }`}
        >
            <span className="flex items-end h-4.5">
                {levels.map((level, i) => {
                    const lit = i <= index;
                    return (
                        <button
                            key={level}
                            ref={(el) => {
                                buttonsRef.current[i] = el;
                            }}
                            type="button"
                            role="radio"
                            aria-checked={level === current}
                            aria-label={`${t(`ai.effort.${level}`)} — ${t(`ai.effort.${level}.hint`)}`}
                            title={`${t(`ai.effort.${level}`)} — ${t(`ai.effort.${level}.hint`)}`}
                            // Chỉ mức đang chọn nằm trong thứ tự Tab (roving tabindex) — đúng mẫu radiogroup.
                            tabIndex={level === current ? 0 : -1}
                            disabled={disabled}
                            onClick={() => select(i)}
                            // Vùng bấm rộng hơn vạch vẽ (vạch 5px, vùng bấm 11px × cả chiều cao thanh),
                            // không thì trên màn cảm ứng gần như không bấm trúng vạch thấp nhất.
                            className="group flex items-end justify-center w-2.75 h-full cursor-pointer disabled:cursor-not-allowed focus:outline-none"
                        >
                            <span
                                className={`block w-1.25 rounded-sm transition-colors ${HEIGHTS[i] ?? 'h-4.5'} ${
                                    lit
                                        ? activeTone
                                        : 'bg-gray-300 dark:bg-gray-600 group-hover:bg-gray-400 dark:group-hover:bg-gray-500'
                                } group-focus-visible:ring-2 group-focus-visible:ring-blue-500 group-focus-visible:ring-offset-1 dark:group-focus-visible:ring-offset-gray-800`}
                            />
                        </button>
                    );
                })}
            </span>
            <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                    isMax ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-200'
                }`}
            >
                {t(`ai.effort.${current}`)}
            </span>
        </div>
    );
}
