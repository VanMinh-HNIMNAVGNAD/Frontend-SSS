import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useFiles, useFileSelection, useClipboard, useDriveAccess } from '../../context/FileContext';
import { downloadItemsAsZip, triggerDownload } from '../../utils/downloadItems';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import SearchFilterModal from './SearchFilterModal';
import SettingsModal from './SettingsModal';
import AccountModal from './AccountModal';
import ActivityLogDrawer from '../file-manager/ActivityLogDrawer';
import NotificationBell from './NotificationBell';
import { useAiPanel } from '../../context/AiPanelContext';
import GlassEdge from '../ui/GlassEdge';
import { confirmDialog } from '../../utils/dialog';
import { 
    Menu, 
    Search, 
    SlidersHorizontal, 
    Settings, 
    Trash2,
    RotateCcw,
    X,
    CheckSquare,
    Download,
    Copy,
    Scissors,
    AlertCircle,
    History,
    Sparkles,
    MoreVertical
} from 'lucide-react';
import cloudLogo from '../../assets/icon/cloud-acceleration-svgrepo-com.svg';

export default function Header({ toggleRightSidebar }) {
    const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
    // Mở khung hỏi AI KHÔNG kèm mục nào — người dùng tự đính tệp từ máy trong panel.
    // Trước bản này `openAi(null)` thoát ngay ở dòng đầu, nên cái nút dưới đây không thể
    // tồn tại; xem `AiPanelContext`.
    const { openAi } = useAiPanel();
    const { 
        searchQuery, 
        setSearchQuery, 
        toggleSidebar, 
        filterType,
        filterDate,
        filterOwner,
        isSidebarCollapsed,
        getSelectedItems,
        folders,
        files,
        activeTab,
        moveToTrashBulk,
        restoreFromTrash,
        markNotSpam,
        deletePermanentlyBulk,
        getDownloadUrl,
        refreshStorageInfo
    } = useFiles();

    // Thanh công cụ hàng loạt (hiện ra khi có mục được chọn) đọc từ context
    // riêng: nếu để chung useFiles() thì mỗi lần tích chọn một tệp là cả Header
    // — logo, ô tìm kiếm, avatar, mọi modal treo trên nó — render lại.
    const { selectedIds, selectedCount, deselectAll, selectAll } = useFileSelection();

    const { cutItems, copyItems } = useClipboard();

    const { t } = useLanguage();

    const navigate = useNavigate();

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
    // Menu "⋮" chỉ có trên điện thoại: gom Lịch sử + Cài đặt vào đó để ô tìm kiếm có
    // chỗ. Ở màn 390px, logo + chữ + bốn nút tròn trước đây ép ô tìm kiếm về 0px và
    // đẩy nút tài khoản ra ngoài mép màn hình.
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    // Nút mở bộ lọc — popover cần biết để cú bấm vào chính nút này không bị tính là
    // "bấm ra ngoài" (đóng) rồi ngay sau đó bị `onClick` mở lại.
    const filterToggleRef = useRef(null);
    const searchInputRef = useRef(null);

    const handleLogoClick = () => {
        navigate('/app/home');
    };

    // Dùng chung cho nút trên thanh (màn rộng) và mục trong menu "⋮" (điện thoại).
    // Chặn khách chưa đăng nhập ngay tại chỗ bấm — xem chú thích ở nút bên dưới.
    const handleOpenActivityLog = () => {
        if (!isAuthenticated) {
            toast.error(t('header.activityLog.needLogin'));
            navigate('/login');
            return;
        }
        setIsActivityLogOpen(true);
    };

    const isTrashTab = activeTab === 'trash';
    const isSpamTab = activeTab === 'spam';

    // Nút hàng loạt chỉ hiện khi MỌI mục đang chọn cho phép — cùng luật với menu chuột phải
    // (ContextMenu.jsx). Trước ##79 Xoá/Cắt luôn hiện ở tab "Được chia sẻ" và trong Bộ nhớ chung
    // chỉ-xem, bấm vào là nhận một toast lỗi cho từng mục; "Xoá vĩnh viễn" mục drive cũng vậy với
    // MEMBER. Vai trò chưa nạp (`null`) ⇒ hiện như cũ, backend vẫn là nơi chặn.
    const { driveRoleOf } = useDriveAccess();
    const selectedItems = selectedCount > 0 ? getSelectedItems(folders, files) : [];
    const isForeign = (it) => it.isSharedWithMe || activeTab === 'shared-with-me';
    const isDriveViewerItem = (it) => Boolean(it.sharedDriveId) && driveRoleOf(it.sharedDriveId) === 'VIEWER';
    const canTrashSelection = selectedItems.every((it) => !isForeign(it) && !isDriveViewerItem(it));
    const canCutSelection = selectedItems.every(
        (it) => (!isForeign(it) || it.sharedRole === 'EDITOR') && !isDriveViewerItem(it),
    );
    const canDeleteForeverSelection = selectedItems.every((it) => {
        const role = it.sharedDriveId ? driveRoleOf(it.sharedDriveId) : null;
        return !it.sharedDriveId || role == null || role === 'ADMIN';
    });
    const allCurrentSelected = (folders?.length + files?.length) > 0 && selectedCount >= (folders?.length + files?.length);

    /**
     * Gộp kết quả một thao tác hàng loạt thành ĐÚNG MỘT toast.
     *
     * Các hàm trong FileContext được gọi ở chế độ `silent` nên không tự thông
     * báo: xóa 10 tệp mà lỗi cả 10 thì trước đây là 10 toast đỏ xếp chồng nhau,
     * còn khi thành công thì tuyệt đối im lặng — người dùng không biết thao tác
     * đã chạy hay chưa.
     *
     * @param {number} total Số mục đã thử xử lý
     * @param {{name: string, reason: string}[]} errors Các mục thất bại, theo thứ tự xử lý
     * @param {string} successKey Khoá i18n cho toast thành công — nhận {count}
     * @param {string} errorKey Khoá i18n khi CHỈ MỘT mục thất bại — nhận {name}, {reason}
     * @param {string} partialKey Khoá i18n khi nhiều mục thất bại — nhận {failed}, {total}, {name}
     */
    const showBatchResult = (total, errors, successKey, errorKey, partialKey) => {
        if (!errors.length) {
            toast.success(t(successKey, { count: total }));
            return;
        }
        // Chi tiết từng mục đẩy ra console cho lúc cần truy vết, toast chỉ nêu
        // số lượng + một mục làm ví dụ (giống pasteItems trong FileContext).
        console.error(
            `[Header] ${errors.length}/${total} mục thất bại:`,
            errors.map((e) => `${e.name}: ${e.reason}`).join('\n'),
        );
        toast.error(
            errors.length === 1
                ? t(errorKey, { name: errors[0].name, reason: errors[0].reason })
                : t(partialKey, { failed: errors.length, total, name: errors[0].name }),
        );
    };

    /**
     * Chạy `run` lần lượt cho từng mục đã chọn rồi báo kết quả một lần.
     *
     * `run` trả về `{ ok, error }` (hợp đồng chung của FileContext ở chế độ
     * silent) và không throw; vẫn bọc try/catch để một lỗi ngoài dự kiến của
     * một mục không chặn những mục còn lại.
     *
     * @returns {number} Số mục xử lý thành công — phía gọi dùng để quyết định
     *          có cần đồng bộ lại danh sách hay không.
     */
    const runBatch = async (items, run, successKey, errorKey, partialKey) => {
        const errors = [];
        for (const item of items) {
            try {
                const res = await run(item);
                if (res && res.ok === false) {
                    errors.push({ name: item.name, reason: res.error?.message || t('common.unknownError') });
                }
            } catch (err) {
                errors.push({ name: item.name, reason: err?.message || t('common.unknownError') });
            }
        }
        deselectAll();
        showBatchResult(items.length, errors, successKey, errorKey, partialKey);
        return items.length - errors.length;
    };

    /**
     * Như `runBatch`, nhưng cho các thao tác đã có endpoint LÔ ở server: một request cho
     * cả tập chọn, thay vì N request nối tiếp.
     *
     * Vì sao đáng tách ra: `runBatch` chờ xong mục này mới gửi mục kế. Mỗi lượt là 4 câu
     * truy vấn đi từ dyno (region `us`) sang Postgres (ap-southeast-1), nên xoá 10 tệp
     * tốn khoảng 9 giây và người dùng nhìn thấy đúng cảnh chúng rụng xuống từng cái một.
     *
     * Server ở đây KHÔNG ném lỗi khi một vài id hỏng — nó trả `failed: [{ id, reason }]`.
     * Ghép lại thành tên để `showBatchResult` nói được "tệp nào", vì id thì người dùng
     * không đọc được.
     */
    const runBulk = async (items, call, successKey, errorKey, partialKey) => {
        const res = await call(items.map((item) => item.id));
        deselectAll();

        // Cả request hỏng (mất mạng, 401, 500): không có `failed` từng mục, nên quy mọi
        // mục về cùng một lý do — đó đúng là điều đã xảy ra với chúng.
        if (!res.ok) {
            const reason = res.error?.message || t('common.unknownError');
            showBatchResult(
                items.length,
                items.map((item) => ({ name: item.name, reason })),
                successKey, errorKey, partialKey,
            );
            return 0;
        }

        const nameById = new Map(items.map((item) => [item.id, item.name]));
        const errors = (res.failed || []).map((f) => ({
            name: nameById.get(f.id) || f.id,
            reason: f.reason || t('common.unknownError'),
        }));
        showBatchResult(items.length, errors, successKey, errorKey, partialKey);
        return items.length - errors.length;
    };

    const handleDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!(await confirmDialog({ message: t('header.confirm.trash', { count: items.length }), confirmLabel: t('common.delete') }))) return;

        const succeeded = await runBulk(
            items,
            moveToTrashBulk,
            'header.success.delete',
            'header.error.delete',
            'header.error.deletePartial',
        );
        // Một lượt làm mới dung lượng cho cả lô, thay vì một lượt mỗi mục
        if (succeeded > 0) refreshStorageInfo();
    };

    /**
     * Nút "Khôi phục" phục vụ CẢ hai tab, nhưng gọi hai endpoint khác nhau.
     *
     * Tab Nội dung rác phải đi `markNotSpam`: mục ở đó có `is_trash = false` sẵn,
     * nên `restoreFromTrash` chỉ set lại đúng giá trị cũ — backend trả 200, dòng bị
     * xoá khỏi danh sách, và tệp thì không đi đâu cả. Đó là lỗi "khôi phục xong
     * không thấy tệp đâu".
     */
    const handleRestoreSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        const confirmKey = isSpamTab ? 'header.confirm.notSpam' : 'header.confirm.restore';
        if (!(await confirmDialog({ message: t(confirmKey, { count: items.length }), confirmLabel: t('common.restore') }))) return;

        // Nơi tệp quay về, để báo cho người dùng biết — họ đang đứng ở trang Nội dung
        // rác nên không nhìn thấy nó xuất hiện lại trong cây thư mục.
        const destinations = new Set();

        const succeeded = await runBatch(
            items,
            async (item) => {
                if (!isSpamTab) return restoreFromTrash(item.id, { silent: true });
                const res = await markNotSpam(item.id, { silent: true });
                if (res.ok) destinations.add(res.parentName || t('nav.myDrive'));
                return res;
            },
            isSpamTab ? 'header.success.notSpam' : 'header.success.restore',
            'header.error.restore',
            'header.error.restorePartial',
        );

        if (isSpamTab && succeeded > 0 && destinations.size === 1) {
            toast.success(t('header.success.notSpamTo', { folder: [...destinations][0] }));
        }
        if (succeeded > 0) refreshStorageInfo();
    };

    const handlePermanentDeleteSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;
        if (!(await confirmDialog({
            message: t('header.confirm.deleteForever', { count: items.length }),
            confirmLabel: t('common.deleteForever'),
            danger: true,
        }))) return;

        const succeeded = await runBulk(
            items,
            deletePermanentlyBulk,
            'header.success.deleteForever',
            'header.error.deleteForever',
            'header.error.deleteForeverPartial',
        );
        if (succeeded > 0) refreshStorageInfo();
    };

    const handleDownloadSelected = async () => {
        const items = getSelectedItems(folders, files);
        if (!items.length) return;

        const fileItems = items.filter((i) => i.type !== 'folder');
        const folderItems = items.filter((i) => i.type === 'folder');

        // Có thư mục trong lựa chọn -> gói tất cả (file + toàn bộ cây thư mục con)
        // thành 1 file ZIP duy nhất do backend nén.
        // Nhiều TỆP cũng đi đường này: N lượt click <a> liên tiếp bị Chrome chặn ở
        // lượt thứ hai ("Trang này đang cố tải nhiều tệp"), và với mỗi tệp là một
        // lượt ký presigned URL — một tệp ZIP là một lượt tải, luôn xong.
        if (folderItems.length > 0 || fileItems.length > 1) {
            await downloadItemsAsZip(items, { t });
            return;
        }

        const errors = [];
        for (const item of fileItems) {
            try {
                const url = await getDownloadUrl(item.id, { silent: true });
                if (!url) {
                    errors.push({ name: item.name, reason: t('header.error.noDownloadUrl') });
                    continue;
                }
                triggerDownload(url, item.name);
                await new Promise((r) => setTimeout(r, 300));
            } catch (err) {
                errors.push({ name: item.name, reason: err?.message || t('common.unknownError') });
            }
        }
        showBatchResult(
            fileItems.length,
            errors,
            'header.success.download',
            'header.error.download',
            'header.error.downloadPartial',
        );
    };

    if (selectedCount > 0) {
        return (
            // Thanh chọn nhiều: cùng tấm kính với header thường, sáng hơn một bậc (`--glass-bright`) để
            // người dùng biết đang ở chế độ chọn — không còn ánh xanh (trước nữa: nền xanh đặc #0b57d0).
            <header className="relative h-14 sm:h-16 flex items-center justify-between px-2 sm:px-3 md:px-4 glass bg-[var(--glass-bright)]! rounded-[20px] sm:rounded-full text-[var(--ink)] shrink-0 gap-2 sm:gap-3 transition-colors duration-200 animate-fade-in">
                {/* Viền sáng của kính — xem chú thích ở header thường bên dưới. */}
                <GlassEdge className="z-auto" />

                {/* Left */}
                <div className="relative flex items-center gap-2 sm:gap-4 min-w-0">
                    <button onClick={deselectAll} className="p-2 rounded-full transition-colors cursor-pointer shrink-0" title={t('common.close')}>
                        <X className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-base sm:text-lg truncate tabular-nums">{t('header.selected', { count: selectedCount })}</span>
                    
                    <div className="w-px h-6 bg-black/10 dark:bg-white/15 mx-2 hidden sm:block" />
                    
                    <button
                        onClick={() => allCurrentSelected ? deselectAll() : selectAll(folders, files)}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm font-medium cursor-pointer"
                    >
                        <CheckSquare className="w-4 h-4" />
                        <span>{allCurrentSelected ? t('common.deselectAll') : t('common.selectAll')}</span>
                    </button>
                </div>

                {/* Right */}
                <div className="relative flex items-center gap-0.5 sm:gap-2 shrink-0">
                    {!isTrashTab && !isSpamTab ? (
                        <>
                            {canTrashSelection && (
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1.5 px-3 py-2 hover:text-[var(--tone-danger)] rounded-full transition-colors text-sm font-medium cursor-pointer" title={t('common.delete')}>
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.delete')}</span>
                            </button>
                            )}
                            {canCutSelection && (
                            <button 
                                onClick={() => {
                                    cutItems(Array.from(selectedIds));
                                }} 
                                className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors text-sm font-medium cursor-pointer" 
                                title={t('header.action.cut')}
                            >
                                <Scissors className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.cut')}</span>
                            </button>
                            )}
                            <button 
                                onClick={() => {
                                    copyItems(Array.from(selectedIds));
                                }} 
                                className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors text-sm font-medium cursor-pointer" 
                                title={t('header.action.copy')}
                            >
                                <Copy className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.copy')}</span>
                            </button>
                            <button onClick={handleDownloadSelected} className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors text-sm font-medium cursor-pointer" title={t('common.download')}>
                                <Download className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.download')}</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={handleRestoreSelected} className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors text-sm font-medium cursor-pointer" title={t('common.restore')}>
                                <RotateCcw className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.restore')}</span>
                            </button>
                            {canDeleteForeverSelection && (
                            <button onClick={handlePermanentDeleteSelected} className="flex items-center gap-1.5 px-3 py-2 text-[var(--tone-danger)] rounded-full transition-colors text-sm font-medium cursor-pointer" title={t('common.deleteForever')}>
                                <AlertCircle className="w-4 h-4" />
                                <span className="hidden lg:inline">{t('common.deleteForever')}</span>
                            </button>
                            )}
                        </>
                    )}
                </div>
            </header>
        );
    }

    return (
        // Tấm kính hình viên thuốc nổi trên nền ambient. `glass` KHÔNG blur: header chứa modal
        // Cài đặt + ngăn Lịch sử (`fixed inset-0`) — backdrop-filter sẽ nhốt chúng vào thanh này.
        <header className="relative h-14 sm:h-16 flex items-center justify-between px-1.5 sm:px-2.5 md:px-3 glass rounded-[20px] sm:rounded-full shrink-0 gap-1.5 sm:gap-3 transition-colors duration-200">
            {/* Viền sáng của kính. Header KHÔNG được là stacking context: popover tài khoản, bộ
                lọc tìm kiếm… (`z-50` bên trong) đang so z-index trực tiếp với <main> (`z-0`) — nhốt
                chúng vào header là chúng chui xuống dưới vùng nội dung. Vì vậy viền không dùng
                được `z-index: -1` mà là `z-auto` + con ĐẦU TIÊN, và ba khối nội dung đều
                `relative` để được vẽ đè lên nó (cùng tầng, đứng sau trong cây DOM). */}
            <GlassEdge className="z-auto" />

            {/* LOGO & Web Title "cloudSSS" */}
            <div className="relative flex items-center gap-2 shrink-0">
                {/* Nút Toggle Sidebar */}
                <button
                    onClick={toggleSidebar}
                    title={isSidebarCollapsed ? t('header.sidebar.expand') : t('header.sidebar.collapse')}
                    className="p-2.5 text-gray-700 dark:text-gray-300 rounded-full transition-colors focus:outline-none cursor-pointer"
                >
                    <Menu className="w-5 h-5 text-gray-800 dark:text-gray-200" />
                </button>

                {/* Tên web "cloudSSS" (Clicking resets to My Drive).
                    Ẩn trên điện thoại: chỗ đó dành cho ô tìm kiếm. Nút ☰ bên cạnh vẫn mở
                    được sidebar, và breadcrumb ngay dưới đã nói người dùng đang ở đâu. */}
                <div 
                    onClick={handleLogoClick}
                    className="hidden sm:flex items-center cursor-pointer select-none pr-2 group"
                    title={t('header.logo.title')}
                >
                    <img src={cloudLogo} alt="" className="w-8 h-8 mr-1" />
                    {/* Chữ chỉ hiện từ `md`: ở dải 640–767px (tablet dọc nhỏ, điện thoại
                        xoay ngang) cả bốn nút tròn đã quay lại thanh, thêm chữ nữa là ô
                        tìm kiếm lại bị ép còn vài chục pixel. */}
                    <span className="hidden md:inline text-xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 font-sans">
                        cloud<span className="text-blue-600 dark:text-blue-400 font-black text-2xl">SSS</span>
                    </span>
                </div>
            </div>

            {/* VÙNG TÌM KIẾM TO + BỘ LỌC TÌM KIẾM */}
            <div className="flex-1 min-w-0 max-w-2xl relative sm:mx-2">
                <div className="flex items-center h-11 glass-input hover:bg-white/75 dark:hover:bg-white/[0.09] focus-within:bg-white/90 dark:focus-within:bg-white/10 focus-within:ring-2 focus-within:ring-black/10 dark:focus-within:ring-white/15 rounded-full pl-3 pr-1.5 sm:pl-4 sm:pr-2 transition-all duration-200">
                    <Search className="w-5 h-5 text-[var(--ink-muted)] mr-2 sm:mr-3 shrink-0" />
                    <input
                        id="global-search-input"
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        // Esc xoá từ khoá đang gõ (##90) — như ô tìm kiếm của Google Drive.
                        onKeyDown={(e) => {
                            if (e.key === 'Escape' && searchQuery) {
                                e.preventDefault();
                                setSearchQuery('');
                            }
                        }}
                        placeholder={t('header.search.placeholder')}
                        aria-label={t('header.search.placeholder')}
                        // 16px trên điện thoại: Safari iOS tự phóng to cả trang khi chạm vào
                        // ô nhập có chữ nhỏ hơn 16px, và không tự thu lại sau đó.
                        className="w-full min-w-0 bg-transparent border-none outline-none text-base sm:text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-ellipsis"
                    />

                    {/* Nút ✕ xoá từ khoá (##90): trước đây muốn bỏ tìm kiếm phải tự xoá từng chữ. */}
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                searchInputRef.current?.focus();
                            }}
                            title={t('header.search.clear')}
                            aria-label={t('header.search.clear')}
                            className="p-2 sm:p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors ml-1 shrink-0 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    
                    {/* Nút Bộ lọc tìm kiếm — viên kính sáng + chấm khi có bộ lọc nào đang áp (cả Ngày
                        sửa đổi, ##90); không còn tô xanh. */}
                    <button
                        ref={filterToggleRef}
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        title={t('header.search.filter')}
                        aria-expanded={isFilterOpen}
                        className={`relative p-2 sm:p-1.5 rounded-full transition-colors ml-1 sm:ml-2 shrink-0 cursor-pointer ${
                            isFilterOpen ? 'glass-active text-[var(--ink)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                        }`}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        {(filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all') && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--ink)]" aria-hidden="true" />
                        )}
                    </button>
                </div>

                {/* Popover Bộ Lọc Tìm Kiếm */}
                <SearchFilterModal
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    toggleRef={filterToggleRef}
                />
            </div>

            {/* CÀI ĐẶT + ỨNG DỤNG HỆ SINH THÁI + THÔNG TIN TÀI KHOẢN */}
            <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 relative">
                


                {/* Nút Lịch sử hoạt động
                  *
                  * Khách chưa đăng nhập KHÔNG được mở drawer: lịch sử hoạt động là dữ
                  * liệu riêng của một tài khoản. Trước đây nút này bấm được ở mọi trạng
                  * thái — phiên vừa hết hạn là drawer vẫn mở ra, gọi API rồi mới bị 401
                  * và bị interceptor đá về /login, tức người dùng thấy panel lịch sử
                  * bật lên rồi trang mới nhảy đi. Nay chặn ngay tại chỗ bấm.
                  */}
                <button
                    onClick={handleOpenActivityLog}
                    disabled={isAuthLoading}
                    title={isAuthenticated ? t('header.activityLog') : t('header.activityLog.needLogin')}
                    className="hidden sm:inline-flex p-2.5 text-gray-700 dark:text-gray-300 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <History className="w-5 h-5" />
                </button>

                {/* Nút Hỏi AI
                  *
                  * Đường vào AI duy nhất trước đây là menu chuột phải trên một tệp — tức
                  * muốn hỏi thì phải có sẵn một tệp trong Drive và phải biết cái menu đó
                  * có mục AI. Người dùng mới không tìm ra, và người muốn hỏi về một tệp
                  * trên máy thì phải tải nó vào Drive trước. Nút này bỏ cả hai rào đó.
                  *
                  * Chặn khách chưa đăng nhập ngay tại chỗ bấm, cùng lý do với nút Lịch sử
                  * hoạt động ở trên: hạn mức AI gắn với một tài khoản, mở panel rồi mới ăn
                  * 401 thì người dùng thấy khung bật lên rồi trang nhảy đi.
                  */}
                <button
                    onClick={() => {
                        if (!isAuthenticated) {
                            toast.error(t('header.ai.needLogin'));
                            navigate('/login');
                            return;
                        }
                        openAi(null);
                    }}
                    disabled={isAuthLoading}
                    title={isAuthenticated ? t('header.ai') : t('header.ai.needLogin')}
                    aria-label={isAuthenticated ? t('header.ai') : t('header.ai.needLogin')}
                    className="p-2 sm:p-2.5 text-gray-700 dark:text-gray-300 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Sparkles className="w-5 h-5" />
                </button>

                {/* Chuông thông báo (##91) — chỉ khi đã đăng nhập: thông báo là dữ liệu riêng của
                    một tài khoản, và chuông tự hỏi máy chủ định kỳ. Hiện ở MỌI cỡ màn hình — một
                    lời mời chia sẻ mà phải mở menu "⋮" mới thấy thì coi như không có. */}
                {isAuthenticated && <NotificationBell />}

                {/* Nút Cài Đặt */}
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    title={t('header.settings')}
                    className="hidden sm:inline-flex p-2.5 text-gray-700 dark:text-gray-300 rounded-full transition-colors cursor-pointer"
                >
                    <Settings className="w-5 h-5" />
                </button>

                {/* Menu "⋮" — chỉ trên điện thoại, thay cho hai nút Lịch sử + Cài đặt ở trên */}
                <div className="relative sm:hidden">
                    <button
                        onClick={() => setIsMoreOpen((open) => !open)}
                        title={t('header.more')}
                        aria-label={t('header.more')}
                        aria-expanded={isMoreOpen}
                        className="p-2 text-gray-700 dark:text-gray-300 rounded-full transition-colors cursor-pointer"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    {isMoreOpen && (
                        <>
                            {/* Lớp trong suốt bắt cú chạm ra ngoài để đóng menu */}
                            <div className="fixed inset-0 z-40" onClick={() => setIsMoreOpen(false)} />
                            <div className="absolute right-0 top-full mt-2 w-56 z-50 p-1.5 glass-strong rounded-[20px] animate-glass-in origin-top-right">
                                <button
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        handleOpenActivityLog();
                                    }}
                                    disabled={isAuthLoading}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm font-medium text-gray-800 dark:text-gray-200 active:bg-black/5 dark:active:bg-white/10 transition-colors text-left cursor-pointer disabled:opacity-40"
                                >
                                    <History className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                    <span>{t('header.activityLog')}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        setIsSettingsOpen(true);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm font-medium text-gray-800 dark:text-gray-200 active:bg-black/5 dark:active:bg-white/10 transition-colors text-left cursor-pointer"
                                >
                                    <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                    <span>{t('header.settings')}</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Nút Thông tin tài khoản — 3 trạng thái: loading / chưa login / đã login */}
                <div className="relative">
                    {isAuthLoading ? (
                        /* Skeleton khi đang kiểm tra auth */
                        <div className="w-9 h-9 rounded-full bg-black/10 dark:bg-white/10 animate-pulse ml-1" />
                    ) : !isAuthenticated ? (
                        /* Chưa đăng nhập → hiện nút Đăng nhập */
                        <button
                            onClick={() => navigate('/login')}
                            className="ml-1 px-3 sm:px-4 py-1.5 rounded-full btn-accent hover:brightness-105 text-[13px] sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap"
                        >
                            {t('common.login')}
                        </button>
                    ) : (
                        /* Đã đăng nhập → hiện avatar */
                        <>
                            <button
                                onClick={() => setIsAccountOpen(!isAccountOpen)}
                                title={t('header.account')}
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 dark:from-zinc-500 dark:to-zinc-700 text-white font-semibold flex items-center justify-center hover:brightness-105 shadow-sm ring-2 ring-white/80 dark:ring-white/15 transition ml-1 mr-0.5 cursor-pointer overflow-hidden"
                            >
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (user?.fullName || user?.email || 'U').charAt(0).toUpperCase()
                                )}
                            </button>

                            {/* Popover Thông Tin Tài Khoản */}
                            <AccountModal
                                isOpen={isAccountOpen}
                                onClose={() => setIsAccountOpen(false)}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Modal Cài Đặt */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            {/* Drawer Lịch sử hoạt động — chỉ dựng khi còn phiên. Nếu phiên bị thu hồi
                từ thiết bị khác trong lúc drawer đang mở thì `isAuthenticated` đổi về
                false và drawer đóng lại ngay, không giữ lại danh sách đã tải trên màn hình. */}
            <ActivityLogDrawer
                isOpen={isActivityLogOpen && isAuthenticated}
                onClose={() => setIsActivityLogOpen(false)}
                fileId={null}
                fileName={null}
            />
        </header>
    );
}