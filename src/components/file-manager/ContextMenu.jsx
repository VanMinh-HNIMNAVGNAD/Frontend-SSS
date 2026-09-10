import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Download,
    Pencil,
    Sparkles,
    UserPlus,
    Info,
    Trash2,
    ThumbsDown,
    Copy,
    Star,
    FolderInput,
    RotateCcw,
    Eye,
    Scissors,
    Loader2,
    ShieldOff,
    ShieldCheck,
    FileUp,
    FolderUp,
    FolderPlus,
    Palette,
    ChevronRight,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { SHORTCUT_HINTS } from '../../hooks/useGlobalShortcuts';
import ColorPickerPanel from './ColorPickerPanel';

// Bảng phím tắt lấy thẳng từ hook — đã format sẵn theo hệ điều hành đang chạy,
// nên phần hiển thị không bao giờ lệch với phím thật sự đang được lắng nghe.
// (Trước đây chỗ này hardcode "Ctrl+Alt+E" — phím tắt toàn cục cho Đổi tên
//  chưa từng dùng phím E. Ctrl+Alt+E chỉ chạy ở FileListView.jsx khi một HÀNG
//  đang được focus bàn phím, nên bấm từ menu chuột phải thì không có gì xảy ra.)
// An toàn về kiến trúc: useGlobalShortcuts.js chỉ phụ thuộc 'react', không
// import ngược lại component nào → không có vòng lặp import.
// Tra theo `id` ổn định — bản cũ tra `hint.label.includes('đổi tên')`, tức là so
// khớp với CHỮ HIỂN THỊ, nên đổi giao diện sang English là mất gợi ý phím tắt.
const RENAME_SHORTCUT_KEYS =
    SHORTCUT_HINTS.find((hint) => hint.id === 'rename')?.keys ?? [];

// ── Khung đo dùng chung cho cả ba biến thể menu ───────────────────────────
// Trước đây mỗi nhánh tự viết chuỗi class riêng: hàng có phím tắt dùng
// `justify-between`, hàng không có dùng `gap-3`, nên nhãn ở hai kiểu hàng không
// nằm cùng một cột và bề rộng w-60/w-64 lệch nhau giữa các menu. Gom về đây để
// mọi hàng, mọi menu đều chung một lưới: [icon 16px][gap 12px][nhãn co giãn][phần đuôi].
const MENU_SHELL =
    'fixed z-50 w-72 max-w-[calc(100vw-16px)] bg-white dark:bg-[#282a2c]/95 backdrop-blur-md ' +
    'text-gray-900 dark:text-gray-200 rounded-2xl shadow-2xl px-1.5 py-1.5 ' +
    'border border-gray-300 dark:border-gray-700/80 text-[13px] font-sans select-none animate-fade-in';

const ROW_BASE = 'w-full px-2.5 py-2 rounded-xl flex items-center gap-3 text-left transition-colors';

const TONE = {
    default: 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#37393b]',
    strong: 'text-gray-900 dark:text-gray-100 font-medium hover:bg-gray-100 dark:hover:bg-[#37393b]',
    accent: 'text-blue-700 dark:text-blue-300 font-medium hover:bg-gray-100 dark:hover:bg-[#37393b]',
    danger: 'text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10',
    // Chỉ chữ chuyển sang đỏ khi rê chuột (Chuyển vào thùng rác)
    dangerHover: 'text-gray-800 dark:text-gray-200 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-gray-100 dark:hover:bg-[#37393b]',
};

/**
 * Một hàng lệnh. `icon` nhận sẵn node để chỗ gọi tự quyết màu/animation
 * (ngôi sao đã tô, Loader2 đang quay…), phần còn lại của lưới thì cố định.
 */
function MenuRow({ icon, label, shortcut, shortcutTitle, trailing, onClick, disabled = false, tone = 'default' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${ROW_BASE} ${TONE[tone]} ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
        >
            <span className="shrink-0 flex items-center">{icon}</span>
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {shortcut && (
                <span
                    title={shortcutTitle}
                    className="shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                    {shortcut}
                </span>
            )}
            {trailing}
        </button>
    );
}

/** Hàng bị khoá quyền: cùng lưới với MenuRow để chữ không bị so le. */
function MenuRowLocked({ label, hint }) {
    return (
        <div className={`${ROW_BASE} text-gray-400 dark:text-gray-500 cursor-not-allowed`}>
            <ShieldOff className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate line-through">{label}</span>
            <span className="shrink-0 text-[10px] whitespace-nowrap">{hint}</span>
        </div>
    );
}

function MenuSeparator() {
    return <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1 mx-1.5" />;
}

export default function ContextMenu({
    isOpen = true,
    x,
    y,
    item,
    // 'item'  → menu cho tệp/thư mục (mặc định, hành vi cũ của mọi trang)
    // 'drive' → menu cho thẻ Bộ nhớ dùng chung: chỉ Đổi tên / Gắn sao / Sao chép /
    //           Chia sẻ / Xóa. Bỏ hẳn Xem trước, Tải xuống, Cắt, Dán, Hỏi Gemini,
    //           Thùng rác — không mục nào trong số đó áp dụng được cho một drive.
    variant = 'item',
    isTrashTab = false,
    isSpamTab = false,
    activeTab = 'my-drive',
    onClose,
    onPreview,
    onRename,
    onCut,
    onCopy,
    onPaste,
    canPaste = false,
    isPasting = false,
    onShare,
    onGemini,
    onDownload,
    onMoveToTrash,
    onRestore,
    onNotSpam,
    onDeletePermanently,
    onToggleStar,
    onShowInfo,
    onDismissSuggestion,
    onChangeColor,          // (item, hexColor | null) → void
    // Menu cho vùng nền trống (right-click ngoài mọi file/folder) — không có `item`
    onUploadFile,
    onUploadFolder,
    onCreateFolder,
    isBuildingTree = false,
}) {
    const menuRef = useRef(null);
    const { t } = useLanguage();

    // Reposition menu to stay inside window bounds
    const [pos, setPos] = useState({ top: y, left: x });
    // Bảng màu — bung sang bên phải như submenu (xem ColorPickerPanel.jsx).
    // Lưu ID của mục đang mở bảng màu chứ không phải cờ boolean: component này KHÔNG
    // remount khi bấm chuột phải sang mục khác (mọi trang đều giữ một instance duy
    // nhất), nên cờ boolean sẽ để panel mở nguyên và hiện màu của mục trước đó.
    const [colorPickerFor, setColorPickerFor] = useState(null);
    const showColorPicker = colorPickerFor != null && colorPickerFor === item?.id;

    // Mọi lối đóng menu đều đi qua đây để bảng màu không còn mở sẵn ở lần mở sau.
    const closeMenu = useCallback(() => {
        setColorPickerFor(null);
        onClose?.();
    }, [onClose]);

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newTop = y;
            let newLeft = x;

            if (y + rect.height > window.innerHeight - 10) {
                newTop = Math.max(10, window.innerHeight - rect.height - 10);
            }
            if (x + rect.width > window.innerWidth - 10) {
                newLeft = Math.max(10, window.innerWidth - rect.width - 10);
            }

            setPos({ top: newTop, left: newLeft });
        }
    }, [x, y]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeMenu]);

    const hasBlankAreaActions = onUploadFile || onUploadFolder || onCreateFolder;

    // Menu vùng trống không có `item` để làm mốc ẩn/hiện, nên phải dựa vào `isOpen`
    if (!isOpen) return null;

    if (!item && !hasBlankAreaActions) return null;

    // ── Menu cho vùng nền trống: tải tệp/thư mục lên, tạo thư mục mới, dán ──
    if (!item) {
        // Dán vào chỗ trống = dán vào thư mục ĐANG mở (`onPaste(undefined)` để
        // FileContext tự lấy `currentFolderId`). Đây là lối vào quan trọng nhất của
        // lệnh dán mà trước đây không có: một thư mục đích RỖNG thì không còn tệp
        // nào để bấm chuột phải lên, nên người dùng không có cách nào dán bằng menu.
        //
        // Chỉ mở ở hai tab có khái niệm "thư mục đang mở". Ở Có gắn sao / Gần đây /
        // Thùng rác / Nội dung rác, `currentFolderId` là null nên lệnh dán sẽ ném tệp
        // vào gốc My Drive — một nơi người dùng không hề nhìn thấy trên màn hình đó.
        const canPasteHere =
            canPaste && !isTrashTab && !isSpamTab && ['my-drive', 'shared-drives'].includes(activeTab);

        return (
            <div
                ref={menuRef}
                className={MENU_SHELL}
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <MenuRow
                    tone="strong"
                    icon={<FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    label={t('menu.uploadFile')}
                    onClick={() => { onUploadFile?.(); closeMenu(); }}
                />

                <MenuRow
                    tone="strong"
                    disabled={isBuildingTree}
                    icon={isBuildingTree
                        ? <Loader2 className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
                        : <FolderUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                    label={isBuildingTree ? t('menu.buildingTree') : t('menu.uploadFolder')}
                    onClick={() => { onUploadFolder?.(); closeMenu(); }}
                />

                <MenuSeparator />

                <MenuRow
                    tone="strong"
                    icon={<FolderPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                    label={t('menu.newFolder')}
                    onClick={() => { onCreateFolder?.(); closeMenu(); }}
                />

                {canPasteHere && (
                    <>
                        <MenuSeparator />

                        <MenuRow
                            tone="accent"
                            disabled={isPasting}
                            icon={isPasting
                                ? <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                : <FolderInput className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                            label={t('menu.paste')}
                            shortcut="Ctrl+V"
                            onClick={() => { onPaste?.(undefined); closeMenu(); }}
                        />
                    </>
                )}
            </div>
        );
    }

    // ── Menu cho thẻ Bộ nhớ dùng chung (SharedDrivesPage) ─────────────
    // Nhánh riêng, `return` sớm: một drive KHÔNG phải `file`/`folder` nên mọi logic
    // bên dưới (item.type, sharedRole, clipboard...) đều không áp dụng được.
    // `item` ở đây là object drive từ `GET /shared-drives`, được trang gắn thêm
    // `canDelete` (true khi người đang đăng nhập chính là `createdBy`).
    if (variant === 'drive') {
        const isDriveAdmin = item.userRole === 'ADMIN';

        return (
            <div
                ref={menuRef}
                className={MENU_SHELL}
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {/* Header */}
                <div className="px-2.5 pt-1 pb-2 mb-1 border-b border-gray-200 dark:border-gray-700/60 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate">{item.name}</span>
                    {item.userRole && (
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            isDriveAdmin
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                                : 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300'
                        }`}>
                            {item.userRole}
                        </span>
                    )}
                </div>

                {/* Đổi tên — chỉ ADMIN của drive (backend PATCH /:id cũng chặn tương tự) */}
                {isDriveAdmin ? (
                    <MenuRow
                        icon={<Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('menu.renameAndDesc')}
                        onClick={() => { onRename?.(item); closeMenu(); }}
                    />
                ) : (
                    <MenuRowLocked label={t('menu.renameAndDesc')} hint={t('menu.needAdmin')} />
                )}

                {/* Gắn sao — mọi thành viên đều làm được, và là dấu sao RIÊNG của người đang
                    đăng nhập (backend lưu ở hàng shared_drive_members của họ) */}
                <MenuRow
                    icon={<Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'}`} />}
                    label={item.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                    onClick={() => { onToggleStar?.(item); closeMenu(); }}
                />

                {/* Sao chép tên drive — KHÔNG có deep-link tới một drive nên không copy link được */}
                <MenuRow
                    icon={<Copy className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                    label={t('menu.copyName')}
                    onClick={() => { onCopy?.(item); closeMenu(); }}
                />

                <MenuSeparator />

                {/* Chia sẻ = quản lý thành viên (bảng shared_drive_members, KHÔNG phải file_shares) */}
                <MenuRow
                    icon={<UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                    label={t('menu.shareAndMembers')}
                    onClick={() => { onShare?.(item); closeMenu(); }}
                />

                <MenuSeparator />

                {/* Xóa drive — chỉ người tạo. Trang sẽ mở hộp thoại xác nhận trước khi gọi API */}
                {item.canDelete ? (
                    <MenuRow
                        tone="danger"
                        icon={<Trash2 className="w-4 h-4" />}
                        label={t('menu.deleteDrive')}
                        onClick={() => { onDeletePermanently?.(item); closeMenu(); }}
                    />
                ) : (
                    <MenuRowLocked label={t('menu.deleteDrive')} hint={t('menu.creatorOnly')} />
                )}
            </div>
        );
    }

    const isFolder = item.type === 'folder';

    // ── RBAC: Phân quyền cho tệp/thư mục được chia sẻ ──────────────
    const isShared = item.isSharedWithMe || activeTab === 'shared-with-me';
    const sharedRole = item.sharedRole; // 'VIEWER' | 'EDITOR' | undefined
    const isEditorInShared = isShared && sharedRole === 'EDITOR';

    // Trong mục được chia sẻ:
    // VIEWER: chỉ Preview + Download + Sao chép + Star + Hỏi Gemini + Thông tin
    // EDITOR: thêm Đổi tên + Cắt (di chuyển trong drive của chủ sở hữu). Không có
    // Thùng rác / Chia sẻ — hai việc đó vẫn chỉ chủ sở hữu mới làm được.
    const canRename = !isShared || isEditorInShared;
    const canCut = !isShared || isEditorInShared;
    const canTrash = !isShared;
    const canShare = !isShared; // Chỉ owner mới chia sẻ được
    // Dán VÀO một thư mục được chia sẻ cần quyền EDITOR — VIEWER bấm vào chỉ nhận 403
    const canPasteIntoItem = !isShared || !isFolder || isEditorInShared;
    // Dấu sao lưu trên chính hàng `files` (cột is_starred) nên nó là dấu sao CỦA CHỦ
    // SỞ HỮU, không phải của từng người xem. Backend vì thế chỉ cho owner đổi; ẩn nút
    // đi thay vì để người dùng bấm rồi nhận 403.
    const canToggleStar = !item.isSharedWithMe;

    return (
        <div
            ref={menuRef}
            className={MENU_SHELL}
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Header */}
            <div className="px-2.5 pt-1 pb-2 mb-1 border-b border-gray-200 dark:border-gray-700/60 text-xs font-bold text-gray-700 dark:text-gray-400 flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate">{item.name}</span>
                {isShared && sharedRole && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        sharedRole === 'EDITOR'
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                            : 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300'
                    }`}>
                        {sharedRole === 'EDITOR' ? t('menu.roleEditor') : t('menu.roleViewer')}
                    </span>
                )}
            </div>

            {isSpamTab ? (
                <>
                    {/* Nội dung rác: chỉ hai lối ra. Menu đầy đủ (Chia sẻ, Cắt, Dán,
                        Hỏi Gemini…) không áp dụng cho một tệp đang bị cách ly, và
                        trước đây tab này KHÔNG hề có mục gỡ cờ — người dùng buộc phải
                        tích chọn rồi tìm nút trên thanh công cụ xanh. */}
                    <MenuRow
                        icon={<ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                        label={t('menu.notSpamRestore')}
                        onClick={() => { onNotSpam?.(item); closeMenu(); }}
                    />

                    <MenuRow
                        tone="danger"
                        icon={<Trash2 className="w-4 h-4" />}
                        label={t('common.deleteForever')}
                        onClick={() => { onDeletePermanently?.(item); closeMenu(); }}
                    />
                </>
            ) : isTrashTab ? (
                <>
                    {/* Trash view options */}
                    <MenuRow
                        icon={<RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                        label={t('common.restore')}
                        onClick={() => { onRestore?.(item); closeMenu(); }}
                    />

                    <MenuRow
                        tone="danger"
                        icon={<Trash2 className="w-4 h-4" />}
                        label={t('common.deleteForever')}
                        onClick={() => { onDeletePermanently?.(item); closeMenu(); }}
                    />
                </>
            ) : (
                <>
                    {/* 1. Hỏi AI — đứng đầu menu: đây là việc người dùng tìm tới
                        nhiều nhất và trước đây nó bị chôn ở giữa danh sách.
                        Bấm là vào thẳng khung chat. Trước đây đây là menu con chứa 5
                        lệnh nhanh (tóm tắt, giải thích, từ khoá, câu hỏi ôn tập, cải
                        thiện). Bỏ đi vì nó bắt người dùng đi qua một lớp hover nữa mới
                        tới được chỗ gõ câu hỏi, trong khi chính khung chat đã có sẵn
                        đúng 5 chip đó ở chân khung cho ai cần. Vì vậy ContextMenu không
                        còn biết tới khái niệm "lệnh nhanh" — danh sách chỉ còn sống một
                        chỗ duy nhất là GeminiModal.jsx. */}
                    <MenuRow
                        tone="strong"
                        icon={<Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                        label={t('ai.menu.title')}
                        onClick={() => { onGemini?.(item, 'chat'); closeMenu(); }}
                    />

                    <MenuSeparator />

                    {/* 2. Xem trước */}
                    {item.type !== 'folder' && (
                        <MenuRow
                            tone="strong"
                            icon={<Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                            label={t('menu.preview')}
                            onClick={() => { onPreview?.(item); closeMenu(); }}
                        />
                    )}

                    {/* 3. Tải xuống */}
                    <MenuRow
                        icon={<Download className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('common.download')}
                        onClick={() => { onDownload?.(item); closeMenu(); }}
                    />

                    {/* 4. Đổi tên — ẩn nếu VIEWER trong shared-with-me.
                        Chỉ in phím tắt ĐẦU TIÊN: chuỗi "Ctrl+Alt+E hoặc F2" dài hơn phần
                        chỗ trống còn lại của hàng nên nó đẩy nhãn co lại và làm hàng này
                        cao hơn mọi hàng khác. Phím còn lại nằm trong tooltip. */}
                    {canRename ? (
                        <MenuRow
                            icon={<Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('menu.rename')}
                            shortcut={RENAME_SHORTCUT_KEYS[0]}
                            shortcutTitle={RENAME_SHORTCUT_KEYS.join(`  ${t('shortcuts.or')}  `)}
                            onClick={() => { onRename?.(item); closeMenu(); }}
                        />
                    ) : (
                        <MenuRowLocked label={t('menu.rename')} hint={t('menu.viewerOnly')} />
                    )}

                    {/* Separator: nhóm clipboard */}
                    <MenuSeparator />

                    {/* 5. Cắt — ẩn trong shared-with-me */}
                    {canCut && (
                        <MenuRow
                            icon={<Scissors className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('common.cut')}
                            shortcut="Ctrl+X"
                            onClick={() => { onCut?.(item); closeMenu(); }}
                        />
                    )}

                    {/* 6. Sao chép */}
                    <MenuRow
                        icon={<Copy className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('common.copy')}
                        shortcut="Ctrl+C"
                        onClick={() => { onCopy?.(item); closeMenu(); }}
                    />

                    {/* 7. Dán — chỉ hiện khi có mục trong clipboard. Nằm ngay sau
                        Cắt/Sao chép để ba lệnh clipboard đi liền một khối. */}
                    {canPaste && canPasteIntoItem && (
                        <MenuRow
                            tone="accent"
                            disabled={isPasting}
                            icon={isPasting
                                ? <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                                : <FolderInput className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                            label={isFolder ? t('menu.pasteIntoFolder') : t('menu.paste')}
                            shortcut="Ctrl+V"
                            onClick={() => {
                                onPaste?.(isFolder ? item.id : undefined);
                                closeMenu();
                            }}
                        />
                    )}

                    {/* 8. Gắn dấu sao — ẩn với tệp được người khác chia sẻ */}
                    {canToggleStar && (
                        <MenuRow
                            icon={<Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'}`} />}
                            label={item.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                            onClick={() => { onToggleStar?.(item); closeMenu(); }}
                        />
                    )}

                    <MenuSeparator />

                    {/* 9. Chia sẻ — chỉ hiển thị khi là owner */}
                    {canShare && (
                        <MenuRow
                            icon={<UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('menu.share')}
                            onClick={() => { onShare?.(item); closeMenu(); }}
                        />
                    )}

                    {/* 10. Thông tin chi tiết & hoạt động */}
                    <MenuRow
                        icon={<Info className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('menu.details')}
                        onClick={() => { onShowInfo?.(item, 'details'); closeMenu(); }}
                    />

                    {/* 11. Đổi màu — chỉ hiện khi owner hoặc EDITOR trong shared.
                        Bảng màu bung SANG PHẢI (submenu) chứ không chèn vào giữa menu:
                        ColorPickerPanel định vị `absolute` theo chính div bọc này, nên
                        div này bắt buộc phải là `relative`. */}
                    {onChangeColor && !item.isSharedWithMe && (
                        <div className="relative">
                            <MenuRow
                                icon={<Palette className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                                label="Đổi màu"
                                onClick={() => setColorPickerFor((v) => (v === item.id ? null : item.id))}
                                trailing={
                                    <span className="shrink-0 flex items-center gap-1.5">
                                        {/* Preview màu hiện tại */}
                                        <span
                                            className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600"
                                            style={{ backgroundColor: item.customColor || undefined }}
                                        />
                                        <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showColorPicker ? 'rotate-90' : ''}`} />
                                    </span>
                                }
                            />

                            {showColorPicker && (
                                <ColorPickerPanel
                                    item={item}
                                    currentColor={item.customColor ?? null}
                                    onSelectColor={(hex) => onChangeColor(item, hex)}
                                    onClose={() => setColorPickerFor(null)}
                                    onCloseMenu={closeMenu}
                                />
                            )}
                        </div>
                    )}

                    {/* Separator: nhóm huỷ bỏ */}
                    <MenuSeparator />

                    {/* 12. Chuyển vào thùng rác — ẩn trong shared-with-me */}
                    {canTrash ? (
                        <MenuRow
                            tone="dangerHover"
                            icon={<Trash2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('menu.moveToTrash')}
                            shortcut="Delete"
                            onClick={() => { onMoveToTrash?.(item); closeMenu(); }}
                        />
                    ) : (
                        <MenuRowLocked label={t('menu.moveToTrash')} hint={t('menu.viewerOnly')} />
                    )}

                    {/* 13. Không phải mục đề xuất hữu ích */}
                    {activeTab === 'home' && (
                        <MenuRow
                            icon={<ThumbsDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                            label={t('menu.notSpam')}
                            onClick={() => { onDismissSuggestion?.(item); closeMenu(); }}
                        />
                    )}
                </>
            )}
        </div>
    );
}
