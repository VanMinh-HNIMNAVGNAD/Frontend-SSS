import { useState, useCallback, useRef } from 'react';
import { useFiles, useFileSelection, useClipboard, useFilePreview, useDriveAccess } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAiPanel } from '../../context/AiPanelContext';
import { sharingApi } from '../../services/api';
import toast from 'react-hot-toast';
import FileSkeleton from '../common/FileSkeleton';
import FolderCard from './FolderCard';
import FileCard from './FileCard';
import ContextMenu from './ContextMenu';
import RenameModal from './RenameModal';
import ShareModal from './ShareModal';
import MoveModal from './MoveModal';
import { Folder, FileText, ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { collectInputEntries } from '../../utils/uploadTree';
import { downloadSingleItem } from '../../utils/downloadItems';
import tRich from '../../utils/tRich';
import { alertDialog, promptDialog } from '../../utils/dialog';
import { FOLDER_GRID_CLASS, FILE_GRID_CLASS } from './gridLayout';

export default function FileGridView() {
    const { t } = useLanguage();
    const { 
        folders, 
        files, 
        currentFilteredItems, 
        openFolder, 
        toggleStar, 
        updateColor,
        moveToTrash,
        restoreFromTrash,
        markNotSpam,
        deletePermanently,
        renameItem,
        getDownloadUrl,
        activeTab,
        isLoading,
        isRefreshing,
        currentPage,
        setCurrentPage,
        pageSize,
        totalItems,
        totalPages,
        // Upload / tạo thư mục (right-click vùng nền trống)
        createFolder,
        enqueueUpload,
        currentFolderId,
        currentSharedDriveId,
        uploadEntries,
        isInForeignFolder,
        openItemLocation,
        searchQuery,
        filterType,
        filterDate,
        filterOwner,
    } = useFiles();
    // Rỗng vì đang TÌM / LỌC thì nói "không có kết quả", không phải "thư mục trống — kéo thả tệp vào".
    const isQuerying = Boolean(searchQuery?.trim()) || filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';

    // Xem chú thích cùng chỗ trong FileListView: ba nhóm này đổi theo từng cú
    // bấm chuột nên đi context riêng, không gộp vào useFiles().
    const { selectedIds, isSelected, toggleSelect, selectRange, deselectAll } = useFileSelection();

    const { clipboard, isPasting, cutItems, copyItems, pasteItems } = useClipboard();

    const { openInfoDrawer, openPreview } = useFilePreview();

    /**
     * Gỡ một tệp khỏi Nội dung rác từ menu chuột phải.
     *
     * Toast nêu rõ tệp về thư mục nào: người dùng vẫn đang đứng ở trang Nội dung rác
     * sau thao tác, dòng vừa biến mất khỏi bảng mà không kèm lời nào thì trông y hệt
     * lỗi cũ ("khôi phục xong không thấy tệp đâu").
     */
    const handleNotSpam = useCallback(async (item) => {
        const res = await markNotSpam(item.id);
        if (res.ok) {
            toast.success(t('file.notSpam.done', {
                name: item.name,
                folder: res.parentName || t('nav.myDrive'),
            }));
        }
    }, [markNotSpam, t]);

    // Context menu state
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, item: null });
    const [isBuildingTree, setIsBuildingTree] = useState(false);

    // Panel AI mount MỘT bản duy nhất ở `AiPanelProvider`: view chỉ nói "mở cho mục này".
    // Nhờ vậy nút "Hỏi AI" trong cửa sổ xem trước — vốn không phải con của view này — gọi
    // được đúng panel đó thay vì phải có bản riêng.
    const { openAi } = useAiPanel();

    // Modals state
    const [renameItemTarget, setRenameItemTarget] = useState(null);
    const [shareItemTarget, setShareItemTarget] = useState(null);
    // Các mục đang mở hộp thoại "Di chuyển tới…" (##90) — null = đóng
    const [moveTargets, setMoveTargets] = useState(null);

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

    const handleCreateFolderPrompt = useCallback(async () => {
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            await alertDialog(t('newBtn.needDrive.folder'));
            return;
        }
        const name = await promptDialog({
            message: t('newBtn.prompt.folderName'),
            defaultValue: t('newBtn.defaultFolderName'),
        });
        if (name && name.trim()) {
            createFolder(name.trim());
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, createFolder, t]);

    const handleFileInputChange = useCallback((e) => {
        const selectedFiles = Array.from(e.target.files || []);
        e.target.value = '';
        if (selectedFiles.length === 0) return;
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            alertDialog(t('newBtn.needDrive.file'));
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
            alertDialog(t('newBtn.needDrive.uploadFolder'));
            return;
        }

        setIsBuildingTree(true);
        try {
            await uploadEntries(tree);
        } finally {
            setIsBuildingTree(false);
        }
    }, [activeTab, currentSharedDriveId, currentFolderId, uploadEntries, t]);

    // Thư mục người khác chia sẻ (##78) hoặc Bộ nhớ chung mình chỉ là VIEWER (##79): menu chuột phải
    // không có nhóm tạo mới / Dán — backend không nhận ghi vào đó; nút "Mới" ở thanh bên nói lý do.
    const { isDriveReadOnly } = useDriveAccess();
    const createActions = isInForeignFolder || isDriveReadOnly
        ? {}
        : {
              onUploadFile: () => fileInputRef.current?.click(),
              onUploadFolder: () => folderInputRef.current?.click(),
              onCreateFolder: handleCreateFolderPrompt,
          };

    const handleItemDoubleClick = useCallback((item) => {
        if (item.type === 'folder' && !item.isTrash && !item.isSpam) {
            openFolder(item);
        } else {
            // Kèm danh sách đang hiện để cửa sổ xem trước có nút ‹ › sang tệp kế bên.
            openPreview(item, files);
        }
    }, [openFolder, openPreview, files]);

    // Thư mục -> backend nén ZIP; tệp -> presigned URL. Trước đây nhánh thư mục
    // chỉ alert('Đang tạo liên kết...') rồi return, không tải gì cả.
    const handleDownloadItem = useCallback(
        (item) => downloadSingleItem(item, getDownloadUrl, { t }),
        [getDownloadUrl, t],
    );

    const handleQuickCopyLink = useCallback(async (item) => {
        // Toast chờ là bắt buộc ở đây, không chỉ để cho đẹp: "sao chép liên kết" tạo một
        // share link ở backend trước khi có gì để chép, mà thao tác chép vào clipboard
        // thì vốn không có phản hồi nhìn thấy được. Không có toast này thì cả giây chờ
        // là hoàn toàn im lặng và người dùng bấm lại lần nữa, tạo thêm một link nữa.
        const toastId = toast.loading(t('list.share.copying'));
        try {
            // Không gửi `role`: link công khai luôn chỉ xem/tải, backend không đọc nó (##79).
            const res = await sharingApi.createShareLink(item.id, {
                isDownloadAllowed: true,
                isPreviewOnly: false,
            });
            const fullShareUrl = `${window.location.origin}/share/${res.shareToken}`;
            await navigator.clipboard.writeText(fullShareUrl);
            toast.success(t('list.share.copied'), { id: toastId });
        } catch (error) {
            console.error('Lỗi khi sao chép nhanh liên kết chia sẻ:', error);
            toast.error(error?.message || t('list.share.copyFailed'), { id: toastId });
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
                className="flex flex-col items-center justify-center h-full py-20"
            >
                <div className="glass-soft w-16 h-16 rounded-[20px] flex items-center justify-center mb-3 text-[var(--ink-subtle)]">
                    {isQuerying ? <SearchX className="w-7 h-7" /> : <Folder className="w-7 h-7" />}
                </div>
                <p className="text-sm font-medium text-[var(--ink)]">
                    {isQuerying ? t('list.empty.noResults') : t('list.empty.gridTitle')}
                </p>
                <p className="text-xs text-[var(--ink-muted)] mt-1 text-center px-4">
                    {isQuerying ? t('list.empty.noResultsHint') : t('list.empty.gridHint')}
                </p>

                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFiles')} />
                <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFolder')} />

                <ContextMenu
                    isOpen={contextMenu.isOpen}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.item}
                    isTrashTab={activeTab === 'trash'}
                    isSpamTab={activeTab === 'spam'}
                    activeTab={activeTab}
                    onClose={closeContextMenu}
                    {...createActions}
                    isBuildingTree={isBuildingTree}
                    onPaste={(targetParentId) => pasteItems(targetParentId)}
                    canPaste={clipboard.items.length > 0 && !isDriveReadOnly}
                    isPasting={isPasting}
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
            {/* `isRefreshing` = vẫn đứng nguyên thư mục này, chỉ đang lọc / tìm lại.
                Làm mờ và khoá tương tác thay vì thay bằng skeleton: xoá cả lưới đi
                rồi dựng lại sau mỗi 400ms gõ phím là màn hình nhấp nháy liên tục. */}
            <div
                className={`space-y-6 phone:space-y-4 overflow-y-auto pr-1 transition-opacity duration-150 ${
                    isRefreshing ? 'opacity-50 pointer-events-none' : ''
                }`}
                aria-busy={isRefreshing}
            >
                {/* Section 1: Thư mục (Folders) */}
                {folders && folders.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3 phone:mb-2 text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
                            <Folder className="w-3.5 h-3.5" />
                            <span>{t('list.group.folders', { count: folders.length })}</span>
                        </div>
                        <div className={FOLDER_GRID_CLASS}>
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
                                    onOpenLocation={openItemLocation}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Section 2: Tệp (Files) */}
                {files && files.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3 phone:mb-2 text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t('list.group.files', { count: files.length })}</span>
                        </div>
                        <div className={FILE_GRID_CLASS}>
                            {files.map((file) => (
                                <FileCard
                                    key={file.id}
                                    file={file}
                                    onDoubleClick={handleItemDoubleClick}
                                    onContextMenu={openContextMenu}
                                    isSelected={isSelected(file.id)}
                                    isCut={clipboard.mode === 'cut' && clipboard.items.some((e) => e.id === file.id)}
                                    onToggleSelect={toggleSelect}
                                    onSelectRange={handleSelectRange}
                                    onOpenLocation={openItemLocation}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t text-xs text-[var(--ink-muted)] border-glass-divider">
                    <div>
                        {tRich(t('list.pagination.showing'), {
                            from: <span className="font-semibold text-[var(--ink)]">{((currentPage - 1) * pageSize) + 1}</span>,
                            to: <span className="font-semibold text-[var(--ink)]">{Math.min(currentPage * pageSize, totalItems)}</span>,
                            total: <span className="font-semibold text-[var(--ink)]">{totalItems}</span>,
                        })}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="glass-soft p-1.5 rounded-full disabled:opacity-40 transition-colors text-[var(--ink)] cursor-pointer disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-2 font-semibold text-[var(--ink)] tabular-nums">
                            {t('list.pagination.page', { page: currentPage, total: totalPages })}
                        </span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="glass-soft p-1.5 rounded-full disabled:opacity-40 transition-colors text-[var(--ink)] cursor-pointer disabled:cursor-not-allowed"
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
                isSpamTab={activeTab === 'spam'}
                activeTab={activeTab}
                onClose={closeContextMenu}
                {...createActions}
                isBuildingTree={isBuildingTree}
                onPreview={(item) => openPreview(item, files)}
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
                // Như Cắt: bấm chuột phải lên một mục ĐANG nằm trong tập chọn thì chuyển cả tập.
                onMove={(targetItem) => {
                    const selected = selectedIds.has(targetItem.id) && selectedIds.size > 1
                        ? [...folders, ...files].filter((it) => selectedIds.has(it.id))
                        : [];
                    setMoveTargets(selected.length > 1 ? selected : [targetItem]);
                }}
                onPaste={(targetParentId) => pasteItems(targetParentId)}
                canPaste={clipboard.items.length > 0 && !isDriveReadOnly}
                isPasting={isPasting}
                onShare={(item) => setShareItemTarget(item)}
                onQuickCopyLink={handleQuickCopyLink}
                onGemini={openAi}
                onToggleStar={(item) => toggleStar(item.id)}
                onMoveToTrash={(item) => moveToTrash(item.id)}
                onRestore={(item) => restoreFromTrash(item.id)}
                onNotSpam={(item) => handleNotSpam(item)}
                onDeletePermanently={(item) => deletePermanently(item.id)}
                onShowInfo={(item, tab) => openInfoDrawer(item, tab)}
                onChangeColor={(item, color) => updateColor(item.id, color)}
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

            <MoveModal
                isOpen={!!moveTargets}
                items={moveTargets}
                onClose={() => setMoveTargets(null)}
                onMoved={deselectAll}
            />

        </div>
    );
}
