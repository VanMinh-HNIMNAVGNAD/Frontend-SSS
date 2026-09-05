import { lazy, Suspense, useState, useRef, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFiles, useFilePreview } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import useGlobalShortcuts from '../../hooks/useGlobalShortcuts';
import Sidebar from './SideBar';
import RightSidebar from './RightSideBar';
import Header from './Header';
import FileInfoDrawer from '../file-manager/FileInfoDrawer';
import ShareModal from '../file-manager/ShareModal';
import RenameModal from '../file-manager/RenameModal';
/**
 * Cửa sổ xem trước nạp theo yêu cầu: nó kéo theo pdf.js, mammoth, `marked` và bộ
 * tô màu cú pháp — nhóm nặng nhất trong toàn bộ gói — nhưng chỉ chạy khi người
 * dùng thật sự bấm mở một tệp. Nó vốn đã được render có điều kiện, nên tách ra
 * không đổi hành vi nào.
 */
const FilePreviewModal = lazy(() => import('../file-manager/FilePreviewModal'));
import UploadProgress from '../file-manager/UploadProgress';
import ResumeUploads from '../file-manager/ResumeUploads';

// Pages are now rendered via react-router-dom <Outlet />

// id của ô tìm kiếm trên Header — dùng cho phím tắt Ctrl + Win + K
export const SEARCH_INPUT_ID = 'global-search-input';

export default function MainLayout() {
    const { t } = useLanguage();
    const {
        renameItem,
        // ── Phục vụ hệ thống phím tắt ──
        activeTab,
        currentFolderId,
        currentSharedDriveId,
        folders,
        files,
        getSelectedItems,
        createFolder,
        enqueueUpload,
        toggleStar,
        moveToTrash,
        refreshStorageInfo,
    } = useFiles();

    // Ngăn thông tin và cửa sổ xem trước đi context riêng: mở/đóng chúng không
    // được phép kéo theo một lần render của Sidebar, Header và cả cây danh sách.
    const {
        isInfoDrawerOpen,
        infoDrawerItem,
        infoDrawerTab,
        closeInfoDrawer,
        previewItem,
        closePreview,
    } = useFilePreview();

    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
    const [shareTargetItem, setShareTargetItem] = useState(null);
    const [renameTargetItem, setRenameTargetItem] = useState(null);

    // Input ẩn cho phím tắt "Tải tệp lên" (Ctrl + Win + U)
    const uploadInputRef = useRef(null);

    /**
     * Ở tab "Bộ nhớ dùng chung", phải mở một Shared Drive cụ thể thì mới biết
     * ghi file/thư mục vào đâu — chặn sớm giống NewButton.jsx.
     */
    const blockedBySharedDrive = useCallback(() => {
        if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
            toast.error(t('shortcutToast.needDrive'));
            return true;
        }
        return false;
    }, [activeTab, currentSharedDriveId, currentFolderId, t]);

    /** Danh sách mục đang được chọn ở khung nội dung hiện tại */
    const getSelection = useCallback(
        () => getSelectedItems(folders, files),
        [getSelectedItems, folders, files],
    );

    // ── Handlers cho từng phím tắt ──────────────────────────────────────────

    const handleNewFolder = useCallback(() => {
        if (blockedBySharedDrive()) return;
        const name = prompt(t('newBtn.prompt.folderName'), t('newBtn.defaultFolderName'));
        if (name && name.trim()) {
            createFolder(name.trim());
        }
    }, [blockedBySharedDrive, createFolder, t]);

    const handleUploadFile = useCallback(() => {
        if (blockedBySharedDrive()) return;
        uploadInputRef.current?.click();
    }, [blockedBySharedDrive]);

    const handleUploadInputChange = (e) => {
        const picked = Array.from(e.target.files || []);
        picked.forEach((file) => enqueueUpload(file));
        e.target.value = ''; // cho phép chọn lại đúng tệp đó lần sau
    };

    const handleFocusSearch = useCallback(() => {
        const input = document.getElementById(SEARCH_INPUT_ID);
        if (!input) return;
        input.focus();
        input.select?.(); // gõ đè luôn từ khoá cũ
    }, []);

    const handleRename = useCallback(() => {
        const selected = getSelection();
        if (selected.length === 0) {
            toast(t('shortcutToast.pickForRename'), { icon: '✏️' });
            return;
        }
        if (selected.length > 1) {
            toast.error(t('shortcutToast.renameOneOnly'));
            return;
        }
        setRenameTargetItem(selected[0]);
    }, [getSelection, t]);

    const handleToggleStar = useCallback(async () => {
        const selected = getSelection();
        if (selected.length === 0) {
            toast(t('shortcutToast.pickForStar'), { icon: '⭐' });
            return;
        }
        // `silent` để toggleStar không bắn một toast cho từng mục; gộp lại một câu
        const results = await Promise.all(
            selected.map((item) => toggleStar(item.id, { silent: true })),
        );
        const done = results.filter((r) => r?.ok);
        const failed = results.length - done.length;
        if (done.length === 1) {
            toast.success(done[0].isStarred === false ? t('file.star.removed') : t('file.star.added'));
        } else if (done.length > 1) {
            toast.success(t('shortcutToast.starBatch', { count: done.length }));
        }
        if (failed > 0) {
            toast.error(t('shortcutToast.starBatchFailed', { count: failed }));
        }
    }, [getSelection, toggleStar, t]);

    const handleMoveToTrash = useCallback(async () => {
        if (activeTab === 'trash') return; // trong thùng rác thì không "xoá" thêm được
        const selected = getSelection();
        if (selected.length === 0) {
            toast(t('shortcutToast.pickForTrash'), { icon: '🗑️' });
            return;
        }
        const label = selected.length === 1
            ? `"${selected[0].name}"`
            : t('shortcutToast.selectionCount', { count: selected.length });
        if (!window.confirm(t('shortcutToast.confirmTrash', { label }))) return;

        // `silent` như ở handleToggleStar: gộp N kết quả thành một câu thay vì để
        // moveToTrash bắn một toast cho từng mục. Trước đây forEach không await
        // nên lỗi còn về sau cả confirm tiếp theo.
        const results = await Promise.all(
            selected.map((item) => moveToTrash(item.id, { silent: true })),
        );
        const failed = [];
        results.forEach((res, idx) => {
            if (!res?.ok) {
                failed.push({ name: selected[idx].name, reason: res?.error?.message || t('common.unknownError') });
            }
        });

        if (failed.length === 0) {
            toast.success(
                selected.length === 1
                    ? t('shortcutToast.trashedOne', { label })
                    : t('shortcutToast.trashedMany', { count: selected.length }),
            );
        } else {
            // Chi tiết ra console, toast chỉ nêu số lượng + một mục làm ví dụ
            console.error(
                `[MainLayout] ${failed.length}/${selected.length} mục thất bại:`,
                failed.map((f) => `${f.name}: ${f.reason}`).join('\n'),
            );
            toast.error(
                failed.length === 1
                    ? t('header.error.delete', { name: failed[0].name, reason: failed[0].reason })
                    : t('header.error.deletePartial', {
                          failed: failed.length,
                          total: selected.length,
                          name: failed[0].name,
                      }),
            );
        }

        // Một lượt làm mới dung lượng cho cả lô, thay vì một lượt mỗi mục
        if (failed.length < selected.length) refreshStorageInfo();
    }, [activeTab, getSelection, moveToTrash, refreshStorageInfo, t]);

    // ── Đăng ký phím tắt toàn cục ───────────────────────────────────────────
    // Tạm tắt khi đang mở modal chặn thao tác để phím không "xuyên" qua lớp phủ
    useGlobalShortcuts(
        {
            onNewFolder: handleNewFolder,
            onUploadFile: handleUploadFile,
            onFocusSearch: handleFocusSearch,
            onRename: handleRename,
            onToggleStar: handleToggleStar,
            onMoveToTrash: handleMoveToTrash,
        },
        { enabled: !previewItem && !renameTargetItem && !shareTargetItem },
    );

    return (
        <div className="flex h-screen w-full bg-[#f0f4f9] dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 font-sans overflow-hidden relative">
            {/* Input ẩn phục vụ phím tắt Ctrl + Win + U */}
            <input
                type="file"
                ref={uploadInputRef}
                onChange={handleUploadInputChange}
                multiple
                className="hidden"
                aria-label={t('shortcut.aria.pickFile')}
            />

            {/* Sidebar bên trái */}
            <Sidebar />

            {/* Khu vực nội dung chính */}
            <div className="flex-1 flex flex-col bg-[#f8fafd] dark:bg-[#1e1e1e] overflow-hidden min-w-0 lg:border-l lg:border-gray-200 dark:lg:border-gray-700">
                {/* Header Navbar */}
                <Header 
                    toggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)} 
                />

                {/* Body Content */}
                <main className="flex-1 overflow-hidden px-3 sm:px-4 lg:px-5 py-3 relative z-0">
                    <Outlet />
                </main>
            </div>

            {/* Sidebar thông tin bên phải */}
            {isRightSidebarOpen && (
                <RightSidebar isOpen={isRightSidebarOpen} />
            )}

            {/* Google Drive Info Drawer Panel */}
            <FileInfoDrawer
                isOpen={isInfoDrawerOpen}
                item={infoDrawerItem}
                activeTab={infoDrawerTab}
                onClose={closeInfoDrawer}
                onOpenShare={(item) => setShareTargetItem(item)}
                onOpenRename={(item) => setRenameTargetItem(item)}
            />

            {/* Shared Modals if opened from Info Drawer */}
            <ShareModal
                isOpen={!!shareTargetItem}
                item={shareTargetItem}
                onClose={() => setShareTargetItem(null)}
            />

            <RenameModal
                isOpen={!!renameTargetItem}
                item={renameTargetItem}
                onClose={() => setRenameTargetItem(null)}
                onRename={(id, newName) => renameItem(id, newName)}
            />

            {/* File Preview Modal */}
            {previewItem && (
                <Suspense fallback={null}>
                    <FilePreviewModal
                        item={previewItem}
                        onClose={closePreview}
                    />
                </Suspense>
            )}

            {/* Global Upload Progress — floating bottom-right */}
            <UploadProgress />

            {/* Tệp lớn còn tải dở từ phiên trước (F5, đóng tab, mất điện) */}
            <ResumeUploads />
        </div>
    );
}
