import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { FILE_TYPE_FILTER_OPTIONS } from '../../constants/fileFilters';

/**
 * Một nhóm lựa chọn dạng CHIP kính (26/10/2026) thay cho <select> gốc của trình duyệt: ô chọn của
 * hệ điều hành là khung xám viền đậm nằm giữa tấm kính, và phải bấm mở mới thấy có những lựa chọn
 * nào. Chip bày sẵn mọi lựa chọn, bấm một lần là chọn; chip đang chọn là viên kính sáng có dấu ✓.
 * Ngón tay: chip cao 36px trên điện thoại.
 */
function ChipGroup({ label, options, value, onChange }) {
    const labelId = useId();
    return (
        <div>
            <p id={labelId} className="mb-2 text-xs font-semibold text-[var(--ink-muted)]">{label}</p>
            <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                    const selected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onChange(option.value)}
                            className={`flex items-center gap-1 h-9 sm:h-8 px-3 rounded-full text-[13px] sm:text-[12.5px] transition-colors cursor-pointer ${
                                selected
                                    ? 'glass-active font-semibold text-[var(--ink)]'
                                    : 'glass-soft font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
                            }`}
                        >
                            {selected && <Check className="w-3.5 h-3.5 -ml-0.5" strokeWidth={2.5} />}
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Nơi có danh sách tệp để lọc — nhãn lấy đúng khoá của Sidebar để cùng một chỗ không
 * mang hai tên (trước đây "Bộ nhớ dùng chung" ở Sidebar lại là "cloudSSS đã chia sẻ" ở đây).
 */
const LOCATION_OPTIONS = [
    // "Mọi nơi" = trang kết quả tìm kiếm của Trang chủ (##90). Chỉ có nghĩa khi đang có từ khoá:
    // không tìm gì thì Trang chủ là trang gợi ý, không có danh sách nào để lọc — xem `locationOptions`.
    { value: 'home', labelKey: 'search.filter.location.anywhere', needsQuery: true },
    { value: 'my-drive', labelKey: 'nav.myDrive' },
    { value: 'shared-with-me', labelKey: 'nav.sharedWithMe' },
    { value: 'shared-drives', labelKey: 'nav.sharedDrives' },
    { value: 'recent', labelKey: 'nav.recent' },
    { value: 'starred', labelKey: 'nav.starred' },
    { value: 'spam', labelKey: 'nav.spam' },
    { value: 'trash', labelKey: 'nav.trash' },
];

/**
 * Popover bộ lọc nâng cao, mở từ nút ở cuối ô tìm kiếm trên Header.
 *
 * Màn rộng: thả ngay dưới ô tìm kiếm, rộng bằng nó. Điện thoại: thành tấm phủ gần
 * trọn chiều ngang màn hình ngay dưới Header — bám theo bề ngang ô tìm kiếm thì
 * ở màn 390px nó chỉ còn khoảng 100px, chữ rớt từng từ một dòng.
 *
 * `toggleRef` là nút mở: cú bấm vào nó không được tính là "bấm ra ngoài", nếu không
 * `mousedown` đóng popover rồi `click` của chính nút đó mở lại, và không bao giờ
 * đóng được bằng nút đã mở nó.
 */
export default function SearchFilterModal({ isOpen, onClose, toggleRef }) {
    // Dựng lại bảng mỗi lần mở: lựa chọn nháp của lần trước (chưa bấm Áp dụng) không
    // được sống sót qua lần đóng — mở ra phải thấy đúng bộ lọc ĐANG áp dụng.
    if (!isOpen) return null;
    return <FilterPanel onClose={onClose} toggleRef={toggleRef} />;
}

/**
 * Chọn xong rồi mới áp dụng. Trước đây Loại và Người sở hữu áp dụng NGAY khi đổi (mỗi
 * lần đổi là một lượt tải danh sách), còn nút "Áp dụng" chỉ lo Vị trí — bằng
 * `window.location.href`, tức tải lại cả trang và làm mất sạch bộ lọc vừa chọn. Nay
 * mọi ô (cả "Ngày sửa đổi" thêm ở ##90) đi cùng một nhịp, và đổi Vị trí là điều hướng trong
 * app nên bộ lọc giữ nguyên.
 */
function FilterPanel({ onClose, toggleRef }) {
    const {
        filterType, setFilterType,
        filterDate, setFilterDate,
        filterOwner, setFilterOwner,
        activeTab, setActiveTab,
        searchQuery,
    } = useFiles();
    const { t } = useLanguage();

    const hasQuery = Boolean(searchQuery?.trim());
    const locationOptions = LOCATION_OPTIONS.filter((o) => !o.needsQuery || hasQuery);
    // Trang chủ (khi không tìm gì) và Thanh toán không có danh sách tệp: lọc từ đó thì đưa về
    // cloudSSS của tôi.
    const currentLocation = locationOptions.some((o) => o.value === activeTab) ? activeTab : 'my-drive';

    const [draftType, setDraftType] = useState(filterType);
    const [draftDate, setDraftDate] = useState(filterDate);
    const [draftOwner, setDraftOwner] = useState(filterOwner);
    const [draftLocation, setDraftLocation] = useState(currentLocation);

    // "Người sở hữu" chỉ có nghĩa ở Bộ nhớ dùng chung — xem `ownerFilterApplies` ở FileContext.
    const ownerApplies = draftLocation === 'shared-drives';

    const modalRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (toggleRef?.current?.contains(e.target)) return;
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose && onClose();
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose && onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, toggleRef]);

    const handleApply = () => {
        setFilterType(draftType);
        setFilterDate(draftDate);
        setFilterOwner(ownerApplies ? draftOwner : 'all');
        // Cùng chỗ đang đứng thì ở lại đúng thư mục đang mở; khác chỗ mới chuyển tab.
        if (draftLocation !== currentLocation || !locationOptions.some((o) => o.value === activeTab)) {
            setActiveTab(draftLocation);
        }
        onClose && onClose();
    };

    // Xoá là xoá ngay những gì bảng này quản lý (Loại, Ngày, Người sở hữu) — không cần bấm Áp
    // dụng thêm một lần. Vị trí và từ khoá giữ nguyên: "xoá bộ lọc" không có nghĩa là đi chỗ khác.
    const handleReset = () => {
        setDraftType('all');
        setDraftDate('all');
        setDraftOwner('all');
        setFilterType('all');
        setFilterDate('all');
        setFilterOwner('all');
    };

    // Cùng danh sách với thanh lọc bên dưới (FileFilterBar) — trước ##90 popover này không có
    // "Ngày sửa đổi", nên lọc theo ngày chỉ làm được ở thanh lọc.
    const dateOptions = [
        { value: 'all', label: t('filter.date.all') },
        { value: 'today', label: t('filter.date.today') },
        { value: '7days', label: t('filter.date.7days') },
        { value: '30days', label: t('filter.date.30days') },
        { value: 'this-year', label: t('filter.date.thisYear', { year: new Date().getFullYear() }) },
    ];

    const typeOptions = [
        { value: 'all', label: t('filter.type.all') },
        ...FILE_TYPE_FILTER_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })),
    ];
    const ownerOptions = [
        { value: 'all', label: t('search.filter.owner.anyone') },
        { value: 'me', label: t('search.filter.owner.me') },
        { value: 'others', label: t('search.filter.owner.others') },
    ];

    return (
        <div
            ref={modalRef}
            className="glass-strong fixed inset-x-2 top-[4.25rem] max-h-[calc(100dvh-5rem)] overflow-y-auto sm:absolute sm:inset-x-0 sm:top-full sm:mt-2 sm:max-h-none sm:overflow-visible rounded-[22px] p-4 sm:p-5 z-50 text-[var(--ink)] animate-glass-in origin-top cursor-default text-left"
        >
            <h3 className="text-[11px] font-semibold text-[var(--ink-subtle)] uppercase tracking-wider mb-4">{t('search.filter.title')}</h3>

            <div className="space-y-4 mb-5">
                {/* Loại tệp — cùng danh sách với thanh lọc */}
                <ChipGroup label={t('filter.type.label')} options={typeOptions} value={draftType} onChange={setDraftType} />

                {/* Ngày sửa đổi */}
                <ChipGroup label={t('filter.date.label')} options={dateOptions} value={draftDate} onChange={setDraftDate} />

                {/* Người sở hữu — chỉ ở Bộ nhớ dùng chung */}
                {ownerApplies && (
                    <ChipGroup label={t('search.filter.owner.label')} options={ownerOptions} value={draftOwner} onChange={setDraftOwner} />
                )}

                {/* Vị trí */}
                <ChipGroup
                    label={t('search.filter.location.label')}
                    options={locationOptions.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
                    value={draftLocation}
                    onChange={setDraftLocation}
                />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-full transition-colors cursor-pointer"
                >
                    {t('filter.reset')}
                </button>
                <button
                    type="button"
                    onClick={handleApply}
                    className="px-5 py-2 text-sm font-semibold btn-accent hover:brightness-105 rounded-full transition cursor-pointer"
                >
                    {t('search.filter.apply')}
                </button>
            </div>
        </div>
    );
}
