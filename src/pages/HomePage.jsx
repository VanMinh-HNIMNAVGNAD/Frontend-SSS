import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useFiles, useClipboard, useFilePreview } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { useAiPanel } from '../context/AiPanelContext';
import { useAuth } from '../context/AuthContext';
import {
    clearDismissedSuggestions,
    dismissSuggestion,
    readDismissedSuggestions,
} from '../constants/homeSuggestions';
import FileSkeleton from '../components/common/FileSkeleton';
import FileThumbnail from '../components/file-manager/FileThumbnail';
import StarButton from '../components/common/StarButton';
import ContextMenu from '../components/file-manager/ContextMenu';
import RenameModal from '../components/file-manager/RenameModal';
import ShareModal from '../components/file-manager/ShareModal';
import MoveModal from '../components/file-manager/MoveModal';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { getFileIcon } from '../utils/getFileIcon';
import { downloadSingleItem } from '../utils/downloadItems';
import { formatListDate } from '../utils/relativeTime';
import { localeTagOf } from '../utils/locale';
import PageHeader from '../components/common/PageHeader';
import {
    HardDrive,
    Clock,
    Users,
    ArrowRight,
    MoreVertical,
    Home,
    File,
    EyeOff,
    Search,
    ArrowLeft,
} from 'lucide-react';
import ViewModeToggle from '../components/common/ViewModeToggle';

/** Tiêu đề một mục của Trang chủ: icon màu mực + tên + chữ phụ, "Xem tất cả" bên phải. */
function SectionHeader({ icon: Icon, title, meta, onViewAll }) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center justify-between pb-1.5 border-b border-glass-divider">
            <div className="flex items-baseline gap-2 min-w-0">
                <Icon className="w-[18px] h-[18px] shrink-0 self-center text-[var(--ink-muted)]" />
                <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
                <span className="text-xs text-[var(--ink-subtle)] truncate">{meta}</span>
            </div>
            <button
                onClick={onViewAll}
                className="shrink-0 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] flex items-center gap-1 transition-colors cursor-pointer"
            >
                {t('home.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// getFileIcon() có thể ném lỗi với item thiếu `name`/`mimeType` (dữ liệu cũ) —
// Trang chủ trộn item từ nhiều nguồn nên bọc lại một lần ở đây.
const safeFileIcon = (item) => {
    try {
        return getFileIcon(item);
    } catch {
        return <File className="w-4 h-4 text-[var(--ink-subtle)] shrink-0" />;
    }
};

// Compact Section Table Component (List Mode)
const SectionTable = ({ itemList, emptyMessage, onItemOpen, onToggleStar, onContextMenu }) => {
    const { t, language } = useLanguage();
    const locale = localeTagOf(language);
    if (itemList.length === 0) {
        return <p className="text-xs text-[var(--ink-subtle)] py-3">{emptyMessage ?? t('home.empty')}</p>;
    }

    return (
        <div className="w-full divide-y divide-[var(--glass-divider)] text-sm">
            {itemList.map((item) => (
                <div
                    key={item.id}
                    onDoubleClick={() => onItemOpen && onItemOpen(item, itemList)}
                    onContextMenu={(e) => onContextMenu && onContextMenu(e, item)}
                    title={t('home.doubleClickToOpen')}
                    className="flex items-center justify-between py-2 px-2.5 row-hover transition-colors cursor-pointer rounded-xl select-none"
                >
                    {/* Name & mini thumbnail (ảnh / video / trang đầu PDF, còn lại là icon) */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        <FileThumbnail
                            file={item}
                            className="w-8 h-8 rounded-lg glass-soft"
                            fallback={safeFileIcon(item)}
                        />
                        <span className="font-medium text-[var(--ink)] truncate">
                            {item.name}
                        </span>
                    </div>

                    {/* Owner */}
                    <div className="text-xs text-[var(--ink-muted)] w-32 hidden sm:block truncate">
                        {item.owner || t('list.owner.me')}
                    </div>

                    {/* Updated Date — dạng gọn, đầy đủ trong tooltip */}
                    <div
                        className="text-xs text-[var(--ink-muted)] tabular-nums w-28 hidden md:block text-right pr-3"
                        title={item.updatedAt}
                    >
                        {formatListDate(item.updatedAtMs, locale) || item.updatedAt}
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
                            className="text-[var(--ink-subtle)] hover:text-[var(--ink)] p-1 rounded-full cursor-pointer"
                            title={t('home.moreActions')}
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
const SectionGrid = ({ itemList, emptyMessage, onItemOpen, onToggleStar, onContextMenu }) => {
    const { t, language } = useLanguage();
    const locale = localeTagOf(language);
    if (itemList.length === 0) {
        return <p className="text-xs text-[var(--ink-subtle)] py-3">{emptyMessage ?? t('home.empty')}</p>;
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 phone:grid-cols-[repeat(auto-fill,minmax(136px,1fr))] phone:gap-2.5 py-2">
            {itemList.map((item) => (
                <div
                    key={item.id}
                    onDoubleClick={() => onItemOpen && onItemOpen(item, itemList)}
                    onContextMenu={(e) => onContextMenu && onContextMenu(e, item)}
                    title={t('home.doubleClickToOpen')}
                    className="glass-soft rounded-[18px] p-2 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer flex flex-col group h-44 select-none"
                >
                    {/* Hàng đầu: icon loại tệp và tên tệp nâng cao, nút sao đã bỏ vì có trong context menu */}
                    <div className="flex items-center justify-between gap-1 mb-1 h-4.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                            {safeFileIcon(item)}
                            <p className="text-[11px] font-semibold text-[var(--ink)] truncate" title={item.name}>
                                {item.name}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onContextMenu && onContextMenu(e, item);
                            }}
                            onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            className="text-[var(--ink-subtle)] hover:text-[var(--ink)] p-0.5 rounded-full opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity shrink-0 cursor-pointer"
                            title={t('home.moreActions')}
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Mini thumbnail: ảnh / video / trang đầu PDF; loại khác về icon mờ — phóng to tối đa */}
                    <FileThumbnail
                        file={item}
                        className="flex-1 w-full rounded-xl bg-white/45 dark:bg-white/[0.04] border border-[var(--glass-divider)] my-1 transition-colors"
                        fallback={<div className="opacity-30 scale-[1.75]">{safeFileIcon(item)}</div>}
                    />

                    <div className="h-3.5 mt-0.5 leading-none">
                        <p className="text-[10px] text-[var(--ink-muted)] font-medium truncate" title={item.updatedAt}>
                            {item.owner || t('list.owner.me')} · {formatListDate(item.updatedAtMs, locale)}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default function HomePage() {
    const { t } = useLanguage();
    const {
        items,
        setActiveTab,
        activeTab,
        isLoading,
        isRefreshing,
        viewMode,
        setViewMode,
        openFolder,
        toggleStar,
        moveToTrash,
        restoreFromTrash,
        deletePermanently,
        renameItem,
        getDownloadUrl,
        searchQuery,
        setSearchQuery,
        totalItems,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        clearFilters,
    } = useFiles();
    // Đang tìm kiếm: Trang chủ thành trang kết quả trên mọi nơi (FileContext hỏi thêm Bộ nhớ chung).
    const isSearching = Boolean(searchQuery?.trim());

    // Bảng tạm và cửa sổ xem trước đi context riêng — xem chú thích ở FileContext.
    const { clipboard, isPasting, cutItems, copyItems, pasteItems } = useClipboard();

    const { openPreview, openInfoDrawer } = useFilePreview();

    const { user } = useAuth();

    // Các mục người dùng đã bấm "Không phải mục đề xuất hữu ích".
    //
    // Khoá theo `user.id` nên phải đọc LẠI khi id đổi: `AuthContext` giữ nguyên cây
    // component khi đăng nhập tài khoản khác trong cùng tab, nên state khởi tạo một
    // lần sẽ mang theo danh sách ẩn của người trước sang hồ sơ người sau.
    //
    // Đặt lại NGAY TRONG LÚC RENDER chứ không qua useEffect: effect chạy SAU khi
    // React đã vẽ xong, tức có đúng một khung hình trang chủ của người mới bị lọc
    // bằng danh sách ẩn của người cũ. Đây là mẫu "điều chỉnh state khi prop đổi"
    // mà React khuyến nghị — React bỏ kết quả render dở và chạy lại ngay, không
    // có DOM nào được đụng tới. (Cũng là lý do `react-hooks/set-state-in-effect`
    // không kêu ở đây, trong khi bản useEffect thì có.)
    const [dismissed, setDismissed] = useState(() => readDismissedSuggestions(user?.id));
    const [dismissedOwner, setDismissedOwner] = useState(user?.id);
    if (dismissedOwner !== user?.id) {
        setDismissedOwner(user?.id);
        setDismissed(readDismissedSuggestions(user?.id));
    }

    // Context menu state
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, item: null });

    // Panel AI mount MỘT bản duy nhất ở `AiPanelProvider`: view chỉ nói "mở cho mục này".
    // Nhờ vậy nút "Hỏi AI" trong cửa sổ xem trước — vốn không phải con của view này — gọi
    // được đúng panel đó thay vì phải có bản riêng.
    const { openAi } = useAiPanel();

    // Modals state
    const [renameItemTarget, setRenameItemTarget] = useState(null);
    const [shareItemTarget, setShareItemTarget] = useState(null);
    // Mục đang mở hộp thoại "Di chuyển tới…" (##90) — null = đóng
    const [moveTargets, setMoveTargets] = useState(null);

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

    // Thư mục -> backend nén ZIP; tệp -> presigned URL. Trước đây nhánh thư mục
    // chỉ alert rồi return, không tải gì cả.
    const handleDownloadItem = useCallback(
        (item) => downloadSingleItem(item, getDownloadUrl, { t }),
        [getDownloadUrl, t],
    );

    /**
     * "Không phải mục đề xuất hữu ích" — ẩn mục khỏi Trang chủ.
     *
     * CHỈ ẩn khỏi trang này. Tệp không bị xoá, không vào thùng rác, vẫn nằm nguyên
     * trong Drive của tôi — nên câu thông báo phải nói ra điều đó, kèm lối hiện lại.
     * Một dòng lệnh làm thứ gì đó biến mất mà không nói nó đi đâu thì người dùng
     * sẽ đoán là đã xoá.
     */
    const handleDismissSuggestion = useCallback((item) => {
        if (!item?.id) return;
        setDismissed((prev) => dismissSuggestion(user?.id, item.id, prev));
        toast.success(t('home.dismissed', { name: item.name }));
    }, [user?.id, t]);

    const handleRestoreDismissed = useCallback(() => {
        setDismissed(clearDismissedSuggestions(user?.id));
    }, [user?.id]);

    // Mở bằng BẤM ĐÚP (giống MyDrive/FileListView) — trước đây một cú click đã mở
    // luôn nên rất dễ mở nhầm tệp khi chỉ muốn bấm ngôi sao hay quét chọn.
    const handleItemOpen = useCallback((item, list) => {
        if (item.type === 'folder') {
            // `openFolder` tự chọn đúng tab theo thư mục (Bộ nhớ chung / được chia sẻ / của tôi).
            // Bản cũ gọi `setActiveTab('my-drive')` trước: thư mục được chia sẻ mở ra RỖNG (đi
            // đường Drive của tôi), và lịch sử có thêm một bước `/app/my-drive` nên bấm Quay lại
            // không về Trang chủ (##77).
            openFolder(item);
        } else {
            // `list` = các mục của CHÍNH mục (Gần đây / Gợi ý…) vừa bấm — nút ‹ › đi trong đó.
            openPreview(item, list);
        }
    }, [openFolder, openPreview]);

    // Ba mục dưới đây đều lọc `dismissed` TRƯỚC khi `slice(0, 6)`, không phải sau:
    // cắt trước rồi mới bỏ mục ẩn thì ẩn một mục là mất luôn một ô trong hàng, và
    // người dùng thấy trang chủ ngắn dần đi thay vì mục tiếp theo dâng lên.
    const visible = useMemo(
        () => items.filter((item) => !item.isTrash && !item.isSpam && !dismissed.has(item.id)),
        [items, dismissed],
    );

    // 1. Mục của tôi (My Drive) - Top 5-6
    // `sharedDriveId` chứ không `isSharedDrive`: cờ đó không nơi nào gán, nên điều kiện cũ luôn
    // đúng và tệp mình tải vào Bộ nhớ chung (về từ nguồn "Gần đây") lọt vào "Mục của tôi".
    const myDriveItems = visible
        .filter(item => !item.sharedDriveId && !item.isSharedWithMe)
        .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
        .slice(0, 6);

    // 2. Đã mở gần đây (Recent) - Top 5-6
    const recentItems = [...visible]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 6);

    // 3. Được chia sẻ với tôi (Shared with me) - Top 5-6
    const sharedItems = visible
        .filter(item => item.isSharedWithMe)
        .slice(0, 6);

    const viewSwitcher = (
        <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} className="shrink-0" />
    );

    // ── Đang tìm kiếm: Trang chủ là trang KẾT QUẢ trên mọi nơi (##90) ───────────
    //
    // Trước đây kết quả vẫn bị chia vào các mục gợi ý — mỗi mục tối đa 6 ô, "Mục của tôi" xếp theo
    // số lượt mở, "Đã mở gần đây" lặp lại chính các kết quả đó. Tìm "báo cáo" có 30 tệp khớp thì
    // chỉ thấy vài tệp, trông như ô tìm kiếm không tìm được vào thư mục con. Nay là MỘT danh sách
    // đầy đủ (Drive của tôi + Được chia sẻ + Bộ nhớ chung, cả cây con), có thanh lọc, sắp xếp, chọn
    // nhiều, và mỗi kết quả ghi nó nằm ở đâu (`ItemLocation`).
    if (isSearching) {
        const shown = items.length;
        return (
            <div className="flex flex-col h-full">
                <PageHeader
                    title={
                        <div className="flex items-center gap-2 min-w-0">
                            <button
                                onClick={() => setSearchQuery('')}
                                title={t('home.search.back')}
                                aria-label={t('home.search.back')}
                                className="p-1.5 -ml-1.5 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors shrink-0 cursor-pointer"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <Search className="w-[22px] h-[22px] shrink-0 text-[var(--ink-muted)]" />
                            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] truncate">{t('home.search.title')}</h1>
                        </div>
                    }
                    subtitle={
                        <span className="pl-16 block">
                            {t('home.search.hint', { count: Math.max(totalItems, shown), query: searchQuery.trim() })}
                        </span>
                    }
                />

                <FileFilterBar
                    filterType={filterType}
                    setFilterType={setFilterType}
                    filterDate={filterDate}
                    setFilterDate={setFilterDate}
                    filterOwner={filterOwner}
                    setFilterOwner={setFilterOwner}
                    onReset={clearFilters}
                />

                {totalItems > shown && (
                    <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
                        {t('home.search.truncated', { shown, total: totalItems })}
                    </p>
                )}

                <div className="flex-1 overflow-y-auto pt-2">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-6 bg-black/[0.06] dark:bg-white/[0.08] rounded-lg w-48 mb-3 animate-pulse" />
                    <FileSkeleton type="home-section" />
                </div>
                <div>
                    <div className="h-6 bg-black/[0.06] dark:bg-white/[0.08] rounded-lg w-48 mb-3 animate-pulse" />
                    <FileSkeleton type="home-section" />
                </div>
            </div>
        );
    }

    return (
        // `isRefreshing`: đang đồng bộ lại nhưng nội dung cũ vẫn đúng chỗ này —
        // làm mờ thay vì thay bằng skeleton (xem `scopeKey` trong FileContext).
        <div
            className={`flex flex-col h-full space-y-7 overflow-y-auto pr-1 transition-opacity duration-150 ${
                isRefreshing ? 'opacity-50 pointer-events-none' : ''
            }`}
            aria-busy={isRefreshing}
        >
            {/* Header Toolbar — Trang chủ không có thanh lọc nên nút Danh sách/Lưới ở lại đây */}
            <PageHeader
                icon={Home}
                title={t('home.title')}
                className="mb-5!"
                actions={
                    <>
                        {/* Lối ra cho danh sách ẩn. Chỉ hiện khi thật sự có gì đang bị ẩn —
                            một nút "hiện lại" đứng thường trực trong khi không có gì để hiện
                            lại chỉ làm người dùng đi tìm thứ không tồn tại. Đặt ở đây chứ
                            không nhét vào modal Cài đặt: nó nói về đúng trang đang mở. */}
                        {dismissed.size > 0 && (
                            <button
                                onClick={handleRestoreDismissed}
                                title={t('home.restoreDismissed.hint')}
                                className="glass-soft flex items-center gap-1.5 text-xs font-medium text-[var(--ink)] h-8 px-3 rounded-full transition-colors cursor-pointer"
                            >
                                <EyeOff className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                                {t('home.restoreDismissed', { count: dismissed.size })}
                            </button>
                        )}

                        {viewSwitcher}
                    </>
                }
            />

            {/* SECTION 1: MY DRIVE */}
            <section className="space-y-2">
                <SectionHeader
                    icon={HardDrive}
                    title={t('home.myDrive')}
                    meta={t('home.myDrive.count', { count: myDriveItems.length })}
                    onViewAll={() => setActiveTab('my-drive')}
                />
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={myDriveItems}
                        emptyMessage={t('home.empty.myDrive')}
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={myDriveItems}
                        emptyMessage={t('home.empty.myDrive')}
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                )}
            </section>

            {/* SECTION 2: RECENT */}
            <section className="space-y-2">
                <SectionHeader
                    icon={Clock}
                    title={t('page.recent.title')}
                    meta={t('home.recent.subtitle')}
                    onViewAll={() => setActiveTab('recent')}
                />
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={recentItems}
                        emptyMessage={t('home.empty.recent')}
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={recentItems}
                        emptyMessage={t('home.empty.recent')}
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                )}
            </section>

            {/* SECTION 3: SHARED WITH ME */}
            <section className="space-y-2">
                <SectionHeader
                    icon={Users}
                    title={t('page.sharedWithMe.title')}
                    meta={t('home.itemCount', { count: sharedItems.length })}
                    onViewAll={() => setActiveTab('shared-with-me')}
                />
                {viewMode === 'grid' ? (
                    <SectionGrid
                        itemList={sharedItems}
                        emptyMessage={t('home.empty.shared')}
                        onItemOpen={handleItemOpen}
                        onToggleStar={toggleStar}
                        onContextMenu={openContextMenu}
                    />
                ) : (
                    <SectionTable
                        itemList={sharedItems}
                        emptyMessage={t('home.empty.shared')}
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
                onMove={(targetItem) => setMoveTargets([targetItem])}
                onPaste={(targetParentId) => pasteItems(targetParentId)}
                canPaste={clipboard?.items?.length > 0}
                isPasting={isPasting}
                onShare={(item) => setShareItemTarget(item)}
                onGemini={openAi}
                onToggleStar={(item) => toggleStar(item.id)}
                onMoveToTrash={(item) => moveToTrash(item.id)}
                onRestore={(item) => restoreFromTrash(item.id)}
                onDeletePermanently={(item) => deletePermanently(item.id)}
                onShowInfo={(item, tab) => openInfoDrawer(item, tab)}
                onDismissSuggestion={handleDismissSuggestion}
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
            />

        </div>
    );
}
