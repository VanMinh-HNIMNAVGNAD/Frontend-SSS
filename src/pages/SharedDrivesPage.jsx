import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFiles, useDriveAccess } from '../context/FileContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import tRich from '../utils/tRich';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import ContextMenu from '../components/file-manager/ContextMenu';
import ShareDriveModal from '../components/file-manager/ShareDriveModal';
import Modal from '../components/common/Modal';
import toast from 'react-hot-toast';
import {
    FolderGit2,
    Plus,
    Users,
    ArrowLeft,
    X,
    MoreVertical,
    Share2,
    Star,
    AlertTriangle,
    Loader2,
    LogOut,
} from 'lucide-react';
import { sharedDrivesApi } from '../services/api';
import ViewModeToggle from '../components/common/ViewModeToggle';

export default function SharedDrivesPage() {
    const { t } = useLanguage();
    const { 
        viewMode, 
        setViewMode, 
        currentFolderId, 
        setCurrentFolderId,
        currentSharedDriveId,
        setCurrentSharedDriveId,
        searchQuery,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        resetFilters,
        clearFilters,
    } = useFiles();
    const { user } = useAuth();

    // `?drive=<id>` — liên kết từ thông báo "bạn được thêm vào Bộ nhớ dùng chung" (##91): mở thẳng
    // drive đó rồi xoá tham số, để Back/F5 không kéo người dùng vào lại.
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const driveId = new URLSearchParams(location.search).get('drive');
        if (!driveId) return;
        setCurrentSharedDriveId(driveId);
        navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }, [location.search, location.pathname, setCurrentSharedDriveId, navigate]);

    // Tên drive khi vào THẲNG một drive (mở thư mục / "nơi chứa" từ kết quả tìm kiếm, ##90): danh
    // sách `drives` bên dưới chỉ nạp ở trang danh sách, nên trước đây tiêu đề rơi về câu chung chung.
    const { driveNameOf } = useDriveAccess();

    // Ở trang danh sách drive mà đang TÌM hoặc LỌC thì hiện kết quả trên mọi drive (##83).
    // Trước đây trang này chỉ vẽ thẻ drive: gõ tìm kiếm ở đây, hay chọn "Vị trí: Bộ nhớ dùng
    // chung" trong bộ lọc của thanh tìm kiếm, đều không hiện ra gì — kết quả có về (FileContext
    // vẫn gọi `tab=shared-drives`) nhưng không chỗ nào vẽ chúng.
    const isQuerying =
        Boolean(searchQuery?.trim()) || filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';

    const filterBar = (
        <FileFilterBar
            filterType={filterType}
            setFilterType={setFilterType}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterOwner={filterOwner}
            setFilterOwner={setFilterOwner}
            onReset={clearFilters}
        />
    );

    const viewSwitcher = (
        <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} className="shrink-0" />
    );
    
    const [drives, setDrives] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state for creating new drive
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newDriveName, setNewDriveName] = useState('');
    const [newDriveDesc, setNewDriveDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Menu 3 chấm / right-click trên thẻ drive
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, drive: null });

    // Các modal thao tác trên một drive
    const [shareTarget, setShareTarget] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [renameName, setRenameName] = useState('');
    const [renameDesc, setRenameDesc] = useState('');
    const [isSavingRename, setIsSavingRename] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [leaveTarget, setLeaveTarget] = useState(null);
    const [isLeaving, setIsLeaving] = useState(false);

    // Nạp lại danh sách sau mỗi thao tác. KHÔNG gọi thẳng một hàm setState từ thân
    // effect (cascading render — `react-hooks/set-state-in-effect`): thao tác chỉ tăng
    // `reloadToken`, còn việc gọi API nằm gọn trong effect bên dưới.
    const [reloadToken, setReloadToken] = useState(0);
    const reloadDrives = useCallback(() => setReloadToken((n) => n + 1), []);

    useEffect(() => {
        // Đang ở trong một drive/thư mục thì màn hình này không hiển thị danh sách
        if (currentSharedDriveId || currentFolderId) return;

        // Chặn setState của một request đã cũ (đổi trang / nạp lại liên tiếp) ghi đè
        // lên kết quả mới hơn
        let cancelled = false;

        (async () => {
            try {
                const res = await sharedDrivesApi.getAll();
                if (cancelled) return;
                setDrives(res || []);
                setError(null);
            } catch (err) {
                if (cancelled) return;
                setError(err.message || t('drives.loadFailed'));
            } finally {
                // `loading` khởi tạo `true` nên chỉ lần tải đầu có spinner toàn trang;
                // các lần nạp lại sau thay dữ liệu tại chỗ, mỗi thao tác đã có cờ bận
                // riêng (`isCreating`, `isSavingRename`, `isDeleting`).
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [currentSharedDriveId, currentFolderId, reloadToken, t]);

    const handleCreateDrive = async (e) => {
        e.preventDefault();
        if (!newDriveName.trim()) return;
        try {
            setIsCreating(true);
            await sharedDrivesApi.create({ name: newDriveName, description: newDriveDesc });
            setIsCreateModalOpen(false);
            setNewDriveName('');
            setNewDriveDesc('');
            reloadDrives();
        } catch (err) {
            alert(t('drives.createFailed', { reason: err.message }));
        } finally {
            setIsCreating(false);
        }
    };

    // Chặn menu mặc định của trình duyệt trên nền trang và trên thẻ drive, NHƯNG
    // vẫn để nguyên menu hệ thống bên trong ô nhập liệu: mọi modal (tạo / đổi tên /
    // xóa / chia sẻ) đều render lồng bên trong div này, chặn hết thì không chuột phải
    // để dán email hay sửa tên drive được nữa.
    const suppressNativeMenu = useCallback((e) => {
        if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
        e.preventDefault();
    }, []);

    // ── Thao tác trên thẻ drive ──────────────────────────────────────────

    // Cả nút 3 chấm và right-click đều đi qua đây → cùng một menu
    const openDriveMenu = useCallback((e, drive) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            // `canDelete`: backend chỉ cho người TẠO drive xóa (chặt hơn "mọi ADMIN")
            drive: { ...drive, canDelete: drive.createdBy === user?.id },
        });
    }, [user?.id]);

    const closeDriveMenu = useCallback(() => {
        setContextMenu({ isOpen: false, x: 0, y: 0, drive: null });
    }, []);

    const handleToggleStar = useCallback(async (drive) => {
        try {
            const res = await sharedDrivesApi.toggleStar(drive.id);
            setDrives((prev) => prev.map((d) => (
                d.id === drive.id ? { ...d, isStarred: res.isStarred } : d
            )));
            toast.success(res.isStarred ? t('file.star.added') : t('file.star.removed'));
        } catch (err) {
            toast.error(err.message || t('file.star.failed'));
        }
    }, [t]);

    // Không copy được LINK vì router không có deep-link tới từng drive
    // (`/app/shared-drives` mở danh sách, drive đang chọn nằm trong context state).
    // Nên sao chép TÊN drive — thứ duy nhất copy ra mà vẫn còn nghĩa.
    const handleCopyName = useCallback(async (drive) => {
        try {
            await navigator.clipboard.writeText(drive.name);
            toast.success(t('drives.nameCopied'));
        } catch {
            toast.error(t('drives.clipboardBlocked'));
        }
    }, [t]);

    const openRenameModal = useCallback((drive) => {
        setRenameTarget(drive);
        setRenameName(drive.name || '');
        setRenameDesc(drive.description || '');
    }, []);

    const handleRenameSubmit = async (e) => {
        e.preventDefault();
        if (!renameTarget || !renameName.trim()) return;
        try {
            setIsSavingRename(true);
            await sharedDrivesApi.update(renameTarget.id, {
                name: renameName.trim(),
                description: renameDesc,
            });
            setRenameTarget(null);
            toast.success(t('drives.updated'));
            reloadDrives();
        } catch (err) {
            toast.error(err.message || t('drives.updateFailed'));
        } finally {
            setIsSavingRename(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            setIsDeleting(true);
            const res = await sharedDrivesApi.remove(deleteTarget.id);
            setDeleteTarget(null);
            toast.success(
                res?.deletedItems
                    ? t('drives.deletedWithItems', { count: res.deletedItems })
                    : t('drives.deleted'),
            );
            reloadDrives();
        } catch (err) {
            toast.error(err.message || t('drives.deleteFailed'));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleConfirmLeave = async () => {
        if (!leaveTarget || !user?.id) return;
        try {
            setIsLeaving(true);
            await sharedDrivesApi.leave(leaveTarget.id, user.id);
            setLeaveTarget(null);
            toast.success(t('drives.left'));
            reloadDrives();
        } catch (err) {
            toast.error(err.message || t('drives.leaveFailed'));
        } finally {
            setIsLeaving(false);
        }
    };

    // If we are inside a specific Shared Drive or folder, show the files view
    if (currentSharedDriveId || currentFolderId) {
        const currentDrive = drives.find((d) => d.id === currentSharedDriveId);
        return (
            <div className="flex flex-col h-full" onContextMenu={suppressNativeMenu}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-glass-divider">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => {
                                setCurrentFolderId(null);
                                setCurrentSharedDriveId(null);
                            }}
                            title={t('drives.back')}
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <FolderGit2 className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                                    {currentDrive?.name || driveNameOf(currentSharedDriveId) || t('drives.contentTitle')}
                                </h1>
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-100 dark:border-indigo-800/60">
                                    {t('drives.groupSpace')}
                                </span>
                            </div>
                            {currentDrive?.description ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{currentDrive.description}</p>
                            ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('drives.contentHint')}</p>
                            )}
                        </div>
                    </div>

                    {viewSwitcher}
                </div>

                {/* Thanh lọc trong drive — trước ##83 không có: bộ lọc chọn ở trang khác vẫn áp
                    vào đây mà không hiện, không xoá được. Có thêm ô "Người sở hữu". */}
                {filterBar}

                <div className="flex-1 overflow-y-auto">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    // Đang tìm / lọc ở trang danh sách drive: kết quả trên MỌI drive mình là thành viên.
    if (isQuerying) {
        return (
            <div className="flex flex-col h-full" onContextMenu={suppressNativeMenu}>
                <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-glass-divider">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={resetFilters}
                            title={t('drives.results.back')}
                            aria-label={t('drives.results.back')}
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors shrink-0 cursor-pointer"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <FolderGit2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 truncate">
                                {t('drives.results.title')}
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('drives.results.hint')}</p>
                        </div>
                    </div>
                    {viewSwitcher}
                </div>

                {filterBar}

                <div className="flex-1 overflow-y-auto">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    // Default view: list of shared drives
    return (
        <div className="flex flex-col h-full overflow-y-auto pr-2 pb-12" onContextMenu={suppressNativeMenu}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-glass-divider">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs border border-indigo-200 dark:border-transparent">
                        <FolderGit2 className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">{t('drives.title')}</h1>
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800/60">
                                {t('drives.groupSpace')}
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1 leading-relaxed">
                            {t('drives.subtitle')}
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    {t('drives.createNew')}
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            ) : error ? (
                <div className="p-4 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-xl text-sm font-semibold border border-red-200 dark:border-red-900/50 flex items-center justify-center">{error}</div>
            ) : drives.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50/70 dark:bg-white/5 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 mt-4">
                    <div className="glass-soft w-16 h-16 rounded-full flex items-center justify-center mb-4 border text-indigo-600 dark:text-indigo-400">
                        <FolderGit2 className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5">{t('drives.empty')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
                        {t('drives.emptyHint')}
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        {t('drives.createFirst')}
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {drives.map(drive => (
                        <div 
                            key={drive.id}
                            onClick={() => {
                                setCurrentSharedDriveId(drive.id);
                                setCurrentFolderId(null);
                            }}
                            onContextMenu={(e) => openDriveMenu(e, drive)}
                            className="glass-soft p-5 border rounded-3xl hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform border border-indigo-100">
                                    <FolderGit2 className="w-6 h-6" />
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-extrabold rounded-full uppercase tracking-wider border border-gray-200 dark:border-transparent">
                                        {drive.userRole}
                                    </span>

                                    {/* Gắn sao — hiện luôn để thấy được trạng thái, không cần mở menu */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleStar(drive); }}
                                        title={drive.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 rounded-full hover:bg-amber-50 transition-colors"
                                    >
                                        <Star className={`w-4 h-4 ${drive.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                                    </button>

                                    {/* Share nhanh — mở thẳng modal quản lý thành viên */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShareTarget(drive); }}
                                        title={t('drives.manageMembers')}
                                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 transition-colors"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>

                                    {/* 3 chấm — cùng menu với right-click */}
                                    <button
                                        onClick={(e) => openDriveMenu(e, drive)}
                                        title={t('drives.moreOptions')}
                                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    >
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-[15px] mb-1.5 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">{drive.name}</h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 flex-1 mb-4 leading-relaxed font-medium">
                                {drive.description || t('drives.noDescription')}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-700 dark:text-indigo-400 mt-auto pt-3 border-t border-glass-divider">
                                <Users className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider">{t('drives.groupSpace')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Menu thao tác của thẻ drive (3 chấm & right-click dùng chung) */}
            <ContextMenu
                isOpen={contextMenu.isOpen}
                variant="drive"
                x={contextMenu.x}
                y={contextMenu.y}
                item={contextMenu.drive}
                onClose={closeDriveMenu}
                onRename={openRenameModal}
                onToggleStar={handleToggleStar}
                onCopy={handleCopyName}
                onShare={(drive) => setShareTarget(drive)}
                onDeletePermanently={(drive) => setDeleteTarget(drive)}
                onLeaveDrive={(drive) => setLeaveTarget(drive)}
            />

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
                    <div className="glass-strong relative rounded-[28px] w-full max-w-md overflow-hidden transform transition-all">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50/50 dark:bg-white/5 border-glass-divider">
                            <div>
                                <h2 className="text-[15px] font-black text-slate-800 dark:text-gray-200 tracking-tight">{t('drives.create.title')}</h2>
                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{t('drives.create.subtitle')}</p>
                            </div>
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl transition-colors ml-2"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateDrive} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                        {t('drives.name.label')} <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newDriveName}
                                        onChange={e => setNewDriveName(e.target.value)}
                                        placeholder={t('drives.name.placeholder')}
                                        className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium placeholder:font-normal"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                        {t('drives.description.optionalLabel')}
                                    </label>
                                    <textarea
                                        value={newDriveDesc}
                                        onChange={e => setNewDriveDesc(e.target.value)}
                                        placeholder={t('drives.description.placeholder')}
                                        rows={3}
                                        className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium placeholder:font-normal"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-8 pt-4 border-t border-glass-divider">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 rounded-xl transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newDriveName.trim() || isCreating}
                                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2"
                                >
                                    {isCreating && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {t('drives.createNew')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Đổi tên & mô tả — modal riêng vì `RenameModal` dùng chung hard-code chữ
                "tệp/thư mục" và chỉ sửa được tên, không sửa được mô tả */}
            {renameTarget && (
            <Modal
                isOpen
                onClose={() => setRenameTarget(null)}
                title={t('drives.rename.title')}
                maxWidth="max-w-md"
            >
                <form onSubmit={handleRenameSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            {t('drives.name.label')} <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            {t('drives.description.label')}
                        </label>
                        <textarea
                            value={renameDesc}
                            onChange={(e) => setRenameDesc(e.target.value)}
                            rows={3}
                            placeholder={t('drives.description.placeholder')}
                            className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium placeholder:font-normal"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setRenameTarget(null)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 rounded-xl transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!renameName.trim() || isSavingRename}
                            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                            {isSavingRename && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {t('drives.saveChanges')}
                        </button>
                    </div>
                </form>
            </Modal>
            )}

            {/* Xác nhận xóa drive — hành động KHÔNG hoàn tác được và kéo theo mọi nội dung bên trong */}
            {deleteTarget && (
            <Modal
                isOpen
                onClose={() => setDeleteTarget(null)}
                title={t('drives.delete.title')}
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    <div className="flex gap-3 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-900/50">
                        <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="text-[13px] text-rose-900 dark:text-rose-200 leading-relaxed">
                            <p className="font-bold mb-1">{t('drives.delete.warnTitle')}</p>
                            <p>
                                {tRich(t('drives.delete.warnBody'), {
                                    items: (
                                        <strong>
                                            {t('drives.delete.itemCount', { count: deleteTarget?.itemCount ?? 0 })}
                                        </strong>
                                    ),
                                    name: <strong>&quot;{deleteTarget?.name}&quot;</strong>,
                                })}
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t('drives.delete.membersLose')}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 rounded-xl transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {t('common.deleteForever')}
                        </button>
                    </div>
                </div>
            </Modal>
            )}

            {/* Xác nhận rời drive — tệp mình đã tải lên vẫn ở lại drive (và vẫn tính vào dung
                lượng của mình, vì quota đếm theo người tải lên), nên phải nói rõ trước khi bấm */}
            {leaveTarget && (
            <Modal
                isOpen
                onClose={() => setLeaveTarget(null)}
                title={t('drives.leave.title')}
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    <div className="flex gap-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-900/50">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-[13px] text-amber-900 dark:text-amber-200 leading-relaxed">
                            <p>
                                {tRich(t('drives.leave.body'), {
                                    name: <strong>&quot;{leaveTarget?.name}&quot;</strong>,
                                })}
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t('drives.leave.filesStay')}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setLeaveTarget(null)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 rounded-xl transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmLeave}
                            disabled={isLeaving}
                            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                            {isLeaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                            {t('drives.leave.confirm')}
                        </button>
                    </div>
                </div>
            </Modal>
            )}

            {/* Chia sẻ drive = quản lý `shared_drive_members` (KHÔNG phải `file_shares`) */}
            {shareTarget && (
            <ShareDriveModal
                isOpen
                drive={shareTarget}
                onClose={() => setShareTarget(null)}
                onChanged={reloadDrives}
            />
            )}
        </div>
    );
}
