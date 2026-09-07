import { useState } from 'react';
import toast from 'react-hot-toast';
import { useFiles, useFileSelection, useClipboard } from '../../context/FileContext';
import { filesApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import SearchFilterModal from './SearchFilterModal';
import SettingsModal from './SettingsModal';
import AccountModal from './AccountModal';
import ActivityLogDrawer from '../file-manager/ActivityLogDrawer';
import { 
    Menu, 
    Search, 
    SlidersHorizontal, 
    Settings, 
    Trash2,
    RotateCcw,
    X,
    CheckSquare,
    Download,
    Copy,
    Scissors,
    AlertCircle,
    History
} from 'lucide-react';

export default function Header({ toggleRightSidebar }) {
    const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { 
        searchQuery, 
        setSearchQuery, 
        toggleSidebar, 
        filterType,
        isSidebarCollapsed,
        getSelectedItems,
        folders,
        files,
        activeTab,
        moveToTrash,
        restoreFromTrash,
        markNotSpam,
        deletePermanently,
        moveItem,
        copyItem,
        getDownloadUrl,
        triggerReload,
        refreshStorageInfo
    } = useFiles();

    // Thanh công cụ hàng loạt (hiện ra khi có mục được chọn) đọc từ context
    // riêng: nếu để chung useFiles() thì mỗi lần tích chọn một tệp là cả Header
    // — logo, ô tìm kiếm, avatar, mọi modal treo trên nó — render lại.
    const { selectedIds, selectedCount, deselectAll, selectAll } = useFileSelection();

    const { cutItems, copyItems } = useClipboard();

    const { t } = useLanguage();

    const navigate = useNavigate();

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

    const handleLogoClick = () => {
        navigate('/app/home');
    };

    const isTrashTab = activeTab === 'trash';
    const isSpamTab = activeTab === 'spam';
    const allCurrentSelected = (folders?.length + files?.length) > 0 && selectedCount >= (folders?.length + files?.length);

    /**
     * Gộp kết quả một thao tác hàng loạt thành ĐÚNG MỘT toast.
     *
     * Các hàm trong FileContext được gọi ở chế độ `silent` nên không tự thông
     * báo: xóa 10 tệp mà lỗi cả 10 thì trước đây là 10 toast đỏ xếp chồng nhau,
     * còn khi thành công thì tuyệt đối im lặng — người dùng không biết thao tác
     * đã chạy hay chưa.
     *
     * @param {number} total Số mục đã thử xử lý
     * @param {{name: string, reason: string}[]} errors Các mục thất bại, theo thứ tự xử lý
     * @param {string} successKey Khoá i18n cho toast thành công — nhận {count}
     * @param {string} errorKey Khoá i18n khi CHỈ MỘT mục thất bại — nhận {name}, {reason}
     * @param {string} partialKey Khoá i18n khi nhiều mục thất bại — nhận {failed}, {total}, {name}
     */
    const showBatchResult = (total, errors, successKey, errorKey, partialKey) => {
        if (!errors.length) {
            toast.success(t(successKey, { count: total }));
            return;
        }
        // Chi tiết từng mục đẩy ra console cho lúc cần truy vết, toast chỉ nêu
        // số lượng + một mục làm ví dụ (giống pasteItems trong FileContext).
        console.error(
            `[Header] ${errors.length}/${total} mục thất bại:`,
            errors.map((e) => `${e.name}: ${e.reason}`).join('\n'),
        );
        toast.error(
            errors.length === 1
                ? t(errorKey, { name: errors[0].name, reason: errors[0].reason })
                : t(partialKey, { failed: errors.length, total, name: errors[0].name }),
        );
    };

    /**
     * Chạy `run` lần lượt cho từng mục đã chọn rồi báo kết quả một lần.
     *
     * `run` trả về `{ ok, error }` (hợp đồng chung của FileContext ở chế độ
     * silent) và không throw; vẫn bọc try/catch để một lỗi ngoài dự kiến của
     * một mục không chặn những mục còn lại.
     *
     * @returns {number} Số mục xử lý thành công — phía gọi dùng để quyết định
     *          có cần đồng bộ lại danh sách hay không.
     */
    const runBatch = async (items, run, successKey, errorKey, partialKey) => {
        const errors = [];
        for (const item of items) {
            try {
                const res = await run(item);
                if (res && res.ok === false) {
                    errors.push({ name: item.name, reason: res.error?.message || t('common.unknownError') });
                }
            } catch (err) {
                errors.push({ name: item.name, reason: err?.message || t('common.unknownError') });
            }
        }
        deselectAll();
        showBatchResult(items.length, errors, successKey, errorKey, partialKey);
        return items.length - errors.length;
    };

    const handleDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!confirm(t('header.confirm.trash', { count: items.length }))) return;

        const succeeded = await runBatch(
            items,
            (item) => moveToTrash(item.id, { silent: true }),
            'header.success.delete',
            'header.error.delete',
            'header.error.deletePartial',
        );
        // Một lượt làm mới dung lượng cho cả lô, thay vì một lượt mỗi mục
        if (succeeded > 0) refreshStorageInfo();
    };

    /**
     * Nút "Khôi phục" phục vụ CẢ hai tab, nhưng gọi hai endpoint khác nhau.
     *
     * Tab Nội dung rác phải đi `markNotSpam`: mục ở đó có `is_trash = false` sẵn,
     * nên `restoreFromTrash` chỉ set lại đúng giá trị cũ — backend trả 200, dòng bị
     * xoá khỏi danh sách, và tệp thì không đi đâu cả. Đó là lỗi "khôi phục xong
     * không thấy tệp đâu".
     */
    const handleRestoreSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const confirmKey = isSpamTab ? 'header.confirm.notSpam' : 'header.confirm.restore';
        if (!confirm(t(confirmKey, { count: items.length }))) return;

        // Nơi tệp quay về, để báo cho người dùng biết — họ đang đứng ở trang Nội dung
        // rác nên không nhìn thấy nó xuất hiện lại trong cây thư mục.
        const destinations = new Set();

        const succeeded = await runBatch(
            items,
            async (item) => {
                if (!isSpamTab) return restoreFromTrash(item.id, { silent: true });
                const res = await markNotSpam(item.id, { silent: true });
                if (res.ok) destinations.add(res.parentName || t('nav.myDrive'));
                return res;
            },
            isSpamTab ? 'header.success.notSpam' : 'header.success.restore',
            'header.error.restore',
            'header.error.restorePartial',
        );

        if (isSpamTab && succeeded > 0 && destinations.size === 1) {
            toast.success(t('header.success.notSpamTo', { folder: [...destinations][0] }));
        }
        if (succeeded > 0) refreshStorageInfo();
    };

    const handlePermanentDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!confirm(t('header.confirm.deleteForever', { count: items.length }))) return;

        const succeeded = await runBatch(
            items,
            (item) => deletePermanently(item.id, { silent: true }),
            'header.success.deleteForever',
            'header.error.deleteForever',
            'header.error.deleteForeverPartial',
        );
        if (succeeded > 0) refreshStorageInfo();
    };

    const handleMoveSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const targetId = prompt(t('header.prompt.moveTarget'));
        if (targetId === null) return;

        const succeeded = await runBatch(
            items,
            (item) => moveItem(item.id, targetId || null, { silent: true }),
            'header.success.move',
            'header.error.move',
            'header.error.movePartial',
        );
        // moveItem/copyItem ở chế độ silent KHÔNG tự tải lại danh sách — nếu để
        // nó tự làm thì mỗi mục là một lần tải lại cả trang cho cùng kết quả.
        if (succeeded > 0) await triggerReload();
    };

    const handleCopySelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const targetId = prompt(t('header.prompt.copyTarget'));
        if (targetId === null) return;

        const succeeded = await runBatch(
            items,
            (item) => copyItem(item.id, targetId || null, { silent: true }),
            'header.success.copy',
            'header.error.copy',
            'header.error.copyPartial',
        );
        if (succeeded > 0) {
            await triggerReload();
            refreshStorageInfo();
        }
    };

    const handleDownloadSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;

        const fileItems = items.filter((i) => i.type !== 'folder');
        const folderItems = items.filter((i) => i.type === 'folder');

        // Có thư mục trong lựa chọn -> gói tất cả (file + toàn bộ cây thư mục con)
        // thành 1 file ZIP duy nhất do backend nén
        if (folderItems.length > 0) {
            // Nén ở backend có thể mất vài giây: giữ một toast "đang tạo" rồi
            // thay chính nó bằng kết quả (cùng `id`) để không sinh toast thứ hai.
            const toastId = toast.loading(t('header.zip.creating'));
            try {
                const zipBlob = await filesApi.downloadZip(items.map((i) => i.id));
                const blobUrl = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `driveR_download_${Date.now()}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
                toast.success(t('header.success.zip'), { id: toastId });
            } catch (error) {
                console.error('[Header] ZIP download failed:', error);
                toast.error(t('header.error.zip'), { id: toastId });
            }
            return;
        }

        const errors = [];
        for (const item of fileItems) {
            try {
                const url = await getDownloadUrl(item.id, { silent: true });
                if (!url) {
                    errors.push({ name: item.name, reason: t('header.error.noDownloadUrl') });
                    continue;
                }
                const link = document.createElement('a');
                link.href = url;
                link.download = item.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                await new Promise((r) => setTimeout(r, 300));
            } catch (err) {
                errors.push({ name: item.name, reason: err?.message || t('common.unknownError') });
            }
        }
        showBatchResult(
            fileItems.length,
            errors,
            'header.success.download',
            'header.error.download',
            'header.error.downloadPartial',
        );
    };

    if (selectedCount > 0) {
        return (
            <header className="h-16 flex items-center justify-between px-3 md:px-5 bg-[#0b57d0] text-white border-b border-[#0b57d0] shrink-0 gap-3 transition-colors duration-200">
                {/* Left */}
                <div className="flex items-center gap-4">
                    <button onClick={deselectAll} className="p-2 hover:bg-white/20 rounded-full transition-colors cursor-pointer" title={t('common.close')}>
                        <X className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-lg">{t('header.selected', { count: selectedCount })}</span>
                    
                    <div className="w-px h-6 bg-white/30 dark:bg-white/5 mx-2 hidden sm:block" />
                    
                    <button
                        onClick={() => allCurrentSelected ? deselectAll() : selectAll(folders, files)}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium cursor-pointer"
                    >
                        <CheckSquare className="w-4 h-4" />
                        <span>{allCurrentSelected ? t('common.deselectAll') : t('common.selectAll')}</span>
                    </button>
                </div>

                {/* Right */}
                <div className="flex items-center gap-1 sm:gap-2">
                    {!isTrashTab && !isSpamTab ? (
                        <>
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 px-3 py-2 hover:bg-red-500/90 rounded-lg transition-colors text-sm font-medium cursor-pointer" title={t('common.delete')}>
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.delete')}</span>
                            </button>
                            <button 
                                onClick={() => {
                                    cutItems(Array.from(selectedIds));
                                }} 
                                className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium cursor-pointer" 
                                title={t('header.action.cut')}
                            >
                                <Scissors className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.cut')}</span>
                            </button>
                            <button 
                                onClick={() => {
                                    copyItems(Array.from(selectedIds));
                                }} 
                                className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium cursor-pointer" 
                                title={t('header.action.copy')}
                            >
                                <Copy className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.copy')}</span>
                            </button>
                            <button onClick={handleDownloadSelected} className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium cursor-pointer" title={t('common.download')}>
                                <Download className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.download')}</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={handleRestoreSelected} className="flex items-center gap-1.5 px-3 py-2 hover:bg-emerald-500/90 rounded-lg transition-colors text-sm font-medium cursor-pointer" title={t('common.restore')}>
                                <RotateCcw className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.restore')}</span>
                            </button>
                            <button onClick={handlePermanentDeleteSelected} className="flex items-center gap-1.5 px-3 py-2 hover:bg-red-500/90 rounded-lg transition-colors text-sm font-medium cursor-pointer" title={t('common.deleteForever')}>
                                <AlertCircle className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.deleteForever')}</span>
                            </button>
                        </>
                    )}
                </div>
            </header>
        );
    }

    return (
        <header className="h-16 flex items-center justify-between px-3 md:px-5 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-gray-700 shrink-0 gap-3 transition-colors duration-200 shadow-2xs">
            {/* LOGO & Web Title "driveR" */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Nút Toggle Sidebar */}
                <button
                    onClick={toggleSidebar}
                    title={isSidebarCollapsed ? t('header.sidebar.expand') : t('header.sidebar.collapse')}
                    className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors focus:outline-none cursor-pointer"
                >
                    <Menu className="w-5 h-5 text-gray-800 dark:text-gray-200" />
                </button>

                {/* Tên web "driveR" (Clicking resets to My Drive) */}
                <div 
                    onClick={handleLogoClick}
                    className="flex items-center cursor-pointer select-none pr-2 group"
                    title={t('header.logo.title')}
                >
                    <span className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 font-sans">
                        drive<span className="text-blue-600 dark:text-blue-400 font-black text-2xl">R</span>
                    </span>
                </div>
            </div>

            {/* VÙNG TÌM KIẾM TO + BỘ LỌC TÌM KIẾM */}
            <div className="flex-1 max-w-2xl relative mx-2">
                <div className="flex items-center bg-gray-100/90 dark:bg-white/5 hover:bg-gray-200/70 dark:hover:bg-white/10 focus-within:bg-white dark:focus-within:bg-[#282a2c] border border-gray-200/90 dark:border-transparent focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-0 focus-within:shadow-md rounded-full px-4 py-2 transition-all duration-200">
                    <Search className="w-5 h-5 text-gray-600 dark:text-gray-400 mr-3 shrink-0" />
                    <input
                        id="global-search-input"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('header.search.placeholder')}
                        className="w-full bg-transparent border-none outline-none text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    />
                    
                    {/* Nút Bộ lọc tìm kiếm */}
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        title={t('header.search.filter')}
                        className={`p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors ml-2 shrink-0 cursor-pointer ${
                            isFilterOpen || filterType !== 'all' ? 'text-blue-700 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-500/15' : 'text-gray-700 dark:text-gray-300'
                        }`}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                    </button>
                </div>

                {/* Popover Bộ Lọc Tìm Kiếm */}
                <SearchFilterModal
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                />
            </div>

            {/* CÀI ĐẶT + ỨNG DỤNG HỆ SINH THÁI + THÔNG TIN TÀI KHOẢN */}
            <div className="flex items-center gap-1.5 shrink-0 relative">
                


                {/* Nút Lịch sử hoạt động
                  *
                  * Khách chưa đăng nhập KHÔNG được mở drawer: lịch sử hoạt động là dữ
                  * liệu riêng của một tài khoản. Trước đây nút này bấm được ở mọi trạng
                  * thái — phiên vừa hết hạn là drawer vẫn mở ra, gọi API rồi mới bị 401
                  * và bị interceptor đá về /login, tức người dùng thấy panel lịch sử
                  * bật lên rồi trang mới nhảy đi. Nay chặn ngay tại chỗ bấm.
                  */}
                <button
                    onClick={() => {
                        if (!isAuthenticated) {
                            toast.error(t('header.activityLog.needLogin'));
                            navigate('/login');
                            return;
                        }
                        setIsActivityLogOpen(true);
                    }}
                    disabled={isAuthLoading}
                    title={isAuthenticated ? t('header.activityLog') : t('header.activityLog.needLogin')}
                    className="p-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <History className="w-5 h-5" />
                </button>

                {/* Nút Cài Đặt */}
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    title={t('header.settings')}
                    className="p-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
                >
                    <Settings className="w-5 h-5" />
                </button>

                {/* Nút Thông tin tài khoản — 3 trạng thái: loading / chưa login / đã login */}
                <div className="relative">
                    {isAuthLoading ? (
                        /* Skeleton khi đang kiểm tra auth */
                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse ml-1" />
                    ) : !isAuthenticated ? (
                        /* Chưa đăng nhập → hiện nút Đăng nhập */
                        <button
                            onClick={() => navigate('/login')}
                            className="ml-1 px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                        >
                            {t('common.login')}
                        </button>
                    ) : (
                        /* Đã đăng nhập → hiện avatar */
                        <>
                            <button
                                onClick={() => setIsAccountOpen(!isAccountOpen)}
                                title={t('header.account')}
                                className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center hover:opacity-90 shadow-xs transition-opacity ml-1 cursor-pointer overflow-hidden border border-gray-200 dark:border-gray-700"
                            >
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (user?.fullName || user?.email || 'U').charAt(0).toUpperCase()
                                )}
                            </button>

                            {/* Popover Thông Tin Tài Khoản */}
                            <AccountModal
                                isOpen={isAccountOpen}
                                onClose={() => setIsAccountOpen(false)}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Modal Cài Đặt */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            {/* Drawer Lịch sử hoạt động — chỉ dựng khi còn phiên. Nếu phiên bị thu hồi
                từ thiết bị khác trong lúc drawer đang mở thì `isAuthenticated` đổi về
                false và drawer đóng lại ngay, không giữ lại danh sách đã tải trên màn hình. */}
            <ActivityLogDrawer
                isOpen={isActivityLogOpen && isAuthenticated}
                onClose={() => setIsActivityLogOpen(false)}
                fileId={null}
                fileName={null}
            />
        </header>
    );
}