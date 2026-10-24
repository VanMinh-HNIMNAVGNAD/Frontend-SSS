import { List, LayoutGrid } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import LiquidGroup from '../ui/LiquidGroup';

const MODES = [
    { id: 'list', Icon: List, labelKey: 'view.list' },
    { id: 'grid', Icon: LayoutGrid, labelKey: 'view.grid' },
];

/**
 * Nút chuyển Danh sách ⇄ Lưới ở đầu mọi trang tệp. Trước đây chín trang mỗi trang chép một bản
 * y hệt nhau; gom về đây để viên kính "đang chọn" trượt qua lại giữa hai nút ở mọi trang.
 *
 * @param {'list'|'grid'} viewMode
 * @param {(mode: 'list'|'grid') => void} setViewMode
 * @param {string} [className] Thêm class cho khung (ví dụ `shrink-0`)
 */
export default function ViewModeToggle({ viewMode, setViewMode, className = '' }) {
    const { t } = useLanguage();

    return (
        <LiquidGroup
            activeKey={viewMode}
            className={`flex items-center bg-gray-200/90 dark:bg-gray-700 rounded-full p-0.5 border border-gray-300 dark:border-gray-700 ${className}`}
        >
            {MODES.map(({ id, Icon, labelKey }) => (
                <button
                    key={id}
                    type="button"
                    data-liquid-key={id}
                    onClick={() => setViewMode(id)}
                    title={t(labelKey)}
                    aria-label={t(labelKey)}
                    aria-pressed={viewMode === id}
                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                        viewMode === id
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                >
                    <Icon className="w-4 h-4" />
                </button>
            ))}
        </LiquidGroup>
    );
}
