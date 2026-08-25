import { useState, useCallback, useRef, memo } from 'react';
import { useFiles } from '../../context/FileContext';
import { filesApi, sharingApi } from '../../services/api';
import toast from 'react-hot-toast';
import { formatBytes } from '../../utils/formatFileSize';
import FileSkeleton from '../common/FileSkeleton';
import ContextMenu from './ContextMenu';
import RenameModal from './RenameModal';
import ShareModal from './ShareModal';
import GeminiModal from './GeminiModal';
import StarButton from '../common/StarButton';
import {
    Folder,
    FileText,
    FileSpreadsheet,
    Image as ImageIcon,
    FileCode,
    FileArchive,
    File,
    Video,
    Music,
    Database,
    Layers,
    MoreVertical,
    FolderOpen,
    ChevronLeft,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    CheckSquare,
    Square,
    Minus,
    ShieldAlert
} from 'lucide-react';

const getFileTypeLabel = (item) => {
    if (item.type === 'folder') return 'Thư mục';
    const name = item.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'Tài liệu PDF';
    if (name.endsWith('.xlsx') || name.endsWith('.csv')) return 'Bảng tính Excel';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'Văn bản Word';
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) return 'Trình chiếu PPT';
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'Hình ảnh PNG/JPG';
    if (name.endsWith('.svg')) return 'Đồ họa Vector SVG';
    if (name.endsWith('.mp4') || name.endsWith('.mkv')) return 'Video Clip MP4';
    if (name.endsWith('.mp3') || name.endsWith('.wav')) return 'Âm thanh MP3';
    if (name.endsWith('.py')) return 'Mã nguồn Python';
    if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts')) return 'Mã nguồn Script';
    if (name.endsWith('.sql') || name.endsWith('.db')) return 'Cơ sở dữ liệu SQL';
    if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return 'Tệp nén ZIP/RAR';
    if (name.endsWith('.md')) return 'Tài liệu Markdown';
    if (name.endsWith('.fig')) return 'Thiết kế Figma';
    if (name.endsWith('.exe')) return 'Tệp Thực thi EXE';
    return 'Tệp tin';
};

const getFileIcon = (file) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    if (name.endsWith('.xlsx') || name.endsWith('.csv')) return <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return <ImageIcon className="w-4 h-4 text-purple-500 shrink-0" />;
    if (name.endsWith('.svg')) return <ImageIcon className="w-4 h-4 text-pink-500 shrink-0" />;
    if (name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.md')) return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
    if (name.endsWith('.mp4') || name.endsWith('.mkv')) return <Video className="w-4 h-4 text-violet-500 shrink-0" />;
    if (name.endsWith('.mp3') || name.endsWith('.wav')) return <Music className="w-4 h-4 text-pink-500 shrink-0" />;
    if (name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts')) return <FileCode className="w-4 h-4 text-amber-500 shrink-0" />;
    if (name.endsWith('.sql') || name.endsWith('.db')) return <Database className="w-4 h-4 text-cyan-600 shrink-0" />;
    if (name.endsWith('.fig')) return <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />;
    if (name.endsWith('.zip') || name.endsWith('.rar')) return <FileArchive className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    if (name.endsWith('.exe')) return <FileCode className="w-4 h-4 text-rose-600 shrink-0" />;
    return <File className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />;
};

const FolderTableRow = memo(function FolderTableRow({
    folder,
    isSelected,
    isCut,
    activeTab,
    onKeyDown,
    onDoubleClick,
    onContextMenu,
    onToggleSelect,
    onSelectRange,
    onToggleStar,
}) {
    return (
        <tr
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, folder)}
            onDoubleClick={() => onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu(e, folder)}
            className={`transition-colors group cursor-pointer ${isCut ? 'opacity-50 border-dashed' : ''} ${
                isSelected ? 'bg-blue-50 dark:bg-blue-500/15 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
        >
            {/* Checkbox Column – only this triggers selection */}
            <td
                className="py-2.5 px-3 text-center"
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                        e.preventDefault();
                        onSelectRange(folder.id);
                    } else {
                        onToggleSelect(folder.id);
                    }
                }}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            >
                <button className="flex items-center justify-center text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
            </td>

            {/* Star Column – moved after checkbox */}
            {/* Tệp người khác chia sẻ: cột is_starred thuộc chủ sở hữu nên chỉ hiển
                thị trạng thái, không cho bấm (backend chặn non-owner) */}
            <td className="py-2.5 px-3 text-center">
                <StarButton
                    size="sm"
                    isStarred={folder.isStarred}
                    readOnly={folder.isSharedWithMe}
                    onToggle={() => onToggleStar(folder.id)}
                />
            </td>

            {/* Name Column */}
            <td className="py-2.5 px-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                        <Folder className="w-4 h-4 fill-amber-400" />
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 truncate max-w-[200px]" title={folder.name}>
                        {folder.name}
                    </span>
                </div>
            </td>

            {/* Size Column */}
            <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 font-mono text-[11px]">--</td>

            {/* Type Column */}
            <td className="py-2.5 px-3 hidden lg:table-cell">
                <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium text-[11px] border border-amber-200/60 dark:border-amber-800/60">
                    Thư mục
                </span>
            </td>

            {/* Owner Column */}
            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[140px] hidden lg:table-cell">
                {activeTab === 'shared-with-me' && folder.sharedOwner ? (
                    <div className="flex items-center gap-2">
                        {folder.sharedOwner.avatarUrl ? (
                            <img src={folder.sharedOwner.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                {folder.sharedOwner.fullName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        )}
                        <span className="truncate text-[11px]">{folder.sharedOwner.fullName || folder.owner}</span>
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                            folder.sharedRole === 'EDITOR' 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>
                            {folder.sharedRole === 'EDITOR' ? 'Sửa' : 'Xem'}
                        </span>
                    </div>
                ) : (
                    folder.owner || 'Tôi'
                )}
            </td>

            {/* Modified Column */}
            <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap hidden sm:table-cell">
                {activeTab === 'shared-with-me' && folder.sharedAt 
                    ? folder.sharedAt 
                    : folder.updatedAt}
            </td>

            {/* Action Options */}
            <td className="py-2.5 px-3 text-center">
                <button
                    onClick={(e) => onContextMenu(e, folder)}
                    className="p-1 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
});

const FileTableRow = memo(function FileTableRow({
    file,
    isSelected,
    isCut,
    activeTab,
    onKeyDown,
    onDoubleClick,
    onContextMenu,
    onToggleSelect,
    onSelectRange,
    onToggleStar,
}) {
    return (
        <tr
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, file)}
            onDoubleClick={() => onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu(e, file)}
            className={`transition-colors group cursor-pointer ${isCut ? 'opacity-50 border-dashed' : ''} ${
                isSelected ? 'bg-blue-50 dark:bg-blue-500/15 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
        >
            {/* Checkbox Column – only this triggers selection */}
            <td
                className="py-2.5 px-3 text-center"
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                        e.preventDefault();
                        onSelectRange(file.id);
                    } else {
                        onToggleSelect(file.id);
                    }
                }}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            >
                <button className="flex items-center justify-center text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
            </td>

            {/* Star Column — xem ghi chú ở hàng thư mục */}
            <td className="py-2.5 px-3 text-center">
                <StarButton
                    size="sm"
                    isStarred={file.isStarred}
                    readOnly={file.isSharedWithMe}
                    onToggle={() => onToggleStar(file.id)}
                />
            </td>

            {/* Name Column */}
            <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                    {getFileIcon(file)}
                    <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 truncate max-w-[180px]" title={file.name}>
                        {file.name}
                    </span>
                    {/* Lý do bị gắn cờ do Spam Guard — chỉ tệp trong mục Nội dung rác mới có */}
                    {file.isSpam && (
                        <span
                            className="shrink-0 text-amber-600 dark:text-amber-400"
                            title={file.suspiciousReason || 'Tệp bị gắn cờ đáng ngờ'}
                        >
                            <ShieldAlert className="w-4 h-4" />
                        </span>
                    )}
                </div>
            </td>

            {/* Size Column */}
            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono font-medium text-[11px]">
                {formatBytes(file.size)}
            </td>

            {/* Type Column */}
            <td className="py-2.5 px-3 hidden lg:table-cell">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium text-[11px] border border-blue-200/60 whitespace-nowrap">
                    {getFileTypeLabel(file)}
                </span>
            </td>

            {/* Owner Column */}
            <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[140px] hidden lg:table-cell">
                {activeTab === 'shared-with-me' && file.sharedOwner ? (
                    <div className="flex items-center gap-2">
                        {file.sharedOwner.avatarUrl ? (
                            <img src={file.sharedOwner.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                {file.sharedOwner.fullName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        )}
                        <span className="truncate text-[11px]">{file.sharedOwner.fullName || file.owner}</span>
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                            file.sharedRole === 'EDITOR' 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>
                            {file.sharedRole === 'EDITOR' ? 'Sửa' : 'Xem'}
                        </span>
                    </div>
                ) : (
                    file.owner || 'Tôi'
                )}
            </td>

            {/* Modified Column */}
            <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap hidden sm:table-cell">
                {activeTab === 'shared-with-me' && file.sharedAt 
                    ? file.sharedAt 
                    : file.updatedAt}
            </td>

            {/* Action Options */}
            <td className="py-2.5 px-3 text-center">
                <button
                    onClick={(e) => onContextMenu(e, file)}
                    className="p-1 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
});

// ──────────────────────────────────────────────────────────────────

export default function FileListView() {
    const {
        folders,
        files,
        currentFilteredItems,
        openFolder,
        toggleStar,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        renameItem,
        openInfoDrawer,
        openPreview,
        getDownloadUrl,
        activeTab,
        isLoading,
        currentPage,
        setCurrentPage,
        pageSize,
        totalItems,
        totalPages,
        sortField,
        setSortField,
        sortDirection,
        setSortDirection,
        // Selection
        selectedIds,
        selectedCount,
        isSelected,
        toggleSelect,
        selectRange,
        selectAll,
        deselectAll,
        // Clipboard
        clipboard,
        isPasting,
        cutItems,
        copyItems,
        pasteItems,
        // Upload / tạo thư mục (right-click vùng nền trống)
        createFolder,
        enqueueUpload,
        currentFolderId,
        currentSharedDriveId,
        triggerReload,
    } = useFiles();

    // Context menu state
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, item: null });
    const [isBuildingTree, setIsBuildingTree] = useState(false);

    // Modals state
    const [renameItemTarget, setRenameItemTarget] = useState(null);
    const [shareItemTarget, setShareItemTarget] = useState(null);
    const [geminiItemTarget, setGeminiItemTarget] = useState(null);

    // Hidden inputs cho "Tải tệp lên" / "Tải thư mục lên" từ menu vùng nền trống
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const setFolderInputRef = useCallback((el) => {
        folderInputRef.current = el;
        if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
        }
    }, []);

    const handleCreateFolderPrompt = useCallback(() => {
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tạo thư mục mới.');
            return;
        }
        const name = prompt('Nhập tên thư mục mới:', 'Thư mục chưa đặt tên');
        if (name) {
            createFolder(name);
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, createFolder]);

    const handleFileInputChange = useCallback((e) => {
        const selectedFiles = Array.from(e.target.files || []);
        e.target.value = '';
        if (selectedFiles.length === 0) return;
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tải tệp lên.');
            return;
        }
        selectedFiles.forEach((file) => enqueueUpload(file));
    }, [activeTab, currentSharedDriveId, currentFolderId, enqueueUpload]);

    // Tải folder lên, giữ nguyên cấu trúc thư mục con (giống NewButton.jsx)
    const handleFolderInputChange = useCallback(async (e) => {
        const selectedFiles = Array.from(e.target.files || []);
        e.target.value = '';
        if (selectedFiles.length === 0) return;

        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tải thư mục lên.');
            return;
        }

        setIsBuildingTree(true);
        try {
            const dirPathSet = new Set();
            selectedFiles.forEach((file) => {
                const parts = file.webkitRelativePath.split('/');
                for (let depth = 1; depth < parts.length; depth++) {
                    dirPathSet.add(parts.slice(0, depth).join('/'));
                }
            });

            const sortedDirPaths = Array.from(dirPathSet).sort((a, b) => {
                const depthA = a.split('/').length;
                const depthB = b.split('/').length;
                if (depthA !== depthB) return depthA - depthB;
                return a.localeCompare(b);
            });

            let batchFolderIdMap = {};
            const effectiveSharedDriveId = activeTab === 'shared-drives' ? currentSharedDriveId : undefined;
            if (sortedDirPaths.length > 0) {
                try {
                    batchFolderIdMap = await filesApi.createFoldersBatch(
                        sortedDirPaths,
                        currentFolderId,
                        effectiveSharedDriveId,
                    );
                } catch (error) {
                    console.error('Lỗi khi tạo hàng loạt thư mục:', error);
                    alert('Không thể tạo toàn bộ cấu trúc thư mục, một số tệp có thể bị đặt sai vị trí.');
                }
            }

            const folderIdMap = { '': currentFolderId, ...batchFolderIdMap };

            selectedFiles.forEach((file) => {
                const parts = file.webkitRelativePath.split('/');
                const dirPath = parts.slice(0, -1).join('/');
                const targetId = folderIdMap[dirPath] ?? currentFolderId;
                enqueueUpload(file, targetId, undefined, effectiveSharedDriveId);
            });

            triggerReload();
        } finally {
            setIsBuildingTree(false);
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, enqueueUpload, triggerReload]);

    // ── Selection Helpers ──
    const allCurrentCount = (folders?.length || 0) + (files?.length || 0);
    const allSelected = allCurrentCount > 0 && selectedCount >= allCurrentCount;
    const someSelected = selectedCount > 0 && !allSelected;

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }, [sortField, setSortDirection, setSortField]);

    // Folders and files are already sorted by FileContext
    const sortedFolders = folders || [];
    const sortedFiles = files || [];

    const handleItemDoubleClick = useCallback((item) => {
        if (item.type === 'folder' && !item.isTrash && !item.isSpam) {
            openFolder(item);
        } else {
            openPreview(item);
        }
    }, [openFolder, openPreview]);

    const handleQuickCopyLink = useCallback(async (item) => {
        try {
            const res = await sharingApi.createShareLink(item.id, {
                isDownloadAllowed: true,
                isPreviewOnly: false,
            });
            const fullShareUrl = `${window.location.origin}/share/${res.shareToken}`;
            await navigator.clipboard.writeText(fullShareUrl);
            toast.success('Đã sao chép liên kết chia sẻ');
        } catch (error) {
            console.error('Lỗi khi sao chép nhanh liên kết chia sẻ:', error);
            toast.error(error?.message || 'Không thể sao chép liên kết chia sẻ');
        }
    }, []);

    const openContextMenu = useCallback((e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            item
        });
    }, []);

    const openBlankContextMenu = useCallback((e) => {
        e.preventDefault();
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            item: null
        });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu({ isOpen: false, x: 0, y: 0, item: null });
    }, []);

    const handleKeyDown = useCallback((e, item) => {
        if (e.ctrlKey && e.altKey && (e.key === 'e' || e.key === 'E')) {
            e.preventDefault();
            setRenameItemTarget(item);
        } else if (e.key === 'Delete') {
            e.preventDefault();
            moveToTrash(item.id);
        }
    }, [moveToTrash]);

    const handleSelectRange = useCallback((id) => {
        selectRange(id, folders, files);
    }, [selectRange, folders, files]);

    if (isLoading) {
        return <FileSkeleton count={10} type="table" />;
    }

    if (currentFilteredItems.length === 0) {
        return (
            <div
                onContextMenu={openBlankContextMenu}
                className="flex flex-col items-center justify-center h-full py-20 text-gray-400 dark:text-gray-500 select-none"
            >
                <FolderOpen className="w-16 h-16 stroke-1 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Chưa có tệp hoặc thư mục nào ở đây</p>

                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label="Chọn nhiều tệp để tải lên" />
                <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label="Chọn thư mục để tải lên" />

                <ContextMenu
                    isOpen={contextMenu.isOpen}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.item}
                    isTrashTab={activeTab === 'trash'}
                    activeTab={activeTab}
                    onClose={closeContextMenu}
                    onUploadFile={() => fileInputRef.current?.click()}
                    onUploadFolder={() => folderInputRef.current?.click()}
                    onCreateFolder={handleCreateFolderPrompt}
                    isBuildingTree={isBuildingTree}
                />
            </div>
        );
    }

    return (
        <div
            onContextMenu={openBlankContextMenu}
            className="w-full flex flex-col h-full justify-between select-none text-xs sm:text-sm relative"
        >
            <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label="Chọn nhiều tệp để tải lên" />
            <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label="Chọn thư mục để tải lên" />

            {/* Extended Metadata Table View */}
            <div className="w-full overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700 shadow-2xs bg-white dark:bg-[#282a2c]">
                <table className="w-full text-left border-collapse min-w-[560px] lg:min-w-[850px]">
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/80 dark:bg-white/5 select-none">
                            {/* Checkbox Header */}
                            <th className="py-3 px-3 w-8 text-center">
                                <button
                                    onClick={() => allSelected ? deselectAll() : selectAll(folders, files)}
                                    className="flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                >
                                    {allSelected ? (
                                        <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    ) : someSelected ? (
                                        <Minus className="w-4 h-4 text-blue-500" />
                                    ) : (
                                        <Square className="w-4 h-4" />
                                    )}
                                </button>
                            </th>

                            {/* Star Header */}
                            <th className="py-3 px-3 w-8 text-center"></th>

                            {/* Name Header */}
                            <th
                                onClick={() => handleSort('name')}
                                className="py-3 px-3 font-semibold hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-1">
                                    <span>Name</span>
                                    {sortField === 'name' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                            </th>

                            {/* Size Header */}
                            <th
                                onClick={() => handleSort('size')}
                                className="py-3 px-3 font-semibold hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-1">
                                    <span>Size</span>
                                    {sortField === 'size' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                            </th>

                            {/* Type Header (Hidden on Mobile & Tablet) */}
                            <th
                                onClick={() => handleSort('type')}
                                className="py-3 px-3 font-semibold hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer transition-colors hidden lg:table-cell"
                            >
                                <div className="flex items-center gap-1">
                                    <span>Type</span>
                                    {sortField === 'type' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                            </th>

                            {/* Owner Header (Hidden on Mobile & Tablet) */}
                            <th
                                onClick={() => handleSort('owner')}
                                className="py-3 px-3 font-semibold hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer transition-colors hidden lg:table-cell"
                            >
                                <div className="flex items-center gap-1">
                                    <span>Owner</span>
                                    {sortField === 'owner' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                            </th>

                            {/* Modified Header (Hidden on Mobile) */}
                            <th
                                onClick={() => handleSort('updatedAt')}
                                className="py-3 px-3 font-semibold hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer transition-colors hidden sm:table-cell"
                            >
                                <div className="flex items-center gap-1">
                                    <span>Modified</span>
                                    {sortField === 'updatedAt' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )}
                                </div>
                            </th>

                            {/* Actions Header */}
                            <th className="py-3 px-3 w-10 text-center"></th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                        {/* Render Folders */}
                        {sortedFolders.map((folder) => (
                            <FolderTableRow
                                key={folder.id}
                                folder={folder}
                                isSelected={isSelected(folder.id)}
                                isCut={clipboard.mode === 'cut' && clipboard.items.some((e) => e.id === folder.id)}
                                activeTab={activeTab}
                                onKeyDown={handleKeyDown}
                                onDoubleClick={handleItemDoubleClick}
                                onContextMenu={openContextMenu}
                                onToggleSelect={toggleSelect}
                                onSelectRange={handleSelectRange}
                                onToggleStar={toggleStar}
                            />
                        ))}

                        {/* Render Files */}
                        {sortedFiles.map((file) => (
                            <FileTableRow
                                key={file.id}
                                file={file}
                                isSelected={isSelected(file.id)}
                                isCut={clipboard.mode === 'cut' && clipboard.items.some((e) => e.id === file.id)}
                                activeTab={activeTab}
                                onKeyDown={handleKeyDown}
                                onDoubleClick={handleItemDoubleClick}
                                onContextMenu={openContextMenu}
                                onToggleSelect={toggleSelect}
                                onSelectRange={handleSelectRange}
                                onToggleStar={toggleStar}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/*
              Vùng nền trống bên dưới bảng — right-click vào đây để tải lên / tạo thư mục mới.
              Cần thiết vì khi danh sách dài, các hàng <tr> chiếm hết chiều cao và không còn
              chỗ nào để right-click ra menu vùng trống.
            */}
            <div className="flex-1 min-h-[120px] shrink-0" aria-hidden="true" />

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 text-xs text-gray-500 dark:text-gray-400">
                    <div>
                        Hiển thị <span className="font-semibold text-gray-700 dark:text-gray-300">{((currentPage - 1) * pageSize) + 1}</span> - <span className="font-semibold text-gray-700 dark:text-gray-300">{Math.min(currentPage * pageSize, totalItems)}</span> trong <span className="font-semibold text-gray-700 dark:text-gray-300">{totalItems}</span> mục
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-2 font-medium">
                            Trang {currentPage} / {totalPages}
                        </span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Context Menu floating */}
            <ContextMenu
                isOpen={contextMenu.isOpen}
                x={contextMenu.x}
                y={contextMenu.y}
                item={contextMenu.item}
                isTrashTab={activeTab === 'trash'}
                activeTab={activeTab}
                onClose={closeContextMenu}
                onUploadFile={() => fileInputRef.current?.click()}
                onUploadFolder={() => folderInputRef.current?.click()}
                onCreateFolder={handleCreateFolderPrompt}
                isBuildingTree={isBuildingTree}
                onPreview={(item) => openPreview(item)}
                onDownload={async (item) => {
                    if (item.type === 'folder') {
                        alert('Đang tạo liên kết tải xuống thư mục dạng ZIP...');
                        return;
                    }
                    const url = await getDownloadUrl(item.id);
                    if (url) {
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = item.name;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                }}
                onRename={(item) => setRenameItemTarget(item)}
                onCut={(targetItem) => {
                    if (selectedIds.has(targetItem.id) && selectedIds.size > 1) {
                        cutItems(Array.from(selectedIds));
                    } else {
                        cutItems([targetItem.id]);
                    }
                }}
                onCopy={(targetItem) => {
                    if (selectedIds.has(targetItem.id) && selectedIds.size > 1) {
                        copyItems(Array.from(selectedIds));
                    } else {
                        copyItems([targetItem.id]);
                    }
                }}
                onPaste={(targetParentId) => pasteItems(targetParentId)}
                canPaste={clipboard.items.length > 0}
                isPasting={isPasting}
                onShare={(item) => setShareItemTarget(item)}
                onQuickCopyLink={handleQuickCopyLink}
                onGemini={(item) => setGeminiItemTarget(item)}
                onToggleStar={(item) => toggleStar(item.id)}
                onMoveToTrash={(item) => moveToTrash(item.id)}
                onRestore={(item) => restoreFromTrash(item.id)}
                onDeletePermanently={(item) => deletePermanently(item.id)}
                onShowInfo={(item, tab) => openInfoDrawer(item, tab)}
            />

            {/* Modals */}
            <RenameModal
                isOpen={!!renameItemTarget}
                item={renameItemTarget}
                onClose={() => setRenameItemTarget(null)}
                onRename={(id, newName) => renameItem(id, newName)}
            />

            <ShareModal
                isOpen={!!shareItemTarget}
                item={shareItemTarget}
                onClose={() => setShareItemTarget(null)}
            />

            <GeminiModal
                isOpen={!!geminiItemTarget}
                item={geminiItemTarget}
                onClose={() => setGeminiItemTarget(null)}
            />
        </div>
    );
}
