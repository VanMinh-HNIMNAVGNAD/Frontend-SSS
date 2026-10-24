import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Reusable Dropdown Component (Single Responsibility: Dropdown UI render & toggle state)
 * @param {string} label - Title or current display label
 * @param {React.ReactNode} icon - Optional leading icon
 * @param {Array<{value: string, label: string, icon?: React.ReactNode}>} options - Dropdown choices
 * @param {string} value - Selected option value
 * @param {function} onChange - Callback when an option is selected
 * @param {boolean} active - Flag to highlight active filter pill. CHỈ cờ này quyết định tô xanh:
 *   bản trước còn tô mọi giá trị khác 'all', nên ô "Sắp xếp" ở thứ tự mặc định ("Tên (A-Z)")
 *   lúc nào cũng sáng như một bộ lọc đang bật (##83).
 */
export default function SelectDropdown({
    label,
    icon: Icon,
    options = [],
    value = 'all',
    onChange,
    active = false
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);
    const displayLabel = selectedOption && value !== 'all' ? selectedOption.label : label;

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 select-none cursor-pointer ${
                    active
                        ? 'glass-soft bg-blue-500/12! dark:bg-blue-400/15! text-blue-800 dark:text-blue-200 ring-1 ring-blue-500/35'
                        : 'glass-soft text-gray-800 dark:text-gray-200'
                }`}
            >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} />}
                <span className="truncate max-w-[140px]">{displayLabel}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-700 dark:text-blue-400' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-52 glass-strong rounded-[18px] p-1.5 z-50 animate-glass-in origin-top-left">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {options.map((option) => {
                            const isSelected = option.value === value;
                            const OptionIcon = option.icon;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                        isSelected
                                            ? 'bg-blue-500/12 dark:bg-blue-400/15 text-blue-800 dark:text-blue-200 font-bold'
                                            : 'text-gray-800 dark:text-gray-200 pointer-coarse:active:bg-black/[0.05] dark:pointer-coarse:active:bg-white/[0.08] font-medium'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 truncate pr-2">
                                        {OptionIcon && <OptionIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}`} />}
                                        <span className="truncate">{option.label}</span>
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
