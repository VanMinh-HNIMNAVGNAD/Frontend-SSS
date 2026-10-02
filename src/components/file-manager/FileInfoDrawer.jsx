import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useFilePreview } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { filesApi } from '../../services/api';
import { formatBytes } from '../../utils/formatFileSize';
import { localeTagOf } from '../../utils/locale';
import { 
    X, 
    FileText, 
    FileSpreadsheet, 
    Image as ImageIcon, 
    FileCode, 
    FileArchive, 
    File, 
    Folder, 
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
    Video,
    Music,
    Database,
    Layers,
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
            filesApi.getFileVersions(item.id)
                .then((data) => setVersions(data))
                .catch((err) => console.error(err))
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

    const getFileIconLarge = () => {
        if (isFolder) return <Folder className="w-16 h-16 text-amber-500 fill-amber-500/20 stroke-1" />;
        const name = item.name.toLowerCase();
        if (name.endsWith('.pdf')) return <FileText className="w-16 h-16 text-rose-500 stroke-1" />;
        if (name.endsWith('.xlsx') || name.endsWith('.csv')) return <FileSpreadsheet className="w-16 h-16 text-emerald-600 stroke-1" />;
        if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return <ImageIcon className="w-16 h-16 text-purple-500 stroke-1" />;
        if (name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.md')) return <FileText className="w-16 h-16 text-blue-500 stroke-1" />;
        if (name.endsWith('.mp4') || name.endsWith('.mkv')) return <Video className="w-16 h-16 text-violet-500 stroke-1" />;
        if (name.endsWith('.mp3') || name.endsWith('.wav')) return <Music className="w-16 h-16 text-pink-500 stroke-1" />;
        if (name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.jsx')) return <FileCode className="w-16 h-16 text-amber-500 stroke-1" />;
        if (name.endsWith('.sql') || name.endsWith('.db')) return <Database className="w-16 h-16 text-cyan-600 stroke-1" />;
        if (name.endsWith('.fig')) return <Layers className="w-16 h-16 text-purple-600 stroke-1" />;
        if (name.endsWith('.zip') || name.endsWith('.rar')) return <FileArchive className="w-16 h-16 text-amber-600 stroke-1" />;
        return <File className="w-16 h-16 text-gray-500 stroke-1" />;
    };

    const getActivityMeta = (action = '') => {
        const act = (action || '').toUpperCase();
        if (act.includes('UPLOAD')) {
            return {
                label: t('activity.action.uploadFile'),
                icon: Upload,
                colorClass: 'text-emerald-600 dark:text-emerald-400',
                bgClass: 'bg-emerald-100 dark:bg-emerald-900/40',
            };
        }
        if (act.includes('RENAME')) {
            return {
                label: t('activity.action.rename'),
                icon: Pencil,
                colorClass: 'text-amber-600 dark:text-amber-400',
                bgClass: 'bg-amber-100 dark:bg-amber-900/40',
            };
        }
        if (act.includes('SHARE')) {
            return {
                label: t('info.action.shareLink'),
                icon: Share2,
                colorClass: 'text-blue-600 dark:text-blue-400',
                bgClass: 'bg-blue-100 dark:bg-blue-900/40',
            };
        }
        // Phải đứng TRƯỚC nhánh TRASH/DELETE: 'MARK_NOT_SPAM' không chứa hai chữ đó,
        // nhưng để rơi xuống cuối thì nhãn hiện ra là chuỗi thô "Mark Not Spam".
        if (act.includes('NOT_SPAM')) {
            return {
                label: t('activity.action.notSpam'),
                icon: RotateCcw,
                colorClass: 'text-emerald-600 dark:text-emerald-400',
                bgClass: 'bg-emerald-100 dark:bg-emerald-900/40',
            };
        }
        if (act.includes('RESTORE')) {
            return {
                label: t('activity.action.restore'),
                icon: RotateCcw,
                colorClass: 'text-emerald-600 dark:text-emerald-400',
                bgClass: 'bg-emerald-100 dark:bg-emerald-900/40',
            };
        }
        if (act.includes('TRASH') || act.includes('DELETE')) {
            return {
                label: act.includes('PERMANENT') ? t('activity.action.deleteForever') : t('activity.action.trash'),
                icon: Trash2,
                colorClass: 'text-rose-600 dark:text-rose-400',
                bgClass: 'bg-rose-100 dark:bg-rose-900/40',
            };
        }
        if (act.includes('STAR')) {
            return {
                label: t('info.action.star'),
                icon: Star,
                colorClass: 'text-amber-500 dark:text-amber-400',
                bgClass: 'bg-amber-100 dark:bg-amber-900/40',
            };
        }
        if (act.includes('COPY')) {
            return {
                label: t('activity.action.copy'),
                icon: Copy,
                colorClass: 'text-indigo-600 dark:text-indigo-400',
                bgClass: 'bg-indigo-100 dark:bg-indigo-900/40',
            };
        }
        if (act.includes('VERSION')) {
            return {
                label: t('info.action.newVersion'),
                icon: History,
                colorClass: 'text-purple-600 dark:text-purple-400',
                bgClass: 'bg-purple-100 dark:bg-purple-900/40',
            };
        }
        if (act.includes('DOWNLOAD')) {
            return {
                label: t('common.download'),
                icon: Download,
                colorClass: 'text-sky-600 dark:text-sky-400',
                bgClass: 'bg-sky-100 dark:bg-sky-900/40',
            };
        }
        const formatted = action
            ? action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
            : t('activity.action.other');
        return {
            label: formatted,
            icon: ActivityIcon,
            colorClass: 'text-blue-600 dark:text-blue-400',
            bgClass: 'bg-blue-100 dark:bg-blue-900/40',
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
                className="fixed inset-0 z-40 bg-black/20 animate-fade-in cursor-pointer"
                onClick={onClose}
            />
            <aside 
                className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-white dark:bg-[#1e1e1e] border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col font-sans animate-slide-left text-xs text-gray-800 dark:text-gray-200 overflow-hidden cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
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
                    className="p-1.5 rounded-full text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 cursor-pointer"
                    title={t('common.close')}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-100/90 dark:bg-[#252728]">
                <button
                    onClick={() => setCurrentTab('details')}
                    className={`flex-1 py-3 text-center font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                        currentTab === 'details'
                            ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#1e1e1e] font-bold'
                            : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                    }`}
                >
                    <InfoIcon className="w-3.5 h-3.5" />
                    <span>{t('info.tab.details')}</span>
                </button>

                <button
                    onClick={() => setCurrentTab('activity')}
                    className={`flex-1 py-3 text-center font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                        currentTab === 'activity'
                            ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#1e1e1e] font-bold'
                            : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                    }`}
                >
                    <ActivityIcon className="w-3.5 h-3.5" />
                    <span>{t('info.tab.activity')}</span>
                </button>

                {!isFolder && (
                    <button
                        onClick={() => setCurrentTab('versions')}
                        className={`flex-1 py-3 text-center font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                            currentTab === 'versions'
                                ? 'border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#1e1e1e] font-bold'
                                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 font-medium'
                        }`}
                    >
                        <History className="w-3.5 h-3.5" />
                        <span>{t('info.tab.versions')}</span>
                    </button>
                )}
            </div>

            {/* Tab Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {currentTab === 'details' ? (
                    <>
                        {/* Access & Sharing Section */}
                        <div className="space-y-2.5">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs uppercase tracking-wider text-[11px]">
                                {t('info.access.heading')}
                            </h4>
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-[#282a2c] border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                                        {(item.owner || 'T').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{item.owner || t('list.owner.me')}</p>
                                        <p className="text-[10px] text-gray-400">Group: {item.group || 'dev-team'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {!isFolder && (
                                        <button
                                            onClick={() => { openPreview(item); onClose?.(); }}
                                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                        >
                                            <Eye className="w-3.5 h-3.5 text-blue-500" /> {t('menu.preview')}
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
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
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
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.type')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {isFolder ? t('fileType.folder') : item.mimeType || t('info.type.dataFile')}
                                </span>
                            </div>

                            {/* Property item: Kích thước */}
                            {!isFolder && (
                                <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                    <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.size')}</span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                                        {formatBytes(item.size)}
                                    </span>
                                </div>
                            )}

                            {/* Property item: Vị trí */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.location')}</span>
                                <span className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                    <FolderTree className="w-3.5 h-3.5" />
                                    {item.parentId ? t('info.location.subfolder') : t('breadcrumb.myDriveRoot')}
                                </span>
                            </div>

                            {/* Property item: Người sở hữu */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.owner')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">
                                    {item.owner || t('list.owner.me')}
                                </span>
                            </div>

                            {/* Property item: Group */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.group')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                                    {item.group || 'users'}
                                </span>
                            </div>

                            {/* Property item: Permissions */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.permissions')}</span>
                                <span className="font-mono font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                                    {item.permissions || (isFolder ? 'rwxr-xr-x' : 'rw-r--r--')}
                                </span>
                            </div>

                            {/* Property item: Sửa đổi lần cuối */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.modified')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                                    {item.updatedAt || '—'}
                                </span>
                            </div>

                            {/* Property item: Ngày tạo (Created) */}
                            <div className="flex justify-between py-1.5 border-b border-gray-200 dark:border-gray-800">
                                <span className="text-gray-600 dark:text-gray-400 font-semibold">{t('info.field.created')}</span>
                                <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
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
                                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                    title={t('info.refresh')}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {loadingTab ? (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 space-y-2.5">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                <p className="text-xs text-gray-400 font-medium">{t('info.activity.loading')}</p>
                            </div>
                        ) : activityError ? (
                            <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-center space-y-2">
                                <AlertCircle className="w-6 h-6 text-rose-500 dark:text-rose-400 mx-auto" />
                                <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                                    {t('info.activity.loadFailed')}
                                </p>
                                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                                    {activityError}
                                </p>
                                <button
                                    onClick={fetchActivityLogs}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
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
                                            className="flex gap-3 text-xs p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                                        >
                                            <div
                                                className={`w-7 h-7 rounded-xl ${meta.bgClass} ${meta.colorClass} flex items-center justify-center shrink-0 font-bold shadow-xs`}
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
                                                    <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed break-words bg-white/60 dark:bg-gray-900/40 px-2 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800/60">
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
                                <div className="w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center mx-auto mb-2 text-gray-400">
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
                        ) : versions ? (
                            <div className="space-y-3">
                                {/* Current Version */}
                                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-extrabold text-blue-700 dark:text-blue-400 text-xs">{t('info.versions.current')}</span>
                                        <span className="text-[10px] font-mono text-blue-600">{formatBytes(versions.currentVersion.sizeBytes)}</span>
                                    </div>
                                    <p className="text-[11px] text-blue-900 dark:text-blue-200 font-medium">{versions.currentVersion.name}</p>
                                </div>

                                {/* Past Versions */}
                                {versions.pastVersions && versions.pastVersions.length > 0 ? (
                                    versions.pastVersions.map((v) => (
                                        <div key={v.id} className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
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
                            <p className="text-xs text-gray-400 py-4 text-center">{t('info.versions.none')}</p>
                        )}
                    </div>
                )}
            </div>
            </aside>
        </>
    );
}
