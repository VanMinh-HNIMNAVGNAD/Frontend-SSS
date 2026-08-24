import { useState, useRef, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFiles } from '../../context/FileContext';
import useGlobalShortcuts from '../../hooks/useGlobalShortcuts';
import Sidebar from './SideBar';
import RightSidebar from './RightSideBar';
import Header from './Header';
import FileInfoDrawer from '../file-manager/FileInfoDrawer';
import ShareModal from '../file-manager/ShareModal';
import RenameModal from '../file-manager/RenameModal';
import FilePreviewModal from '../file-manager/FilePreviewModal';
import UploadProgress from '../file-manager/UploadProgress';

// Pages are now rendered via react-router-dom <Outlet />

// id của ô tìm kiếm trên Header — dùng cho phím tắt Ctrl + Win + K
export const SEARCH_INPUT_ID = 'global-search-input';

export default function MainLayout() {
    const {
        isInfoDrawerOpen,
        infoDrawerItem,
        infoDrawerTab,
        closeInfoDrawer,
        renameItem,
        previewItem,
        closePreview,
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
    } = useFiles();

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
            toast.error('Vui lòng mở một Bộ nhớ dùng chung trước.');
            return true;
        }
        return false;
    }, [activeTab, currentSharedDriveId, currentFolderId]);

    /** Danh sách mục đang được chọn ở khung nội dung hiện tại */
    const getSelection = useCallback(
        () => getSelectedItems(folders, files),
        [getSelectedItems, folders, files],
    );

    // ── Handlers cho từng phím tắt ──────────────────────────────────────────

    const handleNewFolder = useCallback(() => {
        if (blockedBySharedDrive()) return;
        const name = prompt('Nhập tên thư mục mới:', 'Thư mục chưa đặt tên');
        if (name && name.trim()) {
            createFolder(name.trim());
        }
    }, [blockedBySharedDrive, createFolder]);

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
            toast('Hãy chọn một tệp hoặc thư mục trước khi đổi tên.', { icon: '✏️' });
            return;
        }
        if (selected.length > 1) {
            toast.error('Chỉ có thể đổi tên từng mục một.');
            return;
        }
        setRenameTargetItem(selected[0]);
    }, [getSelection]);

    const handleToggleStar = useCallback(() => {
        const selected = getSelection();
        if (selected.length === 0) {
            toast('Hãy chọn mục cần đánh dấu sao.', { icon: '⭐' });
            return;
        }
        selected.forEach((item) => toggleStar(item.id));
    }, [getSelection, toggleStar]);

    const handleMoveToTrash = useCallback(() => {
        if (activeTab === 'trash') return; // trong thùng rác thì không "xoá" thêm được
        const selected = getSelection();
        if (selected.length === 0) {
            toast('Hãy chọn mục cần chuyển vào thùng rác.', { icon: '🗑️' });
            return;
        }
        const label = selected.length === 1 ? `"${selected[0].name}"` : `${selected.length} mục đã chọn`;
        if (!window.confirm(`Chuyển ${label} vào thùng rác?`)) return;
        selected.forEach((item) => moveToTrash(item.id));
    }, [activeTab, getSelection, moveToTrash]);

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
        <div className="flex h-screen w-full bg-white text-gray-900 font-sans overflow-hidden relative">
            {/* Input ẩn phục vụ phím tắt Ctrl + Win + U */}
            <input
                type="file"
                ref={uploadInputRef}
                onChange={handleUploadInputChange}
                multiple
                className="hidden"
                aria-label="Chọn tệp để tải lên bằng phím tắt"
            />

            {/* Sidebar bên trái */}
            <Sidebar />

            {/* Khu vực nội dung chính */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0 lg:border-l lg:border-gray-200">
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
                <FilePreviewModal
                    item={previewItem}
                    onClose={closePreview}
                />
            )}

            {/* Global Upload Progress — floating bottom-right */}
            <UploadProgress />
        </div>
    );
}
