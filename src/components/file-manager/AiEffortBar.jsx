import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { localeTagOf } from '../../utils/locale';

/**
 * Nút "Mức suy luận" của khung Hỏi AI — Thấp / Vừa / Cao / Tối đa.
 *
 * 25/10/2026 đổi từ bốn vạch bấm trực tiếp sang một nút mở menu (cùng kiểu nút chọn model), vì bản
 * vạch có ba chỗ khó dùng: vạch rộng 5px khó bấm trên điện thoại; mô tả từng mức chỉ hiện khi rê
 * chuột, tức trên điện thoại không bao giờ thấy; và không nói mỗi mức chờ bao lâu — thứ duy nhất người
 * dùng thật sự cần để chọn. Nút vẫn giữ bốn vạch nhỏ để nhìn một lần là biết đang ở nấc nào.
 *
 * Mỗi mức trong menu có thời gian chờ ƯỚC TÍNH của CHÍNH model đang chọn (`seconds` — backend đo,
 * `effortSeconds` ở `backend/src/ai/ai-models.ts`): cùng chữ "Cao", Gemini 4 Argon chờ hơn một phút
 * còn 3.5 Flash-Lite chỉ hơn chục giây, và ở vài model hai mức liền nhau gần như bằng nhau — số đo nói
 * điều đó thẳng ra thay vì để người dùng đoán. Backend cũ không có số thì menu chỉ có mô tả.
 *
 * Mức là của TỪNG MODEL (khung chat nhớ riêng cho mỗi model — xem `GeminiModal`). Backend quy đổi ra
 * tham số của từng model — giao diện chỉ gửi một chữ.
 *
 * Bàn phím: nút là `aria-haspopup="listbox"`; menu mở thì ↑/↓ chuyển giữa các mức, Enter chọn, Esc
 * đóng. Trên nút đang đóng, ←/→ đổi mức luôn không cần mở menu.
 *
 * Props:
 *  - levels    các mức model này chỉnh được, thấp → cao (`status.models[].efforts`).
 *  - value     mức đang chọn.
 *  - onChange  (level) => void.
 *  - seconds   { low, medium, high, max } giây chờ ước tính, hoặc không có.
 *  - disabled  đang có lượt trả lời chạy — lượt đó đã đi bằng mức cũ rồi.
 */
const HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4.5'];
const MENU_WIDTH_REM = 19;

/** Bốn vạch cao dần, `lit` vạch đầu sáng — vẽ trên nút và ở đầu mỗi hàng của menu. */
function Bars({ count, lit, max }) {
    const tone = max ? 'bg-amber-500 dark:bg-amber-400' : 'bg-blue-600 dark:bg-blue-400';
    return (
        <span className="flex items-end gap-[2px] h-4.5 shrink-0" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    className={`block w-1 rounded-sm ${HEIGHTS[i] ?? 'h-4.5'} ${
                        i < lit ? tone : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                />
            ))}
        </span>
    );
}

export default function AiEffortBar({ levels, value, onChange, seconds, disabled = false }) {
    const { t, language } = useLanguage();
    const [open, setOpen] = useState(false);
    // Độ lệch (px) của menu so với mép trái nút — xem `toggle`.
    const [menuLeft, setMenuLeft] = useState(0);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const optionRefs = useRef([]);
    const index = Math.max(0, levels.indexOf(value));
    const current = levels[index];
    const number = useMemo(
        () => new Intl.NumberFormat(localeTagOf(language), { maximumFractionDigits: 1 }),
        [language],
    );

    // "≈ 12 giây" / "≈ 1,5 phút". Làm tròn thô có chủ ý: số đo dao động vài chục phần trăm giữa các
    // lượt, ghi "37 giây" là hứa một độ chính xác không có.
    const waitText = (level) => {
        const s = seconds?.[level];
        if (!Number.isFinite(s) || s <= 0) return null;
        if (s < 20) return t('ai.effort.waitSeconds', { n: number.format(Math.max(1, Math.round(s))) });
        if (s < 60) return t('ai.effort.waitSeconds', { n: number.format(Math.round(s / 5) * 5) });
        return t('ai.effort.waitMinutes', { n: number.format(Math.round(s / 30) / 2) });
    };

    const pick = (level) => {
        if (disabled || !levels.includes(level)) return;
        onChange(level);
        setOpen(false);
        triggerRef.current?.focus();
    };

    const toggle = () => {
        if (disabled) return;
        if (!open && triggerRef.current) {
            // Menu thả lên, canh trái nút; nút nằm giữa hay sát mép phải (điện thoại, hàng công cụ
            // xuống dòng) thì đẩy menu sang trái vừa đủ để nó nằm trọn trong màn hình, cách mép 16px.
            // Canh phải theo nút thì không đủ: nút ở giữa màn 360px làm menu tràn mép TRÁI.
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const { left } = triggerRef.current.getBoundingClientRect();
            const width = Math.min(MENU_WIDTH_REM * rem, window.innerWidth - 2 * rem);
            setMenuLeft(Math.max(16 - left, Math.min(0, window.innerWidth - 16 - width - left)));
        }
        setOpen((v) => !v);
    };

    useEffect(() => {
        if (!open) return undefined;
        optionRefs.current[index]?.focus();
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
        };
        // `index` cố ý không nằm trong danh sách: chỉ đặt tiêu điểm lúc vừa mở.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onTriggerKeyDown = (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step || open) return;
        event.preventDefault();
        const next = levels[Math.min(levels.length - 1, Math.max(0, index + step))];
        if (next && next !== current && !disabled) onChange(next);
    };

    const onListKeyDown = (event) => {
        const focused = optionRefs.current.indexOf(document.activeElement);
        let next = null;
        if (event.key === 'ArrowDown') next = Math.min(levels.length - 1, focused + 1);
        else if (event.key === 'ArrowUp') next = Math.max(0, focused - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = levels.length - 1;
        if (next === null) return;
        event.preventDefault();
        optionRefs.current[next]?.focus();
    };

    const isMax = current === 'max';
    const currentWait = waitText(current);

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                onKeyDown={onTriggerKeyDown}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`${t('ai.effort.label')}: ${t(`ai.effort.${current}`)}${currentWait ? `, ${currentWait}` : ''}`}
                title={`${t('ai.effort.label')}: ${t(`ai.effort.${current}`)} — ${t(`ai.effort.${current}.hint`)}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] ring-1 ring-black/[0.04] dark:ring-white/10 font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Bars count={levels.length} lit={index + 1} max={isMax} />
                <span
                    className={`whitespace-nowrap ${
                        isMax ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-gray-200'
                    }`}
                >
                    {t(`ai.effort.${current}`)}
                </span>
                {currentWait && (
                    <span className="hidden sm:inline whitespace-nowrap text-gray-500 dark:text-gray-400 font-normal">
                        {currentWait}
                    </span>
                )}
                <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                // Khung kính không cuộn — xem chú thích cùng chỗ ở AiModelPicker (lớp blur `::before`).
                <div
                    className="glass-strong absolute bottom-full mb-2 z-30 rounded-[20px] overflow-hidden animate-glass-in origin-bottom"
                    style={{ left: menuLeft, width: `min(${MENU_WIDTH_REM}rem, calc(100vw - 2rem))` }}
                >
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('ai.effort.label')}
                    </div>
                    <div role="listbox" aria-label={t('ai.effort.label')} onKeyDown={onListKeyDown} className="p-1.5 pt-0">
                        {levels.map((level, i) => {
                            const active = level === current;
                            const wait = waitText(level);
                            const max = level === 'max';
                            return (
                                <button
                                    key={level}
                                    ref={(el) => {
                                        optionRefs.current[i] = el;
                                    }}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => pick(level)}
                                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-[12px] text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        active ? 'bg-blue-500/10 dark:bg-blue-400/15' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <span className="pt-0.5">
                                        <Bars count={levels.length} lit={i + 1} max={max} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span
                                                className={`text-[13px] font-semibold ${
                                                    max
                                                        ? 'text-amber-700 dark:text-amber-300'
                                                        : 'text-gray-900 dark:text-gray-100'
                                                }`}
                                            >
                                                {t(`ai.effort.${level}`)}
                                            </span>
                                            {wait && (
                                                <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400">
                                                    {wait}
                                                </span>
                                            )}
                                        </span>
                                        <span className="block text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-0.5">
                                            {t(`ai.effort.${level}.hint`)}
                                        </span>
                                    </span>
                                    <span className="w-3.5 shrink-0 pt-0.5">
                                        {active && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="px-3 pt-1.5 pb-2.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400 border-t border-glass-divider">
                        {t(seconds ? 'ai.effort.footnoteTimed' : 'ai.effort.footnote')}
                    </p>
                </div>
            )}
        </div>
    );
}
