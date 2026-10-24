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

    const getActionVisual = (action, details = {}) => {
        const act = (action || '').toUpperCase();
        switch (act) {
            case 'UPLOAD_FILE':
                return {
                    label: t('activity.action.uploadFile'),
                    icon: Upload,
                    iconColor: 'text-emerald-600 dark:text-emerald-400',
                    bgBadge: 'bg-emerald-50 dark:bg-emerald-400/15 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
                    timelineDot: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-900',
                };
            case 'CREATE_FOLDER':
                return {
                    label: t('activity.action.createFolder'),
                    icon: FolderPlus,
                    iconColor: 'text-cyan-600 dark:text-cyan-400',
                    bgBadge: 'bg-cyan-50 dark:bg-cyan-400/15 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300',
                    timelineDot: 'bg-cyan-500 ring-cyan-100 dark:ring-cyan-900',
                };
            case 'RENAME_ITEM':
                return {
                    label: t('activity.action.rename'),
                    icon: Pencil,
                    iconColor: 'text-amber-600 dark:text-amber-400',
                    bgBadge: 'bg-amber-50 dark:bg-amber-400/15 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                    timelineDot: 'bg-amber-500 ring-amber-100 dark:ring-amber-900',
                };
            case 'MOVE_ITEM':
                return {
                    label: t('activity.action.move'),
                    icon: Move,
                    iconColor: 'text-violet-600 dark:text-violet-400',
                    bgBadge: 'bg-violet-50 dark:bg-violet-400/15 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
                    timelineDot: 'bg-violet-500 ring-violet-100 dark:ring-violet-900',
                };
            case 'TOGGLE_STAR':
                return {
                    label: details.isStarred ? t('activity.action.star') : t('activity.action.unstar'),
                    icon: Star,
                    iconColor: 'text-amber-500 dark:text-amber-400',
                    bgBadge: 'bg-amber-50 dark:bg-amber-400/15 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                    timelineDot: 'bg-amber-400 ring-amber-100 dark:ring-amber-900',
                };
            case 'TRASH_ITEM':
                return {
                    label: t('activity.action.trash'),
                    icon: Trash2,
                    iconColor: 'text-rose-600 dark:text-rose-400',
                    bgBadge: 'bg-rose-50 dark:bg-rose-400/15 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
                    timelineDot: 'bg-rose-500 ring-rose-100 dark:ring-rose-900',
                };
            case 'RESTORE_ITEM':
                return {
                    label: t('activity.action.restore'),
                    icon: RotateCcw,
                    iconColor: 'text-teal-600 dark:text-teal-400',
                    bgBadge: 'bg-teal-50 dark:bg-teal-400/15 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300',
                    timelineDot: 'bg-teal-500 ring-teal-100 dark:ring-teal-900',
                };
            case 'MARK_NOT_SPAM':
                return {
                    label: t('activity.action.notSpam'),
                    icon: RotateCcw,
                    iconColor: 'text-teal-600 dark:text-teal-400',
                    bgBadge: 'bg-teal-50 dark:bg-teal-400/15 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300',
                    timelineDot: 'bg-teal-500 ring-teal-100 dark:ring-teal-900',
                };
            case 'DELETE_PERMANENTLY':
                return {
                    label: t('activity.action.deleteForever'),
                    icon: AlertTriangle,
                    iconColor: 'text-red-600 dark:text-red-400',
                    bgBadge: 'bg-red-50 dark:bg-red-400/15 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
                    timelineDot: 'bg-red-600 ring-red-100 dark:ring-red-900',
                };
            case 'EMPTY_TRASH':
                return {
                    label: t('activity.action.emptyTrash'),
                    icon: Trash2,
                    iconColor: 'text-red-600 dark:text-red-400',
                    bgBadge: 'bg-red-50 dark:bg-red-400/15 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
                    timelineDot: 'bg-red-600 ring-red-100 dark:ring-red-900',
                };
            case 'COPY_FILE':
            case 'COPY_FOLDER':
                return {
                    label: t('activity.action.copy'),
                    icon: Copy,
                    iconColor: 'text-indigo-600 dark:text-indigo-400',
                    bgBadge: 'bg-indigo-50 dark:bg-indigo-400/15 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
                    timelineDot: 'bg-indigo-500 ring-indigo-100 dark:ring-indigo-900',
                };
            case 'SHARE_LINK_CREATED':
                return {
                    label: t('activity.action.shareLink'),
                    icon: Share2,
                    iconColor: 'text-blue-600 dark:text-blue-400',
                    bgBadge: 'bg-blue-50 dark:bg-blue-400/15 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
                    timelineDot: 'bg-blue-500 ring-blue-100 dark:ring-blue-900',
                };
            case 'SHARE_LINK_REVOKED':
                return {
                    label: t('activity.action.shareLinkRevoked'),
                    icon: UserMinus,
                    iconColor: 'text-purple-600 dark:text-purple-400',
                    bgBadge: 'bg-purple-50 dark:bg-purple-400/15 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
                    timelineDot: 'bg-purple-500 ring-purple-100 dark:ring-purple-900',
                };
            case 'SHARE_ACCESS_ADDED':
                return {
                    label: t('activity.action.shareAdd'),
                    icon: UserPlus,
                    iconColor: 'text-blue-600 dark:text-blue-400',
                    bgBadge: 'bg-blue-50 dark:bg-blue-400/15 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
                    timelineDot: 'bg-blue-500 ring-blue-100 dark:ring-blue-900',
                };
            case 'SHARE_ACCESS_REMOVED':
                return {
                    label: t('activity.action.shareRemove'),
                    icon: UserMinus,
                    iconColor: 'text-purple-600 dark:text-purple-400',
                    bgBadge: 'bg-purple-50 dark:bg-purple-400/15 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
                    timelineDot: 'bg-purple-500 ring-purple-100 dark:ring-purple-900',
                };
            default:
                return {
                    label: action ? action.replace(/_/g, ' ') : t('activity.action.other'),
                    icon: Activity,
                    iconColor: 'text-gray-600 dark:text-gray-400',
                    bgBadge: 'bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300',
                    timelineDot: 'bg-gray-400 ring-gray-100 dark:ring-gray-800',
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
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 font-mono text-xs">{to}</span>
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
                            <span className="text-rose-600 dark:text-rose-400 font-medium">
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
                            <span className="text-rose-600 dark:text-rose-400 font-medium">
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
                                email: <span className="font-medium text-blue-600 dark:text-blue-400">{email}</span>,
                            })}
                        </div>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
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
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-400/15 border border-blue-100 dark:border-blue-400/25 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-xs">
                                <History className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="font-bold text-base text-gray-900 dark:text-gray-100 truncate">
                                    {t('activity.drawer.title')}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate flex items-center gap-1.5 mt-0.5">
                                    {fileId ? (
                                        <>
                                            <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                                            <span className="truncate">{fileName || t('activity.scope.selectedFile')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <HardDrive className="w-3 h-3 text-emerald-500 shrink-0" />
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
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
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
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                        isSelected
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'bg-gray-100 dark:bg-white/[0.07] text-gray-700 dark:text-gray-200'
                                    }`}
                                >
                                    <span>{t(group.labelKey)}</span>
                                    {count > 0 && (
                                        <span
                                            className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none ${
                                                isSelected
                                                    ? 'bg-white/25 text-white'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                                            }`}
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
                <div className="flex-1 overflow-y-auto p-5 relative bg-gray-50/60 dark:bg-black/20">
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
                        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-400/15 border border-red-200 dark:border-red-900 text-center space-y-3 my-6">
                            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
                            <p className="text-xs text-red-700 dark:text-red-300 font-medium">{error}</p>
                            <button
                                onClick={fetchLogs}
                                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>{t('upload.retry')}</span>
                            </button>
                        </div>
                    )}

                    {/* Empty State - No Logs at all */}
                    {!isLoading && !error && logs.length === 0 && (
                        <div className="py-16 text-center space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/[0.07] flex items-center justify-center mx-auto text-gray-400">
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
                            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/[0.07] flex items-center justify-center mx-auto text-gray-400">
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
                                className="px-3.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.07] text-gray-700 dark:text-gray-300 font-semibold text-xs transition-colors cursor-pointer"
                            >
                                {t('activity.filtered.showAll', { count: logs.length })}
                            </button>
                        </div>
                    )}

                    {/* Timeline List */}
                    {!isLoading && !error && filteredLogs.length > 0 && (
                        <div className="relative pl-6 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
                            {filteredLogs.map((log) => {
                                const visual = getActionVisual(log.action, log.details);
                                const IconComponent = visual.icon;

                                return (
                                    <div key={log.id} className="relative group">
                                        {/* Dot on timeline */}
                                        <div
                                            className={`glass-soft absolute -left-6 top-2 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-[#2a2a2e] z-10`}
                                        >
                                            <div className={`w-3.5 h-3.5 rounded-full ${visual.timelineDot}`} />
                                        </div>

                                        {/* Activity Item Card */}
                                        <div className="p-4 rounded-2xl bg-white hover:bg-white dark:bg-black/20 dark:hover:bg-white/[0.06] border border-gray-200 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:hover:border-gray-700 shadow-sm transition-all space-y-2.5">
                                            {/* Action Header & Badge */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1.5 rounded-lg ${visual.bgBadge}`}>
                                                        <IconComponent className="w-4 h-4" />
                                                    </div>
                                                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
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
                <div className="px-5 py-3 border-t bg-white dark:bg-[#1a1a1a] flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 shrink-0 border-glass-divider">
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
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
