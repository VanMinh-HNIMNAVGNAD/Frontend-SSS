import { createPortal } from 'react-dom';
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

/**
 * Viên chọn kiểu kính cho thanh lọc (Loại tệp, Ngày sửa đổi, Người sở hữu, Sắp xếp).
 * Các viên không có icon đầu; ChevronDown luôn được giữ lại để nhận biết đây là menu.
 *
 * @param {string} label - Nhãn khi chưa chọn gì (giá trị 'all')
 * @param {React.ComponentType} icon - Icon đầu viên (tuỳ chọn)
 * @param {Array<{value: string, label: string, icon?: React.ComponentType}>} options
 * @param {string} value - Giá trị đang chọn
 * @param {function} onChange - Gọi khi chọn một mục
 * @param {boolean} active - Bộ lọc đang bật. CHỈ cờ này quyết định viên sáng lên: bản trước còn tô
 *   mọi giá trị khác 'all', nên ô "Sắp xếp" ở thứ tự mặc định lúc nào cũng sáng như một bộ lọc
 *   đang bật (##83).
 * @param {function} [onClear] - Có thì viên đang bật hiện nút ✕ bỏ riêng bộ lọc này — không phải
 *   mở menu ra chọn lại "Tất cả", cũng không phải xoá sạch mọi bộ lọc.
 * @param {'left'|'right'} [align='left'] - Mép menu bám theo: viên ở cuối thanh (Sắp xếp) mở sang
 *   trái để menu không tràn ra ngoài khung.
 * @param {string} [clearLabel] - Tooltip / aria-label của nút ✕
 *
 * Đơn sắc (26/10/2026): đang bật là viên kính SÁNG (`glass-active`) + chữ mực đậm thay cho nền xanh
 * chữ xanh; mục đang chọn trong menu cũng vậy, dấu ✓ màu mực.
 */
export default function SelectDropdown({
    label,
    icon: Icon,
    options = [],
    value = 'all',
    onChange,
    active = false,
    onClear,
    align = 'left',
    clearLabel,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const menuRef = useRef(null);
    const [menuPosition, setMenuPosition] = useState(null);

    const updateMenuPosition = useCallback(() => {
        if (!dropdownRef.current) return;
        const rect = dropdownRef.current.getBoundingClientRect();
        const menuWidth = 208;
        const horizontalPadding = 8;
        const left = align === 'right'
            ? rect.right - menuWidth
            : rect.left;
        const clampedLeft = Math.min(
            Math.max(horizontalPadding, left),
            window.innerWidth - menuWidth - horizontalPadding,
        );
        setMenuPosition({
            top: rect.bottom + 8,
            left: clampedLeft,
        });
    }, [align]);

    useLayoutEffect(() => {
        if (!isOpen) return undefined;
        updateMenuPosition();
        return undefined;
    }, [isOpen, updateMenuPosition]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleViewportChange = () => updateMenuPosition();
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);
        return () => {
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [isOpen, updateMenuPosition]);

    // Bấm ra ngoài hoặc Esc thì đóng.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleClickOutside = (event) => {
            if (
                !dropdownRef.current?.contains(event.target)
                && !menuRef.current?.contains(event.target)
            ) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const selectedOption = options.find((opt) => opt.value === value);
    const displayLabel = selectedOption && value !== 'all' ? selectedOption.label : label;
    const showClear = active && typeof onClear === 'function';

    return (
        <div className="relative inline-block shrink-0 whitespace-nowrap text-left" ref={dropdownRef}>
            <div
                className={`flex items-center h-8 rounded-full transition-colors duration-150 select-none ${
                    active ? 'glass-active text-[var(--ink)]' : 'glass-soft text-[var(--ink)]'
                }`}
            >
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    title={label}
                    className={`flex items-center gap-1.5 h-full rounded-full text-[12.5px] cursor-pointer ${
                        showClear ? 'pl-3 pr-1' : 'px-3'
                    } ${active ? 'font-semibold' : 'font-medium'}`}
                >
                    {Icon && (
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`} />
                    )}
                    <span className="truncate max-w-[160px]">{displayLabel}</span>
                    <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 text-[var(--ink-subtle)] transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                        }`}
                    />
                </button>
                {showClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        title={clearLabel}
                        aria-label={clearLabel}
                        className="mr-1 p-1 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                    >
                        <X className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {isOpen && menuPosition && createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    className="fixed w-52 max-w-[calc(100vw-1rem)] glass-strong rounded-[18px] p-1.5 z-[1000] animate-glass-in origin-top-left"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                    <div className="max-h-72 overflow-y-auto custom-scrollbar">
                        {options.map((option) => {
                            const isSelected = option.value === value;
                            const OptionIcon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-2.5 py-2 rounded-xl text-[13px] flex items-center justify-between gap-3 transition-colors cursor-pointer text-[var(--ink)] ${
                                        isSelected
                                            ? 'glass-active font-semibold'
                                            : 'font-medium pointer-coarse:active:bg-black/[0.05] dark:pointer-coarse:active:bg-white/[0.08]'
                                    }`}
                                >
                                    <span className="flex items-center gap-2.5 min-w-0">
                                        {OptionIcon && (
                                            <OptionIcon
                                                className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-subtle)]'}`}
                                            />
                                        )}
                                        <span className="truncate">{option.label}</span>
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[var(--ink)]" strokeWidth={2.5} />}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
