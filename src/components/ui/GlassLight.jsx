import { registerGlassLight } from '../../utils/glassSpotlight';

/**
 * Chất liệu Liquid Glass cho một tấm kính LỚN (thanh bên, header, vùng nội dung):
 *   • viền sáng có hướng — sáng ở mép trên-trái, hắt nhẹ ở mép dưới-phải, luôn hiện;
 *   • ánh sáng theo chuột — rê tới đâu, mặt kính bóng lên ở đó và đoạn viền gần con trỏ bắt sáng.
 *
 * Bề mặt nổi (`glass-strong` / `glass-dark`: menu, hộp thoại…) KHÔNG cần component này — chúng tự
 * có hai thứ trên bằng CSS (styles/liquid-glass.css). Tấm lớn thì cần, vì lớp sáng phải là phần tử
 * con dời bằng `translate`: vẽ bằng nền của chính tấm kính thì mỗi khung hình trình duyệt vẽ lại
 * cả danh sách tệp bên trong.
 *
 * Đặt làm con TRỰC TIẾP của tấm kính. Tấm kính phải:
 *   • được định vị (`relative` / `absolute` / `fixed`) — lớp sáng phủ `inset: 0` theo nó;
 *   • là stacking context (có `z-index`, `isolate`…) để lớp sáng `z-index: -1` nằm dưới chữ.
 *     Không được như vậy (Header) thì truyền `className="z-auto"`, đặt nó làm con ĐẦU TIÊN và cho
 *     các khối nội dung `relative` — xem Header.jsx.
 *
 * Toạ độ do utils/glassSpotlight.js ghi; component này không có state, không re-render.
 */
export default function GlassLight({ className = '' }) {
    return (
        <span ref={registerGlassLight} aria-hidden="true" className={`glass-light ${className}`}>
            <span className="glass-light-edge" />
            <span className="glass-light-surface">
                <span className="glass-light-glow" />
            </span>
            <span className="glass-light-rim">
                <span className="glass-light-glow" />
            </span>
        </span>
    );
}
