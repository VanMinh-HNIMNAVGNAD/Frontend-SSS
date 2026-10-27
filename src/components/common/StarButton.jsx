import { memo } from 'react';
import { Star } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';

/**
 * Nút gắn sao dùng chung cho MỌI chỗ có dấu sao: thẻ tệp / thư mục, hàng trong
 * bảng danh sách, thẻ Bộ nhớ dùng chung, trang chủ...
 *
 * Trước đây mỗi view tự viết lại nút này nên style lệch nhau (chỗ thì
 * `text-gray-300` chìm hẳn trong dark mode, chỗ thì có nền hover, chỗ không) và
 * quan trọng hơn: KHÔNG chỗ nào chặn double-click. Ngôi sao chỉ `stopPropagation`
 * cho sự kiện `click`, còn `dblclick` vẫn nổi bọt lên thẻ/hàng cha nên bấm hai
 * lần vào ngôi sao là mở luôn cửa sổ xem trước — đúng lỗi người dùng báo. Ở đây
 * chặn cả `click` lẫn `dblclick` nên hành vi giống hệt trang Bộ nhớ dùng chung.
 *
 * @param {boolean}  isStarred  Trạng thái hiện tại (quyết định ngôi sao có tô màu)
 * @param {Function} onToggle   Gọi khi bấm; component KHÔNG tự quản lý state
 * @param {boolean}  readOnly   Chỉ hiển thị trạng thái, không cho bấm
 *                              (tệp người khác chia sẻ: cột is_starred thuộc chủ sở hữu)
 * @param {'sm'|'md'} size      Cỡ vùng bấm
 *
 * Đơn sắc (26/10/2026): sao đã gắn là ngôi sao TÔ ĐẶC màu mực (như Google Drive bản mới), chưa gắn
 * là nét xám nhạt — không còn vàng hổ phách giữa giao diện xám/trắng.
 */
const SIZES = {
    sm: { pad: 'p-1', icon: 'w-4 h-4' },
    md: { pad: 'p-1.5', icon: 'w-4 h-4' },
};

function StarButton({
    isStarred = false,
    onToggle,
    readOnly = false,
    size = 'md',
    className = '',
    // Mặc định để undefined rồi ngã về t(...) trong thân: giá trị mặc định của
    // tham số được tính lúc gọi, chưa có `t`, nên chuỗi cứng ở đây không dịch được.
    readOnlyTitle,
}) {
    const { t } = useLanguage();
    const s = SIZES[size] || SIZES.md;

    const icon = (
        <Star
            className={`${s.icon} transition-all duration-200 ${
                isStarred ? 'fill-current' : ''
            }`}
        />
    );

    if (readOnly) {
        return (
            <span
                className={`inline-flex ${s.pad} text-[var(--ink-subtle)] opacity-50 ${className}`}
                title={readOnlyTitle ?? t('star.readOnly')}
            >
                {icon}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle?.();
            }}
            // Chặn dblclick để không lọt xuống onDoubleClick của thẻ/hàng (mở preview)
            onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
            }}
            title={isStarred ? t('menu.star.remove') : t('menu.star.add')}
            aria-label={isStarred ? t('menu.star.remove') : t('menu.star.add')}
            aria-pressed={isStarred}
            className={`inline-flex items-center justify-center ${s.pad} rounded-full transition-colors active:scale-90 cursor-pointer ${
                isStarred
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--ink-subtle)] opacity-70 hover:opacity-100 hover:text-[var(--ink)]'
            } ${className}`}
        >
            {icon}
        </button>
    );
}

export default memo(StarButton);
