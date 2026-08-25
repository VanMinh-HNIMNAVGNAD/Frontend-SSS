import { useState } from 'react';
import { useFiles } from '../../context/FileContext';
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
        selectedIds,
        selectedCount,
        deselectAll,
        selectAll,
        getSelectedItems,
        folders,
        files,
        activeTab,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        moveItem,
        copyItem,
        cutItems,
        copyItems,
        getDownloadUrl
    } = useFiles();

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

    const handleDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!confirm(t('header.confirm.trash', { count: items.length }))) return;

        const errors = [];
        for (const item of items) {
            try { await moveToTrash(item.id); } 
            catch { errors.push(item.name); }
        }
        deselectAll();
        if (errors.length) alert(t('header.error.delete', { names: errors.join(', ') }));
    };

    const handleRestoreSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!confirm(t('header.confirm.restore', { count: items.length }))) return;

        const errors = [];
        for (const item of items) {
            try { await restoreFromTrash(item.id); } 
            catch { errors.push(item.name); }
        }
        deselectAll();
        if (errors.length) alert(t('header.error.restore', { names: errors.join(', ') }));
    };

    const handlePermanentDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!confirm(t('header.confirm.deleteForever', { count: items.length }))) return;

        const errors = [];
        for (const item of items) {
            try { await deletePermanently(item.id); } 
            catch { errors.push(item.name); }
        }
        deselectAll();
        if (errors.length) alert(t('header.error.deleteForever', { names: errors.join(', ') }));
    };

    const handleMoveSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const targetId = prompt(t('header.prompt.moveTarget'));
        if (targetId === null) return;

        const errors = [];
        for (const item of items) {
            try { await moveItem(item.id, targetId || null); } 
            catch { errors.push(item.name); }
        }
        deselectAll();
        if (errors.length) alert(t('header.error.move', { names: errors.join(', ') }));
    };

    const handleCopySelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const targetId = prompt(t('header.prompt.copyTarget'));
        if (targetId === null) return;

        const errors = [];
        for (const item of items) {
            try { await copyItem(item.id, targetId || null); } 
            catch { errors.push(item.name); }
        }
        deselectAll();
        if (errors.length) alert(t('header.error.copy', { names: errors.join(', ') }));
    };

    const handleDownloadSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;

        const fileItems = items.filter((i) => i.type !== 'folder');
        const folderItems = items.filter((i) => i.type === 'folder');

        // Có thư mục trong lựa chọn -> gói tất cả (file + toàn bộ cây thư mục con)
        // thành 1 file ZIP duy nhất do backend nén
        if (folderItems.length > 0) {
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
            } catch (error) {
                console.error('Lỗi khi tải ZIP:', error);
                alert(t('header.error.zip'));
            }
            return;
        }

        for (const item of fileItems) {
            try {
                const url = await getDownloadUrl(item.id);
                if (url) {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = item.name;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    await new Promise((r) => setTimeout(r, 300));
                }
            } catch {
                console.error(`Lỗi tải xuống: ${item.name}`);
            }
        }
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
        <header className="h-16 flex items-center justify-between px-3 md:px-5 bg-white dark:bg-[#1e1e1e] border-b border-gray-100 dark:border-gray-700 shrink-0 gap-3 transition-colors duration-200">
            {/* LOGO & Web Title "driveR" */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Nút Toggle Sidebar */}
                <button
                    onClick={toggleSidebar}
                    title={isSidebarCollapsed ? t('header.sidebar.expand') : t('header.sidebar.collapse')}
                    className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors focus:outline-none cursor-pointer"
                >
                    <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>

                {/* Tên web "driveR" (Clicking resets to My Drive) */}
                <div 
                    onClick={handleLogoClick}
                    className="flex items-center cursor-pointer select-none pr-2 group"
                    title={t('header.logo.title')}
                >
                    <span className="text-xl font-bold tracking-tight text-gray-800 dark:text-gray-200 font-sans">
                        drive<span className="text-blue-600 dark:text-blue-400 font-extrabold text-2xl">R</span>
                    </span>
                </div>
            </div>

            {/* VÙNG TÌM KIẾM TO + BỘ LỌC TÌM KIẾM */}
            <div className="flex-1 max-w-2xl relative mx-2">
                <div className="flex items-center bg-[#f0f4f9] dark:bg-white/5 hover:bg-[#e9eef6] dark:hover:bg-white/10 focus-within:bg-white dark:focus-within:bg-[#282a2c] focus-within:shadow-md focus-within:ring-1 focus-within:ring-blue-500 rounded-full px-4 py-2 transition-all duration-200">
                    <Search className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-3 shrink-0" />
                    <input
                        id="global-search-input"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('header.search.placeholder')}
                        className="w-full bg-transparent border-none outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400"
                    />
                    
                    {/* Nút Bộ lọc tìm kiếm */}
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        title={t('header.search.filter')}
                        className={`p-1.5 rounded-full hover:bg-gray-200/80 dark:hover:bg-white/10 transition-colors ml-2 shrink-0 cursor-pointer ${
                            isFilterOpen || filterType !== 'all' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15' : 'text-gray-600 dark:text-gray-300'
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
                


                {/* Nút Lịch sử hoạt động */}
                <button
                    onClick={() => setIsActivityLogOpen(true)}
                    title={t('header.activityLog')}
                    className="p-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors cursor-pointer"
                >
                    <History className="w-5 h-5" />
                </button>

                {/* Nút Cài Đặt */}
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    title={t('header.settings')}
                    className="p-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
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

            {/* Drawer Lịch sử hoạt động */}
            <ActivityLogDrawer
                isOpen={isActivityLogOpen}
                onClose={() => setIsActivityLogOpen(false)}
                fileId={null}
                fileName={null}
            />
        </header>
    );
}