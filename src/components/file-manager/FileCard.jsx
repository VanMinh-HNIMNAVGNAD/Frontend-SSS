import { memo } from 'react';
import { formatBytes } from '../../utils/formatFileSize';
import { useFileThumbnail, getFileTypeCategory } from '../../hooks/useFileThumbnail';
import { useInViewport } from '../../hooks/useInViewport';
import { getCardColorVars } from '../../utils/fileColors';
import { useLanguage } from '../../context/LanguageContext';
import { FILE_CARD_HEIGHT_CLASS } from './gridLayout';
import ItemLocation from './ItemLocation';
import { TagIcons } from '../common/TagChips';
import { 
    FileText, 
    FileSpreadsheet, 
    Image as ImageIcon, 
    FileCode, 
    FileArchive, 
    File, 
    Video, 
    Music, 
    Database, 
    Layers, 
    MoreVertical, 
    CheckSquare,
    Square,
    ShieldAlert,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TOÀN BỘ THẺ ĂN THEO MÀU CỦA TỆP
// ─────────────────────────────────────────────────────────────────────────────
// Bản cũ có ba bảng CAT_BG_CLASS / CAT_BADGE_CLASS / CAT_PREVIEW_CLASS cứng theo
// category, còn customColor chỉ được nhét vào borderColor — nên người dùng đổi
// màu một tệp thì gần như chỉ thấy cái viền nhúc nhích.
//
// Nay mọi mảng màu (nền, viền, tên tệp, icon, badge, khung xem trước) đều đọc từ
// biến CSS do getCardColorVars() sinh ra từ MỘT mã màu hiệu lực. Bảng màu đó
// tính tương phản theo WCAG, nên nền đậm tới đâu thì chữ và icon tự kéo sáng/tối
// theo — chủ thể không bị chìm xuống nền. Xem utils/fileColors.js.
//
// Mỗi biến có hai bản `-l` (sáng) / `-d` (tối); biến thể `dark:` của Tailwind
// chọn giúp, nên thẻ không cần biết đang ở theme nào.
//
// Đơn sắc (26/10/2026): tệp chưa tự chọn màu là thẻ kính XÁM, màu loại tệp chỉ còn ở icon (đã dịu);
// nhãn đuôi tệp ở chân thẻ là chữ xám trên nền kính nhạt thay cho con tem màu đặc.

/** Icon theo loại tệp; màu lấy từ biến CSS nên tự đổi theo màu thẻ và theo theme. */
function getCatIcon(cat, size = 'w-5 h-5') {
    const cls = `${size} shrink-0 text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)]`;
    switch (cat) {
        case 'pdf':      return <FileText className={cls} />;
        case 'sheet':    return <FileSpreadsheet className={cls} />;
        case 'image':    return <ImageIcon className={cls} />;
        case 'video':    return <Video className={cls} />;
        case 'audio':    return <Music className={cls} />;
        case 'database': return <Database className={cls} />;
        case 'figma':    return <Layers className={cls} />;
        case 'markdown': return <FileCode className={cls} />;
        case 'doc':      return <FileText className={cls} />;
        case 'archive':  return <FileArchive className={cls} />;
        case 'code':     return <FileCode className={cls} />;
        default:         return <File className={cls} />;
    }
}

function FileCard({ file, onDoubleClick, onContextMenu, isSelected, isCut = false, onToggleSelect, onSelectRange, onOpenLocation }) {
    const { t } = useLanguage();
    const cat = getFileTypeCategory(file?.name);

    // Màu hiệu lực: customColor (DB) nếu có, ngược lại màu theo phần mở rộng
    const colorVars = getCardColorVars(file);
    const icon = getCatIcon(cat, 'w-4 h-4');
    const bigIcon = getCatIcon(cat, 'w-6 h-6');

    // Thumbnail: logic tải/parse nằm trong hook dùng chung với Trang chủ.
    //
    // `enabled` gắn với việc thẻ đã vào gần khung nhìn chưa: một trang Lưới có tới
    // 50 thẻ nhưng chỉ khoảng 12 thẻ được nhìn thấy. Không có cổng này thì mở một
    // thư mục ảnh là 50 lượt xin URL và 50 lượt tải ảnh gốc ngay lập tức, cho 12 ô
    // người dùng đang xem. Bản đã đệm vẫn hiện ngay, cổng chỉ hoãn việc gọi mạng.
    const [viewportRef, isNearViewport] = useInViewport();
    const { thumbType, thumbUrl, textContent, sheetData } = useFileThumbnail(file, {
        enabled: isNearViewport,
    });

    return (
        <div
            ref={viewportRef}
            onDoubleClick={() => onDoubleClick && onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, file)}
            style={colorVars}
            className={`group relative flex flex-col px-2.5 phone:px-2 pt-1.5 pb-1.5 rounded-[18px] cursor-pointer transition-all duration-200 border shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(15,23,42,0.05)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_24px_-12px_rgba(15,23,42,0.28)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-12px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 ${FILE_CARD_HEIGHT_CLASS}
                bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)]
                hover:bg-[var(--fc-hover-l)] dark:hover:bg-[var(--fc-hover-d)]
                border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)] ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-black/55 dark:ring-white/60' : ''}`}
        >
            {/* Hàng đầu: icon loại tệp căn đều ở góc trên trái, tên tệp nâng cao và chữ nhỏ đi,
                ô chọn hiện đè lên icon khi rê chuột/đã chọn, nút sao đã bỏ vì có trong context menu */}
            <div className="flex items-center gap-1.5 h-4.5 z-10">
                <div className="relative w-4.5 h-4.5 shrink-0 flex items-center justify-center">
                    <span className={`flex transition-opacity ${isSelected ? 'opacity-0' : 'group-hover:opacity-0'}`}>
                        {icon}
                    </span>
                    {/* Chỉ ô này mới bật/tắt chọn */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (e.shiftKey) {
                                e.preventDefault();
                                onSelectRange && onSelectRange(file.id);
                            } else {
                                onToggleSelect && onToggleSelect(file.id);
                            }
                        }}
                        onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        className={`absolute inset-0 flex items-center justify-center rounded transition-opacity ${
                            isSelected
                                ? 'opacity-100 text-[var(--ink)]'
                                : 'opacity-0 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-[var(--ink)]'
                        }`}
                        title={isSelected ? t('card.deselect') : t('card.select')}
                    >
                        {isSelected
                            ? <CheckSquare className="w-3.5 h-3.5" />
                            : <Square className="w-3.5 h-3.5" />}
                    </button>
                </div>
                <span
                    className="flex-1 min-w-0 text-[11px] leading-4 font-semibold truncate text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]"
                    title={file.name}
                >
                    {file.name}
                </span>
                {/* Ly do bi gan co doi voi tep trong muc Noi dung rac */}
                {file.isSpam && (
                    <span
                        className="shrink-0 text-[var(--ink-muted)]"
                        title={file.suspiciousReason || t('list.suspicious')}
                    >
                        <ShieldAlert className="w-3.5 h-3.5" />
                    </span>
                )}
                <button
                    onClick={(e) => onContextMenu && onContextMenu(e, file)}
                    onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="shrink-0 -mr-0.5 p-0.5 rounded-full transition-colors opacity-80 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-[var(--fc-ink-l)] dark:hover:text-[var(--fc-ink-d)]"
                    title={t('card.fileOptions')}
                >
                    <MoreVertical className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Khung xem trước — to ra tối đa, nhường toàn bộ không gian cho ảnh/video */}
            <div className="flex-1 min-h-0 my-1 rounded-xl flex flex-col items-center justify-center text-center overflow-hidden relative shadow-2xs transition-colors
                bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)]
                border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                {thumbType === 'image' && thumbUrl ? (
                    /* ── Ảnh ── */
                    <img
                        src={thumbUrl}
                        alt={file.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                ) : thumbType === 'video' && thumbUrl ? (
                    /* ── Video frame đầu, không autoplay, không cho click ── */
                    <video
                        src={thumbUrl}
                        muted
                        preload="metadata"
                        className="w-full h-full object-cover pointer-events-none"
                        onLoadedMetadata={(e) => { e.target.currentTime = 1; }}
                    />

                ) : thumbType === 'sheet' && sheetData ? (
                    /* ── XLSX/CSV mini table ── */
                    <div className="w-full h-full rounded-lg overflow-hidden p-1 bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)]">
                        <table className="w-full text-left border-collapse" style={{ fontSize: '6px', lineHeight: '1.2' }}>
                            <tbody>
                                {sheetData.map((row, ri) => (
                                    <tr
                                        key={ri}
                                        className={ri === 0
                                            ? 'font-bold bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)]'
                                            : ''}
                                    >
                                        {Array.from({ length: Math.min(row.length, 5) }).map((_, ci) => (
                                             <td
                                                key={ci}
                                                className="border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)] px-0.5 py-px truncate text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]"
                                                style={{ maxWidth: '30px' }}
                                            >
                                                {String(row[ci] ?? '').slice(0, 8)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                ) : thumbType === 'markdown' ? (
                    <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-1.5">
                        <div className="p-1.5 rounded-lg shadow-sm bg-white dark:bg-white/10 border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                            <FileCode className="w-4 h-4 text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)]" />
                        </div>
                        <span className="text-[8px] font-mono font-bold tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                            MARKDOWN
                        </span>
                    </div>

                ) : thumbType === 'text' && textContent ? (
                    /* ── Text / Code / JSON / DOCX ── */
                    <div className="w-full h-full rounded-lg p-2 overflow-hidden">
                        <pre
                            className="text-[8px] font-mono leading-tight whitespace-pre-wrap break-all text-left text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]"
                            style={{ maxHeight: '100%', overflow: 'hidden' }}
                        >
                            {textContent}
                        </pre>
                    </div>

                ) : (
                    /* ── Fallback: icon mặc định ── */
                    <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-2">
                        <div className="scale-150 opacity-80">{bigIcon}</div>
                        <span className="text-[10px] font-semibold tracking-wide uppercase text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                            {file.name.split('.').pop() || 'FILE'}
                        </span>
                    </div>
                )}
            </div>

            {/* Chân thẻ: nhãn định dạng góc dưới trái làm nhỏ đi và thụt sâu hơn xuống dưới,
                dung lượng ở góc dưới phải căn đều đối xứng với icon góc trên trái */}
            <div className="flex items-center justify-between gap-1.5 h-3.5 mt-0.5 leading-none">
                {/* Kết quả tìm kiếm (##90): chỗ của nhãn định dạng nhường cho nơi chứa tệp — đuôi tệp
                    đã nằm ngay trong tên ở hàng đầu, còn thẻ thì cao cố định, không thêm dòng được. */}
                <span className="flex items-center gap-1 min-w-0">
                    {file.parentName !== undefined ? (
                        <ItemLocation item={file} onOpen={onOpenLocation} compact />
                    ) : (
                        <span className="px-1 py-px rounded font-semibold text-[8.5px] tracking-wider uppercase bg-black/[0.05] dark:bg-white/[0.08] text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                            {file.name.split('.').pop() || 'FILE'}
                        </span>
                    )}
                    {/* Nhãn riêng của người xem (##91) — thẻ cao cố định nên chỉ là icon, tên trong tooltip */}
                    <TagIcons tags={file.tags} />
                </span>
                <span className="shrink-0 font-mono text-[9.5px] font-medium text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                    {formatBytes(file.size)}
                </span>
            </div>
        </div>
    );
}

export default memo(FileCard);
