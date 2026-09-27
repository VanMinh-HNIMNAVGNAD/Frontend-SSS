import { useEffect, useRef, useState } from 'react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { FILE_TYPE_FILTER_OPTIONS } from '../../constants/fileFilters';

// 16px và cao hơn trên điện thoại: Safari iOS phóng to cả trang khi chạm vào ô chọn
// có chữ dưới 16px, và ngón tay cần vùng chạm lớn hơn con trỏ chuột.
const SELECT_CLASS =
    'w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Nơi có danh sách tệp để lọc — nhãn lấy đúng khoá của Sidebar để cùng một chỗ không
 * mang hai tên (trước đây "Bộ nhớ dùng chung" ở Sidebar lại là "cloudSSS đã chia sẻ" ở đây).
 */
const LOCATION_OPTIONS = [
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
 * cả ba đi cùng một nhịp, và đổi Vị trí là điều hướng trong app nên bộ lọc giữ nguyên.
 */
function FilterPanel({ onClose, toggleRef }) {
    const {
        filterType, setFilterType,
        filterOwner, setFilterOwner,
        activeTab, setActiveTab,
    } = useFiles();
    const { t } = useLanguage();

    // Trang chủ và Thanh toán không có danh sách tệp: lọc từ đó thì đưa về cloudSSS của tôi.
    const currentLocation = LOCATION_OPTIONS.some((o) => o.value === activeTab) ? activeTab : 'my-drive';

    const [draftType, setDraftType] = useState(filterType);
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
        setFilterOwner(ownerApplies ? draftOwner : 'all');
        // Cùng chỗ đang đứng thì ở lại đúng thư mục đang mở; khác chỗ mới chuyển tab.
        if (draftLocation !== currentLocation || !LOCATION_OPTIONS.some((o) => o.value === activeTab)) {
            setActiveTab(draftLocation);
        }
        onClose && onClose();
    };

    // Xoá là xoá ngay những gì bảng này quản lý (Loại, Người sở hữu) — không cần bấm Áp
    // dụng thêm một lần. Vị trí giữ nguyên: "xoá bộ lọc" không có nghĩa là đi chỗ khác.
    const handleReset = () => {
        setDraftType('all');
        setDraftOwner('all');
        setFilterType('all');
        setFilterOwner('all');
    };

    return (
        <div
            ref={modalRef}
            className="fixed inset-x-2 top-[4.25rem] max-h-[calc(100dvh-5rem)] overflow-y-auto sm:absolute sm:inset-x-0 sm:top-full sm:mt-2 sm:max-h-none sm:overflow-visible bg-white dark:bg-[#282a2c] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 z-50 text-gray-800 dark:text-gray-200 animate-fade-in cursor-default text-left"
        >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 sm:mb-4">{t('search.filter.title')}</h3>

            <div className={`grid grid-cols-1 gap-3 sm:gap-4 mb-4 sm:mb-6 ${ownerApplies ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                {/* Loại tệp — cùng danh sách với thanh lọc */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('filter.type.label')}</label>
                    <select
                        value={draftType}
                        onChange={(e) => setDraftType(e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">{t('filter.type.all')}</option>
                        {FILE_TYPE_FILTER_OPTIONS.map(({ value, labelKey }) => (
                            <option key={value} value={value}>{t(labelKey)}</option>
                        ))}
                    </select>
                </div>

                {/* Người sở hữu — chỉ ở Bộ nhớ dùng chung */}
                {ownerApplies && (
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('search.filter.owner.label')}</label>
                        <select
                            value={draftOwner}
                            onChange={(e) => setDraftOwner(e.target.value)}
                            className={SELECT_CLASS}
                        >
                            <option value="all">{t('search.filter.owner.anyone')}</option>
                            <option value="me">{t('search.filter.owner.me')}</option>
                            <option value="others">{t('search.filter.owner.others')}</option>
                        </select>
                    </div>
                )}

                {/* Vị trí */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('search.filter.location.label')}</label>
                    <select
                        value={draftLocation}
                        onChange={(e) => setDraftLocation(e.target.value)}
                        className={SELECT_CLASS}
                    >
                        {LOCATION_OPTIONS.map(({ value, labelKey }) => (
                            <option key={value} value={value}>{t(labelKey)}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                >
                    {t('filter.reset')}
                </button>
                <button
                    type="button"
                    onClick={handleApply}
                    className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-sm transition-colors cursor-pointer"
                >
                    {t('search.filter.apply')}
                </button>
            </div>
        </div>
    );
}
