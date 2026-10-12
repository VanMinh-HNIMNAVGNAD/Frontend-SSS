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
    ArrowUpDown,
    UserRound,
    User,
    Users
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

// Nhãn cột cho thứ tự đặt từ TIÊU ĐỀ CỘT của chế độ Danh sách mà ô "Sắp xếp" không có sẵn
// (Chủ sở hữu, Loại tệp Z-A) — xem `sortOptions` bên dưới.
const SORT_FIELD_LABEL_KEYS = {
    name: 'list.col.name',
    size: 'list.col.size',
    type: 'list.col.type',
    owner: 'list.col.owner',
    updatedAt: 'list.col.modified',
};

/**
 * Thanh lọc dùng chung cho mọi trang có danh sách tệp (cloudSSS của tôi, Được chia sẻ, Gần đây,
 * Gắn sao, Nội dung rác, Thùng rác, bên trong một Bộ nhớ chung — và kết quả tìm kiếm trên mọi
 * Bộ nhớ chung).
 *
 * Bộ lọc nằm trong FileContext và đi theo người dùng qua các trang, nên trang nào có danh sách
 * mà KHÔNG hiện thanh này thì có bộ lọc vô hình: chọn "Hình ảnh" ở cloudSSS của tôi rồi sang
 * Gần đây, trang Gần đây chỉ còn ảnh mà không có gì cho biết vì sao, cũng không có nút xoá (##83).
 *
 * `showSort={false}` cho trang giữ thứ tự của server (Gần đây = mở gần nhất trước).
 * "Người sở hữu" chỉ hiện ở Bộ nhớ chung — nơi duy nhất backend lọc được theo chủ
 * (`ownerFilterApplies` ở FileContext); trước ##83 chỉ chọn được nó trong bộ lọc của thanh tìm
 * kiếm, còn thanh này thì không hiện, không cho đổi.
 */
export default function FileFilterBar({
    filterType = 'all',
    setFilterType,
    filterDate = 'all',
    setFilterDate,
    filterOwner = 'all',
    setFilterOwner,
    onReset,
    showSort = true,
}) {
    const { sortField, setSortField, sortDirection, setSortDirection, ownerFilterApplies } = useFiles();
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
    // Thứ tự đặt từ tiêu đề cột mà danh sách trên không có: trước đây ô này hiện chữ "Sắp xếp"
    // tô xanh mà không nói đang sắp theo gì.
    const currentSort = `${sortField}-${sortDirection}`;
    if (!sortOptions.some((o) => o.value === currentSort) && SORT_FIELD_LABEL_KEYS[sortField]) {
        sortOptions.push({
            value: currentSort,
            label: `${t(SORT_FIELD_LABEL_KEYS[sortField])} ${sortDirection === 'desc' ? '↓' : '↑'}`,
        });
    }

    const ownerOptions = [
        { value: 'all', label: t('search.filter.owner.anyone') },
        { value: 'me', label: t('search.filter.owner.me'), icon: User },
        { value: 'others', label: t('search.filter.owner.others'), icon: Users },
    ];
    
    const handleSortChange = (val) => {
        const [field, dir] = val.split('-');
        setSortField(field);
        setSortDirection(dir);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 py-2 mb-3 border-b border-gray-200 dark:border-gray-700 select-none">
            {showSort && (
                <>
                    <SelectDropdown
                        label={t('filter.sort.label')}
                        icon={ArrowUpDown}
                        options={sortOptions}
                        value={currentSort}
                        onChange={handleSortChange}
                        active={sortField !== 'name' || sortDirection !== 'asc'}
                    />

                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
                </>
            )}

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

            {/* Người sở hữu — chỉ ở Bộ nhớ chung */}
            {ownerFilterApplies && setFilterOwner && (
                <SelectDropdown
                    label={t('search.filter.owner.label')}
                    icon={UserRound}
                    options={ownerOptions}
                    value={filterOwner}
                    onChange={setFilterOwner}
                    active={filterOwner !== 'all'}
                />
            )}

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
