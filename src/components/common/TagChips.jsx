import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { DEFAULT_TAG_COLOR } from '../../constants/tags';

/**
 * Chip nhãn trên hàng/thẻ tệp (##91). Bấm một chip là mở trang "Nhãn" của nó — chặn nổi bọt để cú
 * bấm không đồng thời chọn hàng hay mở tệp.
 *
 * Hiện tối đa `max` chip rồi "+N": một tệp gắn chục nhãn không được đẩy cột tên ra khỏi màn hình.
 * Không có nhãn thì không vẽ gì — kể cả khoảng trống.
 */
function TagChips({ tags, max = 3, className = '' }) {
    const navigate = useNavigate();
    const { t } = useLanguage();
    if (!Array.isArray(tags) || tags.length === 0) return null;

    const shown = tags.slice(0, max);
    const rest = tags.length - shown.length;

    return (
        <span className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
            {shown.map((tag) => {
                const color = tag.colorHex || DEFAULT_TAG_COLOR;
                return (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/app/tags/${tag.id}`);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        title={t('tags.openTag', { name: tag.name })}
                        className="inline-flex items-center gap-1 max-w-[120px] px-1.5 py-[1px] rounded-full text-[10px] font-semibold leading-4 border cursor-pointer hover:brightness-95 dark:hover:brightness-125"
                        style={{
                            color,
                            borderColor: `${color}55`,
                            backgroundColor: `${color}14`,
                        }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate">{tag.name}</span>
                    </button>
                );
            })}
            {rest > 0 && (
                <span
                    className="text-[10px] font-semibold text-gray-500 dark:text-gray-400"
                    title={tags.slice(max).map((tag) => tag.name).join(', ')}
                >
                    +{rest}
                </span>
            )}
        </span>
    );
}

/**
 * Bản THU NHỎ cho thẻ lưới (##91): thẻ cao cố định, không có chỗ cho một dòng chip — chỉ vẽ các
 * chấm màu, tên nằm trong tooltip.
 */
export const TagDots = memo(function TagDots({ tags, max = 4, className = '' }) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const shown = tags.slice(0, max);
    return (
        <span
            className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}
            title={tags.map((tag) => tag.name).join(', ')}
            aria-label={tags.map((tag) => tag.name).join(', ')}
        >
            {shown.map((tag) => (
                <span
                    key={tag.id}
                    className="w-2 h-2 rounded-full ring-1 ring-white/70 dark:ring-black/40"
                    style={{ backgroundColor: tag.colorHex || DEFAULT_TAG_COLOR }}
                />
            ))}
            {tags.length > max && (
                <span className="text-[8px] font-bold text-gray-500 dark:text-gray-400 ml-0.5">+{tags.length - max}</span>
            )}
        </span>
    );
});

export default memo(TagChips);
