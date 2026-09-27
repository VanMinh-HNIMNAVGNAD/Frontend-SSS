import SelectDropdown from '../ui/SelectDropdown';
import { 
    FileType,
    Calendar,
    XCircle,
    Folder,
    File,
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
import { useLanguage } from '../../context/LanguageContext';
import { FILE_TYPE_FILTER_OPTIONS } from '../../constants/fileFilters';

const TYPE_ICONS = {
    folder: Folder,
    file: File,
    pdf: FileText,
    image: ImageIcon,
    spreadsheet: FileSpreadsheet,
    presentation: Presentation,
    media: Video,
    code: FileCode,
    archive: Archive,
};

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
    const { t } = useLanguage();

    // Cùng một danh sách với bộ lọc nâng cao trên thanh tìm kiếm — xem constants/fileFilters.js.
    const typeOptions = [
        { value: 'all', label: t('filter.type.all') },
        ...FILE_TYPE_FILTER_OPTIONS.map(({ value, labelKey }) => ({
            value,
            label: t(labelKey),
            icon: TYPE_ICONS[value],
        })),
    ];

    // Date Modified Options
    // Năm lấy từ đồng hồ máy, không ghi cứng: nhãn cũ là 'Năm nay (2026)' nên
    // sang 2027 nó vẫn khoe 2026 trong khi bộ lọc thật đã tính theo năm mới
    // (backend dùng `new Date().getFullYear()` — xem FilesService, nhánh 'this-year').
    const dateOptions = [
        { value: 'all', label: t('filter.date.all') },
        { value: 'today', label: t('filter.date.today') },
        { value: '7days', label: t('filter.date.7days') },
        { value: '30days', label: t('filter.date.30days') },
        { value: 'this-year', label: t('filter.date.thisYear', { year: new Date().getFullYear() }) },
    ];

    const hasActiveFilters = filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';

    const sortOptions = [
        { value: 'name-asc', label: t('filter.sort.nameAsc') },
        { value: 'name-desc', label: t('filter.sort.nameDesc') },
        { value: 'size-desc', label: t('filter.sort.sizeDesc') },
        { value: 'size-asc', label: t('filter.sort.sizeAsc') },
        { value: 'updatedAt-desc', label: t('filter.sort.newest') },
        { value: 'updatedAt-asc', label: t('filter.sort.oldest') },
        { value: 'type-asc', label: t('filter.sort.type') },
    ];
    
    const handleSortChange = (val) => {
        const [field, dir] = val.split('-');
        setSortField(field);
        setSortDirection(dir);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 py-2 mb-3 border-b border-gray-200 dark:border-gray-700 select-none">
            <SelectDropdown
                label={t('filter.sort.label')}
                icon={ArrowUpDown}
                options={sortOptions}
                value={`${sortField}-${sortDirection}`}
                onChange={handleSortChange}
                active={sortField !== 'name' || sortDirection !== 'asc'}
            />
            
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>

            {/* Filter by File Type */}
            <SelectDropdown
                label={t('filter.type.label')}
                icon={FileType}
                options={typeOptions}
                value={filterType}
                onChange={setFilterType}
                active={filterType !== 'all'}
            />

            {/* Filter by Date */}
            <SelectDropdown
                label={t('filter.date.label')}
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors shadow-2xs cursor-pointer"
                    title={t('filter.resetTitle')}
                >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t('filter.reset')}</span>
                </button>
            )}
        </div>
    );
}
