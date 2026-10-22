import { useState, memo, useCallback, useEffect, useRef } from 'react';
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
import { createRateMeter, createEtaSmoother, formatDuration } from '../../utils/uploadEta';

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

/** Đã kết thúc — không còn gì để chờ. */
const FINISHED = new Set(['done', 'error', 'canceled']);

/**
 * Chiều cao CỐ ĐỊNH của một dòng (px). Là điều kiện để chỉ vẽ những dòng đang nằm trong khung
 * nhìn: tải một thư mục vài nghìn tệp mà dựng đủ vài nghìn dòng thì chính bảng tiến trình làm
 * trang giật.
 */
const ROW_HEIGHT = 56;
/** Số dòng nhìn thấy trước khi phải cuộn. */
const VISIBLE_ROWS = 5;
/** Vẽ dư vài dòng trên/dưới khung nhìn để cuộn nhanh không thấy khoảng trắng. */
const OVERSCAN = 4;
/** Nhịp cập nhật tốc độ / thời gian còn lại — đủ đều để đếm lùi, đủ thưa để không tốn gì. */
const TICK_MS = 1000;
/** Cả đợt xong không lỗi thì bảng tự đóng sau chừng này (trừ khi chuột đang đặt trên bảng). */
const AUTO_CLOSE_MS = 6000;
/** Tệp từ cỡ này trở lên mới có thời gian còn lại riêng trên dòng của nó. */
const ROW_ETA_MIN_BYTES = 8 * 1024 * 1024;

/** Dung lượng gọn: "300 KB", "2.4 MB" — phần lẻ của KB chỉ làm rối mắt. */
const formatSize = (bytes) => formatBytes(bytes, bytes < 1024 * 1024 ? 0 : 1);

/**
 * Số liệu của CẢ ĐỢT tải lên, tính theo BYTE trên mọi tệp còn trong hàng đợi — kể cả tệp đã
 * xong, vì tệp xong không còn bị gỡ khỏi hàng đợi giữa chừng nữa (##89).
 *
 * Bản cũ lấy TRUNG BÌNH % của những dòng còn hiện, mà dòng xong bị gỡ sau 5 giây: mỗi lần một
 * dòng 100% rời đi, trung bình của phần còn lại tụt xuống — đó là cú "giật lại" của thanh tổng
 * sau mỗi tệp. Trung bình % còn coi tệp 1 GB nặng ngang tệp 1 KB.
 *
 * Tệp lỗi / đã huỷ không tính vào tổng: không ai còn đang chờ chúng.
 */
function summarizeQueue(queue, readJobBytes) {
    const s = {
        count: 0, done: 0, active: 0, pending: 0, paused: 0,
        errors: 0, canceled: 0, cancellable: 0,
        totalBytes: 0, doneBytes: 0, sentBytes: 0,
    };
    for (const job of queue) {
        if (CANCELLABLE.has(job.status)) s.cancellable += 1;
        if (job.status === 'error') { s.errors += 1; continue; }
        if (job.status === 'canceled') { s.canceled += 1; continue; }

        if (job.status === 'done') s.done += 1;
        else if (job.status === 'pending') s.pending += 1;
        else if (job.status === 'paused') s.paused += 1;
        else s.active += 1; // uploading / confirming

        const size = Number(job.fileObj?.size) || 0;
        const bytes = readJobBytes?.(job.id);
        // Đang xác nhận = byte đã lên hết, chỉ còn chờ backend ghi hàng.
        const loaded = job.status === 'done' || job.status === 'confirming'
            ? size
            : Math.min(size, bytes?.loaded ?? Math.round((size * (job.percent || 0)) / 100));
        s.count += 1;
        s.totalBytes += size;
        s.doneBytes += loaded;
        // Byte thật sự đi trên mạng trong lượt này — phần có sẵn của phiên tải tiếp thì không.
        s.sentBytes += Math.max(0, loaded - (bytes?.baseline ?? 0));
    }
    s.percent = s.totalBytes > 0
        ? Math.floor((s.doneBytes / s.totalBytes) * 100)
        : s.count > 0 ? Math.floor((s.done / s.count) * 100) : 0;
    s.remainingBytes = Math.max(0, s.totalBytes - s.doneBytes);
    s.allDone = queue.length > 0 && queue.every((j) => FINISHED.has(j.status));
    s.running = s.active + s.pending > 0;
    return s;
}

/**
 * UploadProgress — Hiện progress nhiều file upload song song.
 * Tự động kết nối tới UploadContext & FileContext (hoặc nhận qua props nếu có).
 */
export default memo(function UploadProgress({ queue, onDismissError, onRetry }) {
    const { t } = useLanguage();
    const { uploadQueue, removeJob, clearQueue, readJobBytes } = useUpload();
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

    // Tính lại ở MỖI lần render (vài nghìn phép cộng — rẻ hơn mọi bộ nhớ đệm). Byte nằm ở ref
    // của UploadContext nên React không tự biết khi nào chúng đổi: nhịp 1 giây bên dưới gọi
    // `setTick` để kéo lại chúng giữa hai lần hàng đợi đổi (mỗi 2%).
    const [, setTick] = useState(0);
    const summary = summarizeQueue(effectiveQueue || [], readJobBytes);

    // ── Tốc độ + thời gian còn lại ──────────────────────────────────────────────────
    //
    // Tính trong nhịp đồng hồ chứ không trong lúc render: bộ đo là đối tượng có trạng thái
    // (trung bình trượt theo thời gian), mỗi lần render mà lấy mẫu là số liệu lệch theo số lần
    // React render chứ không theo thời gian thật.
    const [eta, setEta] = useState({ seconds: null, rate: null, stalled: false, rows: {} });
    const queueRef = useRef(effectiveQueue);
    useEffect(() => {
        queueRef.current = effectiveQueue;
    }, [effectiveQueue]);

    const running = summary.running;
    useEffect(() => {
        if (!running) return undefined;
        // Đợt mới ⇒ bộ đo mới: tốc độ của đợt trước không nói gì về đợt này.
        const meter = createRateMeter();
        const smoother = createEtaSmoother();
        const rowMeters = new Map();

        const timer = setInterval(() => {
            const now = Date.now();
            const current = queueRef.current || [];
            const s = summarizeQueue(current, readJobBytes);
            meter.sample(s.sentBytes, now);

            const rate = meter.rate(now);
            const stalled = s.active > 0 && meter.isStalled(now);
            const estimate = rate && rate > 0 && s.remainingBytes > 0 ? s.remainingBytes / rate : null;
            const seconds = stalled ? null : smoother.next(estimate ?? NaN, now);

            // Thời gian còn lại của từng tệp LỚN đang chạy — mười tệp nhỏ chạy song song thì con
            // số riêng của chúng chỉ là nhiễu.
            const rows = {};
            const alive = new Set();
            for (const job of current) {
                const size = Number(job.fileObj?.size) || 0;
                if (job.status !== 'uploading' || size < ROW_ETA_MIN_BYTES) continue;
                const bytes = readJobBytes(job.id);
                if (!bytes) continue;
                alive.add(job.id);
                let entry = rowMeters.get(job.id);
                if (!entry) {
                    entry = { meter: createRateMeter(), smoother: createEtaSmoother() };
                    rowMeters.set(job.id, entry);
                }
                entry.meter.sample(bytes.loaded, now);
                const rowRate = entry.meter.rate(now);
                const left = Math.max(0, size - bytes.loaded);
                const rowEstimate = rowRate && rowRate > 0 ? left / rowRate : null;
                const rowSeconds = entry.smoother.next(rowEstimate ?? NaN, now);
                if (rowSeconds !== null) rows[job.id] = rowSeconds;
            }
            for (const id of rowMeters.keys()) if (!alive.has(id)) rowMeters.delete(id);

            setEta({ seconds, rate, stalled, rows });
            setTick((n) => n + 1);
        }, TICK_MS);

        return () => clearInterval(timer);
    }, [running, readJobBytes]);

    // ── Tự đóng khi cả đợt xong mà không có lỗi ─────────────────────────────────────
    //
    // Hoãn khi người dùng đang chỉ chuột vào bảng, hoặc đang đi trong bảng bằng BÀN PHÍM. Không
    // hoãn theo mọi lần focus: bấm chuột vào "Thử lại" để lại focus trên nút đó (hoặc trên chỗ nút
    // vừa biến mất), và bảng sẽ không bao giờ tự đóng nữa.
    const [isHovered, setIsHovered] = useState(false);
    const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
    const { allDone, errors: errorCount } = summary;
    const holdOpen = isHovered || hasKeyboardFocus;
    useEffect(() => {
        if (!allDone || errorCount > 0 || holdOpen) return undefined;
        const timer = setTimeout(clearQueue, AUTO_CLOSE_MS);
        return () => clearTimeout(timer);
    }, [allDone, errorCount, holdOpen, clearQueue]);

    // ── Danh sách: thứ tự cố định, chỉ vẽ dòng đang nhìn thấy ────────────────────────
    const [scrollTop, setScrollTop] = useState(0);
    const scrollRafRef = useRef(null);
    const handleListScroll = useCallback((e) => {
        const top = e.currentTarget.scrollTop;
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            setScrollTop(top);
        });
    }, []);
    useEffect(() => () => {
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    }, []);

    if (!effectiveQueue || effectiveQueue.length === 0) return null;

    const {
        done: doneCount, active: activeCount, pending: pendingCount, paused: pausedCount,
        canceled: canceledCount, cancellable: cancellableCount,
    } = summary;

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
              extra:
                  (pendingCount > 0 ? t('upload.summary.pending', { count: pendingCount }) : '') +
                  (pausedCount > 0 ? t('upload.summary.paused', { count: pausedCount }) : ''),
          });

    // Dòng trạng thái thời gian — một câu duy nhất, theo đúng thứ tự ưu tiên.
    let timeLabel;
    if (allDone) {
        timeLabel = errorCount > 0 ? t('upload.eta.doneWithErrors') : t('upload.eta.done');
    } else if (!running) {
        timeLabel = pausedCount > 0 ? t('upload.eta.paused') : t('upload.eta.estimating');
    } else if (eta.stalled) {
        timeLabel = t('upload.eta.stalled');
    } else if (eta.seconds === null) {
        timeLabel = t('upload.eta.estimating');
    } else {
        timeLabel = t('upload.eta.left', { eta: formatDuration(eta.seconds, t) });
    }
    const speedLabel = running && !eta.stalled && eta.rate
        ? t('upload.speed', { speed: formatSize(eta.rate) })
        : '';
    const percent = allDone && errorCount === 0 ? 100 : summary.percent;

    const barColor = allDone
        ? errorCount > 0
            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
            : 'linear-gradient(90deg, #10b981, #059669)'
        : 'linear-gradient(90deg, #3b82f6, #6366f1)';

    // Cửa sổ dòng cần vẽ. `scrollTop` kẹp lại khi danh sách vừa ngắn đi (bỏ dòng, đóng bớt).
    const rowCount = effectiveQueue.length;
    const viewportHeight = Math.min(rowCount, VISIBLE_ROWS) * ROW_HEIGHT;
    const maxScroll = Math.max(0, rowCount * ROW_HEIGHT - viewportHeight);
    const top = Math.min(scrollTop, maxScroll);
    const firstRow = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
    const lastRow = Math.min(rowCount, Math.ceil((top + viewportHeight) / ROW_HEIGHT) + OVERSCAN);

    return (
        <div
            className="glass-strong fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-90 rounded-[20px] border overflow-hidden"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={(e) => setHasKeyboardFocus(Boolean(e.target.matches?.(':focus-visible')))}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setHasKeyboardFocus(false);
            }}
        >

            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
                    <UploadCloud className={`w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 ${activeCount > 0 ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{headerLabel}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {cancellableCount > 0 && (
                        <button
                            onClick={() => setCancelTarget({ kind: 'all', count: cancellableCount })}
                            className="px-2 py-1 mr-1 rounded-full text-[11px] font-semibold bg-black/[0.05] dark:bg-white/10 hover:bg-rose-500/90 text-gray-700 dark:text-gray-200 hover:text-white transition-colors cursor-pointer"
                            title={t('upload.cancelN', { count: cancellableCount })}
                        >
                            {t('upload.cancelAll')}
                        </button>
                    )}
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                        title={isMinimized ? t('upload.expand') : t('upload.collapse')}
                        aria-expanded={!isMinimized}
                    >
                        {isMinimized
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {allDone && (
                        <button
                            onClick={clearQueue}
                            className="p-1 hover:bg-black/[0.06] dark:hover:bg-white/10 rounded-full transition-colors text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                            title={t('upload.closePanel')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tổng tiến trình của CẢ ĐỢT — luôn hiện, kể cả khi thu gọn */}
            <div className="px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] border-y border-glass-divider">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-[11px] text-gray-700 dark:text-gray-200 font-semibold truncate" aria-live="polite">
                        {timeLabel}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-300 tabular-nums shrink-0">{percent}%</span>
                </div>
                <div
                    className="w-full bg-black/[0.08] dark:bg-white/10 rounded-full h-1.5 overflow-hidden"
                    role="progressbar"
                    aria-label={t('upload.totalProgress')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                >
                    <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${percent}%`, background: barColor }}
                    />
                </div>
                <div className="flex items-center justify-between gap-3 mt-1.5 text-[10.5px] text-gray-500 dark:text-gray-400 tabular-nums">
                    <span className="truncate">
                        {/* Mẫu số là CẢ ĐỢT (kể cả tệp lỗi / đã huỷ) — khớp với tiêu đề "Hoàn tất 4/6 tệp". */}
                        {t('upload.progress.files', { done: doneCount, total: effectiveQueue.length })}
                        {summary.totalBytes > 0 && (
                            <> · {formatSize(summary.doneBytes)} / {formatSize(summary.totalBytes)}</>
                        )}
                    </span>
                    {speedLabel && <span className="shrink-0">{speedLabel}</span>}
                </div>
            </div>

            {/* Danh sách từng file — thứ tự KHÔNG đổi trong cả đợt, dòng xong ở nguyên chỗ */}
            {!isMinimized && (
                <div
                    // Điện thoại: tối đa 3 dòng — 5 dòng là bảng che hơn nửa màn hình.
                    className="overflow-y-auto overscroll-contain max-h-42 sm:max-h-none"
                    style={{ height: viewportHeight }}
                    onScroll={handleListScroll}
                >
                    <div role="list" className="relative" style={{ height: rowCount * ROW_HEIGHT }}>
                        {effectiveQueue.slice(firstRow, lastRow).map((job, i) => (
                            <div
                                key={job.id}
                                role="listitem"
                                className="absolute inset-x-0 border-b border-glass-divider"
                                style={{ top: (firstRow + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
                            >
                                <FileJobRow
                                    job={job}
                                    jobId={job.id}
                                    etaSeconds={eta.rows[job.id]}
                                    onDismissError={handleDismissError}
                                    onRetry={handleRetry}
                                    onCancel={askCancelJob}
                                    onPause={pauseUploadJob}
                                    onResume={resumePausedJob}
                                />
                            </div>
                        ))}
                    </div>
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


/**
 * Một dòng hiển thị trạng thái 1 file — cao CỐ ĐỊNH (`ROW_HEIGHT`): dòng thứ hai là thanh
 * tiến độ HOẶC một ghi chú (kích thước, lỗi, đổi tên), không bao giờ cả hai.
 */
const FileJobRow = memo(function FileJobRow({ job, jobId, etaSeconds, onDismissError, onRetry, onCancel, onPause, onResume }) {
    const { t } = useLanguage();
    const { fileName, percent, status, error } = job;
    const size = job.fileObj?.size;

    // Bind jobId bên trong component với useCallback để tạo stable ref
    // — không cần tạo inline arrow function ở parent, memo sẽ hoạt động đúng
    const handleDismiss = useCallback(() => onDismissError?.(jobId), [onDismissError, jobId]);
    const handleRetry = useCallback(() => onRetry?.(jobId), [onRetry, jobId]);
    // Truyền cả job (không chỉ id) vì hộp xác nhận cần tên tệp và % đang dở
    const handleCancel = useCallback(() => onCancel?.(job), [onCancel, job]);
    const handlePause = useCallback(() => onPause?.(jobId), [onPause, jobId]);
    const handleResume = useCallback(() => onResume?.(jobId), [onResume, jobId]);

    // Tệp ≤ 10MB đi một phát, không có phiên nào để quay lại → không mời tạm dừng
    const canPause = PAUSABLE.has(status) && isResumableSize(size);

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

    // Chữ bên phải tên tệp
    let rightLabel;
    switch (status) {
        case 'done': rightLabel = size ? formatSize(size) : '✓'; break;
        case 'error': rightLabel = t('upload.state.failed'); break;
        case 'canceled': rightLabel = t('upload.state.canceled'); break;
        case 'paused': rightLabel = t('upload.state.paused', { percent }); break;
        case 'confirming': rightLabel = t('upload.state.saving'); break;
        case 'pending': rightLabel = t('upload.state.waiting'); break;
        default:
            rightLabel = etaSeconds !== undefined
                ? t('upload.row.percentEta', { percent, eta: formatDuration(etaSeconds, t) })
                : `${percent}%`;
    }

    const showBar = status === 'uploading' || status === 'confirming' || status === 'paused';
    const barColor = status === 'paused' ? 'bg-amber-400' : 'bg-linear-to-r from-blue-500 to-indigo-500';

    // Ghi chú ở dòng thứ hai khi không có thanh tiến độ
    let note = null;
    let noteClass = 'text-gray-400 dark:text-gray-500';
    if (status === 'error') {
        note = error || t('upload.itemFailed');
        noteClass = 'text-rose-500';
    } else if (status === 'done' && job.renamedFrom) {
        note = t('upload.renamedFrom', { name: job.renamedFrom });
        noteClass = 'text-amber-600 dark:text-amber-400';
    } else if (status === 'done') {
        note = t('upload.state.done');
    } else if (size) {
        note = formatSize(size);
    }

    return (
        <div className="h-full px-4 flex items-center gap-2.5">
            {statusIcon()}

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span
                        className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate"
                        title={fileName}
                    >
                        {fileName}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
                        {rightLabel}
                    </span>
                </div>

                <div className="mt-1.5 h-3.5 flex items-center">
                    {showBar ? (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-[width] duration-300 ease-out ${barColor}`}
                                style={{ width: `${status === 'confirming' ? 100 : percent}%` }}
                            />
                        </div>
                    ) : (
                        note && (
                            <p
                                className={`text-[10px] leading-3.5 truncate ${noteClass}`}
                                title={status === 'done' && job.renamedFrom ? t('upload.originalName', { name: job.renamedFrom }) : note}
                            >
                                {note}
                            </p>
                        )
                    )}
                </div>
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

            {/* Đã huỷ / lỗi: cho tải lại, hoặc dẹp dòng này đi */}
            {(status === 'canceled' || status === 'error') && (
                <div className="flex items-center gap-0.5 shrink-0">
                    <button
                        onClick={handleRetry}
                        className="p-1 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded transition-colors cursor-pointer"
                        title={status === 'canceled' ? t('upload.restart') : t('upload.retry')}
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded transition-colors cursor-pointer"
                        title={status === 'canceled' ? t('upload.dismissRow') : t('upload.clearError')}
                    >
                        <X className={`w-3.5 h-3.5 ${status === 'error' ? 'text-rose-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    </button>
                </div>
            )}
        </div>
    );
});
