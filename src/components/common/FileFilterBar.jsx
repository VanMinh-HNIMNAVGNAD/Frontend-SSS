import SelectDropdown from '../ui/SelectDropdown';
import { 
    FileType,
    Calendar,
    XCircle,
    Folder,
    FileText,
    Image as ImageIcon,
    FileSpreadsheet,
    Presentation,
    Archive,
    Video,
    FileCode,
    ArrowUpDown
} from 'lucide-react';
import { useFiles } from '../../context/FileContext';

/**
 * Reusable File Filter Bar Component (Common Component used across MyDrivePage, SharedWithMePage, StarredPage, SpamPage, TrashPage)
 */
export default function FileFilterBar({
    filterType = 'all',
    setFilterType,
    filterDate = 'all',
    setFilterDate,
    filterOwner = 'all',
    onReset
}) {
    const { sortField, setSortField, sortDirection, setSortDirection } = useFiles();

    // Extended File Type Options
    const typeOptions = [
        { value: 'all', label: 'Tất cả loại tệp' },
        { value: 'folder', label: 'Thư mục', icon: Folder },
        { value: 'pdf', label: 'Tài liệu & PDF', icon: FileText },
        { value: 'image', label: 'Hình ảnh & Thiết kế', icon: ImageIcon },
        { value: 'spreadsheet', label: 'Bảng tính & Database', icon: FileSpreadsheet },
        { value: 'presentation', label: 'Trình chiếu (PPT)', icon: Presentation },
        { value: 'media', label: 'Video & Audio', icon: Video },
        { value: 'code', label: 'Mã nguồn Script', icon: FileCode },
        { value: 'archive', label: 'Tệp nén & Khác', icon: Archive },
    ];

    // Date Modified Options
    const dateOptions = [
        { value: 'all', label: 'Mọi thời điểm' },
        { value: 'today', label: 'Hôm nay' },
        { value: '7days', label: '7 ngày qua' },
        { value: '30days', label: '30 ngày qua' },
        { value: 'this-year', label: 'Năm nay (2026)' },
    ];

    const hasActiveFilters = filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';

    const sortOptions = [
        { value: 'name-asc', label: 'Tên (A-Z)' },
        { value: 'name-desc', label: 'Tên (Z-A)' },
        { value: 'size-desc', label: 'Kích thước (Lớn-Nhỏ)' },
        { value: 'size-asc', label: 'Kích thước (Nhỏ-Lớn)' },
        { value: 'updatedAt-desc', label: 'Sửa đổi mới nhất' },
        { value: 'updatedAt-asc', label: 'Sửa đổi cũ nhất' },
        { value: 'type-asc', label: 'Loại tệp' },
    ];
    
    const handleSortChange = (val) => {
        const [field, dir] = val.split('-');
        setSortField(field);
        setSortDirection(dir);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 py-2 mb-3 border-b border-gray-100 dark:border-gray-700 select-none">
            <SelectDropdown
                label="Sắp xếp"
                icon={ArrowUpDown}
                options={sortOptions}
                value={`${sortField}-${sortDirection}`}
                onChange={handleSortChange}
                active={sortField !== 'name' || sortDirection !== 'asc'}
            />
            
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

            {/* Filter by File Type */}
            <SelectDropdown
                label="Loại tệp"
                icon={FileType}
                options={typeOptions}
                value={filterType}
                onChange={setFilterType}
                active={filterType !== 'all'}
            />

            {/* Filter by Date */}
            <SelectDropdown
                label="Ngày sửa đổi"
                icon={Calendar}
                options={dateOptions}
                value={filterDate}
                onChange={setFilterDate}
                active={filterDate !== 'all'}
            />

            {/* Quick Reset Filters Button */}
            {hasActiveFilters && (
                <button
                    type="button"
                    onClick={onReset}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors shadow-2xs cursor-pointer"
                    title="Xóa tất cả bộ lọc"
                >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Xóa bộ lọc</span>
                </button>
            )}
        </div>
    );
}
