import { useEffect, useRef } from 'react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';

// 16px và cao hơn trên điện thoại: Safari iOS phóng to cả trang khi chạm vào ô chọn
// có chữ dưới 16px, và ngón tay cần vùng chạm lớn hơn con trỏ chuột.
const SELECT_CLASS =
    'w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

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
    const { 
        filterType, setFilterType,
        filterOwner, setFilterOwner,
        filterLocation, setFilterLocation
    } = useFiles();
    const { t } = useLanguage();

    const modalRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (toggleRef?.current?.contains(e.target)) return;
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose && onClose();
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, toggleRef]);

    if (!isOpen) return null;

    const handleReset = () => {
        setFilterType('all');
        setFilterOwner('all');
        setFilterLocation('all');
    };

    return (
        <div 
            ref={modalRef}
            className="fixed inset-x-2 top-[4.25rem] max-h-[calc(100dvh-5rem)] overflow-y-auto sm:absolute sm:inset-x-0 sm:top-full sm:mt-2 sm:max-h-none sm:overflow-visible bg-white dark:bg-[#282a2c] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 z-50 text-gray-800 dark:text-gray-200 animate-fade-in cursor-default text-left"
        >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 sm:mb-4">{t('search.filter.title')}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {/* Loại tệp */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('search.filter.type.label')}</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">{t('search.filter.type.all')}</option>
                        <option value="folder">{t('search.filter.type.folder')}</option>
                        <option value="file">{t('search.filter.type.file')}</option>
                        <option value="pdf">{t('search.filter.type.pdf')}</option>
                        <option value="image">{t('search.filter.type.image')}</option>
                    </select>
                </div>

                {/* Người sở hữu */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('search.filter.owner.label')}</label>
                    <select
                        value={filterOwner}
                        onChange={(e) => setFilterOwner(e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">{t('search.filter.owner.anyone')}</option>
                        <option value="me">{t('search.filter.owner.me')}</option>
                        <option value="others">{t('search.filter.owner.others')}</option>
                    </select>
                </div>

                {/* Vị trí */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('search.filter.location.label')}</label>
                    <select
                        value={filterLocation}
                        onChange={(e) => setFilterLocation(e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">{t('search.filter.location.anywhere')}</option>
                        <option value="my-drive">{t('search.filter.location.myDrive')}</option>
                        <option value="shared-with-me">{t('search.filter.location.sharedWithMe')}</option>
                        <option value="shared-drives">{t('search.filter.location.sharedDrives')}</option>
                        <option value="spam">{t('search.filter.location.spam')}</option>
                        <option value="trash">{t('search.filter.location.trash')}</option>
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
                    onClick={() => {
                        if (filterLocation !== 'all') {
                            window.location.href = `/app/${filterLocation}`;
                        }
                        onClose();
                    }}
                    className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-sm transition-colors cursor-pointer"
                >
                    {t('search.filter.apply')}
                </button>
            </div>
        </div>
    );
}
