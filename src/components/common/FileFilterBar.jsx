import SelectDropdown from '../ui/SelectDropdown';
import ViewModeToggle from './ViewModeToggle';
import {
    Folder,
    File,
    FileText,
    Image as ImageIcon,
    FileSpreadsheet,
    Presentation,
    Archive,
    Video,
    FileCode,
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
 * Bố cục: một đường kẻ dưới; trên màn rộng là một hàng, trên điện thoại nhóm filter
 * nằm ngang riêng và nhóm sắp xếp/chế độ xem xuống hàng dưới —
 *   [Loại tệp ▾] [Ngày sửa đổi ▾] [Người sở hữu ▾] (Xoá bộ lọc)   [Sắp xếp ▾] [≡ | ⊞]
 * Bên trái là bộ lọc (thu hẹp danh sách), bên phải là cách TRÌNH BÀY (thứ tự, Danh sách/Lưới) —
 * trước đây "Sắp xếp" đứng lẫn đầu hàng bộ lọc, nút Danh sách/Lưới nằm tít trên tiêu đề trang, và
 * tiêu đề + thanh lọc mỗi thứ một đường kẻ riêng chồng lên nhau. Bộ lọc đang bật hiện giá trị của
 * nó kèm nút ✕ bỏ riêng; "Xoá bộ lọc" chỉ hiện khi có từ hai bộ lọc trở lên.
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
    showViewToggle = true,
}) {
    const {
        sortField,
        setSortField,
        sortDirection,
        setSortDirection,
        ownerFilterApplies,
        viewMode,
        setViewMode,
    } = useFiles();
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

    const showOwner = ownerFilterApplies && setFilterOwner;
    const activeCount =
        (filterType !== 'all' ? 1 : 0) + (filterDate !== 'all' ? 1 : 0) + (showOwner && filterOwner !== 'all' ? 1 : 0);

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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-3 border-b border-glass-divider select-none">
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* Bộ lọc — thu hẹp danh sách */}
                <SelectDropdown
                    label={t('filter.type.label')}
                    options={typeOptions}
                    value={filterType}
                    onChange={setFilterType}
                    active={filterType !== 'all'}
                    onClear={() => setFilterType('all')}
                    clearLabel={t('filter.clearOne')}
                />

                <SelectDropdown
                    label={t('filter.date.label')}
                    options={dateOptions}
                    value={filterDate}
                    onChange={setFilterDate}
                    active={filterDate !== 'all'}
                    onClear={() => setFilterDate('all')}
                    clearLabel={t('filter.clearOne')}
                />

                {/* Người sở hữu — chỉ ở Bộ nhớ chung */}
                {showOwner && (
                    <SelectDropdown
                        label={t('search.filter.owner.label')}
                        options={ownerOptions}
                        value={filterOwner}
                        onChange={setFilterOwner}
                        active={filterOwner !== 'all'}
                        onClear={() => setFilterOwner('all')}
                        clearLabel={t('filter.clearOne')}
                    />
                )}

                {activeCount >= 2 && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="h-8 shrink-0 px-2 text-[12.5px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline underline-offset-2 cursor-pointer"
                        title={t('filter.resetTitle')}
                    >
                        {t('filter.reset')}
                    </button>
                )}
            </div>

            {/* Trình bày — thứ tự và chế độ xem, dồn sang phải */}
            {(showSort || showViewToggle) && (
                <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:ml-auto sm:w-auto">
                    {showSort && (
                        <SelectDropdown
                            label={t('filter.sort.label')}
                            options={sortOptions}
                            value={currentSort}
                            onChange={handleSortChange}
                            active={sortField !== 'name' || sortDirection !== 'asc'}
                            align="right"
                        />
                    )}
                    {showViewToggle && <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />}
                </div>
            )}
        </div>
    );
}
