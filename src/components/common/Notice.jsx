import { Info } from 'lucide-react';

const ICON_TONE = {
    neutral: 'bg-[var(--chip-fill)] text-[var(--ink-muted)]',
    warning: 'bg-[var(--tone-warn-soft)] text-[var(--tone-warn)]',
    danger: 'bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]',
};

/**
 * Dải thông báo trong trang (Thùng rác tự xoá sau 30 ngày, cảnh báo Nội dung rác…).
 *
 * Kính nhạt + chữ mực (26/10/2026) thay cho hộp nền xanh / nền hổ phách viền đậm: một dải màu đặc
 * kéo hết bề ngang trang hút mắt hơn chính danh sách tệp. Sắc cảnh báo (nếu có) chỉ còn ở viên icon.
 *
 * @param {React.ComponentType} [icon=Info]
 * @param {'neutral'|'warning'|'danger'} [tone='neutral']
 * @param {React.ReactNode} [title]
 */
export default function Notice({ icon: Icon = Info, tone = 'neutral', title, children, className = '' }) {
    return (
        <div className={`glass-soft rounded-2xl px-3 py-2.5 flex gap-3 ${title ? 'items-start' : 'items-center'} ${className}`}>
            <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${ICON_TONE[tone] || ICON_TONE.neutral}`}>
                <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 py-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                {title && <p className="text-[13px] font-semibold text-[var(--ink)]">{title}</p>}
                {children}
            </div>
        </div>
    );
}
