/**
 * Hàng tiêu đề của một trang danh sách (Gần đây, Gắn sao, Thùng rác…): icon + tiêu đề bên trái, nút
 * của riêng trang bên phải.
 *
 * Gom về một chỗ (26/10/2026): mỗi trang từng tự viết hàng này với một màu icon riêng (tím cho Gần
 * đây, vàng cho Gắn sao, hổ phách cho Nội dung rác, xanh cho Được chia sẻ…), khoảng cách dưới lệch
 * nhau (mb-2/mb-4) và một đường kẻ chồng ngay trên đường kẻ của thanh lọc. Nay icon là màu mực nhạt
 * ở mọi trang, không có đường kẻ — thanh lọc bên dưới (FileFilterBar) là đường kẻ duy nhất.
 *
 * @param {React.ComponentType} [icon]
 * @param {React.ReactNode} title Chuỗi (thành <h1>) hoặc một node dựng sẵn (breadcrumb)
 * @param {React.ReactNode} [meta] Chữ phụ ngay sau tiêu đề ("3 tệp")
 * @param {React.ReactNode} [subtitle] Dòng mô tả dưới tiêu đề
 * @param {React.ReactNode} [actions] Nút của trang, bên phải
 */
export default function PageHeader({ icon: Icon, title, meta, subtitle, actions, className = '' }) {
    return (
        <div className={`flex items-center justify-between gap-3 mb-3 min-h-9 ${className}`}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {Icon && <Icon className="w-[22px] h-[22px] shrink-0 text-[var(--ink-muted)]" />}
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                        {typeof title === 'string' ? (
                            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] truncate">{title}</h1>
                        ) : (
                            title
                        )}
                        {meta && <span className="shrink-0 text-xs font-medium text-[var(--ink-subtle)]">{meta}</span>}
                    </div>
                    {subtitle && <p className="mt-0.5 text-xs text-[var(--ink-muted)] line-clamp-2">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}
