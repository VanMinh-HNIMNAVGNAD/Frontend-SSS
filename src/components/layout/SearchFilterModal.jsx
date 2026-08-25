import { useEffect, useRef } from 'react';
import { useFiles } from '../../context/FileContext';

export default function SearchFilterModal({ isOpen, onClose }) {
    const { 
        filterType, setFilterType,
        filterOwner, setFilterOwner,
        filterLocation, setFilterLocation
    } = useFiles();

    const modalRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
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
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleReset = () => {
        setFilterType('all');
        setFilterOwner('all');
        setFilterLocation('all');
    };

    return (
        <div 
            ref={modalRef}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#282a2c] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 z-50 text-gray-800 dark:text-gray-200 animate-in fade-in duration-150 cursor-default text-left"
        >
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Bộ lọc tìm kiếm driveR</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Loại tệp */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Loại tệp/Driver</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Tất cả loại (Driver, Folder, Tệp)</option>
                        <option value="folder">Thư mục / Driver</option>
                        <option value="file">Tệp tin</option>
                        <option value="pdf">Tài liệu PDF (.pdf)</option>
                        <option value="image">Hình ảnh (PNG, JPG)</option>
                    </select>
                </div>

                {/* Người sở hữu */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Người sở hữu</label>
                    <select
                        value={filterOwner}
                        onChange={(e) => setFilterOwner(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Bất kỳ ai</option>
                        <option value="me">Tôi sở hữu</option>
                        <option value="others">Được chia sẻ bởi người khác</option>
                    </select>
                </div>

                {/* Vị trí */}
                <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Vị trí</label>
                    <select
                        value={filterLocation}
                        onChange={(e) => setFilterLocation(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Bất kỳ đâu trong driveR</option>
                        <option value="my-drive">Driver riêng của tôi</option>
                        <option value="shared-with-me">Được chia sẻ với tôi</option>
                        <option value="shared-drives">Driver đã chia sẻ</option>
                        <option value="spam">Nội dung rác</option>
                        <option value="trash">Thùng rác</option>
                    </select>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                >
                    Đặt lại
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
                    Áp dụng bộ lọc
                </button>
            </div>
        </div>
    );
}
