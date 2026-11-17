import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { backupsApi } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatBytes } from '../utils/formatFileSize';

/** Mã lý do từ backend (`BackupSkipReason`) → khoá dịch. */
export const BACKUP_REASON_KEYS = {
    'not-found': 'backups.reason.notFound',
    folder: 'backups.reason.folder',
    trash: 'backups.reason.trash',
    spam: 'backups.reason.spam',
    empty: 'backups.reason.empty',
    unchanged: 'backups.reason.unchanged',
    'storage-error': 'backups.reason.storageError',
};

/**
 * "Sao lưu" ở menu chuột phải (17/11/2026): gửi các tệp đang chọn sang `POST /backups` rồi báo kết
 * quả bằng MỘT toast. Thư mục bị loại ngay ở đây (backend cũng loại) để khỏi tốn một request khi
 * người dùng chỉ chọn thư mục.
 */
export function useBackupFiles() {
    const { t } = useLanguage();

    return useCallback(async (targets) => {
        const files = targets.filter((x) => x && x.type !== 'folder');
        if (!files.length) {
            toast.error(t('backups.reason.folder'));
            return null;
        }
        const toastId = toast.loading(t('backups.toast.running', { count: files.length }));
        try {
            const res = await backupsApi.create(files.map((f) => f.id));
            const done = res.backedUp?.length ?? 0;
            const skipped = res.skipped ?? [];
            const usage = t('backups.toast.usage', {
                used: formatBytes(res.usedBytes, 1),
                limit: formatBytes(res.limitBytes, 0),
            });
            const firstReason = skipped[0]
                ? t('backups.toast.skippedOne', {
                    name: skipped[0].name || '',
                    reason: t(BACKUP_REASON_KEYS[skipped[0].reason] || 'backups.reason.storageError'),
                })
                : '';
            if (done && !skipped.length) {
                toast.success(`${t('backups.toast.done', { count: done })} ${usage}`, { id: toastId });
            } else if (done) {
                toast.success(
                    `${t('backups.toast.partial', { done, skipped: skipped.length })} ${firstReason}`,
                    { id: toastId, duration: 6000 },
                );
            } else {
                // Không tệp nào được sao lưu: nói lý do của tệp đầu tiên (thường mọi tệp cùng một lý do).
                const fn = skipped[0]?.reason === 'unchanged' ? toast.success : toast.error;
                fn(firstReason || t('backups.reason.storageError'), { id: toastId, duration: 6000 });
            }
            return res;
        } catch (err) {
            toast.error(err?.message || t('common.genericError'), { id: toastId, duration: 6000 });
            return null;
        }
    }, [t]);
}
