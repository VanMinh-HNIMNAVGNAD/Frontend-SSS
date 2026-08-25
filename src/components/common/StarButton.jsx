import { memo } from 'react';
import { Star } from 'lucide-react';

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
    readOnlyTitle = 'Chỉ chủ sở hữu mới gắn sao được',
}) {
    const s = SIZES[size] || SIZES.md;

    const icon = (
        <Star
            className={`${s.icon} transition-all duration-200 ${
                isStarred ? 'fill-amber-400 text-amber-500 scale-110' : ''
            }`}
        />
    );

    if (readOnly) {
        return (
            <span
                className={`inline-flex ${s.pad} text-gray-300 dark:text-gray-600 ${className}`}
                title={readOnlyTitle}
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
            title={isStarred ? 'Bỏ khỏi mục gắn sao' : 'Thêm vào mục gắn sao'}
            aria-label={isStarred ? 'Bỏ khỏi mục gắn sao' : 'Thêm vào mục gắn sao'}
            aria-pressed={isStarred}
            className={`inline-flex items-center justify-center ${s.pad} rounded-full transition-colors active:scale-90 ${
                isStarred
                    ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/15'
                    : 'text-gray-400 dark:text-gray-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/15'
            } ${className}`}
        >
            {icon}
        </button>
    );
}

export default memo(StarButton);
