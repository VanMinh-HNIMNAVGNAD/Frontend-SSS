import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { DEFAULT_TAG_COLOR } from '../../constants/tags';

/**
 * Icon một nhãn: hình thẻ treo của lucide (cùng icon ở thanh bên và trang Nhãn), tô ĐẶC màu nhãn,
 * viền và lỗ xỏ màu trắng. Bản chấm tròn 8px cũ vừa quá bé vừa lẫn vào màu riêng của thẻ (nền thẻ
 * ăn theo `customColor`) — viền trắng tách icon khỏi mọi nền, hình thẻ treo thì không ai đọc nhầm
 * thành một ô màu.
 *
 * `text-white` chứ không truyền `color`: prop `color` của lucide chỉ đặt `stroke`, còn lỗ xỏ là
 * `<circle fill="currentColor">` — nó đọc màu chữ CSS, nên phải đặt bằng class.
 */
function TagGlyph({ color, className = '' }) {
    return <Tag className={`shrink-0 text-white ${className}`} fill={color} strokeWidth={2} aria-hidden="true" />;
}

/**
 * Chip nhãn trên hàng/thẻ tệp (##91). Bấm một chip là mở trang "Nhãn" của nó — chặn nổi bọt để cú
 * bấm không đồng thời chọn hàng hay mở tệp.
 *
 * Hiện tối đa `max` chip rồi "+N": một tệp gắn chục nhãn không được đẩy cột tên ra khỏi màn hình.
 * Không có nhãn thì không vẽ gì — kể cả khoảng trống.
 *
 * Đơn sắc (26/10/2026): chip là viên kính xám chữ mực nhạt, màu của nhãn chỉ còn ở icon thẻ treo —
 * bản cũ tô cả chữ, viền lẫn nền theo màu nhãn nên một hàng có hai ba mảng đỏ/xanh/lục. Chip đứng
 * CÙNG DÒNG với tên tệp và không bao giờ xuống dòng (`flex-nowrap`): trước đây chip nằm dưới tên nên
 * hàng có nhãn cao hơn hàng không nhãn, cả bảng lởm chởm.
 */
function TagChips({ tags, max = 3, className = '' }) {
    const navigate = useNavigate();
    const { t } = useLanguage();
    if (!Array.isArray(tags) || tags.length === 0) return null;

    const shown = tags.slice(0, max);
    const rest = tags.length - shown.length;

    return (
        <span className={`flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden ${className}`}>
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
                        className="chip shrink-0 max-w-[120px] h-[18px] pl-1 pr-1.5 text-[10.5px] leading-none hover:text-[var(--ink)] cursor-pointer"
                    >
                        {/* 10px + khe 2px: chỉ rộng hơn chấm 6px + khe 4px cũ 2px, ba chip vẫn vừa một dòng */}
                        <TagGlyph color={color} className="w-2.5 h-2.5" />
                        <span className="truncate">{tag.name}</span>
                    </button>
                );
            })}
            {rest > 0 && (
                <span
                    className="shrink-0 text-[10.5px] font-semibold text-[var(--ink-subtle)]"
                    title={tags.slice(max).map((tag) => tag.name).join(', ')}
                >
                    +{rest}
                </span>
            )}
        </span>
    );
}

/**
 * Bản THU NHỎ cho thẻ lưới (##91): thẻ cao cố định, không có chỗ cho một dòng chip — chỉ vẽ icon
 * nhãn, tên nằm trong tooltip.
 *
 * Thẻ gọn (`compact:` — điện thoại/tablet) chỉ rộng ~136–190px: các icon xếp chồng mép lên nhau
 * (viền trắng vẫn tách từng cái) để ba nhãn không ăn hết chỗ của tên. `stacked` chồng ở MỌI cỡ màn
 * — cho thẻ thư mục, nơi icon nằm cùng hàng với tên: ba icon chồng rộng ~34px, gần bằng ba chấm cũ.
 */
export const TagIcons = memo(function TagIcons({ tags, max = 3, stacked = false, className = '' }) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const shown = tags.slice(0, max);
    const names = tags.map((tag) => tag.name).join(', ');
    return (
        <span
            role="img"
            className={`inline-flex items-center shrink-0 ${stacked ? '-space-x-1' : 'gap-0.5 compact:gap-0 compact:-space-x-1'} ${className}`}
            title={names}
            aria-label={names}
        >
            {shown.map((tag) => (
                <TagGlyph key={tag.id} color={tag.colorHex || DEFAULT_TAG_COLOR} className="w-3.5 h-3.5" />
            ))}
            {tags.length > max && (
                <span className="text-[9px] font-bold leading-none text-[var(--ink-subtle)] pl-1">+{tags.length - max}</span>
            )}
        </span>
    );
});

export default memo(TagChips);
