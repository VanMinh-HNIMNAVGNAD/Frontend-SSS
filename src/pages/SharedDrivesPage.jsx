import { useState, useEffect, useCallback } from 'react';
import { useFiles } from '../context/FileContext';
import { useAuth } from '../context/AuthContext';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import ContextMenu from '../components/file-manager/ContextMenu';
import ShareDriveModal from '../components/file-manager/ShareDriveModal';
import Modal from '../components/common/Modal';
import toast from 'react-hot-toast';
import {
    FolderGit2,
    List,
    LayoutGrid,
    Plus,
    Users,
    ArrowLeft,
    X,
    MoreVertical,
    Share2,
    Star,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { sharedDrivesApi } from '../services/api';

export default function SharedDrivesPage() {
    const { 
        viewMode, 
        setViewMode, 
        currentFolderId, 
        setCurrentFolderId,
        currentSharedDriveId,
        setCurrentSharedDriveId,
    } = useFiles();
    const { user } = useAuth();
    
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
                setError(err.message || 'Lỗi khi tải danh sách bộ nhớ dùng chung');
            } finally {
                // `loading` khởi tạo `true` nên chỉ lần tải đầu có spinner toàn trang;
                // các lần nạp lại sau thay dữ liệu tại chỗ, mỗi thao tác đã có cờ bận
                // riêng (`isCreating`, `isSavingRename`, `isDeleting`).
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [currentSharedDriveId, currentFolderId, reloadToken]);

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
            alert('Lỗi tạo bộ nhớ chung: ' + err.message);
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
            toast.success(res.isStarred ? 'Đã thêm vào mục gắn sao' : 'Đã bỏ khỏi mục gắn sao');
        } catch (err) {
            toast.error(err.message || 'Không cập nhật được dấu sao');
        }
    }, []);

    // Không copy được LINK vì router không có deep-link tới từng drive
    // (`/app/shared-drives` mở danh sách, drive đang chọn nằm trong context state).
    // Nên sao chép TÊN drive — thứ duy nhất copy ra mà vẫn còn nghĩa.
    const handleCopyName = useCallback(async (drive) => {
        try {
            await navigator.clipboard.writeText(drive.name);
            toast.success('Đã sao chép tên bộ nhớ dùng chung');
        } catch {
            toast.error('Trình duyệt không cho phép truy cập clipboard');
        }
    }, []);

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
            toast.success('Đã cập nhật bộ nhớ dùng chung');
            reloadDrives();
        } catch (err) {
            toast.error(err.message || 'Không cập nhật được bộ nhớ dùng chung');
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
                    ? `Đã xóa bộ nhớ dùng chung và ${res.deletedItems} mục bên trong`
                    : 'Đã xóa bộ nhớ dùng chung',
            );
            reloadDrives();
        } catch (err) {
            toast.error(err.message || 'Không xóa được bộ nhớ dùng chung');
        } finally {
            setIsDeleting(false);
        }
    };

    // If we are inside a specific Shared Drive or folder, show the files view
    if (currentSharedDriveId || currentFolderId) {
        const currentDrive = drives.find((d) => d.id === currentSharedDriveId);
        return (
            <div className="flex flex-col h-full" onContextMenu={suppressNativeMenu}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => {
                                setCurrentFolderId(null);
                                setCurrentSharedDriveId(null);
                            }}
                            title="Quay lại danh sách"
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <FolderGit2 className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                                    {currentDrive?.name || 'Nội dung bộ nhớ dùng chung'}
                                </h1>
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 rounded-md border border-indigo-100">
                                    Không gian nhóm
                                </span>
                            </div>
                            {currentDrive?.description ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{currentDrive.description}</p>
                            ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tài liệu lưu trữ thuộc quyền sở hữu chung của các thành viên</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-full p-1 border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setViewMode('list')}
                            title="Xem dạng danh sách"
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'list'
                                    ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-600 dark:text-blue-400 font-medium'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                            }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            title="Xem dạng lưới"
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'grid'
                                    ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-600 dark:text-blue-400 font-medium'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                            }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    // Default view: list of shared drives
    return (
        <div className="flex flex-col h-full overflow-y-auto pr-2 pb-12" onContextMenu={suppressNativeMenu}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <FolderGit2 className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-gray-800 dark:text-gray-200 tracking-tight">Bộ nhớ dùng chung</h1>
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 rounded-md border border-indigo-100/80">
                                Không gian nhóm
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1 leading-relaxed">
                            Không gian lưu trữ tập thể cho đội ngũ &amp; dự án — Tệp thuộc về cả nhóm thay vì một cá nhân riêng lẻ.
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Tạo mới
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            ) : error ? (
                <div className="p-4 bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold border border-red-100 flex items-center justify-center">{error}</div>
            ) : drives.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 mt-4">
                    <div className="w-16 h-16 bg-white dark:bg-[#282a2c] rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100 dark:border-gray-700 text-indigo-600 dark:text-indigo-400">
                        <FolderGit2 className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1.5">Chưa có bộ nhớ dùng chung nào</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6 leading-relaxed">
                        Bộ nhớ dùng chung giúp phòng ban hoặc nhóm dự án của bạn lưu trữ và quản lý tài liệu tại một nơi tập trung. Tài liệu thuộc sở hữu của cả nhóm và không bị mất khi có thành viên rời đi.
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Tạo Bộ nhớ nhóm đầu tiên
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
                            className="p-5 border border-gray-200 dark:border-gray-700 rounded-3xl hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer bg-white dark:bg-[#282a2c] group flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                                    <FolderGit2 className="w-6 h-6" />
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                                        {drive.userRole}
                                    </span>

                                    {/* Gắn sao — hiện luôn để thấy được trạng thái, không cần mở menu */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleStar(drive); }}
                                        title={drive.isStarred ? 'Bỏ khỏi mục gắn sao' : 'Thêm vào mục gắn sao'}
                                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-amber-500 rounded-full hover:bg-amber-50 transition-colors"
                                    >
                                        <Star className={`w-4 h-4 ${drive.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                                    </button>

                                    {/* Share nhanh — mở thẳng modal quản lý thành viên */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShareTarget(drive); }}
                                        title="Chia sẻ & quản lý thành viên"
                                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 rounded-full hover:bg-indigo-50 transition-colors"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>

                                    {/* 3 chấm — cùng menu với right-click */}
                                    <button
                                        onClick={(e) => openDriveMenu(e, drive)}
                                        title="Tùy chọn khác"
                                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    >
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-[15px] mb-1.5 truncate group-hover:text-indigo-700 transition-colors">{drive.name}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1 mb-4 leading-relaxed">
                                {drive.description || 'Không có mô tả'}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-600/80 mt-auto pt-3 border-t border-gray-50">
                                <Users className="w-3.5 h-3.5" />
                                <span className="uppercase tracking-wider">Không gian nhóm / Dự án</span>
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
            />

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#282a2c] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden transform transition-all">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-700 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
                            <div>
                                <h2 className="text-[15px] font-black text-slate-800 dark:text-gray-200 tracking-tight">Tạo Bộ nhớ dùng chung</h2>
                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Tất cả thành viên sẽ cùng sở hữu và quản lý tài liệu của nhóm</p>
                            </div>
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors ml-2"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateDrive} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                        Tên bộ nhớ nhóm <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newDriveName}
                                        onChange={e => setNewDriveName(e.target.value)}
                                        placeholder="Ví dụ: Phòng Marketing, Dự án Alpha..."
                                        className="w-full px-4 py-2.5 bg-white dark:bg-[#282a2c] border border-slate-200 dark:border-gray-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium placeholder:font-normal"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                        Mô tả (Không bắt buộc)
                                    </label>
                                    <textarea
                                        value={newDriveDesc}
                                        onChange={e => setNewDriveDesc(e.target.value)}
                                        placeholder="Mô tả mục đích sử dụng hoặc phòng ban quản lý bộ nhớ này..."
                                        rows={3}
                                        className="w-full px-4 py-2.5 bg-white dark:bg-[#282a2c] border border-slate-200 dark:border-gray-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium placeholder:font-normal"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-8 pt-4 border-t border-slate-100 dark:border-gray-700">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newDriveName.trim() || isCreating}
                                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2"
                                >
                                    {isCreating && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Tạo mới
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
                title="Đổi tên Bộ nhớ dùng chung"
                maxWidth="max-w-md"
            >
                <form onSubmit={handleRenameSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Tên bộ nhớ nhóm <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white dark:bg-[#282a2c] border border-slate-200 dark:border-gray-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Mô tả
                        </label>
                        <textarea
                            value={renameDesc}
                            onChange={(e) => setRenameDesc(e.target.value)}
                            rows={3}
                            placeholder="Mô tả mục đích sử dụng hoặc phòng ban quản lý bộ nhớ này..."
                            className="w-full px-4 py-2.5 bg-white dark:bg-[#282a2c] border border-slate-200 dark:border-gray-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium placeholder:font-normal"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => setRenameTarget(null)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={!renameName.trim() || isSavingRename}
                            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                            {isSavingRename && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Lưu thay đổi
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
                title="Xóa Bộ nhớ dùng chung?"
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    <div className="flex gap-3 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div className="text-[13px] text-rose-900 leading-relaxed">
                            <p className="font-bold mb-1">Hành động này không thể hoàn tác.</p>
                            <p>
                                Toàn bộ <strong>{deleteTarget?.itemCount ?? 0} tệp/thư mục</strong> bên trong
                                {' '}<strong>&quot;{deleteTarget?.name}&quot;</strong> sẽ bị xóa vĩnh viễn, kể cả
                                tệp do các thành viên khác tải lên. Chúng KHÔNG vào thùng rác.
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                        Mọi thành viên cũng sẽ mất quyền truy cập ngay lập tức.
                    </p>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Xóa vĩnh viễn
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
