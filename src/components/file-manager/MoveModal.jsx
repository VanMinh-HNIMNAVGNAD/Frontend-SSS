import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ChevronRight,
    Folder,
    FolderGit2,
    FolderSymlink,
    HardDrive,
    Loader2,
    Users,
    X,
} from 'lucide-react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { filesApi, sharedDrivesApi } from '../../services/api';
import { getCardColorVars } from '../../utils/fileColors';

// Trần `limit` của `GET /files` (backend `GetFilesQueryDto`): thư mục có hơn số này thư mục con
// thì hộp thoại nói rõ là chỉ hiện phần đầu, thay vì lặng lẽ thiếu.
const FOLDER_PAGE_LIMIT = 200;

/** Chặng "Tất cả vị trí" — danh sách các vùng (Drive của tôi + từng Bộ nhớ chung ghi được). */
const ROOTS = { area: 'roots', folderId: null };

/**
 * Hộp thoại "Di chuyển tới…" (##90) — mở từ menu chuột phải › Chỉnh sửa.
 *
 * Trước đây muốn chuyển một tệp sang thư mục khác chỉ có cách Cắt, tự đi tới thư mục đích rồi
 * Dán. Ở đây duyệt cây thư mục ngay trong hộp thoại rồi bấm "Di chuyển tới đây".
 *
 * Nơi đích hiện ra theo đúng luật backend (`moveItem`): mục của mình / của Bộ nhớ chung thì đi
 * được vào Drive của tôi và các Bộ nhớ chung mình là ADMIN/MEMBER; mục NGƯỜI KHÁC chia sẻ cho mình
 * (EDITOR) chỉ được sắp xếp lại bên trong cây được chia sẻ — nên chỉ hiện "Được chia sẻ với tôi".
 * Backend vẫn là nơi chặn cuối (vd. MEMBER chuyển tệp người khác ra khỏi drive): lỗi hiện ở toast.
 *
 * Dựng lại mỗi lần mở (như `SearchFilterModal`): vị trí đang duyệt của lần trước không được sống
 * sang lần mở cho mục khác.
 */
export default function MoveModal({ isOpen, items, onClose, onMoved }) {
    if (!isOpen || !items?.length) return null;
    return <MovePanel items={items} onClose={onClose} onMoved={onMoved} />;
}

function MovePanel({ items, onClose, onMoved }) {
    const { t } = useLanguage();
    const { moveItemsTo } = useFiles();

    const isForeign = items.some((item) => item.isSharedWithMe);
    const movingIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

    // Vùng đang chứa các mục + thư mục cha chung của chúng (nếu cùng một cha) — điểm bắt đầu duyệt.
    const first = items[0];
    const commonParentId = items.every((item) => (item.parentId ?? null) === (first.parentId ?? null))
        ? first.parentId ?? null
        : null;
    const commonDriveId = !isForeign && items.every((item) => (item.sharedDriveId ?? null) === (first.sharedDriveId ?? null))
        ? first.sharedDriveId ?? null
        : null;

    const rootCrumb = useCallback((area, extra = {}) => {
        if (area === 'my-drive') return { area, folderId: null, name: t('nav.myDrive'), ...extra };
        if (area === 'shared') return { area, folderId: null, name: t('nav.sharedWithMe'), ...extra };
        return { area, folderId: null, ...extra };
    }, [t]);

    // Đường đang đứng: chặng cuối là nơi "Di chuyển tới đây" sẽ chuyển vào. Mở ra là đứng NGAY
    // trong thư mục đang chứa các mục (Drive của tôi / Được chia sẻ): lượt tải thư mục con đầu tiên
    // trả kèm breadcrumb của nó (`unresolved` — xem effect tải danh sách), nên lên thư mục cha hay
    // sang thư mục bên cạnh chỉ một cú bấm. Bộ nhớ chung không có breadcrumb từ backend ⇒ gốc drive.
    const baseTrail = useMemo(() => {
        if (isForeign) return [rootCrumb('shared')];
        if (commonDriveId) return [ROOTS, rootCrumb('drive', { driveId: commonDriveId, name: '' })];
        return [ROOTS, rootCrumb('my-drive')];
    }, [isForeign, commonDriveId, rootCrumb]);
    const [trail, setTrail] = useState(() =>
        commonParentId && !commonDriveId
            ? [
                ...baseTrail,
                {
                    area: isForeign ? 'shared' : 'my-drive',
                    folderId: commonParentId,
                    name: '',
                    // Các mục đang chuyển nằm trong thư mục này: vai của mình ở đó là vai với chính chúng.
                    role: isForeign ? first.sharedRole : undefined,
                    unresolved: true,
                },
            ]
            : baseTrail,
    );
    const location = trail[trail.length - 1];

    const [drives, setDrives] = useState(null); // Bộ nhớ chung mình GHI được — null: đang tải
    // Thư mục con của MỘT chỗ: `key` nói nó thuộc chỗ nào, nên đổi chỗ là tự thành "đang tải"
    // mà không phải setState ngay trong effect.
    const [listing, setListing] = useState({ key: null, status: 'loading', folders: [], truncated: false });
    const [reloadKey, setReloadKey] = useState(0);
    const [isMoving, setIsMoving] = useState(false);
    const listingKey = `${location.area}:${location.driveId ?? ''}:${location.folderId ?? ''}:${reloadKey}`;

    // Danh sách Bộ nhớ chung (qua bộ đệm 60 giây của `sharedDrivesApi`) — cho chặng "Tất cả vị
    // trí" và tên drive ở chặng gốc của drive.
    useEffect(() => {
        if (isForeign) return undefined;
        let cancelled = false;
        sharedDrivesApi
            .getAll()
            .then((list) => {
                if (cancelled) return;
                const all = Array.isArray(list) ? list : [];
                setDrives(all.filter((d) => ['ADMIN', 'MEMBER'].includes(d.userRole)));
                // Chặng gốc drive dựng trước khi biết tên — điền tên vào.
                setTrail((prev) => prev.map((crumb) =>
                    crumb.area === 'drive' && !crumb.folderId && !crumb.name
                        ? { ...crumb, name: all.find((d) => d.id === crumb.driveId)?.name || '' }
                        : crumb,
                ));
            })
            .catch(() => {
                if (!cancelled) setDrives([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isForeign]);

    // Thư mục con của chỗ đang đứng ("Tất cả vị trí" là danh sách cố định, không tải gì).
    useEffect(() => {
        if (location.area === 'roots') return undefined;
        let cancelled = false;
        const params = {
            tab: location.area === 'drive' ? 'shared-drives' : location.area === 'shared' ? 'shared-with-me' : 'my-drive',
            folderId: location.folderId || undefined,
            sharedDriveId: location.area === 'drive' ? location.driveId : undefined,
            filterType: 'folder',
            sortBy: 'name',
            sortDir: 'asc',
            page: 1,
            limit: FOLDER_PAGE_LIMIT,
        };
        filesApi
            .getFilesAndFolders(params, { background: true })
            .then((res) => {
                if (cancelled) return;
                if (location.unresolved) {
                    // Chặng mở đầu: thay bằng đường thật (tổ tiên + tên thư mục) từ breadcrumb.
                    const crumbs = (Array.isArray(res?.breadcrumb) ? res.breadcrumb : [])
                        .filter((crumb) => crumb.id)
                        .map((crumb) => ({ area: location.area, folderId: crumb.id, name: crumb.name }));
                    if (crumbs.length > 0) crumbs[crumbs.length - 1].role = location.role;
                    setTrail([...baseTrail, ...crumbs]);
                }
                const list = (res?.items || []).filter((item) => item.type === 'folder');
                const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
                setListing({
                    key: listingKey,
                    status: 'ready',
                    folders: list.sort((a, b) => collator.compare(a.name || '', b.name || '')),
                    truncated: (res?.meta?.total ?? list.length) > list.length,
                });
            })
            .catch(() => {
                if (cancelled) return;
                // Thư mục đang chứa các mục mà không mở được (vd. của chủ, phía trên chỗ được chia
                // sẻ): bắt đầu ở gốc thay vì đứng trên một chặng không tên với câu lỗi.
                if (location.unresolved) setTrail(baseTrail);
                else setListing({ key: listingKey, status: 'error', folders: [], truncated: false });
            });
        return () => {
            cancelled = true;
        };
        // `location.unresolved`/`role` chỉ đọc lúc phản hồi về; đổi chúng (điền breadcrumb) không
        // được tải lại cùng một thư mục — `listingKey` đã gồm đúng những gì quyết định danh sách.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listingKey, baseTrail]);

    const status = location.area === 'roots' ? 'ready' : listing.key === listingKey ? listing.status : 'loading';
    const folders = listing.key === listingKey ? listing.folders : [];
    const isTruncated = listing.key === listingKey && listing.truncated;

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && !isMoving) onClose?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isMoving, onClose]);

    const openCrumb = (index) => setTrail((prev) => prev.slice(0, index + 1));
    const enterFolder = (folder) =>
        setTrail((prev) => [
            ...prev,
            {
                area: location.area,
                driveId: location.driveId,
                folderId: folder.id,
                name: folder.name,
                role: location.area === 'shared' ? folder.sharedRole : undefined,
            },
        ]);
    const enterArea = (crumb) => setTrail((prev) => [...prev, crumb]);

    const crumbLabel = (crumb) => (crumb.area === 'roots' ? t('move.allLocations') : crumb.name || '…');

    // Không chuyển được vào chỗ đang đứng thì nói vì sao ngay trên nút.
    const destination = {
        folderId: location.folderId,
        sharedDriveId: location.area === 'drive' ? location.driveId : null,
    };
    const isSamePlace = (item) =>
        destination.folderId
            ? (item.parentId ?? null) === destination.folderId
            : (item.parentId ?? null) === null && (item.sharedDriveId ?? null) === (destination.sharedDriveId ?? null);
    let blockedReason = '';
    if (location.area === 'roots' || (location.area === 'shared' && !location.folderId)) {
        blockedReason = t('move.pickFolder');
    } else if (location.role === 'VIEWER') {
        blockedReason = t('move.viewerOnly');
    } else if (items.every(isSamePlace)) {
        blockedReason = t('move.alreadyHere');
    }

    const handleMove = async () => {
        if (blockedReason || isMoving) return;
        setIsMoving(true);
        let moved;
        try {
            // Lỗi từng mục đã được `moveItemsTo` báo (một toast) — ở đây chỉ báo phần đã xong.
            ({ moved } = await moveItemsTo(items, destination));
        } finally {
            setIsMoving(false);
        }
        if (moved > 0) {
            toast.success(t('move.done', { count: moved, name: crumbLabel(location) }));
            onMoved?.();
        }
        onClose?.();
    };

    const title = items.length === 1
        ? t('move.title.one', { name: first.name })
        : t('move.title.many', { count: items.length });

    const rowClass =
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors';

    return (
        <div
            className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4 animate-fade-in cursor-pointer"
            onClick={() => { if (!isMoving) onClose?.(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="move-modal-title"
                className="glass-strong relative dark:text-gray-100 rounded-[20px] w-full max-w-md border overflow-hidden cursor-default flex flex-col max-h-[calc(100dvh-2rem)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-glass-divider">
                    <div className="flex items-center gap-2.5 min-w-0 font-semibold text-lg text-gray-800 dark:text-gray-100">
                        <FolderSymlink className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span id="move-modal-title" className="truncate" title={title}>{title}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isMoving}
                        aria-label={t('common.close')}
                        className="p-1 rounded-full shrink-0 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Đường đang đứng — bấm một chặng để quay lên */}
                <nav
                    aria-label={t('move.breadcrumb')}
                    className="flex flex-wrap items-center gap-0.5 px-5 pt-3 pb-2 text-[13px] font-medium"
                >
                    {trail.map((crumb, index) => {
                        const isLast = index === trail.length - 1;
                        return (
                            <span key={`${crumb.area}:${crumb.driveId ?? ''}:${crumb.folderId ?? ''}`} className="flex items-center gap-0.5 min-w-0">
                                {index > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
                                {isLast ? (
                                    <span className="px-1.5 py-0.5 truncate max-w-[14rem] text-gray-900 dark:text-gray-100" aria-current="location">
                                        {crumbLabel(crumb)}
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openCrumb(index)}
                                        disabled={isMoving}
                                        className="px-1.5 py-0.5 rounded-md truncate max-w-[10rem] text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer"
                                    >
                                        {crumbLabel(crumb)}
                                    </button>
                                )}
                            </span>
                        );
                    })}
                </nav>

                {/* Danh sách nơi có thể đi vào */}
                <div className="px-3 pb-2 overflow-y-auto min-h-[12rem] max-h-[50vh]">
                    {location.area === 'roots' ? (
                        <ul className="space-y-0.5">
                            <li>
                                <button type="button" className={`${rowClass} hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer`} onClick={() => enterArea(rootCrumb('my-drive'))}>
                                    <HardDrive className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                                    <span className="flex-1 min-w-0 truncate font-medium">{t('nav.myDrive')}</span>
                                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                                </button>
                            </li>
                            {drives === null ? (
                                <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 className="w-4 h-4 animate-spin" /> {t('move.loading')}
                                </li>
                            ) : (
                                drives.map((drive) => (
                                    <li key={drive.id}>
                                        <button
                                            type="button"
                                            className={`${rowClass} hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer`}
                                            onClick={() => enterArea(rootCrumb('drive', { driveId: drive.id, name: drive.name }))}
                                        >
                                            <FolderGit2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                            <span className="flex-1 min-w-0 truncate font-medium">{drive.name}</span>
                                            <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    ) : status === 'loading' ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> {t('move.loading')}
                        </div>
                    ) : status === 'error' ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-gray-600 dark:text-gray-300">
                            <span>{t('move.loadFailed')}</span>
                            <button
                                type="button"
                                onClick={() => setReloadKey((n) => n + 1)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                            >
                                {t('move.retry')}
                            </button>
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
                            {location.area === 'shared' && !location.folderId
                                ? <Users className="w-8 h-8 stroke-1 text-gray-300 dark:text-gray-600" />
                                : <Folder className="w-8 h-8 stroke-1 text-gray-300 dark:text-gray-600" />}
                            <span>{t('move.empty')}</span>
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {folders.map((folder) => {
                                // Chuyển một thư mục vào chính nó (hay vào cây con của nó, chỉ tới được qua nó) là vô nghĩa.
                                const isSelf = movingIds.has(folder.id);
                                return (
                                    <li key={folder.id}>
                                        <button
                                            type="button"
                                            disabled={isSelf || isMoving}
                                            title={isSelf ? t('move.selfFolder') : folder.name}
                                            onClick={() => enterFolder(folder)}
                                            style={getCardColorVars(folder)}
                                            className={`${rowClass} ${isSelf ? 'opacity-45 cursor-not-allowed' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer'}`}
                                        >
                                            <Folder className="w-4 h-4 shrink-0 fill-current text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)]" />
                                            <span className="flex-1 min-w-0 truncate">{folder.name}</span>
                                            {location.area === 'shared' && folder.sharedRole === 'VIEWER' && (
                                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
                                                    {t('list.role.viewer')}
                                                </span>
                                            )}
                                            {!isSelf && <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {isTruncated && status === 'ready' && (
                        <p className="px-3 pt-2 text-xs text-gray-500 dark:text-gray-400">
                            {t('move.truncated', { count: FOLDER_PAGE_LIMIT })}
                        </p>
                    )}
                </div>

                {/* Chân: lý do chưa chuyển được + nút. Màn hẹp: lý do một dòng riêng phía trên —
                    chung hàng với hai nút thì ở 390px chỉ còn "Mục đang ...". */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-6 py-4 border-t border-glass-divider">
                    <span className="min-w-0 text-xs text-gray-500 dark:text-gray-400 sm:truncate" title={blockedReason}>
                        {blockedReason}
                    </span>
                    <div className="flex items-center justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isMoving}
                            className="px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleMove}
                            disabled={Boolean(blockedReason) || isMoving}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold btn-accent hover:brightness-105 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                            {isMoving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isMoving ? t('move.moving') : t('move.here')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
