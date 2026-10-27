import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useFilePreview } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { filesApi } from '../../services/api';
import { formatBytes } from '../../utils/formatFileSize';
import { localeTagOf } from '../../utils/locale';
import LiquidGroup from '../ui/LiquidGroup';
import { getFileIcon } from '../../utils/getFileIcon';
import { 
    X, 
    User, 
    Clock, 
    HardDrive, 
    FolderTree, 
    Lock, 
    Share2, 
    Pencil, 
    Sparkles, 
    Activity as ActivityIcon, 
    Info as InfoIcon,
    History,
    Shield,
    Users,
    Eye,
    AlertCircle,
    RotateCcw,
    Trash2,
    Upload,
    Download,
    Star,
    Copy,
    RefreshCw,
    Loader2
} from 'lucide-react';

export default function FileInfoDrawer({ isOpen, item, activeTab = 'details', onClose, onOpenShare, onOpenRename }) {
    const { openPreview } = useFilePreview();
    const { t, language } = useLanguage();
    const locale = localeTagOf(language);
    const [currentTab, setCurrentTab] = useState(activeTab);
    const [versions, setVersions] = useState(null);
    // `{ id, message }` — lỗi nạp phiên bản của tệp `id` (##79: trước đây chỉ console.error).
    const [versionsError, setVersionsError] = useState(null);
    const [activityLogs, setActivityLogs] = useState([]);
    const [activityError, setActivityError] = useState(null);
    const [loadingTab, setLoadingTab] = useState(false);

    useEffect(() => {
        if (activeTab) {
            setCurrentTab(activeTab);
        }
    }, [activeTab, isOpen]);

    const fetchActivityLogs = () => {
        if (!item?.id) return;
        setLoadingTab(true);
        setActivityError(null);
        filesApi.getActivityLogs(item.id)
            .then((data) => {
                setActivityLogs(Array.isArray(data) ? data : []);
            })
            .catch((err) => {
                console.error('[Activity Logs Error]', err);
                setActivityError(err.message || t('activity.loadFailed'));
            })
            .finally(() => {
                setLoadingTab(false);
            });
    };

    useEffect(() => {
        if (!isOpen || !item) return;
        if (currentTab === 'versions' && item.type !== 'folder') {
            setLoadingTab(true);
            const forId = item.id;
            filesApi.getFileVersions(forId)
                .then((data) => setVersions(data))
                .catch((err) => setVersionsError({ id: forId, message: err.message || t('info.versions.none') }))
                .finally(() => setLoadingTab(false));
        } else if (currentTab === 'activity') {
            fetchActivityLogs();
        }
    }, [isOpen, item?.id, currentTab]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !item) return null;

    const isFolder = item.type === 'folder';
    // Chỉ hiện dữ liệu/lỗi phiên bản CỦA ĐÚNG tệp đang mở. Ngăn này không remount khi đổi tệp,
    // nên trước ##79 tệp nạp lỗi (vd. 404) vẫn hiện "Phiên bản hiện tại" — tên, dung lượng — của
    // tệp xem TRƯỚC đó.
    const shownVersions = versions?.currentVersion?.id === item.id ? versions : null;
    const shownVersionsError = versionsError?.id === item.id ? versionsError.message : null;

    // Icon lớn ở đầu ngăn: cùng màu (đã dịu) với icon ở danh sách/lưới — bản cũ có bảng màu riêng
    // (thư mục hổ phách, PDF hồng, ảnh tím…) lệch với chính tệp đó ở ngoài danh sách.
    const getFileIconLarge = () => (
        <span className="glass-soft w-12 h-12 rounded-2xl flex items-center justify-center">
            {getFileIcon(item, 'w-6 h-6')}
        </span>
    );

    const getActivityMeta = (action = '') => {
        const act = (action || '').toUpperCase();
        if (act.includes('UPLOAD')) {
            return {
                label: t('activity.action.uploadFile'),
                icon: Upload,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('RENAME')) {
            return {
                label: t('activity.action.rename'),
                icon: Pencil,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('SHARE')) {
            return {
                label: t('info.action.shareLink'),
                icon: Share2,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        // Phải đứng TRƯỚC nhánh TRASH/DELETE: 'MARK_NOT_SPAM' không chứa hai chữ đó,
        // nhưng để rơi xuống cuối thì nhãn hiện ra là chuỗi thô "Mark Not Spam".
        if (act.includes('NOT_SPAM')) {
            return {
                label: t('activity.action.notSpam'),
                icon: RotateCcw,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('RESTORE')) {
            return {
                label: t('activity.action.restore'),
                icon: RotateCcw,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('TRASH') || act.includes('DELETE')) {
            return {
                label: act.includes('PERMANENT') ? t('activity.action.deleteForever') : t('activity.action.trash'),
                icon: Trash2,
                colorClass: 'text-[var(--tone-danger)]',
                bgClass: 'bg-[var(--tone-danger-soft)]',
            };
        }
        if (act.includes('STAR')) {
            return {
                label: t('info.action.star'),
                icon: Star,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('COPY')) {
            return {
                label: t('activity.action.copy'),
                icon: Copy,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('VERSION')) {
            return {
                label: t('info.action.newVersion'),
                icon: History,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        if (act.includes('DOWNLOAD')) {
            return {
                label: t('common.download'),
                icon: Download,
                colorClass: 'text-[var(--ink-muted)]',
                bgClass: 'bg-[var(--chip-fill)]',
            };
        }
        const formatted = action
            ? action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
            : t('activity.action.other');
        return {
            label: formatted,
            icon: ActivityIcon,
            colorClass: 'text-[var(--ink-muted)]',
            bgClass: 'bg-[var(--chip-fill)]',
        };
    };

    const renderActivityDescription = (log) => {
        if (!log || !log.details || typeof log.details !== 'object' || Object.keys(log.details).length === 0) {
            return null;
        }
        const d = log.details;
        const action = (log.action || '').toUpperCase();

        if (action.includes('RENAME')) {
            if (d.oldName && d.newName) {
                return t('info.desc.renameFromTo', { old: d.oldName, new: d.newName });
            }
            if (d.newName) {
                return t('info.desc.renameTo', { new: d.newName });
            }
        }

        if (action.includes('UPLOAD')) {
            const parts = [];
            if (d.fileName || d.name) parts.push(t('info.desc.file', { name: d.fileName || d.name }));
            if (d.sizeBytes || d.size) parts.push(t('info.desc.size', { size: formatBytes(d.sizeBytes || d.size) }));
            if (d.storageProvider || d.provider) parts.push(t('info.desc.provider', { provider: d.storageProvider || d.provider }));
            return parts.length > 0 ? parts.join(' • ') : null;
        }

        if (action.includes('SHARE')) {
            const parts = [];
            if (d.accessLevel) {
                const accessMap = {
                    ANYONE_WITH_LINK: t('info.access.anyoneWithLink'),
                    RESTRICTED: t('info.access.restricted'),
                };
                parts.push(t('info.desc.access', { access: accessMap[d.accessLevel] || d.accessLevel }));
            }
            if (d.role) {
                const roleMap = {
                    VIEWER: t('list.role.viewer'),
                    EDITOR: t('menu.roleEditor'),
                    COMMENTER: t('info.role.commenter'),
                };
                parts.push(t('info.desc.role', { role: roleMap[d.role] || d.role }));
            }
            if (d.expiresAt) {
                parts.push(t('info.desc.expiry', { date: new Date(d.expiresAt).toLocaleDateString(locale) }));
            } else if (d.accessLevel || d.role) {
                parts.push(t('info.desc.noExpiry'));
            }
            return parts.length > 0 ? parts.join(' • ') : t('activity.action.shareLink');
        }

        if (action.includes('VERSION')) {
            const parts = [];
            if (d.versionNumber) parts.push(t('info.desc.version', { number: d.versionNumber }));
            if (d.sizeBytes || d.size) parts.push(t('info.desc.size', { size: formatBytes(d.sizeBytes || d.size) }));
            return parts.length > 0 ? parts.join(' • ') : null;
        }

        if (action.includes('COPY')) {
            if (d.newName || d.name) {
                return t('info.desc.copyMade', { name: d.newName || d.name });
            }
        }

        // Generic details format
        try {
            const entries = Object.entries(d).filter(([k, v]) => v !== null && v !== undefined && typeof v !== 'object');
            if (entries.length > 0) {
                return entries.map(([k, v]) => `${k}: ${v}`).join(' • ');
            }
            return JSON.stringify(d);
        } catch {
            return null;
        }
    };

    return (
        <>
            {/* Transparent backdrop overlay */}
            <div 
                className="fixed inset-0 glass-overlay z-40 animate-fade-in cursor-pointer"
                onClick={onClose}
            />
            <aside 
                className="glass-strong fixed right-0 top-0 bottom-0 sm:right-3 sm:top-3 sm:bottom-3 z-50 w-full sm:w-96 sm:rounded-[26px] flex flex-col font-sans animate-slide-left text-xs text-gray-800 dark:text-gray-200 overflow-hidden cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-glass-divider">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {getFileIconLarge() && <div className="shrink-0">{getFileIconLarge()}</div>}
                    <div className="min-w-0">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate" title={item.name}>
                            {item.name}
                        </h3>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium truncate">
                            {isFolder ? t('fileType.folder') : item.mimeType || t('info.type.dataFile')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-full text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors shrink-0 cursor-pointer"
                    title={t('common.close')}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Tab Navigation */}
            {/* Thanh phân đoạn kính (segmented control) thay cho tab gạch chân trên nền xám. Giọt kính
                "đang chọn" nhảy giữa các tab (LiquidGroup). */}
            <LiquidGroup activeKey={currentTab} className="flex gap-1 mx-4 mt-3 mb-1 p-1 rounded-full glass-soft">
                <button
                    data-liquid-key="details"
                    onClick={() => setCurrentTab('details')}
                    aria-pressed={currentTab === 'details'}
                    className={`flex-1 py-1.5 rounded-full text-center font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        currentTab === 'details'
                            ? 'text-[var(--ink)] font-semibold'
                            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                    }`}
                >
                    <InfoIcon className="w-3.5 h-3.5" />
                    <span>{t('info.tab.details')}</span>
                </button>

                <button
                    data-liquid-key="activity"
                    onClick={() => setCurrentTab('activity')}
                    aria-pressed={currentTab === 'activity'}
                    className={`flex-1 py-1.5 rounded-full text-center font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        currentTab === 'activity'
                            ? 'text-[var(--ink)] font-semibold'
                            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                    }`}
                >
                    <ActivityIcon className="w-3.5 h-3.5" />
                    <span>{t('info.tab.activity')}</span>
                </button>

                {!isFolder && (
                    <button
                        data-liquid-key="versions"
                        onClick={() => setCurrentTab('versions')}
                        aria-pressed={currentTab === 'versions'}
                        className={`flex-1 py-1.5 rounded-full text-center font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                            currentTab === 'versions'
                                ? 'text-[var(--ink)] font-semibold'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                        }`}
                    >
                        <History className="w-3.5 h-3.5" />
                        <span>{t('info.tab.versions')}</span>
                    </button>
                )}
            </LiquidGroup>

            {/* Tab Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {currentTab === 'details' ? (
                    <>
                        {/* Access & Sharing Section */}
                        <div className="space-y-2.5">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-wider text-[11px]">
                                {t('info.access.heading')}
                            </h4>
                            <div className="glass-soft flex items-center justify-between p-3 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 dark:from-zinc-500 dark:to-zinc-700 text-white font-semibold flex items-center justify-center text-xs">
                                        {(item.owner || t('list.owner.me')).charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{item.owner || t('list.owner.me')}</p>
                                        {/* Trước ##81 là dòng giữ chỗ "Group: dev-team" — dữ liệu giả, không dịch được. */}
                                        <p className="text-[10px] text-gray-400">{t('list.col.owner')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {!isFolder && (
                                        <button
                                            onClick={() => { openPreview(item); onClose?.(); }}
                                            className="glass-soft px-2.5 py-1.5 text-[var(--ink)] rounded-full font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                        >
                                            <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)]" /> {t('menu.preview')}
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            // Snapshot item trước khi drawer unmount
                                            const currentItem = item;
                                            // flushSync: ép React flush onClose() đồng bộ
                                            // (unmount FileInfoDrawer hoàn toàn) trước khi
                                            // setShareTargetItem → tránh race condition.
                                            flushSync(() => onClose?.());
                                            onOpenShare?.(currentItem);
                                        }}
                                        className="px-3 py-1.5 btn-accent hover:brightness-105 rounded-full font-semibold flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                        <Share2 className="w-3.5 h-3.5" /> {t('info.access.manage')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* File Details Properties List */}
                        <div className="space-y-3 pt-2">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-wider text-[11px] mb-3">
                                {isFolder ? t('info.detailsOfFolder') : t('info.detailsOfFile')}
                            </h4>

                            {/* Property item: Loại tệp */}
                            <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.type')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {isFolder ? t('fileType.folder') : item.mimeType || t('info.type.dataFile')}
                                </span>
                            </div>

                            {/* Property item: Kích thước */}
                            {!isFolder && (
                                <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                    <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.size')}</span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                                        {formatBytes(item.size)}
                                    </span>
                                </div>
                            )}

                            {/* Property item: Vị trí */}
                            <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.location')}</span>
                                <span className="font-semibold text-[var(--ink)] flex items-center gap-1 min-w-0">
                                    <FolderTree className="w-3.5 h-3.5 shrink-0" />
                                    {/* Mở từ kết quả tìm kiếm thì có tên thư mục cha thật (`parentName`, ##90) */}
                                    <span className="truncate">
                                        {item.parentName || (item.parentId ? t('info.location.subfolder') : t('breadcrumb.myDriveRoot'))}
                                    </span>
                                </span>
                            </div>

                            {/* Property item: Người sở hữu */}
                            <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.owner')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {item.owner || t('list.owner.me')}
                                </span>
                            </div>

                            {/* Property item: Sửa đổi lần cuối */}
                            <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.modified')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {item.updatedAt || '—'}
                                </span>
                            </div>

                            {/* Property item: Ngày tạo (Created) */}
                            <div className="flex justify-between py-1.5 border-b border-glass-divider">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.created')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {item.createdAt || '—'}
                                </span>
                            </div>
                        </div>
                    </>
                ) : currentTab === 'activity' ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-wider text-[11px]">
                                {t('activity.drawer.title')}
                            </h4>
                            {activityLogs.length > 0 && !loadingTab && (
                                <button
                                    onClick={fetchActivityLogs}
                                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                                    title={t('info.refresh')}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {loadingTab ? (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 space-y-2.5">
                                <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-subtle)]" />
                                <p className="text-xs text-gray-400 font-medium">{t('info.activity.loading')}</p>
                            </div>
                        ) : activityError ? (
                            <div className="p-4 rounded-2xl bg-[var(--tone-danger-soft)] text-center space-y-2">
                                <AlertCircle className="w-6 h-6 text-[var(--tone-danger)] mx-auto" />
                                <p className="text-xs font-semibold text-[var(--ink)]">
                                    {t('info.activity.loadFailed')}
                                </p>
                                <p className="text-[11px] text-[var(--ink-muted)]">
                                    {activityError}
                                </p>
                                <button
                                    onClick={fetchActivityLogs}
                                    className="glass-soft inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 text-[var(--ink)] text-xs font-semibold rounded-full transition-colors cursor-pointer"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" /> {t('common.retry')}
                                </button>
                            </div>
                        ) : activityLogs.length > 0 ? (
                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {activityLogs.map((log) => {
                                    const meta = getActivityMeta(log.action);
                                    const Icon = meta.icon;
                                    const description = renderActivityDescription(log);
                                    const dateStr = log.createdAt
                                        ? new Date(log.createdAt).toLocaleString(locale, {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour12: false,
                                        })
                                        : '--';

                                    return (
                                        <div
                                            key={log.id || Math.random()}
                                            className="glass-soft flex gap-3 text-xs p-3 rounded-2xl transition-colors"
                                        >
                                            <div
                                                className={`w-7 h-7 rounded-xl ${meta.bgClass} ${meta.colorClass} flex items-center justify-center shrink-0`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center justify-between gap-1">
                                                    <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                                                        {meta.label}
                                                    </p>
                                                    <span className="text-[10px] text-gray-400 font-mono shrink-0">
                                                        {dateStr}
                                                    </span>
                                                </div>
                                                {description && (
                                                    <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed break-words bg-black/[0.03] dark:bg-white/[0.04] px-2 py-1.5 rounded-lg">
                                                        {description}
                                                    </p>
                                                )}
                                                {log.userId && (
                                                    <p className="text-[10px] text-gray-400 truncate">
                                                        {t('info.activity.actor')}{' '}
                                                        <span className="font-mono">
                                                            {log.userId.length > 16 ? `${log.userId.slice(0, 10)}...` : log.userId}
                                                        </span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-8 px-4 text-center">
                                <div className="glass-soft w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2 text-[var(--ink-subtle)]">
                                    <ActivityIcon className="w-5 h-5 opacity-60" />
                                </div>
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('info.activity.empty')}</p>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    {t('info.activity.emptyHint')}
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-wider text-[11px]">
                            {t('info.versions.heading')}
                        </h4>
                        {loadingTab ? (
                            <p className="text-xs text-gray-400">{t('info.versions.loading')}</p>
                        ) : shownVersions ? (
                            <div className="space-y-3">
                                {/* Current Version */}
                                <div className="p-3 rounded-2xl glass-active">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="chip px-2 py-0.5 text-[10.5px]">{t('info.versions.current')}</span>
                                        <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">{formatBytes(shownVersions.currentVersion.sizeBytes)}</span>
                                    </div>
                                    <p className="text-[11px] text-[var(--ink)] font-medium">{shownVersions.currentVersion.name}</p>
                                </div>

                                {/* Past Versions */}
                                {shownVersions.pastVersions && shownVersions.pastVersions.length > 0 ? (
                                    shownVersions.pastVersions.map((v) => (
                                        <div key={v.id} className="glass-soft p-3 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <div className="font-bold text-gray-900 dark:text-gray-100 text-xs">
                                                    {t('info.versions.label', { number: v.versionNumber })}
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-mono">
                                                    {new Date(v.createdAt).toLocaleString(locale)} • {formatBytes(v.sizeBytes)}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-gray-400 py-2 text-center">{t('info.versions.noOld')}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 py-4 text-center">{shownVersionsError || t('info.versions.none')}</p>
                        )}
                    </div>
                )}
            </div>
            </aside>
        </>
    );
}
