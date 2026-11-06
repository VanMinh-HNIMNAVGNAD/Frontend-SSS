import toast from 'react-hot-toast';
import { alertDialog, confirmDialog } from './dialog';
import { tOutsideReact } from './translate';

/**
 * Quét virus khi tải xuống (06/11/2026) — phía giao diện.
 *
 * Backend quét tệp ≤ 20 MB TRƯỚC khi ký URL tải xuống (`backend/src/virus-scan`), rồi trả kèm
 * `virusScan: { status, reason, threats, maxBytes, … }`. Có mã độc thì nó trả 403
 * `errorCode: 'VIRUS_DETECTED'` (kèm `details.threats`, `details.canOverride`) thay cho URL.
 *
 * Mọi nút tải tệp lẻ (menu chuột phải, thanh chọn, cửa sổ xem trước, trang chia sẻ) đi qua
 * `fetchDownloadWithScan` để cùng một cách nói chuyện với người dùng:
 *  • quét lâu hơn ~0,6 giây thì hiện "Đang quét virus…" (kết quả lấy từ đệm thì không nhấp nháy);
 *  • sạch / quá lớn / không quét được → một toast ngắn nói rõ;
 *  • có mã độc → hộp thoại. Chủ tệp được chọn "Vẫn tải xuống"; người khác chỉ được báo bị chặn.
 */

const SCANNING_TOAST_DELAY_MS = 600;

/** Lỗi đã được báo cho người dùng bằng hộp thoại — nơi gọi không toast thêm lần nữa. */
export class VirusBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VirusBlockedError';
        this.handled = true;
    }
}

export const isVirusBlocked = (err) => err?.errorCode === 'VIRUS_DETECTED';

function formatMb(bytes) {
    const mb = Number(bytes) / (1024 * 1024);
    return Number.isFinite(mb) && mb > 0 ? `${Math.round(mb)} MB` : '20 MB';
}

/**
 * Toast kết quả quét (không có gì để nói thì im lặng: tính năng tắt, tệp rỗng).
 * @param {object|undefined} scan `virusScan` trong phản hồi download-url
 */
export function notifyVirusScan(scan, { t = tOutsideReact, toastId } = {}) {
    const opts = toastId ? { id: toastId } : {};
    if (!scan) {
        if (toastId) toast.dismiss(toastId);
        return;
    }
    switch (scan.status) {
        case 'clean':
            toast.success(t('virusScan.clean'), { ...opts, duration: 2500 });
            return;
        case 'infected':
            // Chỉ tới đây khi chủ tệp đã bấm "Vẫn tải xuống".
            toast.error(t('virusScan.overridden', { threats: (scan.threats || []).join(', ') }), opts);
            return;
        case 'skipped':
            if (scan.reason === 'too_large') {
                toast(t('virusScan.tooLarge', { size: formatMb(scan.maxBytes) }), { ...opts, duration: 4000 });
            } else if (scan.reason === 'rate_limited') {
                toast(t('virusScan.rateLimited'), { ...opts, duration: 5000 });
            } else if (toastId) {
                toast.dismiss(toastId);
            }
            return;
        case 'error':
            // `continuing`: quét quá giờ chờ nhưng máy chủ vẫn quét tiếp ở nền (Cloudmersive đôi khi
            // mất hơn 25 giây với tệp lớn) — lần tải sau sẽ có kết quả ngay.
            toast(t(scan.continuing ? 'virusScan.slow' : 'virusScan.failed'), { ...opts, duration: 6000 });
            return;
        default:
            if (toastId) toast.dismiss(toastId);
    }
}

/**
 * Xin URL tải xuống qua `request(acceptRisk)` và xử lý mọi kết quả quét virus.
 *
 * @param {(acceptRisk: boolean) => Promise<object>} request trả payload download-url (có
 *   `downloadUrl`, `virusScan`); lỗi phải mang `errorCode`/`details` như lỗi đã chuẩn hoá ở api.js.
 * @param {object} [options]
 * @param {Function} [options.t]
 * @param {string} [options.name] tên tệp để nói trong hộp thoại
 * @param {number} [options.sizeBytes] biết trước cỡ thì khỏi hiện "Đang quét…" cho tệp không được quét
 * @returns {Promise<object>} payload; người dùng huỷ / bị chặn → ném `VirusBlockedError` (đã báo).
 */
export async function fetchDownloadWithScan(request, { t = tOutsideReact, name = '', sizeBytes } = {}) {
    let toastId = null;
    let ticker = null;
    const startedAt = Date.now();
    const mayScan = !(Number(sizeBytes) > 20 * 1024 * 1024);
    // Quét bằng Cloudmersive có thể mất vài chục giây với tệp lớn: toast đếm giây để người dùng thấy
    // nó vẫn đang chạy chứ không treo.
    const timer = mayScan
        ? setTimeout(() => {
              toastId = toast.loading(t('virusScan.scanning'));
              ticker = setInterval(() => {
                  const seconds = Math.round((Date.now() - startedAt) / 1000);
                  toast.loading(t('virusScan.scanningFor', { seconds }), { id: toastId });
              }, 1000);
          }, SCANNING_TOAST_DELAY_MS)
        : null;
    const stopTimers = () => {
        clearTimeout(timer);
        clearInterval(ticker);
    };

    try {
        const res = await request(false);
        stopTimers();
        notifyVirusScan(res?.virusScan, { t, toastId });
        return res;
    } catch (err) {
        stopTimers();
        if (toastId) toast.dismiss(toastId);
        if (!isVirusBlocked(err)) throw err;
        return handleVirusDetected(err, request, { t, name });
    }
}

async function handleVirusDetected(err, request, { t, name }) {
    const threats = (err.details?.threats || []).join(', ') || t('virusScan.unknownThreat');
    const fileLabel = name || t('virusScan.thisFile');

    if (!err.details?.canOverride) {
        await alertDialog({
            title: t('virusScan.detected.title'),
            message: t('virusScan.detected.blocked', { name: fileLabel, threats }),
        });
        throw new VirusBlockedError(err.message);
    }

    const proceed = await confirmDialog({
        title: t('virusScan.detected.title'),
        message: t('virusScan.detected.owner', { name: fileLabel, threats }),
        confirmLabel: t('virusScan.detected.downloadAnyway'),
        cancelLabel: t('virusScan.detected.cancel'),
        danger: true,
    });
    if (!proceed) throw new VirusBlockedError(err.message);

    const res = await request(true);
    notifyVirusScan(res?.virusScan, { t });
    return res;
}
