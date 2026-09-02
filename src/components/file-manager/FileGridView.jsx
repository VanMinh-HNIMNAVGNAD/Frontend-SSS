import { useState, useCallback, useRef } from 'react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { sharingApi } from '../../services/api';
import { readDefaultShareRole } from '../../constants/privacy';
import toast from 'react-hot-toast';
import FileSkeleton from '../common/FileSkeleton';
import FolderCard from './FolderCard';
import FileCard from './FileCard';
import ContextMenu from './ContextMenu';
import RenameModal from './RenameModal';
import ShareModal from './ShareModal';
import GeminiModal from './GeminiModal';
import { Folder, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { collectInputEntries } from '../../utils/uploadTree';
import tRich from '../../utils/tRich';

export default function FileGridView() {
    const { t } = useLanguage();
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
        // Selection
        selectedIds,
        isSelected,
        toggleSelect,
        selectRange,
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
        uploadEntries,
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

    const handleCreateFolderPrompt = useCallback(() => {
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert(t('newBtn.needDrive.folder'));
            return;
        }
        const name = prompt(t('newBtn.prompt.folderName'), t('newBtn.defaultFolderName'));
        if (name) {
            createFolder(name);
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, createFolder, t]);

    const handleFileInputChange = useCallback((e) => {
        const selectedFiles = Array.from(e.target.files || []);
        e.target.value = '';
        if (selectedFiles.length === 0) return;
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert(t('newBtn.needDrive.file'));
            return;
        }
        selectedFiles.forEach((file) => enqueueUpload(file));
    }, [activeTab, currentSharedDriveId, currentFolderId, enqueueUpload, t]);

    /**
     * Tải thư mục lên từ menu chuột phải — dùng chung `uploadEntries` của
     * FileContext (xây cây thư mục + đưa từng tệp vào hàng đợi, chỉ chèn thêm
     * card mới thay vì tải lại toàn bộ danh sách).
     */
    const handleFolderInputChange = useCallback(async (e) => {
        const tree = collectInputEntries(e.target.files);
        e.target.value = '';
        if (tree.entries.length === 0) return;

        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alert(t('newBtn.needDrive.uploadFolder'));
            return;
        }

        setIsBuildingTree(true);
        try {
            await uploadEntries(tree);
        } finally {
            setIsBuildingTree(false);
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, uploadEntries, t]);

    const handleItemDoubleClick = useCallback((item) => {
        if (item.type === 'folder' && !item.isTrash && !item.isSpam) {
            openFolder(item);
        } else {
            openPreview(item);
        }
    }, [openFolder, openPreview]);

    const handleDownloadItem = useCallback(async (item) => {
        try {
            if (item.type === 'folder') {
                alert(t('list.zip.creating'));
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
        } catch (error) {
            console.error('Lỗi khi tải xuống:', error);
        }
    }, [getDownloadUrl, t]);

    const handleQuickCopyLink = useCallback(async (item) => {
        try {
            const res = await sharingApi.createShareLink(item.id, {
                // Sao chép nhanh không có giao diện chọn quyền — lấy "Quyền chia sẻ
                // mặc định khi tạo Link" trong Cài đặt. Đọc tại chỗ (không cache theo
                // useCallback) để đổi trong Cài đặt là có hiệu lực ngay ở lần bấm sau.
                role: readDefaultShareRole(),
                isDownloadAllowed: true,
                isPreviewOnly: false,
            });
            const fullShareUrl = `${window.location.origin}/share/${res.shareToken}`;
            await navigator.clipboard.writeText(fullShareUrl);
            toast.success(t('list.share.copied'));
        } catch (error) {
            console.error('Lỗi khi sao chép nhanh liên kết chia sẻ:', error);
            toast.error(error?.message || t('list.share.copyFailed'));
        }
    }, [t]);

    const handleSelectRange = useCallback((id) => {
        selectRange(id, folders, files);
    }, [selectRange, folders, files]);

    if (isLoading) {
        return <FileSkeleton type="grid" count={10} />;
    }

    if (!currentFilteredItems || currentFilteredItems.length === 0) {
        return (
            <div
                onContextMenu={openBlankContextMenu}
                className="flex flex-col items-center justify-center h-full py-20 text-gray-400 dark:text-gray-500"
            >
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3 text-gray-300">
                    <Folder className="w-8 h-8" />
                </div>
                <p className="text-base font-medium text-gray-600 dark:text-gray-300">{t('list.empty.gridTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('list.empty.gridHint')}</p>

                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFiles')} />
                <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFolder')} />

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
            className="flex flex-col h-full justify-between pb-4 select-none"
        >
            <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFiles')} />
            <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFolder')} />
            <div className="space-y-6 overflow-y-auto pr-1">
                {/* Section 1: Thư mục (Folders) */}
                {folders && folders.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <Folder className="w-4 h-4 text-amber-500" />
                            <span>{t('list.group.folders', { count: folders.length })}</span>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
                            {folders.map((folder) => (
                                <FolderCard
                                    key={folder.id}
                                    folder={folder}
                                    onDoubleClick={handleItemDoubleClick}
                                    onContextMenu={openContextMenu}
                                    onStarToggle={toggleStar}
                                    isSelected={isSelected(folder.id)}
                                    isCut={clipboard.mode === 'cut' && clipboard.items.some((e) => e.id === folder.id)}
                                    onToggleSelect={toggleSelect}
                                    onSelectRange={handleSelectRange}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Section 2: Tệp (Files) */}
                {files && files.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span>{t('list.group.files', { count: files.length })}</span>
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
                            {files.map((file) => (
                                <FileCard
                                    key={file.id}
                                    file={file}
                                    onDoubleClick={handleItemDoubleClick}
                                    onContextMenu={openContextMenu}
                                    onStarToggle={toggleStar}
                                    onOpenInfo={openInfoDrawer}
                                    isSelected={isSelected(file.id)}
                                    isCut={clipboard.mode === 'cut' && clipboard.items.some((e) => e.id === file.id)}
                                    onToggleSelect={toggleSelect}
                                    onSelectRange={handleSelectRange}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    <div>
                        {tRich(t('list.pagination.showing'), {
                            from: <span className="font-semibold text-gray-700 dark:text-gray-300">{((currentPage - 1) * pageSize) + 1}</span>,
                            to: <span className="font-semibold text-gray-700 dark:text-gray-300">{Math.min(currentPage * pageSize, totalItems)}</span>,
                            total: <span className="font-semibold text-gray-700 dark:text-gray-300">{totalItems}</span>,
                        })}
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
                onDownload={handleDownloadItem}
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
