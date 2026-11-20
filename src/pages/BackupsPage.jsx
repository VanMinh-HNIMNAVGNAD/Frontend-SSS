import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Archive as DatabaseBackup, DownloadSimple as Download, CircleNotch as Loader2, CursorClick as MousePointerClick, ArrowCounterClockwise as RotateCcw, Trash as Trash2 } from '@phosphor-icons/react';
import PageHeader from '../components/common/PageHeader';
import Notice from '../components/common/Notice';
import { backupsApi } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useFiles } from '../context/FileContext';
import { confirmDialog } from '../utils/dialog';
import { formatBytes } from '../utils/formatFileSize';
import { getFileIcon } from '../utils/getFileIcon';
import { localeTagOf } from '../utils/locale';
import { triggerDownload } from '../utils/downloadItems';

/**
 * Trang "Sao lưu" (17/11/2026). Thay cho sao lưu tự động cả bucket (##86, đã gỡ): người dùng tự
 * chọn tệp ở menu chuột phải → "Sao lưu", bản sao nằm ở kho dự phòng riêng (Backblaze B2), mỗi người
 * tối đa `limitBytes` (50 MB). Ở đây: xem hạn mức, tải xuống, khôi phục về Drive, xoá bản sao lưu.
 */
export default function BackupsPage() {
    const { t, language } = useLanguage();
    const { refreshStorageInfo } = useFiles();
    const [data, setData] = useState(null); // { items, usedBytes, limitBytes }
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState({}); // id → 'download' | 'restore' | 'delete'

    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        backupsApi
            .list()
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || t('common.genericError'));
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey, t]);

    const retry = () => {
        setError(null);
        setReloadKey((k) => k + 1);
    };

    const run = async (id, kind, fn) => {
        setBusy((b) => ({ ...b, [id]: kind }));
        try {
            await fn();
        } catch (err) {
            toast.error(err?.message || t('common.genericError'));
        } finally {
            setBusy((b) => {
                const next = { ...b };
                delete next[id];
                return next;
            });
        }
    };

    const onDownload = (item) =>
        run(item.id, 'download', async () => {
            const { url } = await backupsApi.downloadUrl(item.id);
            triggerDownload(url, item.name);
        });

    const onRestore = (item) =>
        run(item.id, 'restore', async () => {
            const res = await backupsApi.restore(item.id);
            toast.success(t('backups.restore.done', { name: res?.file?.name || item.name }));
            refreshStorageInfo?.();
        });

    const onDelete = async (item) => {
        const ok = await confirmDialog({
            message: t('backups.delete.confirm', { name: item.name }),
            confirmLabel: t('backups.delete.button'),
            danger: true,
        });
        if (!ok) return;
        await run(item.id, 'delete', async () => {
            const res = await backupsApi.remove(item.id);
            setData((d) => d && {
                ...d,
                items: d.items.filter((x) => x.id !== item.id),
                usedBytes: res?.usedBytes ?? d.usedBytes,
            });
        });
    };

    const items = data?.items ?? [];
    const used = data?.usedBytes ?? 0;
    const limit = data?.limitBytes ?? 0;
    const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const barTone = percent >= 100 ? 'bg-[var(--tone-danger)]' : percent >= 85 ? 'bg-[var(--tone-warn)]' : 'bg-[var(--ink-muted)]';
    const dateFmt = new Intl.DateTimeFormat(localeTagOf(language), { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <div className="flex flex-col h-full">
            <PageHeader
                icon={DatabaseBackup}
                title={t('page.backups.title')}
                meta={data ? t('backups.count', { count: items.length }) : null}
            />

            <Notice icon={MousePointerClick} className="mb-3">
                {t('backups.banner.body', { limit: formatBytes(limit || 50 * 1024 * 1024, 0) })}
            </Notice>

            {/* Hạn mức sao lưu — tách khỏi dung lượng Drive ở sidebar */}
            <div className="glass-soft rounded-2xl px-4 py-3 mb-3">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-[var(--ink)]">{t('backups.usage.title')}</span>
                    <span className="text-[var(--ink-muted)] tabular-nums">
                        {data ? t('backups.usage.value', { used: formatBytes(used, 1), limit: formatBytes(limit, 0) }) : '…'}
                    </span>
                </div>
                <div
                    className="mt-2 h-1.5 rounded-full bg-[var(--chip-fill)] overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={t('backups.usage.title')}
                >
                    <div className={`h-full rounded-full ${barTone} transition-[width] duration-300`} style={{ width: `${percent}%` }} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {error ? (
                    <div className="py-12 text-center text-sm text-[var(--ink-muted)]">
                        <p>{error}</p>
                        <button type="button" onClick={retry} className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer">
                            {t('backups.retry')}
                        </button>
                    </div>
                ) : !data ? (
                    <div className="py-12 flex justify-center text-[var(--ink-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin" aria-label={t('backups.loading')} />
                    </div>
                ) : items.length === 0 ? (
                    <div className="py-16 flex flex-col items-center text-center gap-2">
                        <DatabaseBackup className="w-10 h-10 text-[var(--ink-subtle)]" />
                        <p className="text-sm font-semibold text-[var(--ink)]">{t('backups.empty.title')}</p>
                        <p className="text-xs text-[var(--ink-muted)] max-w-sm">{t('backups.empty.body')}</p>
                    </div>
                ) : (
                    <ul className="flex flex-col gap-1">
                        {items.map((item) => {
                            const state = busy[item.id];
                            return (
                                <li key={item.id} className="row-hover rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors">
                                    {getFileIcon({ type: 'file', name: item.name, mimeType: item.mimeType }, 'w-5 h-5')}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-[var(--ink)] truncate" title={item.name}>{item.name}</p>
                                        <p className="text-xs text-[var(--ink-muted)] flex flex-wrap items-center gap-x-2">
                                            <span className="tabular-nums">{formatBytes(item.sizeBytes, 1)}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>{t('backups.item.at', { date: dateFmt.format(new Date(item.createdAt)) })}</span>
                                            {!item.fileId && (
                                                <span className="chip px-1.5 py-0.5 text-[10px]">{t('backups.item.originalDeleted')}</span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <RowButton
                                            label={t('common.download')}
                                            icon={Download}
                                            loading={state === 'download'}
                                            disabled={Boolean(state)}
                                            onClick={() => onDownload(item)}
                                        />
                                        <RowButton
                                            label={t('backups.restore.button')}
                                            icon={RotateCcw}
                                            loading={state === 'restore'}
                                            disabled={Boolean(state)}
                                            onClick={() => onRestore(item)}
                                        />
                                        <RowButton
                                            label={t('backups.delete.button')}
                                            icon={Trash2}
                                            danger
                                            loading={state === 'delete'}
                                            disabled={Boolean(state)}
                                            onClick={() => onDelete(item)}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function RowButton({ label, icon: Icon, onClick, loading, disabled, danger = false }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 hover:bg-[var(--glass-active)] ${
                danger ? 'text-[var(--tone-danger)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        </button>
    );
}
