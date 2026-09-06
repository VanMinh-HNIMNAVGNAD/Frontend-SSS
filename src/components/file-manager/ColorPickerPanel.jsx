import { useState, useRef } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { getDefaultColor } from '../../utils/fileColors';

/**
 * Bảng 30 màu preset được chọn lọc kỹ.
 * Mỗi hàng 6 ô, 5 hàng = 30 màu, bao phủ toàn bộ vòng màu.
 */
const PRESET_COLORS = [
    // Hàng 1: Đỏ → Cam
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#FACC15', '#FDE68A',
    // Hàng 2: Xanh lá
    '#22C55E', '#16A34A', '#10B981', '#059669', '#34D399', '#6EE7B7',
    // Hàng 3: Xanh dương → Tím
    '#3B82F6', '#2563EB', '#1D4ED8', '#6366F1', '#8B5CF6', '#7C3AED',
    // Hàng 4: Hồng → Đỏ tối
    '#EC4899', '#DB2777', '#F43F5E', '#E11D48', '#DC2626', '#991B1B',
    // Hàng 5: Xám / Neutral
    '#6B7280', '#4B5563', '#374151', '#0EA5E9', '#06B6D4', '#1E293B',
];

export default function ColorPickerPanel({ item, currentColor, onSelectColor, onClose }) {
    const [hovered, setHovered] = useState(null);
    const nativeRef = useRef(null);

    // Màu mặc định (không có customColor)
    const defaultColor = getDefaultColor(item);
    // Màu đang "active" = customColor hoặc null
    const activeColor = currentColor ?? null;

    const handlePreset = (hex) => {
        onSelectColor(hex);
        onClose();
    };

    const handleReset = () => {
        onSelectColor(null);
        onClose();
    };

    const handleNativeChange = (e) => {
        onSelectColor(e.target.value);
        onClose();
    };

    return (
        <div
            className="px-3 py-2.5"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Tiêu đề */}
            <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Chọn màu
            </div>

            {/* Grid 6×5 preset */}
            <div className="grid grid-cols-6 gap-1 mb-2">
                {PRESET_COLORS.map((hex) => {
                    const isActive = activeColor === hex;
                    return (
                        <button
                            key={hex}
                            title={hex}
                            onClick={() => handlePreset(hex)}
                            onMouseEnter={() => setHovered(hex)}
                            onMouseLeave={() => setHovered(null)}
                            className={`w-6 h-6 rounded-full transition-all duration-100 flex items-center justify-center ring-offset-1 ring-offset-white dark:ring-offset-[#282a2c] ${
                                isActive
                                    ? 'ring-2 ring-blue-500 scale-110'
                                    : hovered === hex
                                        ? 'ring-2 ring-gray-400 scale-105'
                                        : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                        >
                            {isActive && (
                                <Check className="w-3 h-3 text-white drop-shadow" strokeWidth={3} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-2" />

            {/* RGB picker tự do + preview */}
            <div className="flex items-center gap-2">
                {/* Native color input ẩn, kích hoạt bằng nút */}
                <input
                    ref={nativeRef}
                    type="color"
                    defaultValue={activeColor ?? defaultColor}
                    onChange={handleNativeChange}
                    className="absolute opacity-0 w-0 h-0 pointer-events-none"
                    tabIndex={-1}
                    aria-hidden
                />
                <button
                    onClick={() => nativeRef.current?.click()}
                    className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-[12px] text-gray-700 dark:text-gray-300"
                    title="Mở bảng màu RGB"
                >
                    {/* Ô preview màu hiện tại */}
                    <span
                        className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                        style={{ backgroundColor: activeColor ?? defaultColor }}
                    />
                    <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                        {activeColor ?? defaultColor}
                    </span>
                    <span className="ml-auto text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                        Tuỳ chỉnh…
                    </span>
                </button>
            </div>

            {/* Nút đặt lại */}
            {activeColor && (
                <>
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-2" />
                    <button
                        onClick={handleReset}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span>Đặt lại màu mặc định</span>
                        <span
                            className="ml-auto w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                            style={{ backgroundColor: defaultColor }}
                            title={defaultColor}
                        />
                    </button>
                </>
            )}
        </div>
    );
}

