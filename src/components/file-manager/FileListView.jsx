import { useState, useCallback, useRef, memo } from 'react';
import { useFiles, useFileSelection, useClipboard, useFilePreview, useDriveAccess } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAiPanel } from '../../context/AiPanelContext';
import { getFileIcon as getSharedFileIcon } from '../../utils/getFileIcon';
import { getCardColorVars } from '../../utils/fileColors';
import { sharingApi } from '../../services/api';
import toast from 'react-hot-toast';
import { formatBytes } from '../../utils/formatFileSize';
import FileSkeleton from '../common/FileSkeleton';
import ContextMenu from './ContextMenu';
import RenameModal from './RenameModal';
import ShareModal from './ShareModal';
import MoveModal from './MoveModal';
import StarButton from '../common/StarButton';
import FileThumbnail from './FileThumbnail';
import ItemLocation from './ItemLocation';
import TagChips from '../common/TagChips';
import { collectInputEntries } from '../../utils/uploadTree';
import tRich from '../../utils/tRich';
import { downloadSingleItem } from '../../utils/downloadItems';
import {
    Folder,
    MoreVertical,
    FolderOpen,
    ChevronLeft,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    CheckSquare,
    Square,
    Minus,
    ShieldAlert,
    SearchX,
} from 'lucide-react';

const TYPE_KEY_BY_EXT = [
    // Cùng nhóm đuôi với icon (`utils/getFileIcon.jsx`) và bộ lọc "Loại tệp" của backend
    // (`backend/src/files/file-filters.ts`). Trước ##83 bảng này chỉ biết vài đuôi: `.txt`,
    // `.gif`, `.xls`, `.mov`, `.java`… đều ghi "Tệp tin" trong khi icon và bộ lọc xếp chúng
    // vào đúng loại.
    [/\.pdf$/, 'fileType.pdf'],
    [/\.(xlsx|xls|xlsm|ods|csv|tsv|numbers)$/, 'fileType.spreadsheet'],
    [/\.(docx|doc|odt|rtf|pages)$/, 'fileType.word'],
    [/\.(txt|log|epub)$/, 'fileType.text'],
    [/\.(pptx|ppt|pps|ppsx|odp)$/, 'fileType.ppt'],
    [/\.svg$/, 'fileType.svg'],
    [/\.(png|jpe?g|gif|webp|bmp|tiff?|ico|heic|heif|avif)$/, 'fileType.image'],
    [/\.(psd|ai|sketch|xd)$/, 'fileType.design'],
    [/\.fig$/, 'fileType.figma'],
    [/\.(mp4|mkv|avi|mov|webm|m4v|wmv|flv|3gp|mpe?g)$/, 'fileType.video'],
    [/\.(mp3|wav|aac|flac|ogg|oga|opus|m4a|wma|aiff)$/, 'fileType.audio'],
    [/\.(py|pyw|ipynb)$/, 'fileType.python'],
    [/\.(sql|db|sqlite3?|mdb|accdb)$/, 'fileType.sql'],
    [/\.(md|markdown)$/, 'fileType.markdown'],
    [/\.(exe|msi)$/, 'fileType.exe'],
    [/\.(zip|rar|7z|tar|gz|tgz|bz2|xz|zst|iso|dmg|apk|deb|rpm)$/, 'fileType.archive'],
    [/\.(js|jsx|mjs|cjs|ts|tsx|java|class|jar|kt|kts|scala|c|cpp|cc|cxx|h|hpp|cs|go|rs|rb|php|swift|dart|lua|r|pl|sh|bash|zsh|fish|bat|ps1|json|ya?ml|toml|ini|conf|env|xml|html?|css|scss|sass|less|vue|svelte|graphql|gql|prisma)$/, 'fileType.script'],
];

/** Đuôi lạ thì đoán theo MIME (tệp tải lên từ điện thoại hay mang tên không đuôi). */
const TYPE_KEY_BY_MIME = [
    [/^image\//, 'fileType.image'],
    [/^video\//, 'fileType.video'],
    [/^audio\//, 'fileType.audio'],
    [/pdf/, 'fileType.pdf'],
    [/^text\/plain/, 'fileType.text'],
];

/**
 * Trả về KHOÁ DỊCH của loại tệp, không phải chuỗi hiển thị.
 *
 * Hàm ở ngoài component nên không gọi được `useLanguage()`; nếu trả chuỗi tiếng
 * Việt như trước thì cột "Loại" đứng nguyên tiếng Việt kể cả khi giao diện đã
 * chuyển sang English. Nơi render gọi `t(getFileTypeKey(item))`.
 */
const getFileTypeKey = (item) => {
    if (item.type === 'folder') return 'fileType.folder';
    const name = (item.name || '').toLowerCase();
    const byExt = TYPE_KEY_BY_EXT.find(([re]) => re.test(name));
    if (byExt) return byExt[1];
    const mime = (item.mimeType || '').toLowerCase();
    const byMime = TYPE_KEY_BY_MIME.find(([re]) => re.test(mime));
    return byMime ? byMime[1] : 'fileType.other';
};

/**
 * Icon tệp cho bảng danh sách.
 *
 * Trước đây đây là một bảng if/else riêng với màu Tailwind cứng, nên tệp đã đổi
 * màu (customColor) vẫn hiện đúng màu mặc định của đuôi tệp — đổi màu ở chế độ
 * lưới thì thấy, chuyển sang danh sách là mất. Nay dùng chung util
 * utils/getFileIcon.jsx (đã ưu tiên customColor) để hai chế độ xem không lệch.
 */
const getFileIcon = (file) => getSharedFileIcon(file, 'w-4 h-4');


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
    onOpenLocation,
}) {
    const { t } = useLanguage();
    return (
        <tr
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, folder)}
            onDoubleClick={() => onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu(e, folder)}
            style={getCardColorVars(folder)}
            className={`transition-colors group cursor-pointer ${isCut ? 'opacity-50 border-dashed' : ''} ${
                isSelected
                    ? 'ring-1 ring-inset ring-blue-400 bg-[var(--fc-hover-l)] dark:bg-[var(--fc-hover-d)]'
                    : 'bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)] hover:bg-[var(--fc-surface-l)] dark:hover:bg-[var(--fc-surface-d)]'
            }`}
        >
            {/* Checkbox Column – only this triggers selection */}
            <td
                className="py-3.5 px-3 text-center"
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
                <button className="flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
            </td>

            {/* Star Column – moved after checkbox */}
            {/* Tệp người khác chia sẻ: cột is_starred thuộc chủ sở hữu nên chỉ hiển
                thị trạng thái, không cho bấm (backend chặn non-owner) */}
            <td className="py-3.5 px-3 text-center">
                <StarButton
                    size="sm"
                    isStarred={folder.isStarred}
                    readOnly={folder.isSharedWithMe}
                    onToggle={() => onToggleStar(folder.id)}
                />
            </td>

            {/* Name Column */}
            <td className="py-3.5 px-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg shrink-0 bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)] border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                        <Folder className="w-4 h-4 fill-current text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)]" />
                    </div>
                    <div className="min-w-0 flex flex-col">
                        <span className="font-semibold truncate max-w-[200px] text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]" title={folder.name}>
                            {folder.name}
                        </span>
                        {/* Kết quả tìm kiếm: thư mục này nằm ở đâu (##90) */}
                        <ItemLocation item={folder} onOpen={onOpenLocation} className="max-w-[200px]" />
                        {/* Nhãn riêng của người xem (##91) */}
                        <TagChips tags={folder.tags} className="mt-0.5 max-w-[220px]" />
                    </div>
                </div>
            </td>

            {/* Size Column */}
            <td className="py-3.5 px-3 text-gray-600 dark:text-gray-400 font-mono text-[11px] font-medium">--</td>

            {/* Type Column */}
            <td className="py-3.5 px-3 hidden lg:table-cell">
                <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold text-[11px] border border-amber-200 dark:border-amber-800/60">
                    {t('fileType.folder')}
                </span>
            </td>

            {/* Owner Column */}
            <td className="py-3.5 px-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[140px] hidden lg:table-cell">
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
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400' 
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>
                            {folder.sharedRole === 'EDITOR' ? t('list.role.editor') : t('list.role.viewer')}
                        </span>
                    </div>
                ) : (
                    folder.owner || t('list.owner.me')
                )}
            </td>

            {/* Modified Column */}
            <td className="py-3.5 px-3 text-gray-600 dark:text-gray-400 font-mono text-[11px] font-medium whitespace-nowrap hidden sm:table-cell">
                {activeTab === 'shared-with-me' && folder.sharedAt 
                    ? folder.sharedAt 
                    : folder.updatedAt}
            </td>

            {/* Action Options */}
            <td className="py-3.5 px-3 text-center">
                <button
                    onClick={(e) => onContextMenu(e, folder)}
                    className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
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
    onOpenLocation,
}) {
    const { t } = useLanguage();
    return (
        <tr
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, file)}
            onDoubleClick={() => onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu(e, file)}
            style={getCardColorVars(file)}
            className={`transition-colors group cursor-pointer ${isCut ? 'opacity-50 border-dashed' : ''} ${
                isSelected
                    ? 'ring-1 ring-inset ring-blue-400 bg-[var(--fc-hover-l)] dark:bg-[var(--fc-hover-d)]'
                    : 'bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)] hover:bg-[var(--fc-surface-l)] dark:hover:bg-[var(--fc-surface-d)]'
            }`}
        >
            {/* Checkbox Column – only this triggers selection */}
            <td
                className="py-3.5 px-3 text-center"
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
                <button className="flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
            </td>

            {/* Star Column — xem ghi chú ở hàng thư mục */}
            <td className="py-3.5 px-3 text-center">
                <StarButton
                    size="sm"
                    isStarred={file.isStarred}
                    readOnly={file.isSharedWithMe}
                    onToggle={() => onToggleStar(file.id)}
                />
            </td>

            {/* Name Column */}
            <td className="py-3.5 px-3">
                <div className="flex items-center gap-2.5">
                    {/* Mini thumbnail (ảnh / video / trang đầu PDF), loại còn lại rơi về
                        icon theo đuôi tệp — giống hàng ở Trang chủ. Hàng THƯ MỤC không
                        dùng: xem FolderTableRow, vẫn là icon thư mục màu hổ phách. */}
                    <FileThumbnail
                        file={file}
                        className="w-8 h-8 rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700/60 shadow-2xs"
                        fallback={getFileIcon(file)}
                    />
                    <div className="min-w-0 flex flex-col">
                        <span className="font-semibold truncate max-w-[180px] text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]" title={file.name}>
                            {file.name}
                        </span>
                        {/* Kết quả tìm kiếm: tệp này nằm ở đâu (##90) */}
                        <ItemLocation item={file} onOpen={onOpenLocation} className="max-w-[180px]" />
                        {/* Nhãn riêng của người xem (##91) */}
                        <TagChips tags={file.tags} className="mt-0.5 max-w-[220px]" />
                    </div>
                    {/* Lý do bị gắn cờ do Spam Guard — chỉ tệp trong mục Nội dung rác mới có */}
                    {file.isSpam && (
                        <span
                            className="shrink-0 text-amber-600 dark:text-amber-400"
                            title={file.suspiciousReason || t('list.suspicious')}
                        >
                            <ShieldAlert className="w-4 h-4" />
                        </span>
                    )}
                </div>
            </td>

            {/* Size Column */}
            <td className="py-3.5 px-3 text-gray-800 dark:text-gray-300 font-mono font-semibold text-[11px]">
                {formatBytes(file.size)}
            </td>

            {/* Type Column */}
            <td className="py-3.5 px-3 hidden lg:table-cell">
                <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 font-semibold text-[11px] border border-blue-200 dark:border-blue-800/60 whitespace-nowrap">
                    {t(getFileTypeKey(file))}
                </span>
            </td>

            {/* Owner Column */}
            <td className="py-3.5 px-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[140px] hidden lg:table-cell">
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
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400' 
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400'
                        }`}>
                            {file.sharedRole === 'EDITOR' ? t('list.role.editor') : t('list.role.viewer')}
                        </span>
                    </div>
                ) : (
                    file.owner || t('list.owner.me')
                )}
            </td>

            {/* Modified Column */}
            <td className="py-3.5 px-3 text-gray-600 dark:text-gray-400 font-mono text-[11px] font-medium whitespace-nowrap hidden sm:table-cell">
                {activeTab === 'shared-with-me' && file.sharedAt 
                    ? file.sharedAt 
                    : file.updatedAt}
            </td>

            {/* Action Options */}
            <td className="py-3.5 px-3 text-center">
                <button
                    onClick={(e) => onContextMenu(e, file)}
                    className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
});

// ──────────────────────────────────────────────────────────────────

/**
 * Ô tiêu đề cột bấm được để sắp xếp. `onSort = null` là cột chỉ để đọc (tab "Gần đây").
 */
function SortHeader({ field, label, className = '', onSort, sortField, sortDirection }) {
    const active = onSort && sortField === field;
    return (
        <th
            onClick={onSort ? () => onSort(field) : undefined}
            className={`py-3 px-3 font-bold transition-colors ${
                onSort ? 'hover:text-blue-700 dark:hover:text-blue-400 cursor-pointer' : ''
            } ${className}`}
        >
            <div className="flex items-center gap-1">
                <span>{label}</span>
                {active && (
                    sortDirection === 'asc'
                        ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                )}
            </div>
        </th>
    );
}

const EMPTY_LIST = [];

export default function FileListView() {
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
        sortField,
        setSortField,
        sortDirection,
        setSortDirection,
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
    // Rỗng vì đang TÌM / LỌC thì nói "không có kết quả", không phải "chưa có tệp nào ở đây".
    const isQuerying = Boolean(searchQuery?.trim()) || filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';

    // Ba nhóm dưới đây đọc từ context riêng thay vì useFiles(): chúng đổi theo
    // từng cú bấm chuột, gộp chung sẽ kéo cả Sidebar và Header render theo.
    const {
        selectedIds,
        selectedCount,
        isSelected,
        toggleSelect,
        selectRange,
        selectAll,
        deselectAll,
    } = useFileSelection();

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

    // "Gần đây" luôn theo thứ tự mở gần nhất (FileContext giữ nguyên thứ tự server ở
    // tab này), nên tiêu đề cột ở đó không bấm được và không có mũi tên: một mũi tên
    // "Tên ↑" trên danh sách không xếp theo tên là nói sai.
    const sortProps = activeTab === 'recent'
        ? { onSort: null }
        : { onSort: handleSort, sortField, sortDirection };

    // Folders and files are already sorted by FileContext
    const sortedFolders = folders || EMPTY_LIST;
    // Hằng dùng chung chứ không `[]` mới mỗi lần render: `sortedFiles` nằm trong deps của
    // `handleItemDoubleClick` (để cửa sổ xem trước có nút ‹ › đi trong đúng danh sách này).
    const sortedFiles = files || EMPTY_LIST;

    const handleItemDoubleClick = useCallback((item) => {
        if (item.type === 'folder' && !item.isTrash && !item.isSpam) {
            openFolder(item);
        } else {
            // Kèm danh sách đang hiện để cửa sổ xem trước có nút ‹ › sang tệp kế bên.
            openPreview(item, sortedFiles);
        }
    }, [openFolder, openPreview, sortedFiles]);

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
                {isQuerying
                    ? <SearchX className="w-16 h-16 stroke-1 text-gray-300 mb-3" />
                    : <FolderOpen className="w-16 h-16 stroke-1 text-gray-300 mb-3" />}
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {isQuerying ? t('list.empty.noResults') : t('list.empty.title')}
                </p>
                {isQuerying && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center px-4">{t('list.empty.noResultsHint')}</p>
                )}

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
            className="w-full flex flex-col min-h-full select-none text-xs sm:text-sm relative"
        >
            <input type="file" ref={fileInputRef} onChange={handleFileInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFiles')} />
            <input type="file" ref={setFolderInputRef} onChange={handleFolderInputChange} multiple className="hidden" aria-label={t('newBtn.aria.pickFolder')} />

            {/* Extended Metadata Table View */}
            {/* `isRefreshing` = vẫn đứng nguyên thư mục này, chỉ đang lọc / tìm lại.
                Làm mờ và khoá tương tác thay vì thay bằng skeleton: xoá cả bảng đi
                rồi dựng lại sau mỗi 400ms gõ phím là màn hình nhấp nháy liên tục. */}
            {/* KHÔNG có thẻ bao (viền + bo góc + bóng) và KHÔNG tự cuộn dọc: bảng dài theo
                nội dung và cuộn cùng khung trang. Trước đây khung này `flex-1` trong một cột
                `h-full` nên bảng cuộn TRONG một ô riêng, còn bên dưới luôn chừa 96px trống —
                danh sách dừng cách đáy màn hình một đoạn, và thẻ trắng bao quanh làm rối mắt. */}
            <div
                className={`w-full overflow-x-auto border-b border-gray-200 dark:border-gray-700 transition-opacity duration-150 ${
                    isRefreshing ? 'opacity-50 pointer-events-none' : ''
                }`}
                aria-busy={isRefreshing}
            >
                <table className="w-full text-left border-collapse min-w-[560px] lg:min-w-[850px]">
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider bg-gray-100/90 dark:bg-white/5 select-none">
                            {/* Checkbox Header */}
                            <th className="py-3 px-3 w-8 text-center">
                                <button
                                    onClick={() => allSelected ? deselectAll() : selectAll(folders, files)}
                                    className="flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title={allSelected ? t('common.deselectAll') : t('common.selectAll')}
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

                            {/* Tiêu đề cột bấm để sắp xếp — xem `SortHeader`. */}
                            <SortHeader field="name" label={t('list.col.name')} {...sortProps} />
                            <SortHeader field="size" label={t('list.col.size')} {...sortProps} />
                            <SortHeader field="type" label={t('list.col.type')} className="hidden lg:table-cell" {...sortProps} />
                            <SortHeader field="owner" label={t('list.col.owner')} className="hidden lg:table-cell" {...sortProps} />
                            <SortHeader field="updatedAt" label={t('list.col.modified')} className="hidden sm:table-cell" {...sortProps} />

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
                                onOpenLocation={openItemLocation}
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
                                onOpenLocation={openItemLocation}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/*
              Vùng nền trống bên dưới bảng — right-click vào đây để tải lên / tạo thư mục mới.
              `flex-1` lấp phần còn thừa khi thư mục ít mục; `min-h-12` giữ một dải 48px ở
              cuối khi danh sách dài hơn màn hình, đủ chỗ mở menu vùng trống mà không bắt
              người dùng nhìn một khoảng trống lớn.
            */}
            <div className="flex-1 min-h-12 shrink-0" aria-hidden="true" />

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 text-xs text-gray-600 dark:text-gray-400">
                    <div>
                        {tRich(t('list.pagination.showing'), {
                            from: <span className="font-bold text-gray-900 dark:text-gray-100">{((currentPage - 1) * pageSize) + 1}</span>,
                            to: <span className="font-bold text-gray-900 dark:text-gray-100">{Math.min(currentPage * pageSize, totalItems)}</span>,
                            total: <span className="font-bold text-gray-900 dark:text-gray-100">{totalItems}</span>,
                        })}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-gray-700 dark:text-gray-300"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="px-2 font-semibold text-gray-800 dark:text-gray-200">
                            {t('list.pagination.page', { page: currentPage, total: totalPages })}
                        </span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-gray-700 dark:text-gray-300"
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
                onPreview={(item) => openPreview(item, sortedFiles)}
                onDownload={(item) => downloadSingleItem(item, getDownloadUrl, { t })}
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
                        ? [...sortedFolders, ...sortedFiles].filter((it) => selectedIds.has(it.id))
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
