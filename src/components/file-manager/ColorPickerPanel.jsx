import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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

const PANEL_W = 252;   // phải khớp với w-63 bên dưới — dùng để đo trước khi vẽ
// Neo của panel là <div className="relative"> bọc hàng "Đổi màu", tức là mép TRONG
// của menu — menu còn 6px padding nữa mới tới viền. Trừ đi phần đó thì khoảng hở
// nhìn thấy được là 8px, và đối xứng cả khi panel lật sang trái.
const GAP = 14;

/**
 * Bảng chọn màu — bung SANG BÊN PHẢI hàng "Đổi màu" như một submenu, chứ không
 * chèn thêm chiều cao vào giữa context menu.
 *
 * Vì sao phải làm vậy: bản cũ render inline ngay trong menu, nên khi mở bảng màu
 * menu cao thêm ~150px. Logic canh lề của ContextMenu chỉ chạy theo [x, y] nên
 * không đo lại → phần dưới bảng màu bị tràn khỏi mép dưới màn hình ("lẹm mất màu").
 * Là submenu absolute thì chiều cao menu không đổi, và panel tự canh lấy mình.
 *
 * Panel PHẢI nằm trong cây DOM của menu (không dùng portal): ContextMenu đóng khi
 * mousedown rơi ra ngoài `menuRef`, nên portal ra ngoài sẽ khiến bấm vào bảng màu
 * là đóng luôn cả menu. Cùng lý do đó, khoảng hở giữa menu và panel là một vùng
 * CHẾT — bấm hụt vào đó là mousedown ngoài menu và cả menu đóng ngay khi người
 * dùng còn đang với sang bảng màu. `<span>` cầu nối bên dưới phủ kín khoảng hở
 * (trong suốt, vẫn nhận chuột) nên đường đi từ menu sang panel liền một mạch.
 *
 * @param {object}   item          - file/folder đang chọn (để tính màu mặc định)
 * @param {?string}  currentColor  - customColor hiện tại, null nếu chưa đặt
 * @param {Function} onSelectColor - (hex|null) → void, gọi API đổi màu
 * @param {Function} onClose       - đóng riêng bảng màu
 * @param {Function} onCloseMenu   - đóng cả context menu (sau khi đã áp dụng màu)
 */
export default function ColorPickerPanel({ item, currentColor, onSelectColor, onClose, onCloseMenu }) {
    const panelRef = useRef(null);

    // Màu mặc định (khi không có customColor)
    const defaultColor = getDefaultColor(item);
    // Màu đang "active" = customColor hoặc null
    const activeColor = currentColor ?? null;

    // Màu nháp của bộ chọn RGB. Native <input type="color"> bắn `change` liên tục
    // trong lúc người dùng kéo con trỏ; bản cũ gọi thẳng onSelectColor + onClose ở
    // mỗi lần bắn nên vừa chạm vào là bảng màu biến mất và mỗi cú kéo là một lần
    // gọi API + toast. Giữ ở state cục bộ rồi mới "Áp dụng" một lần.
    const [draft, setDraft] = useState(activeColor ?? defaultColor);
    const hasDraft = draft.toLowerCase() !== (activeColor ?? '').toLowerCase();

    // Canh vị trí: mặc định bung sang phải, lật sang trái nếu bên phải không còn đủ
    // chỗ (menu bị bấm sát mép phải màn hình), và đẩy lên nếu chạm mép dưới.
    // Đo trước khi trình duyệt vẽ (useLayoutEffect) nên không thấy panel nhảy.
    const [pos, setPos] = useState(null);

    const measure = useCallback(() => {
        const el = panelRef.current;
        const anchor = el?.parentElement;   // <div className="relative"> bọc hàng "Đổi màu"
        if (!el || !anchor) return;

        const rect = anchor.getBoundingClientRect();
        // Đo bề rộng THẬT thay vì tin vào hằng số: panel có max-width theo viewport
        // nên trên màn hình hẹp nó nhỏ hơn PANEL_W, và tính nhầm thì nó lật sai bên.
        const w = el.offsetWidth || PANEL_W;
        const h = el.offsetHeight;

        // Chỗ trống thực tế hai bên neo. Ưu tiên phải, chỉ lật trái khi phải không
        // đủ; nếu cả hai đều chật thì chọn bên rộng hơn để mất ít nhất.
        const roomRight = window.innerWidth - 8 - (rect.right + GAP);
        const roomLeft = rect.left - GAP - 8;
        const side = roomRight >= w || roomRight >= roomLeft ? 'right' : 'left';

        let top = 0;
        const overflowBottom = rect.top + h - (window.innerHeight - 8);
        if (overflowBottom > 0) top = -overflowBottom;
        if (rect.top + top < 8) top = 8 - rect.top;

        setPos({ side, left: side === 'right' ? rect.width + GAP : -(w + GAP), top });
    }, []);

    useLayoutEffect(() => {
        measure();
        // Panel cao lên khi hàng "Đặt lại màu mặc định" xuất hiện, và đổi bên khi
        // cửa sổ co lại — cả hai đều phải tính lại chứ không đo một lần lúc mở.
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [measure, activeColor]);

    // Esc đóng riêng bảng màu, trả người dùng về context menu thay vì đóng tất cả.
    // Chặn nổi bọt để ContextMenu (nếu sau này bắt Esc) không đóng theo.
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose?.();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [onClose]);

    const handlePreset = (hex) => {
        onSelectColor(hex);
        onCloseMenu?.();
    };

    const handleReset = () => {
        onSelectColor(null);
        onCloseMenu?.();
    };

    const handleApplyDraft = () => {
        onSelectColor(draft);
        onCloseMenu?.();
    };

    return (
        <div
            ref={panelRef}
            className="absolute z-10 w-63 rounded-2xl border border-gray-300 dark:border-gray-700/80 bg-white dark:bg-[#282a2c] shadow-2xl px-3 py-2.5 animate-fade-in"
            style={{
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                visibility: pos ? 'visible' : 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Cầu nối vô hình phủ khoảng hở giữa menu và panel — nối liền vùng nhận
                chuột để rê (hoặc bấm hụt) ở giữa không còn tính là "ngoài menu".
                Nới thêm 24px trên/dưới vì người dùng thường với sang theo đường chéo. */}
            <span
                aria-hidden
                className="absolute"
                style={{
                    [pos?.side === 'left' ? 'right' : 'left']: -GAP,
                    top: -24,
                    width: GAP,
                    height: 'calc(100% + 48px)',
                }}
            />

            {/* Tiêu đề */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Chọn màu
                </span>
                <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                    {activeColor ?? 'mặc định'}
                </span>
            </div>

            {/* Grid 6×5 preset — 6×28px + 5×8px gap = 208px, thừa chỗ cho viền ring */}
            <div className="grid grid-cols-6 gap-2 justify-items-center">
                {PRESET_COLORS.map((hex) => {
                    const isActive = (activeColor ?? '').toLowerCase() === hex.toLowerCase();
                    return (
                        <button
                            key={hex}
                            title={hex}
                            onClick={() => handlePreset(hex)}
                            className={`w-7 h-7 rounded-full transition-transform duration-100 flex items-center justify-center ring-offset-2 ring-offset-white dark:ring-offset-[#282a2c] ${
                                isActive
                                    ? 'ring-2 ring-blue-500'
                                    : 'hover:scale-110 hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-500'
                            }`}
                            style={{ backgroundColor: hex }}
                        >
                            {isActive && (
                                <Check className="w-3.5 h-3.5 text-white drop-shadow" strokeWidth={3} />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-2.5" />

            {/* Bộ chọn RGB tự do */}
            <div className="flex items-center gap-2">
                {/* Native color input phủ trong suốt lên đúng ô swatch: bấm thẳng vào
                    input để mở hộp màu của hệ điều hành. Bản cũ giấu input ra ngoài
                    rồi gọi ref.click() — cú bấm rơi vào nút bọc ngoài trước, và trên
                    một số trình duyệt hộp màu mở ở sai chỗ hoặc không mở lại được. */}
                <label
                    className="relative w-8 h-8 shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer overflow-hidden"
                    style={{ backgroundColor: draft }}
                    title="Mở bảng màu RGB"
                >
                    <input
                        type="color"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </label>

                <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">RGB tuỳ chọn</div>
                    <div className="font-mono text-[12px] text-gray-700 dark:text-gray-200 leading-tight truncate">
                        {draft.toUpperCase()}
                    </div>
                </div>

                <button
                    onClick={handleApplyDraft}
                    disabled={!hasDraft}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Áp dụng
                </button>
            </div>

            {/* Nút đặt lại */}
            {activeColor && (
                <>
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-2.5" />
                    <button
                        onClick={handleReset}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className="flex-1 text-left truncate">Đặt lại màu mặc định</span>
                        <span
                            className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 shrink-0"
                            style={{ backgroundColor: defaultColor }}
                            title={defaultColor}
                        />
                    </button>
                </>
            )}

        </div>
    );
}
