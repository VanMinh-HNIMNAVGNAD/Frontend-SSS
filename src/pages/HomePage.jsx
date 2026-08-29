import { useState, useCallback } from 'react';
import { useFiles } from '../context/FileContext';
import FileSkeleton from '../components/common/FileSkeleton';
import FileThumbnail from '../components/file-manager/FileThumbnail';
import StarButton from '../components/common/StarButton';
import ContextMenu from '../components/file-manager/ContextMenu';
import RenameModal from '../components/file-manager/RenameModal';
import ShareModal from '../components/file-manager/ShareModal';
import GeminiModal from '../components/file-manager/GeminiModal';
import { getFileIcon } from '../utils/getFileIcon';
import {
    HardDrive,
    Clock,
    Users,
    ArrowRight,
    MoreVertical,
    List,
    LayoutGrid,
    Home,
    File
} from 'lucide-react';

// getFileIcon() có thể ném lỗi với item thiếu `name`/`mimeType` (dữ liệu cũ) —
// Trang chủ trộn item từ nhiều nguồn nên bọc lại một lần ở đây.
const safeFileIcon = (item) => {
    try {
        return getFileIcon(item);
    } catch {
        return <File className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />;
    }
};

// Compact Section Table Component (List Mode)
const SectionTable = ({ itemList, emptyMessage = "Không có mục nào", onItemOpen, onToggleStar, onContextMenu }) => {
    if (itemList.length === 0) {
        return <p className="text-xs text-gray-500 dark:text-gray-400 py-3 italic">{emptyMessage}</p>;
    }

    return (
        <div className="w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {itemList.map((item) => (
                <div
                    key={item.id}
                    onDoubleClick={() => onItemOpen && onItemOpen(item)}
                    onContextMenu={(e) => onContextMenu && onContextMenu(e, item)}
                    title="Bấm đúp để mở"
                    className="flex items-center justify-between py-2.5 px-3 hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer rounded-lg select-none"
                >
                    {/* Name & mini thumbnail (ảnh / video / trang đầu PDF, còn lại là icon) */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        <FileThumbnail
                            file={item}
                            className="w-9 h-9 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700/60 shadow-2xs"
                            fallback={safeFileIcon(item)}
                        />
                        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:text-blue-700 dark:hover:text-blue-400">
                            {item.name}
                        </span>
                    </div>

                    {/* Owner */}
                    <div className="text-xs text-gray-700 dark:text-gray-300 font-medium w-32 hidden sm:block truncate">
                        {item.owner || 'Tôi'}
                    </div>

                    {/* Updated Date */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 font-medium font-mono w-36 hidden md:block text-right pr-4">
                        {item.updatedAt}
                    </div>

                    {/* Action */}
                    <div className="flex items-center gap-0.5">
                        <StarButton
                            size="sm"
                            isStarred={item.isStarred}
                            readOnly={item.isSharedWithMe}
                            onToggle={() => onToggleStar && onToggleStar(item.id)}
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onContextMenu && onContextMenu(e, item);
                            }}
                            onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-200/60 dark:hover:bg-white/10"
                            title="Thao tác khác"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// Compact Section Grid Component (Grid Mode)
const SectionGrid = ({ itemList, emptyMessage = "Không có mục nào", onItemOpen, onToggleStar, onContextMenu }) => {
    if (itemList.length === 0) {
        return <p className="text-xs text-gray-500 dark:text-gray-400 py-3 italic">{emptyMessage}</p>;
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 py-2">
            {itemList.map((item) => (
                <div
                    key={item.id}
                    onDoubleClick={() => onItemOpen && onItemOpen(item)}
                    onContextMenu={(e) => onContextMenu && onContextMenu(e, item)}
                    title="Bấm đúp để mở"
                    className="bg-white dark:bg-[#282a2c] border border-gray-300/80 dark:border-gray-700/60 rounded-xl p-2.5 hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col group h-44 select-none shadow-2xs"
                >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                        {safeFileIcon(item)}
                        <div className="flex items-center gap-0.5">
                            <StarButton
                                size="sm"
                                isStarred={item.isStarred}
                                readOnly={item.isSharedWithMe}
                                onToggle={() => onToggleStar && onToggleStar(item.id)}
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onContextMenu && onContextMenu(e, item);
                                }}
                                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Thao tác khác"
                            >
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Mini thumbnail: ảnh / video / trang đầu PDF; loại khác về icon mờ */}
                    <FileThumbnail
                        file={item}
                        className="flex-1 w-full rounded-lg bg-slate-50/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700/60 mb-2 group-hover:border-blue-300 transition-colors"
                        fallback={<div className="opacity-30 scale-[1.75]">{safeFileIcon(item)}</div>}
                    />

                    <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-700" title={item.name}>
                            {item.name}
                        </p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium mt-0.5 truncate">
                            {item.owner || 'Tôi'} • {item.updatedAt ? item.updatedAt.split(',')[0] : ''}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default function HomePage() {
    const {
        items,
        setActiveTab,
        activeTab,
        isLoading,
        viewMode,
        setViewMode,
        openPreview,
        openFolder,
        toggleStar,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        renameItem,
        openInfoDrawer,
        getDownloadUrl,
        clipboard,
        isPasting,
        cutItems,
        copyItems,
        pasteItems,
    } = useFiles();

    // Context menu state
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, item: null });

    // Modals state
    const [renameItemTarget, setRenameItemTarget] = useState(null);
    const [shareItemTarget, setShareItemTarget] = useState(null);
    const [geminiItemTarget, setGeminiItemTarget] = useState(null);

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

    const closeContextMenu = useCallback(() => {
        setContextMenu({ isOpen: false, x: 0, y: 0, item: null });
    }, []);

    const handleDownloadItem = useCallback(async (item) => {
        try {
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
        } catch (error) {
            console.error('Lỗi khi tải xuống:', error);
        }
    }, [getDownloadUrl]);

    // Mở bằng BẤM ĐÚP (giống MyDrive/FileListView) — trước đây một cú click đã mở
    // luôn nên rất dễ mở nhầm tệp khi chỉ muốn bấm ngôi sao hay quét chọn.
    const handleItemOpen = useCallback((item) => {
        if (item.type === 'folder') {
            setActiveTab('my-drive');
            openFolder(item);
        } else {
            openPreview(item);
        }
    }, [setActiveTab, openFolder, openPreview]);

    // 1. Mục của tôi (My Drive) - Top 5-6
    const myDriveItems = items
        .filter(item => !item.isTrash && !item.isSpam && !item.isSharedDrive && !item.isSharedWithMe)
        .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
        .slice(0, 6);

    // 2. Đã mở gần đây (Recent) - Top 5-6
    const recentItems = items
        .filter(item => !item.isTrash && !item.isSpam)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 6);

    // 3. Được chia sẻ với tôi (Shared with me) - Top 5-6
    const sharedItems = items
        .filter(item => !item.isTrash && !item.isSpam && item.isSharedWithMe)
        .slice(0, 6);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-3 animate-pulse" />
                    <FileSkeleton type="home-section" />
                </div>
                <div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-3 animate-pulse" />
                    <FileSkeleton type="home-section" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-7 overflow-y-auto pr-1">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <Home className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Trang chủ</h1>
                </div>

                <div className="flex items-center bg-gray-200/90 dark:bg-gray-700 rounded-full p-0.5 border border-gray-300 dark:border-gray-700">
                    <button
                        onClick={() => setViewMode('list')}
                        title="Xem dạng danh sách"
                        className={`p-1.5 rounded-full transition-colors ${viewMode === 'list'
                                ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        title="Xem dạng lưới"
                        className={`p-1.5 rounded-full transition-colors ${viewMode === 'grid'
                                ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* SECTION 1: MY DRIVE */}
            <section className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Driver riêng của tôi</h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({myDriveItems.length} mục hay mở nhất)</span>
                    </div>
                    <button
                        onClick={() => setActiveTab('my-drive')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
                    >
                        Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={myDriveItems}
                        emptyMessage="Chưa có tệp nào trong Driver riêng của tôi."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={myDriveItems}
                        emptyMessage="Chưa có tệp nào trong Driver riêng của tôi."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                )}
            </section>

            {/* SECTION 2: RECENT */}
            <section className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Đã mở gần đây</h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(Chỉnh sửa gần đây)</span>
                    </div>
                    <button
                        onClick={() => setActiveTab('recent')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
                    >
                        Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={recentItems}
                        emptyMessage="Chưa có tệp nào mở gần đây."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={recentItems}
                        emptyMessage="Chưa có tệp nào mở gần đây."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                )}
            </section>

            {/* SECTION 3: SHARED WITH ME */}
            <section className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Được chia sẻ với tôi</h2>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({sharedItems.length} mục)</span>
                    </div>
                    <button
                        onClick={() => setActiveTab('shared-with-me')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
                    >
                        Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={sharedItems}
                        emptyMessage="Chưa có tệp nào được chia sẻ với bạn."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={sharedItems}
                        emptyMessage="Chưa có tệp nào được chia sẻ với bạn."
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                )}
            </section>

            {/* Context Menu floating */}
            <ContextMenu
                isOpen={contextMenu.isOpen}
                x={contextMenu.x}
                y={contextMenu.y}
                item={contextMenu.item}
                isTrashTab={false}
                activeTab={activeTab || 'home'}
                onClose={closeContextMenu}
                onPreview={(item) => openPreview(item)}
                onDownload={handleDownloadItem}
                onRename={(item) => setRenameItemTarget(item)}
                onCut={(targetItem) => cutItems([targetItem.id])}
                onCopy={(targetItem) => copyItems([targetItem.id])}
                onPaste={(targetParentId) => pasteItems(targetParentId)}
                canPaste={clipboard?.items?.length > 0}
                isPasting={isPasting}
                onShare={(item) => setShareItemTarget(item)}
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
