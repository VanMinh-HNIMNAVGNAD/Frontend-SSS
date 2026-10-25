/**
 * Viền sáng có hướng cho một tấm kính LỚN (thanh bên, header, vùng nội dung): sáng ở mép trên-trái,
 * hắt nhẹ ở mép dưới-phải, luôn hiện và đứng yên — không đi theo chuột.
 *
 * Bề mặt nổi (`glass-strong` / `glass-dark`: menu, hộp thoại…) KHÔNG cần component này — chúng tự
 * có viền bằng `::after` (styles/liquid-glass.css). Tấm lớn thì cần: `glass` không có
 * pseudo-element nào để mượn.
 *
 * Đặt làm con TRỰC TIẾP của tấm kính. Tấm kính phải:
 *   • được định vị (`relative` / `absolute` / `fixed`) — viền phủ `inset: 0` theo nó;
 *   • là stacking context (có `z-index`, `isolate`…) để viền `z-index: -1` nằm dưới chữ.
 *     Không được như vậy (Header) thì truyền `className="z-auto"`, đặt nó làm con ĐẦU TIÊN và cho
 *     các khối nội dung `relative` — xem Header.jsx.
 */
export default function GlassEdge({ className = '' }) {
    return <span aria-hidden="true" className={`glass-edge ${className}`} />;
}
