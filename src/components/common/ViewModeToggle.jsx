import { List, LayoutGrid } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import LiquidGroup from '../ui/LiquidGroup';

const MODES = [
    { id: 'list', Icon: List, labelKey: 'view.list' },
    { id: 'grid', Icon: LayoutGrid, labelKey: 'view.grid' },
];

/**
 * Nút chuyển Danh sách ⇄ Lưới. Trước đây chín trang mỗi trang chép một bản y hệt nhau; gom về đây
 * để viên kính "đang chọn" trượt qua lại giữa hai nút ở mọi trang. Từ 26/10/2026 nó nằm ở cuối
 * thanh lọc (FileFilterBar) — cùng cụm "cách trình bày" với Sắp xếp — chứ không trên tiêu đề trang.
 *
 * Rãnh là kính nhạt (`glass-soft`, cao 32px như các viên lọc bên cạnh) thay cho rãnh xám đặc cũ;
 * nút đang chọn chỉ đậm chữ, nền sáng do giọt kính của LiquidGroup vẽ.
 *
 * @param {'list'|'grid'} viewMode
 * @param {(mode: 'list'|'grid') => void} setViewMode
 * @param {string} [className] Thêm class cho khung (ví dụ `shrink-0`)
 */
export default function ViewModeToggle({ viewMode, setViewMode, className = '' }) {
    const { t } = useLanguage();

    return (
        <LiquidGroup activeKey={viewMode} className={`flex items-center glass-soft rounded-full p-0.5 shrink-0 ${className}`}>
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
                        viewMode === id ? 'text-[var(--ink)]' : 'text-[var(--ink-subtle)] hover:text-[var(--ink)]'
                    }`}
                >
                    <Icon className="w-4 h-4" />
                </button>
            ))}
        </LiquidGroup>
    );
}
