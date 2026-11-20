import { useLayoutEffect, useRef } from 'react';
import { drawStroke } from '../../utils/motion';

/**
 * Dấu ✓ tự vẽ nét khi xuất hiện (anime.js `svg.createDrawable`, utils/motion.js → drawStroke) —
 * cho toast thành công, tệp tải lên xong. Icon Phosphor là hình TÔ (không có nét) nên không vẽ
 * dần được; đây là một đường nét riêng, cỡ và độ đậm khớp nét `bold` của Phosphor.
 *
 * Giảm chuyển động: dấu hiện đủ ngay.
 *
 * @param {{ className?: string, delay?: number, circle?: boolean }} props
 *   `circle`: thêm vòng tròn quanh dấu (thay cho CheckCircle).
 */
export default function DrawnCheck({ className = '', delay = 60, circle = false }) {
    const pathRef = useRef(null);
    useLayoutEffect(() => {
        drawStroke(pathRef.current, delay);
    }, [delay]);
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            {circle && <circle cx="12" cy="12" r="9.25" strokeWidth={1.6} />}
            <path ref={pathRef} d={circle ? 'M8 12.4l2.7 2.7L16.2 9.4' : 'M4.5 12.75l4.75 4.75L19.5 7'} />
        </svg>
    );
}
