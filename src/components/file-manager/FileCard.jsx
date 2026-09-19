import { memo } from 'react';
import { formatBytes } from '../../utils/formatFileSize';
import { useFileThumbnail, getFileTypeCategory } from '../../hooks/useFileThumbnail';
import { useInViewport } from '../../hooks/useInViewport';
import StarButton from '../common/StarButton';
import { getCardColorVars } from '../../utils/fileColors';
import { useLanguage } from '../../context/LanguageContext';
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

function FileCard({ file, onDoubleClick, onContextMenu, onStarToggle, onOpenInfo, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    const { t } = useLanguage();
    const cat = getFileTypeCategory(file?.name);

    // Màu hiệu lực: customColor (DB) nếu có, ngược lại màu theo phần mở rộng
    const colorVars = getCardColorVars(file);
    const icon = getCatIcon(cat);
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
            className={`group relative flex flex-col justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5 h-52
                bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)]
                hover:bg-[var(--fc-hover-l)] dark:hover:bg-[var(--fc-hover-d)]
                border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)] ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-[#1e1e1e]' : ''}`}
        >
            {/* Checkbox top-left – only this triggers selection */}
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
                className={`absolute top-2 left-2 z-20 p-0.5 rounded transition-all ${
                    isSelected
                        ? 'opacity-100 text-blue-600 dark:text-blue-400'
                        : 'opacity-0 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-blue-600 dark:hover:text-blue-400'
                }`}
                title={isSelected ? 'Bo chon' : 'Chon'}
            >
                {isSelected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
            </button>

            {/* Header: Title & Actions */}
            <div className="flex items-start justify-between gap-2 z-10">
                <div className="flex items-center gap-2 min-w-0 pl-4">
                    {icon}
                    <span
                        className="text-sm font-semibold truncate text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]"
                        title={file.name}
                    >
                        {file.name}
                    </span>
                    {/* Ly do bi gan co doi voi tep trong muc Noi dung rac */}
                    {file.isSpam && (
                        <span
                            className="shrink-0 text-amber-600 dark:text-amber-400"
                            title={file.suspiciousReason || 'Tep bi gan co dang ngo'}
                        >
                            <ShieldAlert className="w-4 h-4" />
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    {/* Tep nguoi khac chia se: cot is_starred thuoc chu so huu nen an nut */}
                    {!file.isSharedWithMe && (
                        <StarButton
                            size="sm"
                            isStarred={file.isStarred}
                            onToggle={() => onStarToggle && onStarToggle(file.id)}
                        />
                    )}
                    <button
                        onClick={(e) => onContextMenu && onContextMenu(e, file)}
                        onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        className="p-1 rounded-full transition-colors text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-[var(--fc-ink-l)] dark:hover:text-[var(--fc-ink-d)] hover:bg-white/60 dark:hover:bg-white/10"
                        title={t('card.fileOptions')}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Khung xem trước — chỉ ám màu rất nhẹ (7%/12%) để ảnh, video và bảng
                tính bên trong vẫn là thứ bắt mắt nhất, không bị nền nuốt mất. */}
            <div className="flex-1 my-2.5 rounded-xl flex flex-col items-center justify-center p-1.5 text-center overflow-hidden relative shadow-2xs transition-colors
                bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)]
                border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                {thumbType === 'image' && thumbUrl ? (
                    /* ── Ảnh ── */
                    <img
                        src={thumbUrl}
                        alt={file.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                    />

                ) : thumbType === 'video' && thumbUrl ? (
                    /* ── Video frame đầu, không autoplay, không cho click ── */
                    <video
                        src={thumbUrl}
                        muted
                        preload="metadata"
                        className="w-full h-full object-cover rounded-lg pointer-events-none"
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
                        <span className="text-[8px] font-mono font-bold tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-[var(--fc-badge-l)] text-[var(--fc-badge-fg-l)] dark:bg-[var(--fc-badge-d)] dark:text-[var(--fc-badge-fg-d)]">
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

            {/* Footer */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[var(--fc-badge-l)] text-[var(--fc-badge-fg-l)] dark:bg-[var(--fc-badge-d)] dark:text-[var(--fc-badge-fg-d)]">
                    {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                </span>
                <span className="font-mono text-[11px] font-semibold text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]">
                    {formatBytes(file.size)}
                </span>
            </div>
        </div>
    );
}

export default memo(FileCard);
