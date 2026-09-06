import { useState, useEffect, useRef } from 'react';
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
    FileUp,
    FolderUp,
    FolderPlus,
    ChevronRight,
    ChevronLeft,
    FileText,
    Lightbulb,
    Tags,
    ListChecks,
    Wand2,
    MessageSquare
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { SHORTCUT_HINTS } from '../../hooks/useGlobalShortcuts';

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

// ── Hành động nhanh của trợ lý AI ──────────────────────────────────────────
// `id` đi thẳng xuống `POST /ai/ask` làm trường `action`; backend giữ câu lệnh
// thật, nên sửa cách hỏi Gemini là deploy backend chứ không build lại frontend.
// `folderOnly` / `fileOnly` lọc theo mục được bấm: "tạo câu hỏi ôn tập" từ một
// thư mục chỉ có danh sách tên tệp thì không ra được gì hữu ích.
const AI_QUICK_ACTIONS = [
    { id: 'summarize', icon: FileText, labelKey: 'ai.action.summarize' },
    { id: 'explain', icon: Lightbulb, labelKey: 'ai.action.explain' },
    { id: 'keywords', icon: Tags, labelKey: 'ai.action.keywords' },
    { id: 'quiz', icon: ListChecks, labelKey: 'ai.action.quiz', fileOnly: true },
    { id: 'improve', icon: Wand2, labelKey: 'ai.action.improve', fileLabelKey: 'ai.action.improveFile' },
];

// Chiều rộng menu chính (w-64) và menu con (w-60) tính bằng px — cần con số thật
// để biết còn chỗ mở sang phải hay phải lật sang trái.
const MENU_WIDTH = 256;
const SUBMENU_WIDTH = 240;

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
    onDeletePermanently,
    onToggleStar,
    onShowInfo,
    onDismissSuggestion,
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

    // Menu con "Hỏi AI": null = đóng, 'right' | 'left' = đang mở và mở về phía nào.
    // Lật sang trái khi bấm chuột phải sát mép phải màn hình, nếu không menu con
    // tràn ra ngoài và người dùng không đọc được nửa cuối các mục.
    const [aiSubmenuSide, setAiSubmenuSide] = useState(null);

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
        // Bấm chuột phải ở chỗ khác khi menu đang mở: menu chính nhảy sang vị trí
        // mới, menu con phải đóng theo chứ không lơ lửng cạnh vị trí cũ.
        setAiSubmenuSide(null);
    }, [x, y]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const hasBlankAreaActions = onUploadFile || onUploadFolder || onCreateFolder;

    // Menu vùng trống không có `item` để làm mốc ẩn/hiện, nên phải dựa vào `isOpen`
    if (!isOpen) return null;

    if (!item && !hasBlankAreaActions) return null;

    // ── Menu cho vùng nền trống: tải tệp/thư mục lên, tạo thư mục mới ──
    if (!item) {
        return (
            <div
                ref={menuRef}
                className="fixed z-50 w-60 bg-white dark:bg-[#282a2c]/95 backdrop-blur-md text-gray-900 dark:text-gray-200 rounded-2xl shadow-2xl py-2 border border-gray-300 dark:border-gray-700/80 text-[13px] font-sans select-none animate-fade-in"
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <button
                    onClick={() => { onUploadFile?.(); onClose(); }}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-900 dark:text-gray-200 font-medium transition-colors"
                >
                    <FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{t('menu.uploadFile')}</span>
                </button>

                <button
                    onClick={() => { onUploadFolder?.(); onClose(); }}
                    disabled={isBuildingTree}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] disabled:opacity-50 disabled:cursor-wait cursor-pointer flex items-center gap-3 text-gray-900 dark:text-gray-200 font-medium transition-colors"
                >
                    {isBuildingTree ? (
                        <Loader2 className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
                    ) : (
                        <FolderUp className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span>{isBuildingTree ? t('menu.buildingTree') : t('menu.uploadFolder')}</span>
                </button>

                <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                <button
                    onClick={() => { onCreateFolder?.(); onClose(); }}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-900 dark:text-gray-200 font-medium transition-colors"
                >
                    <FolderPlus className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                    <span>{t('menu.newFolder')}</span>
                </button>
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
                className="fixed z-50 w-64 bg-white/95 dark:bg-[#282a2c]/90 backdrop-blur-md text-gray-800 dark:text-gray-200 rounded-2xl shadow-2xl py-2 border border-gray-200 dark:border-gray-700/80 text-[13px] font-sans select-none animate-fade-in"
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {/* Header */}
                <div className="px-4 py-1.5 mb-1 border-b border-gray-200 dark:border-gray-700/60 text-xs font-semibold text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
                    <span className="truncate">{item.name}</span>
                    {item.userRole && (
                        <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
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
                    <button
                        onClick={() => { onRename?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        <Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                        <span>{t('menu.renameAndDesc')}</span>
                    </button>
                ) : (
                    <div className="w-full px-4 py-2 flex items-center justify-between text-gray-400 dark:text-gray-500 cursor-not-allowed">
                        <div className="flex items-center gap-3">
                            <ShieldOff className="w-4 h-4 shrink-0" />
                            <span className="line-through text-xs">{t('menu.renameAndDesc')}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('menu.needAdmin')}</span>
                    </div>
                )}

                {/* Gắn sao — mọi thành viên đều làm được, và là dấu sao RIÊNG của người đang
                    đăng nhập (backend lưu ở hàng shared_drive_members của họ) */}
                <button
                    onClick={() => { onToggleStar?.(item); onClose(); }}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                >
                    <Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'} shrink-0`} />
                    <span>{item.isStarred ? t('menu.star.remove') : t('menu.star.add')}</span>
                </button>

                {/* Sao chép tên drive — KHÔNG có deep-link tới một drive nên không copy link được */}
                <button
                    onClick={() => { onCopy?.(item); onClose(); }}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                >
                    <Copy className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                    <span>{t('menu.copyName')}</span>
                </button>

                <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                {/* Chia sẻ = quản lý thành viên (bảng shared_drive_members, KHÔNG phải file_shares) */}
                <button
                    onClick={() => { onShare?.(item); onClose(); }}
                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                >
                    <UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                    <span>{t('menu.shareAndMembers')}</span>
                </button>

                <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                {/* Xóa drive — chỉ người tạo. Trang sẽ mở hộp thoại xác nhận trước khi gọi API */}
                {item.canDelete ? (
                    <button
                        onClick={() => { onDeletePermanently?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 transition-colors"
                    >
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span>{t('menu.deleteDrive')}</span>
                    </button>
                ) : (
                    <div className="w-full px-4 py-2 flex items-center justify-between text-gray-400 dark:text-gray-500 cursor-not-allowed">
                        <div className="flex items-center gap-3">
                            <ShieldOff className="w-4 h-4 shrink-0" />
                            <span className="line-through text-xs">{t('menu.deleteDrive')}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('menu.creatorOnly')}</span>
                    </div>
                )}
            </div>
        );
    }

    const isFolder = item.type === 'folder';

    // Menu chính đã được kéo vào trong màn hình ở effect trên, nên `pos.left` là vị
    // trí thật; chỉ cần hỏi tiếp: mở thêm 240px sang phải có tràn không.
    const openSideForSubmenu = () =>
        pos.left + MENU_WIDTH + SUBMENU_WIDTH + 8 > window.innerWidth ? 'left' : 'right';

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
            className="fixed z-50 w-64 bg-white dark:bg-[#282a2c]/95 backdrop-blur-md text-gray-900 dark:text-gray-200 rounded-2xl shadow-2xl py-2 border border-gray-300 dark:border-gray-700/80 text-[13px] font-sans select-none animate-fade-in"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Header */}
            <div className="px-4 py-1.5 mb-1 border-b border-gray-200 dark:border-gray-700/60 text-xs font-bold text-gray-700 dark:text-gray-400 truncate flex items-center gap-2">
                <span className="truncate">{item.name}</span>
                {isShared && sharedRole && (
                    <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        sharedRole === 'EDITOR'
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                            : 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300'
                    }`}>
                        {sharedRole === 'EDITOR' ? t('menu.roleEditor') : t('menu.roleViewer')}
                    </span>
                )}
            </div>

            {isTrashTab ? (
                <>
                    {/* Trash view options */}
                    <button
                        onClick={() => { onRestore?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{t('common.restore')}</span>
                    </button>

                    <button
                        onClick={() => { onDeletePermanently?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 transition-colors"
                    >
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span>{t('common.deleteForever')}</span>
                    </button>
                </>
            ) : (
                <>
                    {/* 0. Xem trước */}
                    {item.type !== 'folder' && (
                        <button
                            onClick={() => { onPreview?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors font-medium"
                        >
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{t('menu.preview')}</span>
                        </button>
                    )}

                    {/* 1. Tải xuống */}
                    <button
                        onClick={() => { onDownload?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        <Download className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                        <span>{t('common.download')}</span>
                    </button>

                    {/* 2. Đổi tên — ẩn nếu VIEWER trong shared-with-me */}
                    {canRename ? (
                        <button
                            onClick={() => { onRename?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                                <span>{t('menu.rename')}</span>
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono text-right leading-snug">{RENAME_SHORTCUT_KEYS.join(`  ${t('shortcuts.or')}  `)}</span>
                        </button>
                    ) : (
                        // Hiển thị disabled hint khi VIEWER
                        <div className="w-full px-4 py-2 flex items-center justify-between text-gray-400 dark:text-gray-500 cursor-not-allowed">
                            <div className="flex items-center gap-3">
                                <ShieldOff className="w-4 h-4 shrink-0" />
                                <span className="line-through text-xs">{t('menu.rename')}</span>
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('menu.viewerOnly')}</span>
                        </div>
                    )}

                    {/* 2.5. Đánh dấu sao — ẩn với tệp được người khác chia sẻ */}
                    {canToggleStar && (
                        <button
                            onClick={() => { onToggleStar?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'} shrink-0`} />
                                <span>{item.isStarred ? t('menu.star.remove') : t('menu.star.add')}</span>
                            </div>
                        </button>
                    )}

                    {/* Separator: Clipboard Actions */}
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                    {/* Cắt — ẩn trong shared-with-me */}
                    {canCut && (
                        <button
                            onClick={() => { onCut?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Scissors className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                                <span>{t('common.cut')}</span>
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">Ctrl+X</span>
                        </button>
                    )}

                    {/* Sao chép */}
                    <button
                        onClick={() => { onCopy?.(item); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Copy className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                            <span>{t('common.copy')}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">Ctrl+C</span>
                    </button>

                    {/* Dán (Chỉ hiển thị khi có item trong clipboard) */}
                    {canPaste && canPasteIntoItem && (
                        <button
                            disabled={isPasting}
                            onClick={() => { 
                                onPaste?.(isFolder ? item.id : undefined); 
                                onClose(); 
                            }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-between text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-colors font-medium"
                        >
                            <div className="flex items-center gap-3">
                                {isPasting ? (
                                    <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                                ) : (
                                    <FolderInput className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                )}
                                <span>{isFolder ? t('menu.pasteIntoFolder') : t('menu.paste')}</span>
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">Ctrl+V</span>
                        </button>
                    )}

                    {/* Separator 1 */}
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                    {/* 3. Hỏi AI — một mục mở menu con chứa các lệnh nhanh.
                        Trước đây đây là một nút duy nhất mở khung chat trống, người dùng
                        phải tự nghĩ ra câu hỏi. Các lệnh hay dùng nhất giờ nằm ngay trong
                        menu chuột phải: một cú bấm là có câu trả lời. */}
                    <div
                        className="relative"
                        onMouseEnter={() => setAiSubmenuSide(openSideForSubmenu())}
                        onMouseLeave={() => setAiSubmenuSide(null)}
                    >
                        <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={!!aiSubmenuSide}
                            onClick={() => setAiSubmenuSide((prev) => (prev ? null : openSideForSubmenu()))}
                            className={`w-full px-4 py-2 cursor-pointer flex items-center justify-between gap-3 font-medium transition-colors text-gray-900 dark:text-gray-100 ${
                                aiSubmenuSide ? 'bg-purple-50 dark:bg-purple-500/10' : 'hover:bg-gray-100 dark:hover:bg-[#37393b]'
                            }`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                <span className="truncate">{t('ai.menu.title')}</span>
                            </div>
                            {aiSubmenuSide === 'left'
                                ? <ChevronLeft className="w-4 h-4 text-gray-400 shrink-0" />
                                : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        </button>

                        {aiSubmenuSide && (
                            <div
                                role="menu"
                                // -top-2 kéo menu con lên ngang mép trên của hàng cha (py-2 của
                                // menu chính), để mục đầu tiên thẳng hàng với chính nó.
                                className={`absolute -top-2 w-60 bg-white dark:bg-[#282a2c]/95 backdrop-blur-md rounded-2xl shadow-2xl py-2 border border-gray-300 dark:border-gray-700/80 animate-fade-in z-10 ${
                                    aiSubmenuSide === 'left' ? 'right-full mr-1' : 'left-full ml-1'
                                }`}
                            >
                                <div className="px-4 pb-1.5 mb-1 border-b border-gray-200 dark:border-gray-700/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-purple-500 shrink-0" />
                                    <span className="truncate">{t('ai.menu.subtitle')}</span>
                                </div>

                                {AI_QUICK_ACTIONS
                                    .filter((action) => !(action.fileOnly && isFolder))
                                    .filter((action) => !(action.folderOnly && !isFolder))
                                    .map((action) => {
                                        const Icon = action.icon;
                                        const labelKey =
                                            !isFolder && action.fileLabelKey ? action.fileLabelKey : action.labelKey;
                                        return (
                                            <button
                                                key={action.id}
                                                role="menuitem"
                                                onClick={() => { onGemini?.(item, action.id); onClose(); }}
                                                className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors text-left"
                                            >
                                                <Icon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                                <span className="truncate">{t(labelKey)}</span>
                                            </button>
                                        );
                                    })}

                                <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                                {/* Câu hỏi tự do — vẫn giữ đường vào khung chat như trước */}
                                <button
                                    role="menuitem"
                                    onClick={() => { onGemini?.(item, 'chat'); onClose(); }}
                                    className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-900 dark:text-gray-100 font-medium transition-colors text-left"
                                >
                                    <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                    <span className="truncate">{t('ai.menu.chat')}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Separator 2 */}
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                    {/* 4. Chia sẻ — chỉ hiển thị khi là owner */}
                    {canShare && (
                        <button
                            onClick={() => { onShare?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                                <span>{t('menu.share')}</span>
                            </div>
                        </button>
                    )}

                    {/* 6. Thông tin chi tiết & hoạt động */}
                    <button
                        onClick={() => { onShowInfo?.(item, 'details'); onClose(); }}
                        className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        <Info className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                        <span>{t('menu.details')}</span>
                    </button>

                    {/* Separator 3 */}
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-1"></div>

                    {/* 7. Chuyển vào thùng rác — ẩn trong shared-with-me */}
                    {canTrash ? (
                        <button
                            onClick={() => { onMoveToTrash?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center justify-between text-gray-800 dark:text-gray-200 hover:text-rose-700 dark:hover:text-rose-300 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Trash2 className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
                                <span>{t('menu.moveToTrash')}</span>
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">Delete</span>
                        </button>
                    ) : (
                        // Hiển thị disabled hint khi trong shared-with-me
                        <div className="w-full px-4 py-2 flex items-center justify-between text-gray-400 dark:text-gray-500 cursor-not-allowed">
                            <div className="flex items-center gap-3">
                                <ShieldOff className="w-4 h-4 shrink-0" />
                                <span className="line-through text-xs">{t('menu.moveToTrash')}</span>
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('menu.viewerOnly')}</span>
                        </div>
                    )}

                    {/* 8. Không phải mục đề xuất hữu ích */}
                    {activeTab === 'home' && (
                        <button
                            onClick={() => { onDismissSuggestion?.(item); onClose(); }}
                            className="w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#37393b] cursor-pointer flex items-center gap-3 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:text-gray-100 transition-colors"
                        >
                            <ThumbsDown className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                            <span>{t('menu.notSpam')}</span>
                        </button>
                    )}
                </>
            )}
        </div>
    );
}