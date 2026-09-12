import { useState, useMemo, memo, useCallback } from 'react';
import { useUpload } from '../../context/UploadContext';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    UploadCloud,
    CheckCircle2,
    XCircle,
    X,
    Ban,
    Pause,
    Play,
    ChevronUp,
    ChevronDown,
    Loader2,
    Clock,
    RefreshCw,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { formatBytes } from '../../utils/formatFileSize';
import tRich from '../../utils/tRich';
import { isResumableSize } from '../../constants/upload';

/**
 * Các trạng thái còn huỷ được.
 *
 * Cố tình KHÔNG có 'confirming': ở bước đó tệp đã nằm trọn trên cloud và backend
 * đang ghi hàng vào DB. Bấm huỷ lúc ấy chỉ tạo ra một cuộc đua — màn hình báo
 * "đã huỷ" trong khi tệp vẫn hiện ra trong thư mục. Bước này chỉ kéo dài một
 * nhịp mạng nên chờ nó xong rồi xoá là cách trung thực hơn.
 */
const CANCELLABLE = new Set(['pending', 'uploading', 'paused']);

/** Chỉ tệp đang chạy MỚI tạm dừng được (và phải đủ lớn để có phiên quay lại) */
const PAUSABLE = new Set(['pending', 'uploading']);

/**
 * UploadProgress — Hiện progress nhiều file upload song song.
 * Tự động kết nối tới UploadContext & FileContext (hoặc nhận qua props nếu có).
 */
export default memo(function UploadProgress({ queue, onDismissError, onRetry }) {
    const { t } = useLanguage();
    const { uploadQueue, removeJob, clearQueue } = useUpload();
    const {
        retryUploadJob, cancelUploadJob, cancelAllUploads, pauseUploadJob, resumePausedJob,
    } = useFiles();

    const effectiveQueue = queue !== undefined ? queue : uploadQueue;
    const handleDismissError = onDismissError || removeJob;
    const handleRetry = onRetry || retryUploadJob;

    const [isMinimized, setIsMinimized] = useState(false);

    // Huỷ là thao tác KHÔNG lấy lại được: phần đã đẩy lên bị xoá khỏi cloud, tải
    // lại là tải lại từ đầu. Nên luôn hỏi trước, kể cả khi chỉ huỷ một tệp.
    // { kind: 'one', job } | { kind: 'all', count }
    const [cancelTarget, setCancelTarget] = useState(null);

    const askCancelJob = useCallback((job) => setCancelTarget({ kind: 'one', job }), []);
    const closeCancelPrompt = useCallback(() => setCancelTarget(null), []);

    const confirmCancel = useCallback(() => {
        if (!cancelTarget) return;
        if (cancelTarget.kind === 'all') {
            cancelAllUploads();
        } else {
            cancelUploadJob(cancelTarget.job.id);
        }
        setCancelTarget(null);
    }, [cancelTarget, cancelAllUploads, cancelUploadJob]);

    // Tính toán tổng hợp qua useMemo
    const {
        totalPercent, activeCount, doneCount, errorCount, pendingCount, canceledCount, cancellableCount, allDone,
    } = useMemo(() => {
        if (!effectiveQueue || effectiveQueue.length === 0) {
            return {
                totalPercent: 0, activeCount: 0, doneCount: 0, errorCount: 0,
                pendingCount: 0, canceledCount: 0, cancellableCount: 0, allDone: false,
            };
        }
        const total = Math.round(
            effectiveQueue.reduce((sum, job) => sum + (job.percent || 0), 0) / effectiveQueue.length,
        );
        const active = effectiveQueue.filter((j) => j.status === 'uploading' || j.status === 'confirming').length;
        const done = effectiveQueue.filter((j) => j.status === 'done').length;
        const err = effectiveQueue.filter((j) => j.status === 'error').length;
        const pending = effectiveQueue.filter((j) => j.status === 'pending').length;
        const isAllDone =
            effectiveQueue.length > 0 &&
            effectiveQueue.every((j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled');
        const canceled = effectiveQueue.filter((j) => j.status === 'canceled').length;
        const cancellable = effectiveQueue.filter((j) => CANCELLABLE.has(j.status)).length;

        return {
            totalPercent: total,
            activeCount: active,
            doneCount: done,
            errorCount: err,
            pendingCount: pending,
            canceledCount: canceled,
            cancellableCount: cancellable,
            allDone: isAllDone,
        };
    }, [effectiveQueue]);

    if (!effectiveQueue || effectiveQueue.length === 0) return null;

    // Các mệnh đề phụ (" · 2 lỗi", " · 3 chờ") là khoá riêng và được nhúng vào câu
    // chính qua {extra} — ghép bằng template literal như bản cũ thì trật tự và dấu
    // phân cách bị khoá cứng theo tiếng Việt.
    const headerLabel = allDone
        ? t('upload.summary.done', {
              done: doneCount,
              total: effectiveQueue.length,
              extra:
                  (errorCount > 0 ? t('upload.summary.errors', { count: errorCount }) : '') +
                  (canceledCount > 0 ? t('upload.summary.canceled', { count: canceledCount }) : ''),
          })
        : t('upload.summary.uploading', {
              active: activeCount > 0 ? t('upload.summary.nFiles', { count: activeCount }) : '',
              extra: pendingCount > 0 ? t('upload.summary.pending', { count: pendingCount }) : '',
          });

    return (
        <div className="fixed bottom-6 right-6 z-50 w-88 bg-white dark:bg-[#282a2c] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-200"
            style={{ width: '360px' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
                <div className="flex items-center gap-2 text-xs font-semibold">
                    <UploadCloud className={`w-4 h-4 text-blue-400 ${activeCount > 0 ? 'animate-bounce' : ''}`} />
                    <span>{headerLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                    {cancellableCount > 0 && (
                        <button
                            onClick={() => setCancelTarget({ kind: 'all', count: cancellableCount })}
                            className="px-2 py-1 mr-1 rounded-full text-[11px] font-semibold bg-white/10 hover:bg-rose-500/80 text-slate-200 hover:text-white transition-colors cursor-pointer"
                            title={t('upload.cancelN', { count: cancellableCount })}
                        >
                            {t('upload.cancelAll')}
                        </button>
                    )}
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                        title={isMinimized ? t('upload.expand') : t('upload.collapse')}
                    >
                        {isMinimized
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {allDone && (
                        <button
                            onClick={clearQueue}
                            className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                            title={t('upload.closePanel')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Thanh tổng tiến trình — luôn hiện ngay cả khi minimize */}
            <div className="px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400 font-medium">{t('upload.totalProgress')}</span>
                    <span className="text-[11px] font-mono font-bold text-blue-400">{totalPercent}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                            width: `${totalPercent}%`,
                            background: allDone && errorCount === 0
                                ? 'linear-gradient(90deg, #10b981, #059669)'
                                : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                        }}
                    />
                </div>
            </div>

            {/* Danh sách từng file */}
            {!isMinimized && (
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                    {effectiveQueue.map((job) => (
                        <FileJobRow
                            key={job.id}
                            job={job}
                            jobId={job.id}
                            onDismissError={handleDismissError}
                            onRetry={handleRetry}
                            onCancel={askCancelJob}
                            onPause={pauseUploadJob}
                            onResume={resumePausedJob}
                        />
                    ))}
                </div>
            )}

            {/* Hỏi lại trước khi huỷ — xem ghi chú ở state `cancelTarget` */}
            <Modal
                isOpen={Boolean(cancelTarget)}
                onClose={closeCancelPrompt}
                title={cancelTarget?.kind === 'all' ? t('upload.confirmCancelAll') : t('upload.confirmCancelOne')}
                maxWidth="max-w-sm"
            >
                <div className="space-y-4">
                    {cancelTarget?.kind === 'all' ? (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {tRich(t('upload.cancelAll.body'), {
                                count: (
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                                        {t('upload.summary.nFiles', { count: cancelTarget.count })}
                                    </span>
                                ),
                            })}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {tRich(t('upload.cancelOne.title'), {
                                    name: (
                                        <span className="font-semibold text-gray-900 dark:text-gray-100 break-all">
                                            {cancelTarget?.job?.fileName}
                                        </span>
                                    ),
                                })}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t('upload.cancelOne.body', {
                                    percent: cancelTarget?.job?.percent || 0,
                                    ofSize: cancelTarget?.job?.fileObj?.size
                                        ? t('upload.ofSize', { size: formatBytes(cancelTarget.job.fileObj.size) })
                                        : '',
                                })}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={closeCancelPrompt}>
                            {t('upload.keepUploading')}
                        </Button>
                        <Button variant="danger" onClick={confirmCancel}>
                            {cancelTarget?.kind === 'all' ? t('upload.cancelAll') : t('upload.cancelThis')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
});


/** Một dòng hiển thị trạng thái 1 file */
const FileJobRow = memo(function FileJobRow({ job, jobId, onDismissError, onRetry, onCancel, onPause, onResume }) {
    const { t } = useLanguage();
    const { fileName, percent, status, error } = job;

    // Bind jobId bên trong component với useCallback để tạo stable ref
    // — không cần tạo inline arrow function ở parent, memo sẽ hoạt động đúng
    const handleDismiss = useCallback(() => onDismissError?.(jobId), [onDismissError, jobId]);
    const handleRetry = useCallback(() => onRetry?.(jobId), [onRetry, jobId]);
    // Truyền cả job (không chỉ id) vì hộp xác nhận cần tên tệp và % đang dở
    const handleCancel = useCallback(() => onCancel?.(job), [onCancel, job]);
    const handlePause = useCallback(() => onPause?.(jobId), [onPause, jobId]);
    const handleResume = useCallback(() => onResume?.(jobId), [onResume, jobId]);

    // Tệp ≤ 10MB đi một phát, không có phiên nào để quay lại → không mời tạm dừng
    const canPause = PAUSABLE.has(status) && isResumableSize(job.fileObj?.size);

    const statusIcon = () => {
        switch (status) {
            case 'done':
                return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
            case 'error':
                return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
            case 'canceled':
                return <Ban className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />;
            case 'paused':
                return <Pause className="w-4 h-4 text-amber-500 shrink-0" />;
            case 'confirming':
                return <Loader2 className="w-4 h-4 text-indigo-400 shrink-0 animate-spin" />;
            case 'uploading':
                return <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />;
            case 'pending':
            default:
                return <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />;
        }
    };

    const barColor = status === 'error'
        ? 'bg-rose-500'
        : status === 'done'
            ? 'bg-emerald-500'
            : status === 'canceled'
                ? 'bg-gray-300 dark:bg-gray-600'
                : status === 'paused'
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500';

    return (
        <div className="px-4 py-3">
            <div className="flex items-center gap-2.5">
                {statusIcon()}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                            className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate"
                            title={fileName}
                        >
                            {fileName}
                        </span>
                        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 shrink-0">
                            {status === 'done'
                                ? '✓'
                                : status === 'error'
                                    ? '✗'
                                    : status === 'canceled'
                                        ? t('upload.state.canceled')
                                        : status === 'paused'
                                            ? t('upload.state.paused', { percent })
                                            : status === 'confirming'
                                                ? t('upload.state.saving')
                                                : status === 'pending'
                                                    ? t('upload.state.waiting')
                                                    : `${percent}%`}
                        </span>
                    </div>

                    {/* Progress bar — ẩn khi pending và khi đã huỷ */}
                    {status !== 'pending' && status !== 'canceled' && (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${status === 'done' ? 100 : percent}%` }}
                            />
                        </div>
                    )}

                    {/* Thông báo đổi tên do trùng */}
                    {status === 'done' && job.renamedFrom && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 truncate" title={t('upload.originalName', { name: job.renamedFrom })}>
                            {t('upload.renamedFrom', { name: job.renamedFrom })}
                        </p>
                    )}

                    {/* Hiện lỗi nếu có */}
                    {status === 'error' && error && (
                        <p className="text-[10px] text-rose-500 mt-1 truncate" title={error}>
                            {error}
                        </p>
                    )}
                </div>

                {/* Tạm dừng / tải tiếp — chỉ tệp lớn mới có phiên để quay lại */}
                {canPause && (
                    <button
                        onClick={handlePause}
                        className="p-1 shrink-0 rounded hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors cursor-pointer"
                        title={t('upload.pause')}
                        aria-label={t('upload.pauseAria', { name: fileName })}
                    >
                        <Pause className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-amber-500" />
                    </button>
                )}

                {status === 'paused' && (
                    <button
                        onClick={handleResume}
                        className="p-1 shrink-0 rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/15 transition-colors cursor-pointer"
                        title={t('upload.resume')}
                        aria-label={t('upload.resumeAria', { name: fileName })}
                    >
                        <Play className="w-3.5 h-3.5 text-emerald-500" />
                    </button>
                )}

                {/* Nút huỷ — chỉ khi tệp còn đang chờ/đang tải/tạm dừng */}
                {CANCELLABLE.has(status) && (
                    <button
                        onClick={handleCancel}
                        className="p-1 shrink-0 rounded hover:bg-rose-50 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
                        title={t('upload.cancelOne')}
                        aria-label={t('upload.cancelOneAria', { name: fileName })}
                    >
                        <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-rose-500" />
                    </button>
                )}

                {/* Đã huỷ: cho tải lại từ đầu, hoặc dẹp dòng này đi */}
                {status === 'canceled' && (
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={handleRetry}
                            className="p-0.5 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded transition-colors cursor-pointer"
                            title={t('upload.restart')}
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-0.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors cursor-pointer"
                            title={t('upload.dismissRow')}
                        >
                            <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        </button>
                    </div>
                )}

                {/* Nút retry + dismiss khi lỗi */}
                {status === 'error' && (
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={handleRetry}
                            className="p-0.5 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded transition-colors"
                            title={t('upload.retry')}
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-0.5 hover:bg-rose-50 rounded transition-colors"
                            title={t('upload.clearError')}
                        >
                            <X className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

