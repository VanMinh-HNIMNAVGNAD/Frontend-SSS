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
import PageHeader from '../components/common/PageHeader';
import { alertDialog } from '../utils/dialog';
import toast from 'react-hot-toast';
import {
    FolderGit2,
    Plus,
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

// Vai trò của mình trong một drive — nhãn đọc được thay cho mã thô "ADMIN"/"VIEWER" in hoa.
const ROLE_LABEL_KEYS = {
    ADMIN: 'driveShare.role.admin',
    MEMBER: 'driveShare.role.member',
    VIEWER: 'driveShare.role.viewer',
};

export default function SharedDrivesPage() {
    const { t } = useLanguage();
    const { 
        viewMode, 
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

    // Nút ← quay lại danh sách drive, đứng trước tiêu đề của hai màn con bên dưới.
    const backButton = (onClick, label) => (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className="p-1.5 -ml-1.5 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors shrink-0 cursor-pointer"
        >
            <ArrowLeft className="w-5 h-5" />
        </button>
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
            await alertDialog(t('drives.createFailed', { reason: err.message }));
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
                <PageHeader
                    title={
                        <div className="flex items-center gap-2 min-w-0">
                            {backButton(() => {
                                setCurrentFolderId(null);
                                setCurrentSharedDriveId(null);
                            }, t('drives.back'))}
                            <FolderGit2 className="w-[22px] h-[22px] shrink-0 text-[var(--ink-muted)]" />
                            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] truncate">
                                {currentDrive?.name || driveNameOf(currentSharedDriveId) || t('drives.contentTitle')}
                            </h1>
                        </div>
                    }
                    subtitle={<span className="pl-16 block">{currentDrive?.description || t('drives.contentHint')}</span>}
                />

                {/* Thanh lọc trong drive — trước ##83 không có: bộ lọc chọn ở trang khác vẫn áp
                    vào đây mà không hiện, không xoá được. Có thêm ô "Người sở hữu". */}
                {filterBar}

                <div className="flex-1 overflow-y-auto pt-2">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    // Đang tìm / lọc ở trang danh sách drive: kết quả trên MỌI drive mình là thành viên.
    if (isQuerying) {
        return (
            <div className="flex flex-col h-full" onContextMenu={suppressNativeMenu}>
                <PageHeader
                    title={
                        <div className="flex items-center gap-2 min-w-0">
                            {backButton(resetFilters, t('drives.results.back'))}
                            <FolderGit2 className="w-[22px] h-[22px] shrink-0 text-[var(--ink-muted)]" />
                            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] truncate">{t('drives.results.title')}</h1>
                        </div>
                    }
                    subtitle={<span className="pl-16 block">{t('drives.results.hint')}</span>}
                />

                {filterBar}

                <div className="flex-1 overflow-y-auto pt-2">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    // Default view: list of shared drives
    return (
        <div className="flex flex-col h-full overflow-y-auto pr-1 pb-12" onContextMenu={suppressNativeMenu}>
            <PageHeader
                icon={FolderGit2}
                title={t('drives.title')}
                subtitle={t('drives.subtitle')}
                className="pb-3 border-b border-glass-divider"
                actions={
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="btn-accent hover:brightness-105 flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold transition shrink-0 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        {t('drives.createNew')}
                    </button>
                }
            />

            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-subtle)]" />
                </div>
            ) : error ? (
                <div className="mt-2 p-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            ) : drives.length === 0 ? (
                <div className="glass-soft flex flex-col items-center justify-center p-12 text-center rounded-[28px] mt-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-[var(--chip-fill)] text-[var(--ink-muted)]">
                        <FolderGit2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-semibold text-[var(--ink)] mb-1.5">{t('drives.empty')}</h3>
                    <p className="text-sm text-[var(--ink-muted)] max-w-md mb-6 leading-relaxed">
                        {t('drives.emptyHint')}
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="btn-accent hover:brightness-105 px-5 py-2.5 rounded-full text-sm font-semibold transition flex items-center gap-2 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        {t('drives.createFirst')}
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-3">
                    {drives.map(drive => (
                        // Thẻ drive: tên + mô tả bên trái, sao + ⋮ góc phải; chân thẻ là vai trò của
                        // mình (chip xám) và nút Chia sẻ — trước đây vai trò in hoa, sao và nút chia sẻ
                        // chen chúc cạnh icon, cạnh tiêu đề còn một badge "Không gian nhóm / Dự án".
                        <div 
                            key={drive.id}
                            onClick={() => {
                                setCurrentSharedDriveId(drive.id);
                                setCurrentFolderId(null);
                            }}
                            onContextMenu={(e) => openDriveMenu(e, drive)}
                            className="glass-soft p-4 rounded-[22px] hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer group flex flex-col"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--chip-fill)] text-[var(--ink-muted)]">
                                    <FolderGit2 className="w-5 h-5" />
                                </div>
                                <div className="flex items-center -mr-1.5 -mt-1 shrink-0">
                                    {/* Gắn sao — hiện luôn để thấy được trạng thái, không cần mở menu */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleStar(drive); }}
                                        title={drive.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                                        aria-pressed={!!drive.isStarred}
                                        className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                                            drive.isStarred ? 'text-[var(--ink)]' : 'text-[var(--ink-subtle)] hover:text-[var(--ink)]'
                                        }`}
                                    >
                                        <Star className={`w-4 h-4 ${drive.isStarred ? 'fill-current' : ''}`} />
                                    </button>
                                    {/* 3 chấm — cùng menu với right-click */}
                                    <button
                                        onClick={(e) => openDriveMenu(e, drive)}
                                        title={t('drives.moreOptions')}
                                        className="p-1.5 rounded-full text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                                    >
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="mt-3 font-semibold text-[var(--ink)] text-[15px] truncate" title={drive.name}>{drive.name}</h3>
                            <p className="text-xs text-[var(--ink-muted)] line-clamp-2 mt-0.5 mb-3 leading-relaxed">
                                {drive.description || t('drives.noDescription')}
                            </p>

                            <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-glass-divider">
                                <span className="chip px-2 py-0.5 text-[11px]">
                                    {ROLE_LABEL_KEYS[drive.userRole] ? t(ROLE_LABEL_KEYS[drive.userRole]) : drive.userRole}
                                </span>
                                {/* Share nhanh — mở thẳng modal quản lý thành viên */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShareTarget(drive); }}
                                    title={t('drives.manageMembers')}
                                    aria-label={t('drives.manageMembers')}
                                    className="p-1.5 -mr-1.5 rounded-full text-[var(--ink-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                                >
                                    <Share2 className="w-4 h-4" />
                                </button>
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
                        <div className="px-6 py-4 border-b flex items-center justify-between border-glass-divider">
                            <div>
                                <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight">{t('drives.create.title')}</h2>
                                <p className="text-xs text-[var(--ink-muted)] mt-0.5">{t('drives.create.subtitle')}</p>
                            </div>
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-[var(--ink-subtle)] hover:text-[var(--ink)] p-1.5 rounded-full transition-colors ml-2 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateDrive} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1.5 uppercase tracking-wider">
                                        {t('drives.name.label')} <span className="text-[var(--tone-danger)]">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newDriveName}
                                        onChange={e => setNewDriveName(e.target.value)}
                                        placeholder={t('drives.name.placeholder')}
                                        className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium placeholder:font-normal"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1.5 uppercase tracking-wider">
                                        {t('drives.description.optionalLabel')}
                                    </label>
                                    <textarea
                                        value={newDriveDesc}
                                        onChange={e => setNewDriveDesc(e.target.value)}
                                        placeholder={t('drives.description.placeholder')}
                                        rows={3}
                                        className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all resize-none font-medium placeholder:font-normal"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-8 pt-4 border-t border-glass-divider">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 text-xs font-semibold glass-soft text-[var(--ink)] rounded-full transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newDriveName.trim() || isCreating}
                                    className="px-4 py-2 text-xs font-semibold btn-accent hover:brightness-105 disabled:cursor-not-allowed rounded-full transition flex items-center gap-2"
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
                        <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1.5 uppercase tracking-wider">
                            {t('drives.name.label')} <span className="text-[var(--tone-danger)]">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-1.5 uppercase tracking-wider">
                            {t('drives.description.label')}
                        </label>
                        <textarea
                            value={renameDesc}
                            onChange={(e) => setRenameDesc(e.target.value)}
                            rows={3}
                            placeholder={t('drives.description.placeholder')}
                            className="glass-input w-full px-4 py-2.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all resize-none font-medium placeholder:font-normal"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setRenameTarget(null)}
                            className="px-4 py-2 text-xs font-semibold glass-soft text-[var(--ink)] rounded-full transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!renameName.trim() || isSavingRename}
                            className="px-4 py-2 text-xs font-semibold btn-accent hover:brightness-105 disabled:cursor-not-allowed rounded-full transition flex items-center gap-2 cursor-pointer"
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
                    <div className="flex gap-3 p-3.5 rounded-2xl bg-[var(--tone-danger-soft)]">
                        <AlertTriangle className="w-5 h-5 text-[var(--tone-danger)] shrink-0 mt-0.5" />
                        <div className="text-[13px] text-[var(--ink)] leading-relaxed">
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

                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                        {t('drives.delete.membersLose')}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 text-xs font-semibold glass-soft text-[var(--ink)] rounded-full transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="px-4 py-2 text-xs font-semibold btn-danger disabled:cursor-not-allowed rounded-full transition-colors flex items-center gap-2 cursor-pointer"
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
                    <div className="flex gap-3 p-3.5 rounded-2xl bg-[var(--tone-warn-soft)]">
                        <AlertTriangle className="w-5 h-5 text-[var(--tone-warn)] shrink-0 mt-0.5" />
                        <div className="text-[13px] text-[var(--ink)] leading-relaxed">
                            <p>
                                {tRich(t('drives.leave.body'), {
                                    name: <strong>&quot;{leaveTarget?.name}&quot;</strong>,
                                })}
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                        {t('drives.leave.filesStay')}
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-glass-divider">
                        <button
                            type="button"
                            onClick={() => setLeaveTarget(null)}
                            className="px-4 py-2 text-xs font-semibold glass-soft text-[var(--ink)] rounded-full transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmLeave}
                            disabled={isLeaving}
                            className="px-4 py-2 text-xs font-semibold btn-danger disabled:cursor-not-allowed rounded-full transition-colors flex items-center gap-2 cursor-pointer"
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
