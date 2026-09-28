import { memo } from 'react';
import { useFileThumbnail } from '../../hooks/useFileThumbnail';
import { useInViewport } from '../../hooks/useInViewport';

/**
 * Thumbnail nhỏ gọn (ảnh / video / trang đầu PDF) dùng cho những chỗ chỉ cần một
 * ô xem trước bé: thẻ và hàng ở Trang chủ. Thẻ lớn trong MyDrive vẫn là FileCard
 * vì nó còn render thêm bảng tính, text, code... Cả hai dùng chung một hook nên
 * presigned URL được cache lại, không gọi API hai lần cho cùng một tệp.
 *
 * `fallback` là icon theo loại tệp — hiển thị khi tệp không có (hoặc chưa có)
 * thumbnail: thư mục, tệp nén, audio...
 */
function FileThumbnail({ file, className = '', fallback = null, fit = 'cover' }) {
    // Xem chú thích cùng chỗ trong FileCard: chỉ dựng thumbnail cho ô đã vào gần
    // khung nhìn. Ở Trang chủ ba khu vực cộng lại là 18 ô, còn danh sách dạng hàng
    // thì dài hơn nhiều.
    const [viewportRef, isNearViewport] = useInViewport();
    const { thumbType, thumbUrl } = useFileThumbnail(file, {
        variant: 'mini',
        enabled: isNearViewport,
    });

    const mediaClass = `w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`;

    return (
        <div
            ref={viewportRef}
            className={`relative overflow-hidden flex items-center justify-center shrink-0 ${className}`}
        >
            {thumbType === 'image' && thumbUrl ? (
                <img src={thumbUrl} alt={file?.name || ''} loading="lazy" className={mediaClass} />
            ) : thumbType === 'video' && thumbUrl ? (
                <video
                    src={thumbUrl}
                    muted
                    preload="metadata"
                    className={`${mediaClass} pointer-events-none`}
                    onLoadedMetadata={(e) => { e.target.currentTime = 1; }}
                />
            ) : (
                fallback
            )}
        </div>
    );
}

export default memo(FileThumbnail);
