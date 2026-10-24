import { registerGlassLight } from '../../utils/glassSpotlight';

/**
 * Ánh sáng đi theo chuột cho một tấm kính lớn (thanh bên, header, vùng nội dung, menu, hộp
 * thoại): rê tới đâu, mặt kính bóng lên ở đó và đoạn viền gần con trỏ bắt sáng.
 *
 * Đặt làm con TRỰC TIẾP của tấm kính. Tấm kính phải:
 *   • được định vị (`relative` / `absolute` / `fixed`) — lớp sáng phủ `inset: 0` theo nó;
 *   • là stacking context (có `z-index`, `isolate`, hoặc là `glass-strong`) để lớp sáng
 *     `z-index: -1` nằm dưới chữ. Không được như vậy (Header) thì truyền `className="z-auto"`,
 *     đặt nó làm con ĐẦU TIÊN và cho các khối nội dung `relative` — xem Header.jsx.
 *
 * Toạ độ do utils/glassSpotlight.js ghi; component này không có state, không re-render.
 */
export default function GlassLight({ className = '' }) {
    return (
        <span ref={registerGlassLight} aria-hidden="true" className={`glass-light ${className}`}>
            <span className="glass-light-glow" />
            <span className="glass-light-rim">
                <span className="glass-light-glow" />
            </span>
        </span>
    );
}
