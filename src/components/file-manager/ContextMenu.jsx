import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
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
    Plus,
    Upload,
    LogOut,
    SquarePen,
    FolderSymlink,
    Tag,
    Check,
    Minus,
    Settings2,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useDriveAccess, useFiles, useFileSelection } from '../../context/FileContext';
import { useTags } from '../../context/TagsContext';
import { DEFAULT_TAG_COLOR, TAG_COLORS, TAG_NAME_MAX } from '../../constants/tags';
import { SHORTCUT_HINTS } from '../../hooks/useGlobalShortcuts';
import ColorPickerPanel from './ColorPickerPanel';
import GlassLight from '../ui/GlassLight';
import LiquidGroup from '../ui/LiquidGroup';

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
//
// Kính nổi (`glass-strong`, index.css): menu không chứa con `position: fixed` nên được blur.
// Menu là một LiquidGroup (components/ui/LiquidGroup.jsx): nền rê chuột của từng hàng nay là
// MỘT giọt nước trượt giữa các hàng, nên hàng không còn `hover:bg-*` riêng.
const MENU_SHELL =
    'glass-strong fixed z-50 w-72 max-w-[calc(100vw-16px)] ' +
    'text-gray-900 dark:text-gray-100 rounded-[20px] px-1.5 py-1.5 ' +
    'text-[13px] font-sans select-none animate-glass-in';

// Ngón tay không có giọt nước theo chuột: giữ nền khi đang ấn để chạm vẫn có phản hồi.
const ROW_BASE =
    'w-full px-2.5 py-2 rounded-[12px] flex items-center gap-3 text-left transition-colors ' +
    'pointer-coarse:active:bg-black/[0.06] dark:pointer-coarse:active:bg-white/[0.09]';

const TONE = {
    default: 'text-gray-800 dark:text-gray-200',
    strong: 'text-gray-900 dark:text-gray-100 font-medium',
    accent: 'text-blue-700 dark:text-blue-300 font-medium',
    danger: 'text-rose-600 dark:text-rose-300',
    // Chỉ chữ chuyển sang đỏ khi rê chuột (Chuyển vào thùng rác)
    dangerHover: 'text-gray-800 dark:text-gray-200 hover:text-rose-700 dark:hover:text-rose-300',
};

/** Hàng xoá/huỷ: giọt nước ánh đỏ khi rê qua. */
const DANGER_TONES = new Set(['danger', 'dangerHover']);

/**
 * Một hàng lệnh. `icon` nhận sẵn node để chỗ gọi tự quyết màu/animation
 * (ngôi sao đã tô, Loader2 đang quay…), phần còn lại của lưới thì cố định.
 * `active` giữ nền như lúc rê chuột — cho hàng đang mở menu con, để người dùng
 * vẫn thấy menu con đó thuộc hàng nào khi chuột đã sang hẳn bên kia.
 */
function MenuRow({
    icon,
    label,
    shortcut,
    shortcutTitle,
    trailing,
    onClick,
    disabled = false,
    tone = 'default',
    active = false,
    ...buttonProps
}) {
    // Khoá cho giọt nước của menu — chỉ cần duy nhất trong menu, không cần ổn định giữa các lần mở.
    const liquidKey = useId();
    return (
        <button
            type="button"
            data-liquid-key={liquidKey}
            data-liquid-tone={DANGER_TONES.has(tone) ? 'danger' : undefined}
            {...buttonProps}
            onClick={onClick}
            disabled={disabled}
            className={`${ROW_BASE} ${TONE[tone]} ${active ? 'bg-black/[0.06] dark:bg-white/[0.09]' : ''} ${
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

// ── Menu con (▸) ────────────────────────────────────────────────────────────
// Menu nào đang mở được ghi bằng MỘT đường dẫn cho cả cây: 'create' → 'create/upload'.
// Một đường dẫn thay vì mỗi hàng một cờ riêng, vì các menu con phải loại trừ nhau:
// mở "Tạo mới ▸" là bảng màu (đường dẫn 'color') phải đóng — hai tấm cùng bung sang
// phải thì tấm này đè lên tấm kia. Và một tầng con chỉ mở được khi tầng cha đang mở.
//
// Menu con nằm TRONG cây DOM của menu (không dùng portal), cùng lý do với
// ColorPickerPanel: ContextMenu đóng khi mousedown rơi ra ngoài `menuRef`.

// Khung giống MENU_SHELL nhưng `absolute` (neo vào hàng cha) và nền đặc: một lớp
// backdrop-blur lồng trong lớp backdrop-blur khác của menu cha là làm mờ hai lần.
// Bề rộng (`w-56`) truyền riêng qua `SubmenuRow.panelWidth`: menu con "Chỉnh sửa" có hàng mang
// phím tắt ("Dán vào thư mục này  Ctrl+V") nên cần rộng hơn "Tải lên ▸".
//
// Đặc hơn menu cha: menu cha có backdrop-filter nên là "backdrop root" của menu con — phần menu
// con thò ra ngoài khung menu cha KHÔNG được blur, nền phải tự đủ đặc để chữ đọc được.
const SUBMENU_SHELL =
    'glass-strong bg-white/95! dark:bg-[#2a2a2e]/95! absolute z-10 max-w-[calc(100vw-16px)] rounded-[18px] ' +
    'px-1.5 py-1.5 animate-glass-in';

// Neo của menu con là <div className="relative"> bọc hàng cha — nằm trong padding 6px
// + viền 1px của menu cha. Lùi lên đúng 7px thì hàng ĐẦU của menu con thẳng hàng với
// hàng cha; cách ra 11px thì khe hở nhìn thấy giữa hai viền là 4px.
const SUBMENU_INSET = 7;
const SUBMENU_GAP = 11;
const VIEWPORT_MARGIN = 8;
// Rê qua hàng thì chờ một nhịp mới mở, để lướt dọc menu không làm menu con chớp lên;
// rời đi thì chờ lâu hơn, đủ cho đường chéo từ hàng cha sang hàng dưới của menu con.
const SUBMENU_OPEN_DELAY = 100;
const SUBMENU_CLOSE_DELAY = 250;

/** `path` có nằm trong nhánh `branch` không — 'create/upload' nằm trong 'create'. */
const isInBranch = (path, branch) =>
    path != null && (path === branch || path.startsWith(`${branch}/`));

const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null);

// { openPath, setOpenPath, rootRef, side } — `side` là hướng tầng cha đã bung ra;
// mỗi SubmenuPanel cung cấp lại context với `side` của chính nó cho tầng con.
const SubmenuContext = createContext(null);

/**
 * Hàng mở menu con. Chuột: rê qua là mở. Chạm và bàn phím không có "rê qua" nên
 * bấm mới mở, và bấm lần nữa để gập lại.
 */
function SubmenuRow({ path, icon, label, tone = 'default', panelWidth = 'w-56', children }) {
    const { openPath, setOpenPath, rootRef } = useContext(SubmenuContext);
    const isOpen = isInBranch(openPath, path);
    const wrapperRef = useRef(null);
    const openTimerRef = useRef(null);
    const closeTimerRef = useRef(null);
    const pointerTypeRef = useRef('');

    // Mở nhánh này nhưng KHÔNG gập tầng con đang mở bên trong nó: chuột lướt ngược từ
    // "Tải lên ▸" về hàng "Tạo mới" không được làm tắt menu "Tải lên".
    const open = useCallback(
        () => setOpenPath((cur) => (isInBranch(cur, path) ? cur : path)),
        [setOpenPath, path],
    );
    const close = useCallback(
        () => setOpenPath((cur) => (isInBranch(cur, path) ? parentOf(path) : cur)),
        [setOpenPath, path],
    );

    useEffect(() => () => clearTimeout(openTimerRef.current), []);

    // Đang mở thì canh chuột trên CẢ menu: sang một phần khác của menu (hàng khác, vạch
    // ngăn, tầng khác) là gập sau một nhịp, quay lại nhánh này trong nhịp đó là huỷ. Rê
    // quá đà ra hẳn ngoài menu thì giữ nguyên, như menu của hệ điều hành.
    // Không dựa vào `pointerleave` của chính hàng này: chuột đã ra ngoài menu rồi mới
    // quay lại ở một hàng khác thì hàng này không còn nhận được sự kiện "rời" nào nữa,
    // và menu con cứ thế mở mãi cạnh hàng người dùng đang trỏ.
    useEffect(() => {
        const root = rootRef.current;
        if (!isOpen || !root) return undefined;

        const cancelClose = () => {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        };
        const onPointerOver = (e) => {
            if (e.pointerType !== 'mouse') return;
            if (wrapperRef.current?.contains(e.target)) {
                cancelClose();
            } else if (!closeTimerRef.current) {
                closeTimerRef.current = setTimeout(() => {
                    closeTimerRef.current = null;
                    close();
                }, SUBMENU_CLOSE_DELAY);
            }
        };

        root.addEventListener('pointerover', onPointerOver);
        return () => {
            root.removeEventListener('pointerover', onPointerOver);
            cancelClose();
        };
    }, [isOpen, rootRef, close]);

    return (
        <div
            ref={wrapperRef}
            className="relative"
            onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                clearTimeout(openTimerRef.current);
                openTimerRef.current = setTimeout(open, SUBMENU_OPEN_DELAY);
            }}
            onPointerLeave={(e) => {
                // Lướt qua chưa đủ một nhịp thì huỷ lệnh mở đang chờ
                if (e.pointerType === 'mouse') clearTimeout(openTimerRef.current);
            }}
        >
            <MenuRow
                tone={tone}
                icon={icon}
                label={label}
                active={isOpen}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onPointerDown={(e) => {
                    pointerTypeRef.current = e.pointerType;
                }}
                onClick={() => {
                    clearTimeout(openTimerRef.current);
                    // Chuột thì rê qua đã mở rồi: bấm mà gập lại thì người vừa rê vào rồi
                    // bấm (đúng như đang được hướng dẫn) sẽ thấy menu con biến mất.
                    if (pointerTypeRef.current === 'mouse') open();
                    else setOpenPath((cur) => (isInBranch(cur, path) ? parentOf(path) : path));
                    pointerTypeRef.current = '';
                }}
                trailing={<ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-500" />}
            />

            {isOpen && <SubmenuPanel widthClass={panelWidth}>{children}</SubmenuPanel>}
        </div>
    );
}

/**
 * Tấm menu con. Bung cùng hướng với tầng cha (tầng cha đã lật sang trái vì sát mép
 * phải thì tầng con bung sang phải sẽ đè lên chính menu gốc), chỉ đổi hướng khi hướng
 * đó không đủ chỗ. Cả hai bên đều chật (điện thoại) thì thả xuống ngay dưới hàng cha — hoặc
 * bật lên ngay trên nó khi bên dưới không đủ chỗ.
 */
function SubmenuPanel({ widthClass, children }) {
    const ctx = useContext(SubmenuContext);
    const panelRef = useRef(null);
    const [pos, setPos] = useState(null);
    const preferredSide = ctx.side;

    // Đo trước khi trình duyệt vẽ nên không thấy tấm menu nhảy chỗ.
    const measure = useCallback(() => {
        const el = panelRef.current;
        const anchor = el?.parentElement; // <div className="relative"> bọc hàng cha
        if (!el || !anchor) return;

        const rect = anchor.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const roomRight = window.innerWidth - VIEWPORT_MARGIN - (rect.right + SUBMENU_GAP);
        const roomLeft = rect.left - SUBMENU_GAP - VIEWPORT_MARGIN;

        const side = preferredSide === 'left'
            ? (roomLeft >= w || roomLeft >= roomRight ? 'left' : 'right')
            : (roomRight >= w || roomRight >= roomLeft ? 'right' : 'left');
        const beside = (side === 'right' ? roomRight : roomLeft) >= w;

        let left;
        let top;
        let width;
        if (beside) {
            left = side === 'right' ? rect.width + SUBMENU_GAP : -(w + SUBMENU_GAP);
            top = -SUBMENU_INSET;
        } else {
            // Thả xuống ngay dưới hàng cha và phủ KHÍT bề rộng hàng cha. Nó đè lên các
            // hàng bên dưới của menu cha, còn hàng cha vẫn thấy và bấm được (bấm lần nữa
            // để gập). Lùi vào một đoạn cho ra dáng tầng con thì mép trái lòi ra nửa cột
            // icon của menu cha bên dưới — trông như vỡ khung.
            left = 0;
            width = rect.width;
            top = rect.height + 2;
            // Thả xuống mà tràn đáy màn hình ⇒ bật LÊN trên hàng cha nếu đủ chỗ. Dời lên cho vừa
            // màn hình (đoạn dưới) thì tấm che mất CHÍNH hàng cha: không còn thấy menu con thuộc
            // hàng nào, cũng không bấm lại để gập được — hay gặp với "Chỉnh sửa ▸" (##90), menu
            // con cao 6–7 hàng, mở từ nút ⋮ của một hàng ở nửa dưới màn hình điện thoại.
            const fitsBelow = rect.top + top + h <= window.innerHeight - VIEWPORT_MARGIN;
            const fitsAbove = rect.top - 2 - h >= VIEWPORT_MARGIN;
            if (!fitsBelow && fitsAbove) top = -(h + 2);
        }

        const overflowBottom = rect.top + top + h - (window.innerHeight - VIEWPORT_MARGIN);
        if (overflowBottom > 0) top -= overflowBottom;
        if (rect.top + top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN - rect.top;

        setPos({ side, beside, left, top, width });
    }, [preferredSide]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    const childCtx = useMemo(
        () => ({ ...ctx, side: pos?.side ?? preferredSide }),
        [ctx, pos?.side, preferredSide],
    );

    // Menu con là một LiquidGroup riêng: giọt nước của menu cha không lẫn sang hàng của nó.
    return (
        <LiquidGroup
            ref={panelRef}
            className={`${SUBMENU_SHELL} ${widthClass}`}
            style={{
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                width: pos?.width,
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            <GlassLight />
            {/* Cầu nối vô hình phủ khe giữa hai menu (cả padding + viền của menu cha):
                chuột đi ngang qua đó vẫn tính là đang ở trong hàng cha, nên menu con
                không gập giữa đường. Nới 24px trên/dưới cho đường chéo. Khi tấm đè lên
                menu cha thì không có khe nào để nối — và cầu lúc đó sẽ che mất các hàng
                của menu cha — nên bỏ. */}
            {pos?.beside && (
                <span
                    aria-hidden
                    className="absolute"
                    style={{
                        [pos.side === 'left' ? 'right' : 'left']: -SUBMENU_GAP,
                        top: -24,
                        width: SUBMENU_GAP,
                        height: 'calc(100% + 48px)',
                    }}
                />
            )}
            <SubmenuContext.Provider value={childCtx}>{children}</SubmenuContext.Provider>
        </LiquidGroup>
    );
}

/**
 * Nội dung menu con "Gắn nhãn ▸" (##91).
 *
 * Áp cho CẢ NHÓM đang chọn khi mục vừa bấm chuột phải nằm trong nhóm đó (như Google Drive), không
 * thì chỉ mục đó. Trạng thái tích đọc từ danh sách tệp ĐANG SỐNG (`useFiles().items`) chứ không từ
 * `item` của lần mở menu — `item` là ảnh chụp lúc bấm chuột phải, gắn xong một nhãn là nó cũ.
 * Bấm một nhãn KHÔNG đóng menu: gắn ba nhãn là ba cú bấm liền, không phải ba lần mở menu.
 *
 * Tích ✓ = mọi mục đã có nhãn (bấm là gỡ); gạch — = chỉ một phần có (bấm là gắn cho đủ).
 */
function TagMenu({ item, closeMenu }) {
    const { t } = useLanguage();
    const tagsCtx = useTags();
    const { items } = useFiles();
    const { selectedIds } = useFileSelection();
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);

    const targets = useMemo(() => {
        const ids = selectedIds?.has(item.id) && selectedIds.size > 1 ? [...selectedIds] : [item.id];
        return ids
            .map((id) => items.find((x) => x.id === id) ?? (id === item.id ? item : null))
            .filter(Boolean);
    }, [items, selectedIds, item]);

    if (!tagsCtx) return null;
    const { tags, setTagOn, createTag, openManager } = tagsCtx;

    const stateOf = (tag) => {
        const count = targets.filter((x) => (x.tags ?? []).some((own) => own.id === tag.id)).length;
        return count === 0 ? 'none' : count === targets.length ? 'all' : 'some';
    };

    const submitDraft = async () => {
        const name = (draft ?? '').trim();
        if (!name || busy) return;
        setBusy(true);
        const tag = await createTag({ name, colorHex: TAG_COLORS[tags.length % TAG_COLORS.length] });
        setBusy(false);
        if (tag) {
            setDraft(null);
            setTagOn(targets, tag, true);
        }
    };

    return (
        <>
            {targets.length > 1 && (
                <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    {t('tags.menu.forSelection', { count: targets.length })}
                </div>
            )}

            {tags.length === 0 && draft === null && (
                <div className="px-2.5 py-2 text-[12px] text-gray-500 dark:text-gray-400">{t('tags.menu.none')}</div>
            )}

            <div className="max-h-64 overflow-y-auto">
                {tags.map((tag) => {
                    const state = stateOf(tag);
                    return (
                        <MenuRow
                            key={tag.id}
                            role="menuitemcheckbox"
                            aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                            icon={
                                <span
                                    className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                                    style={{
                                        borderColor: tag.colorHex || DEFAULT_TAG_COLOR,
                                        backgroundColor: state === 'none' ? 'transparent' : tag.colorHex || DEFAULT_TAG_COLOR,
                                    }}
                                >
                                    {state === 'all' && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
                                    {state === 'some' && <Minus className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
                                </span>
                            }
                            label={tag.name}
                            onClick={() => setTagOn(targets, tag, state !== 'all')}
                        />
                    );
                })}
            </div>

            <MenuSeparator />

            {draft === null ? (
                <MenuRow
                    icon={<Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    label={t('tags.menu.new')}
                    onClick={() => setDraft('')}
                />
            ) : (
                <div className="px-1.5 py-1 flex items-center gap-1.5">
                    <input
                        autoFocus
                        value={draft}
                        maxLength={TAG_NAME_MAX}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                submitDraft();
                            }
                        }}
                        placeholder={t('tags.newPlaceholder')}
                        aria-label={t('tags.name')}
                        className="glass-input flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-[13px] outline-none focus:border-blue-500"
                    />
                    <button
                        type="button"
                        onClick={submitDraft}
                        disabled={busy || !draft.trim()}
                        title={t('tags.create')}
                        aria-label={t('tags.create')}
                        className="shrink-0 p-1.5 rounded-lg btn-accent hover:brightness-105 disabled:opacity-50 cursor-pointer"
                    >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}

            <MenuRow
                icon={<Settings2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                label={t('tags.menu.manage')}
                onClick={() => {
                    openManager();
                    closeMenu();
                }}
            />
        </>
    );
}

export default function ContextMenu({
    isOpen = true,
    x,
    y,
    item,
    // 'item'  → menu cho tệp/thư mục (mặc định, hành vi cũ của mọi trang)
    // 'drive' → menu cho thẻ Bộ nhớ dùng chung: chỉ Đổi tên / Gắn sao / Sao chép /
    //           Chia sẻ / Xóa (người tạo) hoặc Rời drive (người khác). Bỏ hẳn Xem trước, Tải xuống, Cắt, Dán, Hỏi Gemini,
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
    onMove,                 // "Di chuyển tới…" (##90) — mở MoveModal cho mục (hoặc cả tập đang chọn)
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
    onLeaveDrive,           // chỉ variant 'drive': thành viên không phải người tạo tự rời drive
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
    // Vai trò của mình trong Bộ nhớ chung chứa mục đang mở menu (##79). `null` = mục cá nhân hoặc
    // chưa nạp xong vai trò ⇒ hiện như cũ, backend vẫn là nơi chặn.
    const { driveRoleOf, currentUserId } = useDriveAccess();

    // Reposition menu to stay inside window bounds
    const [pos, setPos] = useState({ top: y, left: x });

    // Menu con đang mở (bảng màu là 'color', "Tạo mới ▸" là 'create'…) — xem SubmenuRow.
    // Gắn kèm KHOÁ của lần mở menu (mục + toạ độ) chứ không lưu mỗi đường dẫn:
    // component này KHÔNG remount khi bấm chuột phải sang mục khác (mọi trang đều giữ
    // một instance duy nhất), nên chỉ lưu đường dẫn thì menu con — và bảng màu với màu
    // của mục trước — vẫn mở nguyên ở lần mở sau.
    const [submenu, setSubmenu] = useState(null);
    const menuKey = `${item?.id ?? ''}@${x},${y}`;
    const openPath = submenu?.key === menuKey ? submenu.path : null;
    const showColorPicker = openPath === 'color';

    const setOpenPath = useCallback((next) => {
        setSubmenu((prev) => {
            const current = prev?.key === menuKey ? prev.path : null;
            const path = typeof next === 'function' ? next(current) : next;
            // Không đổi gì thì trả lại nguyên `prev`: hẹn giờ gập của một lần mở menu
            // TRƯỚC (khoá cũ) chạy muộn sẽ thấy `current` là null và không được phép xoá
            // trắng menu con của lần mở hiện tại.
            if (path === current) return prev;
            return path ? { key: menuKey, path } : null;
        });
    }, [menuKey]);

    const submenuContext = useMemo(
        () => ({ openPath, setOpenPath, rootRef: menuRef, side: 'right' }),
        [openPath, setOpenPath],
    );

    // Mọi lối đóng menu đều đi qua đây để menu con không còn mở sẵn ở lần mở sau.
    const closeMenu = useCallback(() => {
        setSubmenu(null);
        onClose?.();
    }, [onClose]);

    // Esc gập từng tầng menu con một, không đóng cả menu. Bảng màu tự lo phím Esc của
    // nó (ColorPickerPanel). Chặn nổi bọt để Esc không rơi xuống FileContext và xoá mất
    // bảng tạm Cắt/Sao chép đang chờ dán.
    useEffect(() => {
        if (!isOpen || !openPath || openPath === 'color') return undefined;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpenPath((current) => (current ? parentOf(current) : current));
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [isOpen, openPath, setOpenPath]);

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

    // Chỉ FileListView/FileGridView truyền ba lệnh này, nên menu của Trang chủ và của
    // thẻ Bộ nhớ dùng chung không có nhóm tạo mới.
    const hasCreateActions = onUploadFile || onUploadFolder || onCreateFolder;

    // Menu vùng trống không có `item` để làm mốc ẩn/hiện, nên phải dựa vào `isOpen`
    if (!isOpen) return null;

    if (!item && !hasCreateActions) return null;

    // Nhóm "Tải lên ▸ (tệp / thư mục)" + "Tạo thư mục mới". Menu vùng trống đặt nhóm
    // này thẳng ở tầng đầu; menu của tệp/thư mục đặt nó trong "Tạo mới ▸" — để ở danh
    // sách đã kín hàng (không còn chỗ trống nào để bấm chuột phải) vẫn tạo được.
    //
    // Mọi lệnh đều vào THƯ MỤC ĐANG MỞ, kể cả khi mở từ menu của một thư mục: giống nút
    // "+ Mới" và menu vùng trống. Tạo vào bên trong thư mục vừa bấm thì mục mới nằm ở
    // chỗ người dùng không nhìn thấy.
    const renderCreateRows = (uploadPath) => (
        <>
            <SubmenuRow
                path={uploadPath}
                tone="strong"
                icon={<Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                label={t('menu.upload')}
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
            </SubmenuRow>

            <MenuRow
                tone="strong"
                icon={<FolderPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                label={t('menu.newFolder')}
                onClick={() => { onCreateFolder?.(); closeMenu(); }}
            />
        </>
    );

    // SubmenuRow đọc trạng thái menu con qua context — bọc cả menu một lần ở đây.
    const withSubmenus = (menu) => (
        <SubmenuContext.Provider value={submenuContext}>{menu}</SubmenuContext.Provider>
    );

    // ── Menu cho vùng nền trống: tải lên ▸, tạo thư mục mới, dán ──
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

        return withSubmenus(
            <LiquidGroup
                ref={menuRef}
                className={MENU_SHELL}
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <GlassLight />
                {renderCreateRows('upload')}

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
            </LiquidGroup>
        );
    }

    // ── Menu cho thẻ Bộ nhớ dùng chung (SharedDrivesPage) ─────────────
    // Nhánh riêng, `return` sớm: một drive KHÔNG phải `file`/`folder` nên mọi logic
    // bên dưới (item.type, sharedRole, clipboard...) đều không áp dụng được.
    // `item` ở đây là object drive từ `GET /shared-drives`, được trang gắn thêm
    // `canDelete` (true khi người đang đăng nhập chính là `createdBy`).
    if (variant === 'drive') {
        const isDriveAdmin = item.userRole === 'ADMIN';

        return withSubmenus(
            <LiquidGroup
                ref={menuRef}
                className={MENU_SHELL}
                style={{ top: pos.top, left: pos.left }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <GlassLight />
                {/* Header */}
                <div className="px-2.5 pt-1 pb-2 mb-1 border-b text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 border-glass-divider">
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

                {/* Chỉnh sửa ▸ (##90) — cùng nhóm với menu của tệp/thư mục: Đổi tên & mô tả,
                    Sao chép tên, Gắn sao. */}
                <SubmenuRow
                    path="edit"
                    panelWidth="w-64"
                    icon={<SquarePen className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                    label={t('menu.edit')}
                >
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

                    {/* Sao chép tên drive — KHÔNG có deep-link tới một drive nên không copy link được */}
                    <MenuRow
                        icon={<Copy className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('menu.copyName')}
                        onClick={() => { onCopy?.(item); closeMenu(); }}
                    />

                    <MenuSeparator />

                    {/* Gắn sao — mọi thành viên đều làm được, và là dấu sao RIÊNG của người đang
                        đăng nhập (backend lưu ở hàng shared_drive_members của họ) */}
                    <MenuRow
                        icon={<Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'}`} />}
                        label={item.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                        onClick={() => { onToggleStar?.(item); closeMenu(); }}
                    />
                </SubmenuRow>

                <MenuSeparator />

                {/* Chia sẻ = quản lý thành viên (bảng shared_drive_members, KHÔNG phải file_shares) */}
                <MenuRow
                    icon={<UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                    label={t('menu.shareAndMembers')}
                    onClick={() => { onShare?.(item); closeMenu(); }}
                />

                <MenuSeparator />

                {/* Người tạo: Xóa drive. Người khác: Rời drive (backend cho mọi vai tự gỡ chính
                    mình, trừ người tạo). Cả hai đều mở hộp thoại xác nhận trước khi gọi API. */}
                {item.canDelete ? (
                    <MenuRow
                        tone="danger"
                        icon={<Trash2 className="w-4 h-4" />}
                        label={t('menu.deleteDrive')}
                        onClick={() => { onDeletePermanently?.(item); closeMenu(); }}
                    />
                ) : (
                    <MenuRow
                        tone="danger"
                        icon={<LogOut className="w-4 h-4" />}
                        label={t('menu.leaveDrive')}
                        onClick={() => { onLeaveDrive?.(item); closeMenu(); }}
                    />
                )}
            </LiquidGroup>
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
    //
    // Trong Bộ nhớ chung (##79): VIEWER chỉ xem — không Đổi tên / Cắt / Thùng rác / Đổi màu / Dán
    // vào thư mục; Chia sẻ (link + chia sẻ riêng) là của ADMIN, hoặc MEMBER với mục MÌNH tải lên
    // (backend `findSharingTarget`); xoá vĩnh viễn chỉ ADMIN.
    const driveRole = item.sharedDriveId ? driveRoleOf(item.sharedDriveId) : null;
    const isDriveViewer = driveRole === 'VIEWER';
    const isDriveSharingLocked =
        isDriveViewer || (driveRole === 'MEMBER' && currentUserId != null && item.ownerId !== currentUserId);
    const canDeleteForever = !item.sharedDriveId || driveRole == null || driveRole === 'ADMIN';

    const canRename = (!isShared || isEditorInShared) && !isDriveViewer;
    const canCut = (!isShared || isEditorInShared) && !isDriveViewer;
    const canTrash = !isShared && !isDriveViewer;
    const canShare = !isShared && !isDriveSharingLocked; // Chỉ owner (hoặc ADMIN drive) mới chia sẻ được
    // Dán VÀO một thư mục được chia sẻ cần quyền EDITOR — VIEWER bấm vào chỉ nhận 403
    const canPasteIntoItem = (!isShared || !isFolder || isEditorInShared) && !isDriveViewer;
    // Dấu sao lưu trên chính hàng `files` (cột is_starred) nên nó là dấu sao CỦA CHỦ
    // SỞ HỮU, không phải của từng người xem. Backend vì thế chỉ cho owner đổi; ẩn nút
    // đi thay vì để người dùng bấm rồi nhận 403.
    const canToggleStar = !item.isSharedWithMe;

    return withSubmenus(
        <LiquidGroup
            ref={menuRef}
            className={MENU_SHELL}
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <GlassLight />
            {/* Header */}
            <div className="px-2.5 pt-1 pb-2 mb-1 border-b text-xs font-bold text-gray-700 dark:text-gray-400 flex items-center gap-2 border-glass-divider">
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

                    {/* Mục trong Bộ nhớ chung: chỉ ADMIN xoá vĩnh viễn (MEMBER khôi phục được, xoá
                        hẳn thì không — "Dọn thùng rác" cũng giữ lại chúng). */}
                    {canDeleteForever ? (
                        <MenuRow
                            tone="danger"
                            icon={<Trash2 className="w-4 h-4" />}
                            label={t('common.deleteForever')}
                            onClick={() => { onDeletePermanently?.(item); closeMenu(); }}
                        />
                    ) : (
                        <MenuRowLocked label={t('common.deleteForever')} hint={t('menu.needAdmin')} />
                    )}
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

                    {/* Tạo mới ▸ — cùng nhóm lệnh với menu vùng trống (xem renderCreateRows).
                        Ở dạng danh sách, hàng nối hàng kín cả khung nên gần như không còn chỗ
                        trống để bấm chuột phải; không có mục này thì muốn tải lên phải rời
                        tay khỏi danh sách để tìm nút "+ Mới". */}
                    {hasCreateActions && (
                        <SubmenuRow
                            path="create"
                            tone="strong"
                            icon={<Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                            label={t('menu.createNew')}
                        >
                            {renderCreateRows('create/upload')}
                        </SubmenuRow>
                    )}

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

                    {/* 4. Chỉnh sửa ▸ (##90) — Đổi tên, Cắt / Sao chép / Dán, Di chuyển tới…, Gắn sao.
                        Trước đây sáu lệnh này nằm thẳng ở tầng đầu, kéo menu dài tới 16 hàng; gom
                        vào một menu con (rê chuột là mở, chạm/bàn phím thì bấm) cho tầng đầu chỉ còn
                        những việc làm NGAY: Hỏi AI, xem, tải, chia sẻ, chi tiết, thùng rác. Phím tắt
                        của từng lệnh vẫn in bên phải hàng của nó. */}
                    <SubmenuRow
                        path="edit"
                        panelWidth="w-64"
                        icon={<SquarePen className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('menu.edit')}
                    >
                        {/* Đổi tên — khoá nếu VIEWER trong shared-with-me.
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

                        {/* Separator: nhóm clipboard + di chuyển */}
                        <MenuSeparator />

                        {/* Cắt — ẩn trong shared-with-me */}
                        {canCut && (
                            <MenuRow
                                icon={<Scissors className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                                label={t('common.cut')}
                                shortcut="Ctrl+X"
                                onClick={() => { onCut?.(item); closeMenu(); }}
                            />
                        )}

                        {/* Sao chép */}
                        <MenuRow
                            icon={<Copy className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('common.copy')}
                            shortcut="Ctrl+C"
                            onClick={() => { onCopy?.(item); closeMenu(); }}
                        />

                        {/* Dán — chỉ hiện khi có mục trong clipboard. Nằm ngay sau
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

                        {/* Di chuyển tới… — chọn thư mục đích trong hộp thoại (MoveModal), khỏi phải
                            Cắt rồi tự đi tới đó Dán. Cùng quyền với Cắt. */}
                        {canCut && onMove && (
                            <MenuRow
                                icon={<FolderSymlink className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                                label={t('menu.moveTo')}
                                onClick={() => { onMove(item); closeMenu(); }}
                            />
                        )}

                        {/* Gắn dấu sao — ẩn với tệp được người khác chia sẻ */}
                        {canToggleStar && (
                            <>
                                <MenuSeparator />
                                <MenuRow
                                    icon={<Star className={`w-4 h-4 ${item.isStarred ? 'text-amber-600 dark:text-amber-400 fill-amber-400' : 'text-gray-700 dark:text-gray-300'}`} />}
                                    label={item.isStarred ? t('menu.star.remove') : t('menu.star.add')}
                                    onClick={() => { onToggleStar?.(item); closeMenu(); }}
                                />
                            </>
                        )}
                    </SubmenuRow>

                    {/* 4b. Gắn nhãn ▸ (##91) — nhãn là của RIÊNG người dùng nên mọi mục xem được
                        đều gắn được, kể cả tệp người khác chia sẻ và tệp chỉ-xem trong Bộ nhớ chung. */}
                    <SubmenuRow
                        path="tags"
                        panelWidth="w-64"
                        icon={<Tag className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('tags.menu.title')}
                    >
                        <TagMenu item={item} closeMenu={closeMenu} />
                    </SubmenuRow>

                    <MenuSeparator />

                    {/* 5. Chia sẻ — chỉ hiển thị khi là owner */}
                    {canShare && (
                        <MenuRow
                            icon={<UserPlus className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                            label={t('menu.share')}
                            onClick={() => { onShare?.(item); closeMenu(); }}
                        />
                    )}

                    {/* 6. Thông tin chi tiết & hoạt động */}
                    <MenuRow
                        icon={<Info className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                        label={t('menu.details')}
                        onClick={() => { onShowInfo?.(item, 'details'); closeMenu(); }}
                    />

                    {/* 7. Đổi màu — chỉ hiện khi owner hoặc EDITOR trong shared.
                        Bảng màu bung SANG PHẢI (submenu) chứ không chèn vào giữa menu:
                        ColorPickerPanel định vị `absolute` theo chính div bọc này, nên
                        div này bắt buộc phải là `relative`. */}
                    {onChangeColor && !item.isSharedWithMe && !isDriveViewer && (
                        <div className="relative">
                            <MenuRow
                                icon={<Palette className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                                label={t('menu.changeColor')}
                                onClick={() => setOpenPath((path) => (path === 'color' ? null : 'color'))}
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
                                    onClose={() => setOpenPath(null)}
                                    onCloseMenu={closeMenu}
                                />
                            )}
                        </div>
                    )}

                    {/* Separator: nhóm huỷ bỏ */}
                    <MenuSeparator />

                    {/* 8. Chuyển vào thùng rác — ẩn trong shared-with-me */}
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

                    {/* 9. Không phải mục đề xuất hữu ích — chỉ ẩn khỏi Trang chủ.
                         Khoá dịch trước đây là `menu.notSpam`, dùng lại từ nhóm Nội
                         dung rác: bản tiếng Việt đã được sửa thành câu đúng nhưng bản
                         tiếng Anh vẫn đọc là "Not spam", tức người chọn English được
                         mời gỡ một tệp khỏi thư mục rác mà nó chưa từng nằm trong đó. */}
                    {/* Chỉ menu của các MỤC GỢI Ý (HomePage truyền `onDismissSuggestion`): trang kết quả
                        tìm kiếm cũng ở tab 'home' nhưng không có gợi ý nào để ẩn (##90). */}
                    {activeTab === 'home' && onDismissSuggestion && (
                        <MenuRow
                            icon={<ThumbsDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                            label={t('menu.dismissSuggestion')}
                            onClick={() => { onDismissSuggestion?.(item); closeMenu(); }}
                        />
                    )}
                </>
            )}
        </LiquidGroup>
    );
}
