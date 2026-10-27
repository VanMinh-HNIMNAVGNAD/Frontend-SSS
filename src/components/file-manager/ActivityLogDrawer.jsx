import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { filesApi } from '../../services/api';
import { formatBytes } from '../../utils/formatFileSize';
import { localeTagOf } from '../../utils/locale';
import tRich from '../../utils/tRich';
import { formatRelativeTime } from '../../utils/relativeTime';
import {
    X,
    RefreshCw,
    History,
    Activity,
    Upload,
    FolderPlus,
    Pencil,
    Move,
    Star,
    Trash2,
    RotateCcw,
    Share2,
    UserPlus,
    UserMinus,
    AlertTriangle,
    Copy,
    FileText,
    Folder,
    HardDrive,
    Sparkles,
    Clock,
    Filter,
    Shield,
    Check
} from 'lucide-react';

const ACTION_GROUPS = {
    all: {
        id: 'all',
        labelKey: 'activity.group.all',
        filter: () => true,
    },
    upload: {
        id: 'upload',
        labelKey: 'activity.group.upload',
        filter: (act) => ['UPLOAD_FILE', 'CREATE_FOLDER', 'COPY_FILE', 'COPY_FOLDER'].includes(act),
    },
    share: {
        id: 'share',
        labelKey: 'activity.group.share',
        filter: (act) => ['SHARE_LINK_CREATED', 'SHARE_LINK_REVOKED', 'SHARE_ACCESS_ADDED', 'SHARE_ACCESS_REMOVED'].includes(act),
    },
    rename_move: {
        id: 'rename_move',
        labelKey: 'activity.group.renameMove',
        filter: (act) => ['RENAME_ITEM', 'MOVE_ITEM'].includes(act),
    },
    trash_delete: {
        id: 'trash_delete',
        labelKey: 'activity.group.trashDelete',
        filter: (act) => ['TRASH_ITEM', 'RESTORE_ITEM', 'DELETE_PERMANENTLY', 'EMPTY_TRASH'].includes(act),
    },
    star: {
        id: 'star',
        labelKey: 'activity.group.star',
        filter: (act) => ['TOGGLE_STAR'].includes(act),
    },
};


function formatExactDateTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export default function ActivityLogDrawer({ isOpen, onClose, fileId = null, fileName = null }) {
    const { t, language } = useLanguage();
    const { isAuthenticated } = useAuth();
    const locale = localeTagOf(language);
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState('all');

    /**
     * Chốt chặn thứ hai cho lỗi #7 (chốt thứ nhất ở nút mở trong `Header.jsx`).
     *
     * Drawer này còn được mở từ `FileInfoDrawer`, nên không thể trông cậy hoàn toàn
     * vào chỗ bấm ở Header. Chưa có phiên thì KHÔNG gọi API và KHÔNG giữ lại danh
     * sách của lần tải trước: `setLogs([])` là phần quan trọng — không có nó, phiên
     * hết hạn giữa lúc drawer đang mở sẽ để nguyên lịch sử cũ trên màn hình.
     */
    const fetchLogs = useCallback(async () => {
        if (!isAuthenticated) {
            setLogs([]);
            setError(t('activity.needLogin'));
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const data = await filesApi.getActivityLogs(fileId);
            setLogs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('[ActivityLogDrawer] Fetch logs error:', err);
            setLogs([]);
            setError(err.message || t('activity.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    }, [fileId, isAuthenticated, t]);

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        } else {
            setSelectedGroup('all');
        }
    }, [isOpen, fetchLogs]);

    // Handle Escape Key to close drawer
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const filteredLogs = useMemo(() => {
        const groupConfig = ACTION_GROUPS[selectedGroup] || ACTION_GROUPS.all;
        return logs.filter((log) => groupConfig.filter(log.action));
    }, [logs, selectedGroup]);

    const groupCounts = useMemo(() => {
        const counts = { all: logs.length };
        Object.keys(ACTION_GROUPS).forEach((key) => {
            if (key !== 'all') {
                counts[key] = logs.filter((l) => ACTION_GROUPS[key].filter(l.action)).length;
            }
        });
        return counts;
    }, [logs]);

    if (!isOpen) return null;

    // Đơn sắc (26/10/2026): mỗi loại thao tác từng có một màu riêng (lục, lam, hổ phách, tím, ngọc,
    // chàm, đỏ…) ở icon, viền thẻ và chấm trên dòng thời gian. HÌNH icon đã phân biệt loại thao tác;
    // màu chỉ còn cho thao tác không hoàn tác được (xoá vĩnh viễn, dọn thùng rác).
    const TONE_STYLE = {
        neutral: { badge: 'bg-[var(--chip-fill)] text-[var(--ink-muted)]', dot: 'bg-[var(--ink-subtle)]' },
        danger: { badge: 'bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]', dot: 'bg-[var(--tone-danger)]' },
    };

    const getActionVisual = (action, details = {}) => {
        const act = (action || '').toUpperCase();
        switch (act) {
            case 'UPLOAD_FILE':
                return {
                    label: t('activity.action.uploadFile'),
                    icon: Upload,
                    tone: 'neutral',
                };
            case 'CREATE_FOLDER':
                return {
                    label: t('activity.action.createFolder'),
                    icon: FolderPlus,
                    tone: 'neutral',
                };
            case 'RENAME_ITEM':
                return {
                    label: t('activity.action.rename'),
                    icon: Pencil,
                    tone: 'neutral',
                };
            case 'MOVE_ITEM':
                return {
                    label: t('activity.action.move'),
                    icon: Move,
                    tone: 'neutral',
                };
            case 'TOGGLE_STAR':
                return {
                    label: details.isStarred ? t('activity.action.star') : t('activity.action.unstar'),
                    icon: Star,
                    tone: 'neutral',
                };
            case 'TRASH_ITEM':
                return {
                    label: t('activity.action.trash'),
                    icon: Trash2,
                    tone: 'neutral',
                };
            case 'RESTORE_ITEM':
                return {
                    label: t('activity.action.restore'),
                    icon: RotateCcw,
                    tone: 'neutral',
                };
            case 'MARK_NOT_SPAM':
                return {
                    label: t('activity.action.notSpam'),
                    icon: RotateCcw,
                    tone: 'neutral',
                };
            case 'DELETE_PERMANENTLY':
                return {
                    label: t('activity.action.deleteForever'),
                    icon: AlertTriangle,
                    tone: 'danger',
                };
            case 'EMPTY_TRASH':
                return {
                    label: t('activity.action.emptyTrash'),
                    icon: Trash2,
                    tone: 'danger',
                };
            case 'COPY_FILE':
            case 'COPY_FOLDER':
                return {
                    label: t('activity.action.copy'),
                    icon: Copy,
                    tone: 'neutral',
                };
            case 'SHARE_LINK_CREATED':
                return {
                    label: t('activity.action.shareLink'),
                    icon: Share2,
                    tone: 'neutral',
                };
            case 'SHARE_LINK_REVOKED':
                return {
                    label: t('activity.action.shareLinkRevoked'),
                    icon: UserMinus,
                    tone: 'neutral',
                };
            case 'SHARE_ACCESS_ADDED':
                return {
                    label: t('activity.action.shareAdd'),
                    icon: UserPlus,
                    tone: 'neutral',
                };
            case 'SHARE_ACCESS_REMOVED':
                return {
                    label: t('activity.action.shareRemove'),
                    icon: UserMinus,
                    tone: 'neutral',
                };
            default:
                return {
                    label: action ? action.replace(/_/g, ' ') : t('activity.action.other'),
                    icon: Activity,
                    tone: 'neutral',
                };
        }
    };

    const renderLogDescription = (log) => {
        const d = log.details || {};
        const act = (log.action || '').toUpperCase();

        switch (act) {
            case 'UPLOAD_FILE': {
                const name = d.fileName || d.name || t('activity.fallback.untitledFile');
                const size = d.sizeBytes !== undefined ? formatBytes(d.sizeBytes) : null;
                const provider = d.storageProvider ? (
                    d.storageProvider === 'cloudflare_r2' ? 'Cloudflare R2' :
                    d.storageProvider === 'backblaze_b2' ? 'Backblaze B2' : 'Google Cloud'
                ) : null;

                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.uploadFile'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                        {size && <span className="text-gray-500 dark:text-gray-400"> ({size})</span>}
                        {provider && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-white/[0.07] text-gray-600 dark:text-gray-300">
                                {provider}
                            </span>
                        )}
                    </div>
                );
            }
            case 'CREATE_FOLDER': {
                const name = d.folderName || d.name || t('activity.fallback.newFolder');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.createFolder'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                    </div>
                );
            }
            case 'RENAME_ITEM': {
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {d.oldName && d.newName
                            ? tRich(t('activity.desc.renameFromTo'), {
                                  old: <del className="text-gray-400 font-medium">{d.oldName}</del>,
                                  new: (
                                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                                          {d.newName}
                                      </span>
                                  ),
                              })
                            : tRich(t('activity.desc.renameTo'), {
                                  new: (
                                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                                          {d.newName || d.name || t('activity.fallback.newName')}
                                      </span>
                                  ),
                              })}
                    </div>
                );
            }
            case 'MOVE_ITEM': {
                const name = d.fileName || t('activity.fallback.item');
                const from = d.fromPath || '/';
                const to = d.toPath || '/';
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-1">
                        <div>
                            {tRich(t('activity.desc.move'), {
                                name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                            })}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.07] font-mono text-xs">{from}</span>
                            <span>➔</span>
                            <span className="px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.1] text-[var(--ink)] font-mono text-xs">{to}</span>
                        </div>
                    </div>
                );
            }
            case 'TOGGLE_STAR': {
                const name = d.fileName || t('activity.fallback.file');
                const isStarred = d.isStarred;
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t(isStarred ? 'activity.desc.star' : 'activity.desc.unstar'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                    </div>
                );
            }
            case 'TRASH_ITEM': {
                const name = d.fileName || t('activity.fallback.file');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.trash'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                    </div>
                );
            }
            case 'RESTORE_ITEM': {
                const name = d.fileName || t('activity.fallback.file');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.restore'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                    </div>
                );
            }
            case 'MARK_NOT_SPAM': {
                const name = d.fileName || t('activity.fallback.file');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.notSpam'), {
                            name: (
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                            ),
                        })}
                    </div>
                );
            }
            case 'DELETE_PERMANENTLY': {
                const name = d.fileName || t('activity.fallback.file');
                const freed = d.freedBytes ? formatBytes(d.freedBytes) : null;
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.deleteForever'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                        {freed && (
                            <span className="text-[var(--ink-muted)] font-medium">
                                {' '}
                                {t('activity.desc.freed', { size: freed })}
                            </span>
                        )}
                    </div>
                );
            }
            case 'EMPTY_TRASH': {
                const count = d.deletedCount || 0;
                const freed = d.freedBytes ? formatBytes(d.freedBytes) : null;
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {t('activity.desc.emptyTrash', { count })}
                        {freed && (
                            <span className="text-[var(--ink-muted)] font-medium">
                                {' '}
                                {t('activity.desc.freed', { size: freed })}
                            </span>
                        )}
                    </div>
                );
            }
            case 'COPY_FILE':
            case 'COPY_FOLDER': {
                const name = d.fileName || d.folderName || t('activity.fallback.copy');
                const size = d.sizeBytes ? formatBytes(d.sizeBytes) : null;
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.copy'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                        {size && <span className="text-gray-500 dark:text-gray-400"> ({size})</span>}
                    </div>
                );
            }
            case 'SHARE_ACCESS_ADDED': {
                const name = d.fileName || t('activity.fallback.file');
                const email = d.targetEmail || t('activity.fallback.user');
                const roleText = d.role === 'EDITOR' ? t('activity.role.editorLong') : t('activity.role.viewerLong');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-1">
                        <div>
                            {tRich(t('activity.desc.shareAdded'), {
                                name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                                email: <span className="font-medium text-[var(--ink)]">{email}</span>,
                            })}
                        </div>
                        <div className="chip px-2 py-0.5 text-xs">
                            <Shield className="w-3 h-3" />
                            <span>{roleText}</span>
                        </div>
                    </div>
                );
            }
            case 'SHARE_ACCESS_REMOVED': {
                const name = d.fileName || t('activity.fallback.file');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.shareRemoved'), {
                            name: <span className="font-semibold text-gray-900 dark:text-gray-100">{name}</span>,
                        })}
                    </div>
                );
            }
            case 'SHARE_LINK_REVOKED':
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {t('activity.desc.shareLinkRevoked', { count: Number(d.revokedCount) || 0 })}
                    </div>
                );
            case 'SHARE_LINK_CREATED': {
                const accessMap = {
                    ANYONE_WITH_LINK: t('activity.access.anyoneWithLink'),
                    RESTRICTED: t('activity.access.restricted'),
                };
                const roleMap = {
                    VIEWER: t('share.role.viewer'),
                    EDITOR: t('share.role.editor'),
                };
                const access = accessMap[d.accessLevel] || d.accessLevel || t('activity.access.public');
                const role = roleMap[d.role] || d.role || t('list.role.viewer');
                return (
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {tRich(t('activity.desc.shareLink'), {
                            role: <span className="font-semibold text-gray-900 dark:text-gray-100">{role}</span>,
                            access,
                        })}
                    </div>
                );
            }
            default: {
                if (Object.keys(d).length === 0) return null;
                return (
                    <div className="text-gray-600 dark:text-gray-400 font-mono text-xs bg-gray-50 dark:bg-black/20 p-1.5 rounded">
                        {JSON.stringify(d)}
                    </div>
                );
            }
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 glass-overlay z-40 transition-opacity cursor-pointer animate-fade-in"
                onClick={onClose}
            />

            {/* Slide-over Drawer Panel */}
            <aside
                className="glass-strong fixed right-0 top-0 bottom-0 sm:right-3 sm:top-3 sm:bottom-3 z-50 w-full sm:w-[460px] md:w-[480px] sm:rounded-[26px] flex flex-col font-sans text-xs text-gray-800 dark:text-gray-200 overflow-hidden cursor-default animate-slide-left"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="glass-soft px-5 py-4 border-b shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[var(--chip-fill)] flex items-center justify-center text-[var(--ink-muted)] shrink-0">
                                <History className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="font-semibold text-base text-[var(--ink)] truncate">
                                    {t('activity.drawer.title')}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate flex items-center gap-1.5 mt-0.5">
                                    {fileId ? (
                                        <>
                                            <FileText className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{fileName || t('activity.scope.selectedFile')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <HardDrive className="w-3 h-3 shrink-0" />
                                            <span>{t('activity.scope.wholeAccount')}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={fetchLogs}
                                disabled={isLoading}
                                className="p-2 rounded-full text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                                title={t('activity.refresh')}
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
                                title={t('preview.close')}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pt-4 pb-1 no-scrollbar">
                        {Object.values(ACTION_GROUPS).map((group) => {
                            const count = groupCounts[group.id] || 0;
                            const isSelected = selectedGroup === group.id;

                            return (
                                <button
                                    key={group.id}
                                    onClick={() => setSelectedGroup(group.id)}
                                    className={`h-8 px-3 rounded-full text-xs transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                        isSelected
                                            ? 'glass-active font-semibold text-[var(--ink)]'
                                            : 'glass-soft font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                    }`}
                                >
                                    <span>{t(group.labelKey)}</span>
                                    {count > 0 && (
                                        <span
                                            className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold leading-none tabular-nums bg-black/[0.05] dark:bg-white/[0.08] text-[var(--ink-muted)]"
                                        >
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Timeline Content */}
                <div className="flex-1 overflow-y-auto p-5 relative">
                    {/* Loading State */}
                    {isLoading && (
                        <div className="space-y-4 animate-pulse">
                            {[1, 2, 3, 4, 5].map((idx) => (
                                <div key={idx} className="flex gap-3.5 items-start">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/[0.07] shrink-0" />
                                    <div className="flex-1 space-y-2 pt-1">
                                        <div className="h-3.5 bg-gray-200 dark:bg-white/[0.07] rounded w-2/5" />
                                        <div className="h-3 bg-gray-100 dark:bg-white/[0.07] rounded w-4/5" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error State */}
                    {!isLoading && error && (
                        <div className="p-4 rounded-2xl bg-[var(--tone-danger-soft)] text-center space-y-3 my-6">
                            <AlertTriangle className="w-7 h-7 text-[var(--tone-danger)] mx-auto" />
                            <p className="text-xs text-[var(--ink)] font-medium">{error}</p>
                            <button
                                onClick={fetchLogs}
                                className="glass-soft px-4 py-2 rounded-full text-[var(--ink)] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>{t('upload.retry')}</span>
                            </button>
                        </div>
                    )}

                    {/* Empty State - No Logs at all */}
                    {!isLoading && !error && logs.length === 0 && (
                        <div className="py-16 text-center space-y-3">
                            <div className="glass-soft w-14 h-14 rounded-2xl flex items-center justify-center mx-auto text-[var(--ink-subtle)]">
                                <History className="w-7 h-7" />
                            </div>
                            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200">
                                {t('activity.empty.title')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                                {t('activity.empty.hint')}
                            </p>
                        </div>
                    )}

                    {/* Empty State - Filtered No Results */}
                    {!isLoading && !error && logs.length > 0 && filteredLogs.length === 0 && (
                        <div className="py-14 text-center space-y-3">
                            <div className="glass-soft w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-[var(--ink-subtle)]">
                                <Filter className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200">
                                {t('activity.filtered.title')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t('activity.filtered.hint')}
                            </p>
                            <button
                                onClick={() => setSelectedGroup('all')}
                                className="glass-soft px-3.5 py-1.5 rounded-full text-[var(--ink)] font-semibold text-xs transition-colors cursor-pointer"
                            >
                                {t('activity.filtered.showAll', { count: logs.length })}
                            </button>
                        </div>
                    )}

                    {/* Timeline List */}
                    {!isLoading && !error && filteredLogs.length > 0 && (
                        <div className="relative pl-6 space-y-3 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-px before:bg-[var(--glass-divider)]">
                            {filteredLogs.map((log) => {
                                const visual = getActionVisual(log.action, log.details);
                                const IconComponent = visual.icon;
                                const tone = TONE_STYLE[visual.tone] || TONE_STYLE.neutral;

                                return (
                                    <div key={log.id} className="relative group">
                                        {/* Dot on timeline */}
                                        <div
                                            className="absolute -left-6 top-4 w-6 h-6 flex items-center justify-center z-10"
                                        >
                                            <div className={`w-2 h-2 rounded-full ring-4 ring-white/70 dark:ring-[#2a2a2e]/80 ${tone.dot}`} />
                                        </div>

                                        {/* Activity Item Card */}
                                        <div className="glass-soft p-3.5 rounded-2xl hover:shadow-md transition-all space-y-2">
                                            {/* Action Header & Badge */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg ${tone.badge}`}>
                                                        <IconComponent className="w-4 h-4" />
                                                    </div>
                                                    <span className="font-semibold text-sm text-[var(--ink)]">
                                                        {visual.label}
                                                    </span>
                                                </div>

                                                <div
                                                    className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1 shrink-0"
                                                    title={formatExactDateTime(log.createdAt)}
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>{formatRelativeTime(log.createdAt, t, locale)}</span>
                                                </div>
                                            </div>

                                            {/* Description details */}
                                            <div className="pl-7">
                                                {renderLogDescription(log)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Summary */}
                <div className="px-5 py-3 border-t flex items-center justify-between text-xs text-[var(--ink-muted)] shrink-0 border-glass-divider">
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        <span>{tRich(t('activity.total'), {
                            shown: <strong className="text-gray-900 dark:text-gray-200 font-bold">{filteredLogs.length}</strong>,
                            total: logs.length,
                        })}</span>
                    </div>

                    <span className="text-xs text-gray-500 dark:text-gray-500">
                        {logs[0]
                            ? t('activity.latest', { time: formatRelativeTime(logs[0].createdAt, t, locale) })
                            : ''}
                    </span>
                </div>
            </aside>
        </>
    );
}
