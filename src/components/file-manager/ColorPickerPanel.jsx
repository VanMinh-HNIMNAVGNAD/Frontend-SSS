import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { RotateCcw, Check, Pipette } from 'lucide-react';
import { getDefaultColor } from '../../utils/fileColors';
import { useLanguage } from '../../context/LanguageContext';

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

// ── Đổi hệ màu ────────────────────────────────────────────────────────────
// Bộ chọn làm việc trên HSV chứ không trên hex, vì hai thanh kéo của nó chính là
// hai trục của HSV: thanh dải màu là H, ô vuông là S (ngang) và V (dọc). HSV mới
// là nguồn sự thật — quy về hex sau mỗi lần kéo thì hue sẽ mất khi kéo tới trắng
// hoặc đen (cả hai đều có vô số hue quy về cùng một mã hex), và thanh dải màu sẽ
// tự nhảy về đỏ ngay giữa lúc người dùng đang kéo.

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** '#RRGGBB' → {h: 0-360, s: 0-1, v: 0-1}; trả null nếu chuỗi không hợp lệ. */
function hexToHsv(hex) {
    const m = /^#?([\da-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;

    const int = parseInt(m[1], 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = h * 60;
        if (h < 0) h += 360;
    }

    return { h, s: max ? d / max : 0, v: max };
}

/** {h, s, v} → '#RRGGBB' viết hoa. */
function hsvToHex({ h, s, v }) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] = [
        [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][Math.floor(h / 60) % 6];

    const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

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
    const { t } = useLanguage();
    const panelRef = useRef(null);

    // Màu mặc định (khi không có customColor)
    const defaultColor = getDefaultColor(item);
    // Màu đang "active" = customColor hoặc null
    const activeColor = currentColor ?? null;

    // Màu nháp của bộ chọn. Mỗi lần đổi màu là một lần gọi API + toast, nên giữ ở
    // state cục bộ trong lúc kéo rồi mới "Áp dụng" một lần.
    const [hsv, setHsv] = useState(() => hexToHsv(activeColor ?? defaultColor) ?? { h: 0, s: 0, v: 0 });
    const draft = hsvToHex(hsv);

    // Ô hex là input tự do nên phải có state riêng: người dùng gõ dở "#3B8" thì
    // chuỗi đó chưa quy được ra màu, nhưng vẫn phải nằm nguyên trong ô.
    const [hexInput, setHexInput] = useState(draft);

    const hasDraft = draft.toLowerCase() !== (activeColor ?? '').toLowerCase();

    /** Đổi màu nháp và đồng bộ luôn ô hex — hai thứ này không bao giờ được lệch nhau. */
    const applyHsv = useCallback((next) => {
        setHsv(next);
        setHexInput(hsvToHex(next));
    }, []);

    const handleHexInput = (raw) => {
        setHexInput(raw);
        const parsed = hexToHsv(raw);
        // Chỉ nhận khi đã gõ đủ 6 ký tự; gõ dở thì ô cứ giữ nguyên chữ, màu chưa đổi
        if (parsed) setHsv(parsed);
    };

    // ── Kéo trên ô vuông S/V và thanh dải màu ─────────────────────────────
    // Dùng Pointer Events + setPointerCapture: kéo ra ngoài khung vẫn tiếp tục nhận
    // toạ độ, nên con trỏ không "kẹt" ở mép khi người dùng vung tay hơi quá.
    // Khung được đo qua `e.currentTarget` (chính phần tử gắn handler) thay vì một
    // ref — đỡ hai ref chỉ dùng để đo, và ref thì không được đọc trong lúc render.
    // `toValue(x, y)` nhận toạ độ đã quy về 0–1 trong khung.
    const dragProps = (toValue) => {
        const track = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            toValue(
                clamp01((e.clientX - rect.left) / rect.width),
                clamp01((e.clientY - rect.top) / rect.height),
            );
        };
        return {
            onPointerDown: (e) => {
                e.preventDefault();           // chặn bôi đen chữ trong lúc kéo
                e.currentTarget.setPointerCapture(e.pointerId);
                track(e);
            },
            onPointerMove: (e) => {
                if (e.buttons === 1) track(e);
            },
        };
    };

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

    // Màu thuần của hue đang chọn — dùng cho nền ô S/V và cho núm thanh dải màu
    const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

    return (
        <div
            ref={panelRef}
            className="glass-strong absolute z-10 w-63 rounded-[20px] border px-3 py-2.5 animate-fade-in"
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
                    {t('color.pick')}
                </span>
                <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
                    {activeColor ?? t('color.default')}
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
                            className={`w-7 h-7 rounded-full transition-transform duration-100 flex items-center justify-center ring-offset-2 ring-offset-white dark:ring-offset-[#2a2a2e] ${
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

            {/* ── Bộ chọn màu tự do ───────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 mb-2">
                <Pipette className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('color.custom')}
                </span>
            </div>

            {/* Ô vuông S/V: ngang là độ đậm màu, dọc là độ sáng. Nền là hue hiện tại
                phủ hai lớp gradient (trắng sang ngang, đen lên dọc) — đúng cách một
                color picker vẽ, nên mọi sắc độ của dải màu đó đều với tới được. */}
            <div
                {...dragProps((x, y) => applyHsv({ ...hsv, s: x, v: 1 - y }))}
                className="relative w-full h-26 rounded-lg cursor-crosshair touch-none overflow-hidden border border-gray-200 dark:border-gray-700"
                style={{
                    backgroundColor: hueColor,
                    backgroundImage:
                        'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))',
                }}
            >
                <span
                    className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ring-1 ring-black/30 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{
                        left: `${hsv.s * 100}%`,
                        top: `${(1 - hsv.v) * 100}%`,
                        backgroundColor: draft,
                    }}
                />
            </div>

            {/* Thanh dải màu (hue 0–360°) */}
            <div
                {...dragProps((x) => applyHsv({ ...hsv, h: x * 360 }))}
                className="relative w-full h-3.5 rounded-full mt-2.5 cursor-ew-resize touch-none border border-gray-200 dark:border-gray-700"
                style={{
                    backgroundImage:
                        'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
                }}
            >
                <span
                    className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ring-1 ring-black/30 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }}
                />
            </div>

            {/* Ô hex nhập tay + nút áp dụng */}
            <div className="flex items-center gap-2 mt-2.5">
                <span
                    className="w-8 h-8 shrink-0 rounded-lg border border-gray-300 dark:border-gray-600"
                    style={{ backgroundColor: draft }}
                    title={draft}
                />
                <input
                    value={hexInput}
                    onChange={(e) => handleHexInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && hasDraft) handleApplyDraft();
                        e.stopPropagation();   // đừng để phím tắt toàn cục nuốt mất
                    }}
                    spellCheck={false}
                    maxLength={7}
                    aria-label={t('color.hexAria')}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent font-mono text-[12px] text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    onClick={handleApplyDraft}
                    disabled={!hasDraft}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold btn-accent hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {t('color.apply')}
                </button>
            </div>

            {/* Nút đặt lại */}
            {activeColor && (
                <>
                    <div className="h-px bg-gray-200 dark:bg-gray-700/60 my-2.5" />
                    <button
                        onClick={handleReset}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-gray-600 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className="flex-1 text-left truncate">{t('color.reset')}</span>
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
