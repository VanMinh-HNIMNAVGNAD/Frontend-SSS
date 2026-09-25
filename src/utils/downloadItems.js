import toast from 'react-hot-toast';
import { filesApi } from '../services/api';
import { API_BASE_URL } from '../constants/api';
import { tOutsideReact } from './translate';

/**
 * Tải một hoặc nhiều mục xuống máy.
 *
 * Gom về đây vì trước đó CÙNG một đoạn "tạo thẻ <a> rồi click" được chép tay ở 5
 * chỗ (Header, FileListView, FileGridView, HomePage, FilePreviewModal) và đã lệch
 * nhau: chỉ Header biết gọi ZIP, còn ba chỗ kia gặp thư mục thì chỉ
 * `alert('Đang tạo liên kết tải xuống thư mục dạng ZIP...')` rồi return — một câu
 * thông báo cho một việc KHÔNG HỀ xảy ra. Chuột phải vào thư mục → Tải xuống chưa
 * bao giờ tải được gì.
 */

/** Kích một lượt tải xuống từ một URL (presigned hoặc blob). */
function triggerDownload(href, fileName, { revoke = false } = {}) {
    const link = document.createElement('a');
    link.href = href;
    // `download` chỉ là GỢI Ý và bị bỏ qua với URL khác origin (presigned URL của
    // R2/GCS) — tên thật lúc đó do header `Content-Disposition` của storage quyết
    // định. Vẫn đặt vì nó là thứ duy nhất có tác dụng với blob URL.
    if (fileName) link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revoke) URL.revokeObjectURL(href);
}

/** URL để TRÌNH DUYỆT tự tải một tệp ZIP theo vé do backend cấp. */
export function zipTicketUrl(ticket) {
    return `${API_BASE_URL}/files/download-zip/${encodeURIComponent(ticket)}`;
}

/**
 * Backend không cấp được vé: chưa deploy endpoint (404/405 — frontend Vercel và backend
 * Heroku không bao giờ lên cùng lúc) hoặc Redis đang hỏng (503). Khi đó lùi về đường cũ.
 *
 * 404 còn có thể là "không có tệp hợp lệ để nén" thật — đường cũ sẽ trả lại đúng lỗi đó,
 * chỉ tốn thêm một request trong một ca vốn đã là lỗi.
 */
export function isZipTicketUnavailable(error) {
    const status = error?.status ?? error?.response?.status;
    return status === 404 || status === 405 || status === 503;
}

/**
 * Đường cũ: tải cả tệp ZIP bằng XHR vào RAM rồi mới lưu. Chỉ còn là đường lùi — người
 * dùng không thấy tiến trình, và thư mục lớn làm tab phình RAM.
 */
async function downloadZipViaBlob(list) {
    const zipBlob = await filesApi.downloadZip(list.map((i) => i.id));
    const blobUrl = URL.createObjectURL(zipBlob);
    // Một mục thì lấy đúng tên của nó — người dùng nhận 'Tài liệu.zip' chứ không
    // phải 'cloudSSS_download_1758...zip' rồi phải tự đoán bên trong là gì.
    const zipName =
        list.length === 1 && list[0].name
            ? `${list[0].name}.zip`
            : `cloudSSS_download_${Date.now()}.zip`;
    triggerDownload(blobUrl, zipName, { revoke: true });
}

/**
 * Tải các mục đã chọn dưới dạng MỘT tệp ZIP do backend nén.
 * Dùng cho mọi lựa chọn có chứa thư mục, và cho lựa chọn nhiều tệp.
 *
 * Đường chính: xin vé tải rồi để TRÌNH DUYỆT tự tải URL đó. Byte ZIP đi thẳng vào trình
 * quản lý tải xuống ngay từ byte đầu — có thanh tiến trình, không giữ gì trong RAM của tab.
 * Trước đây toast "Đang tạo tệp ZIP..." đứng suốt thời gian TẢI (không chỉ thời gian nén),
 * nên người dùng thấy như "nén rất lâu".
 *
 * @param items mảng mục (cần `id`; `name` dùng để đặt tên tệp ZIP khi chỉ có 1 mục)
 */
export async function downloadItemsAsZip(items, { t = tOutsideReact } = {}) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return false;

    const toastId = toast.loading(t('header.zip.creating'));
    try {
        let ticket = null;
        try {
            ({ ticket } = await filesApi.createZipTicket(list.map((i) => i.id)));
        } catch (error) {
            if (!isZipTicketUnavailable(error)) throw error;
        }

        if (ticket) {
            triggerDownload(zipTicketUrl(ticket));
            toast.success(t('header.zip.started'), { id: toastId });
            return true;
        }

        await downloadZipViaBlob(list);
        toast.success(t('header.success.zip'), { id: toastId });
        return true;
    } catch (error) {
        console.error('[download] ZIP thất bại:', error);
        toast.error(error?.message || t('header.error.zip'), { id: toastId });
        return false;
    }
}

/**
 * Tải MỘT mục: thư mục thì nén ZIP, tệp thì đi thẳng qua presigned URL.
 *
 * @param getDownloadUrl hàm lấy presigned URL của FileContext
 */
export async function downloadSingleItem(item, getDownloadUrl, { t = tOutsideReact } = {}) {
    if (!item) return false;
    if (item.type === 'folder') return downloadItemsAsZip([item], { t });

    try {
        const url = await getDownloadUrl(item.id);
        if (!url) return false;
        triggerDownload(url, item.name);
        return true;
    } catch (error) {
        console.error('[download] tải tệp thất bại:', error);
        toast.error(error?.message || t('file.download.failed'));
        return false;
    }
}

export { triggerDownload };
