import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Reusable Dropdown Component (Single Responsibility: Dropdown UI render & toggle state)
 * @param {string} label - Title or current display label
 * @param {React.ReactNode} icon - Optional leading icon
 * @param {Array<{value: string, label: string, icon?: React.ReactNode}>} options - Dropdown choices
 * @param {string} value - Selected option value
 * @param {function} onChange - Callback when an option is selected
 * @param {boolean} active - Flag to highlight active filter pill
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 shadow-2xs select-none ${
                    active || (value && value !== 'all')
                        ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400/30'
                        : 'bg-white dark:bg-[#282a2c] border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${active || (value && value !== 'all') ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />}
                <span className="truncate max-w-[140px]">{displayLabel}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-1.5 w-52 bg-white dark:bg-[#282a2c] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                                    className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                        isSelected 
                                            ? 'bg-blue-50/80 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold' 
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 truncate pr-2">
                                        {OptionIcon && <OptionIcon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />}
                                        <span className="truncate">{option.label}</span>
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
