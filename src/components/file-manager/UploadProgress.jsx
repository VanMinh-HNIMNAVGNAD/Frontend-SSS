import { useState, useMemo, memo, useCallback } from 'react';
import { useUpload } from '../../context/UploadContext';
import { useFiles } from '../../context/FileContext';
import {
    UploadCloud,
    CheckCircle2,
    XCircle,
    X,
    ChevronUp,
    ChevronDown,
    Loader2,
    Clock,
    RefreshCw,
} from 'lucide-react';

/**
 * UploadProgress — Hiện progress nhiều file upload song song.
 * Tự động kết nối tới UploadContext & FileContext (hoặc nhận qua props nếu có).
 */
export default memo(function UploadProgress({ queue, onDismissError, onRetry }) {
    const { uploadQueue, removeJob, clearQueue } = useUpload();
    const { retryUploadJob } = useFiles();

    const effectiveQueue = queue !== undefined ? queue : uploadQueue;
    const handleDismissError = onDismissError || removeJob;
    const handleRetry = onRetry || retryUploadJob;

    const [isMinimized, setIsMinimized] = useState(false);

    // Tính toán tổng hợp qua useMemo
    const { totalPercent, activeCount, doneCount, errorCount, pendingCount, allDone } = useMemo(() => {
        if (!effectiveQueue || effectiveQueue.length === 0) {
            return { totalPercent: 0, activeCount: 0, doneCount: 0, errorCount: 0, pendingCount: 0, allDone: false };
        }
        const total = Math.round(
            effectiveQueue.reduce((sum, job) => sum + (job.percent || 0), 0) / effectiveQueue.length,
        );
        const active = effectiveQueue.filter((j) => j.status === 'uploading' || j.status === 'confirming').length;
        const done = effectiveQueue.filter((j) => j.status === 'done').length;
        const err = effectiveQueue.filter((j) => j.status === 'error').length;
        const pending = effectiveQueue.filter((j) => j.status === 'pending').length;
        const isAllDone = effectiveQueue.length > 0 && effectiveQueue.every((j) => j.status === 'done' || j.status === 'error');
        
        return { totalPercent: total, activeCount: active, doneCount: done, errorCount: err, pendingCount: pending, allDone: isAllDone };
    }, [effectiveQueue]);

    if (!effectiveQueue || effectiveQueue.length === 0) return null;

    const headerLabel = allDone
        ? `Hoàn tất ${doneCount}/${effectiveQueue.length} tệp${errorCount > 0 ? ` · ${errorCount} lỗi` : ''}`
        : `Đang tải lên ${activeCount > 0 ? `${activeCount} tệp` : ''}${pendingCount > 0 ? ` · ${pendingCount} chờ` : ''}`;

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
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                        title={isMinimized ? 'Mở rộng' : 'Thu gọn'}
                    >
                        {isMinimized
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {allDone && (
                        <button
                            onClick={clearQueue}
                            className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                            title="Đóng bảng tiến trình"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Thanh tổng tiến trình — luôn hiện ngay cả khi minimize */}
            <div className="px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-400 font-medium">Tổng tiến trình</span>
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
});


/** Một dòng hiển thị trạng thái 1 file */
const FileJobRow = memo(function FileJobRow({ job, jobId, onDismissError, onRetry }) {
    const { fileName, percent, status, error } = job;

    // Bind jobId bên trong component với useCallback để tạo stable ref
    // — không cần tạo inline arrow function ở parent, memo sẽ hoạt động đúng
    const handleDismiss = useCallback(() => onDismissError?.(jobId), [onDismissError, jobId]);
    const handleRetry = useCallback(() => onRetry?.(jobId), [onRetry, jobId]);

    const statusIcon = () => {
        switch (status) {
            case 'done':
                return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
            case 'error':
                return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
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
                                    : status === 'confirming'
                                        ? 'Đang lưu...'
                                        : status === 'pending'
                                            ? 'Chờ...'
                                            : `${percent}%`}
                        </span>
                    </div>

                    {/* Progress bar — ẩn khi pending */}
                    {status !== 'pending' && (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${status === 'done' ? 100 : percent}%` }}
                            />
                        </div>
                    )}

                    {/* Thông báo đổi tên do trùng */}
                    {status === 'done' && job.renamedFrom && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 truncate" title={`Tên gốc: ${job.renamedFrom}`}>
                            ↪ Đã đổi tên từ "{job.renamedFrom}"
                        </p>
                    )}

                    {/* Hiện lỗi nếu có */}
                    {status === 'error' && error && (
                        <p className="text-[10px] text-rose-500 mt-1 truncate" title={error}>
                            {error}
                        </p>
                    )}
                </div>

                {/* Nút retry + dismiss khi lỗi */}
                {status === 'error' && (
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={handleRetry}
                            className="p-0.5 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded transition-colors"
                            title="Thử lại"
                        >
                            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-0.5 hover:bg-rose-50 rounded transition-colors"
                            title="Xóa thông báo lỗi"
                        >
                            <X className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

