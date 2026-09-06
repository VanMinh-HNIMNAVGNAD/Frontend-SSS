import { memo } from 'react';
import { formatBytes } from '../../utils/formatFileSize';
import { useFileThumbnail, getFileTypeCategory } from '../../hooks/useFileThumbnail';
import StarButton from '../common/StarButton';
import { getEffectiveColor } from '../../utils/fileColors';
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

/**
 * Lấy icon React cho loại file, tô màu theo `color` (HEX).
 * Dùng inline style để hỗ trợ màu tùy chỉnh RGB bất kỳ.
 */
function getCatIcon(cat, color, size = 'w-5 h-5') {
    const style = { color };
    const cls = `${size} shrink-0`;
    switch (cat) {
        case 'pdf':      return <FileText className={cls} style={style} />;
        case 'sheet':    return <FileSpreadsheet className={cls} style={style} />;
        case 'image':    return <ImageIcon className={cls} style={style} />;
        case 'video':    return <Video className={cls} style={style} />;
        case 'audio':    return <Music className={cls} style={style} />;
        case 'database': return <Database className={cls} style={style} />;
        case 'figma':    return <Layers className={cls} style={style} />;
        case 'markdown': return <FileCode className={cls} style={style} />;
        case 'doc':      return <FileText className={cls} style={style} />;
        case 'archive':  return <FileArchive className={cls} style={style} />;
        case 'code':     return <FileCode className={cls} style={style} />;
        default:         return <File className={cls} style={style} />;
    }
}

/**
 * Trả về Tailwind class màu nền nhẹ cho card dựa trên màu HEX hiệu lực.
 * Vì Tailwind không hỗ trợ dynamic class, ta map theo category thay vì hex.
 * customColor sẽ override bằng inline border-color.
 */
const CAT_BG_CLASS = {
    pdf:      'bg-rose-50/70 dark:bg-rose-500/15 hover:bg-rose-100/80 dark:hover:bg-rose-500/25 border-rose-300/90 dark:border-rose-900/50',
    sheet:    'bg-emerald-50/70 dark:bg-emerald-500/15 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/25 border-emerald-300/90 dark:border-emerald-900/50',
    image:    'bg-purple-50/70 dark:bg-purple-500/15 hover:bg-purple-100/80 dark:hover:bg-purple-500/25 border-purple-300/90 dark:border-purple-900/50',
    video:    'bg-violet-50/70 dark:bg-violet-500/15 hover:bg-violet-100/80 dark:hover:bg-violet-500/25 border-violet-300/90 dark:border-violet-900/50',
    audio:    'bg-pink-50/70 dark:bg-pink-500/15 hover:bg-pink-100/80 dark:hover:bg-pink-500/25 border-pink-300/90 dark:border-pink-900/50',
    database: 'bg-emerald-50/70 dark:bg-emerald-500/15 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/25 border-emerald-300/90 dark:border-emerald-900/50',
    figma:    'bg-purple-50/70 dark:bg-purple-500/15 hover:bg-purple-100/80 dark:hover:bg-purple-500/25 border-purple-300/90 dark:border-purple-900/50',
    doc:      'bg-blue-50/70 dark:bg-blue-500/15 hover:bg-blue-100/80 dark:hover:bg-blue-500/25 border-blue-300/90 dark:border-blue-900/50',
    markdown: 'bg-indigo-50/70 dark:bg-indigo-500/15 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/25 border-indigo-300/90 dark:border-indigo-900/50',
    archive:  'bg-amber-50/70 dark:bg-amber-500/15 hover:bg-amber-100/80 dark:hover:bg-amber-500/25 border-amber-300/90 dark:border-amber-900/50',
    code:     'bg-sky-50/70 dark:bg-sky-500/15 hover:bg-sky-100/80 dark:hover:bg-sky-500/25 border-sky-300/90 dark:border-sky-900/50',
    default:  'bg-slate-50/90 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border-slate-300/90 dark:border-gray-700',
};

const CAT_BADGE_CLASS = {
    pdf:      'bg-rose-100 text-rose-800 font-semibold dark:bg-rose-500/20 dark:text-rose-300',
    sheet:    'bg-emerald-100 text-emerald-800 font-semibold dark:bg-emerald-500/20 dark:text-emerald-300',
    image:    'bg-purple-100 text-purple-800 font-semibold dark:bg-purple-500/20 dark:text-purple-300',
    video:    'bg-violet-100 text-violet-800 font-semibold dark:bg-violet-500/20 dark:text-violet-300',
    audio:    'bg-pink-100 text-pink-800 font-semibold dark:bg-pink-500/20 dark:text-pink-300',
    database: 'bg-emerald-100 text-emerald-800 font-semibold dark:bg-emerald-500/20 dark:text-emerald-300',
    figma:    'bg-purple-100 text-purple-800 font-semibold dark:bg-purple-500/20 dark:text-purple-300',
    doc:      'bg-blue-100 text-blue-800 font-semibold dark:bg-blue-500/20 dark:text-blue-300',
    markdown: 'bg-indigo-100 text-indigo-800 font-semibold dark:bg-indigo-500/20 dark:text-indigo-300',
    archive:  'bg-amber-100 text-amber-800 font-semibold dark:bg-amber-500/20 dark:text-amber-300',
    code:     'bg-sky-100 text-sky-800 font-semibold dark:bg-sky-500/20 dark:text-sky-300',
    default:  'bg-slate-200 text-slate-800 font-semibold dark:bg-gray-700 dark:text-gray-300',
};

const CAT_PREVIEW_CLASS = {
    pdf:      'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    sheet:    'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    image:    'bg-purple-500/10 text-purple-800 dark:text-purple-300',
    video:    'bg-violet-500/10 text-violet-800 dark:text-violet-300',
    audio:    'bg-pink-500/10 text-pink-800 dark:text-pink-300',
    database: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    figma:    'bg-purple-500/10 text-purple-800 dark:text-purple-300',
    doc:      'bg-blue-500/10 text-blue-800 dark:text-blue-300',
    markdown: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300',
    archive:  'bg-amber-500/10 text-amber-800 dark:text-amber-300',
    code:     'bg-sky-500/10 text-sky-800 dark:text-sky-300',
    default:  'bg-slate-500/10 text-slate-800 dark:text-gray-300',
};

function FileCard({ file, onDoubleClick, onContextMenu, onStarToggle, onOpenInfo, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    const cat = getFileTypeCategory(file?.name);

    // Màu hiệu lực: customColor (DB) nếu có, ngược lại dùng màu theo extension
    const color = getEffectiveColor(file);
    const icon = getCatIcon(cat, color);
    const bigIcon = getCatIcon(cat, color, 'w-6 h-6');

    const bgClass     = CAT_BG_CLASS[cat]     ?? CAT_BG_CLASS.default;
    const badgeClass  = CAT_BADGE_CLASS[cat]  ?? CAT_BADGE_CLASS.default;
    const previewClass = CAT_PREVIEW_CLASS[cat] ?? CAT_PREVIEW_CLASS.default;

    // Nếu có customColor, override border bằng inline style
    const cardBorderStyle = file?.customColor
        ? { borderColor: `${file.customColor}55` }  // 33% opacity
        : undefined;

    // Thumbnail: logic tải/parse nằm trong hook dùng chung với Trang chủ
    const { thumbType, thumbUrl, textContent, sheetData } = useFileThumbnail(file);

    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, file)}
            style={isSelected ? undefined : cardBorderStyle}
            className={`group relative flex flex-col justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5 h-52 ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50 dark:bg-blue-500/15' : bgClass}`}
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
                        : 'opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400'
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
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={file.name}>
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
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-white/60 transition-colors"
                        title="Tuy chon tep"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Thumbnail Preview */}
            <div className="flex-1 my-2.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700/60 flex flex-col items-center justify-center p-1.5 text-center overflow-hidden relative group-hover:border-blue-400 dark:group-hover:border-blue-500/50 transition-colors shadow-2xs">
                {thumbType === 'image' && thumbUrl ? (
                    /* ── Ảnh ── */
                    <img
                        src={thumbUrl}
                        alt={file.name}
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
                    <div className="w-full h-full rounded-lg overflow-hidden bg-emerald-50/60 dark:bg-emerald-950/40 p-1">
                        <table className="w-full text-left border-collapse" style={{ fontSize: '6px', lineHeight: '1.2' }}>
                            <tbody>
                                {sheetData.map((row, ri) => (
                                    <tr key={ri} className={ri === 0 ? 'bg-emerald-100/80 dark:bg-emerald-900/60 font-bold' : ''}>
                                        {Array.from({ length: Math.min(row.length, 5) }).map((_, ci) => (
                                             <td
                                                key={ci}
                                                className="border border-emerald-200/50 dark:border-emerald-800/50 px-0.5 py-px truncate text-emerald-900 dark:text-emerald-200 opacity-80"
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
                    <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-1.5 bg-linear-to-br from-indigo-50/80 to-purple-50/60 dark:from-indigo-950/30 dark:to-purple-950/20">
                        <div className="p-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-indigo-200 dark:border-indigo-900/50">
                            <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="text-[8px] font-mono font-bold tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                            MARKDOWN
                        </span>
                    </div>

                ) : thumbType === 'text' && textContent ? (
                    /* ── Text / Code / JSON / DOCX ── */
                    <div className={`w-full h-full rounded-lg p-2 overflow-hidden ${previewClass}`}>
                        <pre
                            className="text-[8px] font-mono leading-tight opacity-60 whitespace-pre-wrap break-all text-left"
                            style={{ maxHeight: '100%', overflow: 'hidden' }}
                        >
                            {textContent}
                        </pre>
                    </div>

                ) : (
                    /* ── Fallback: icon mặc định ── */
                    <div className={`w-full h-full rounded-lg flex flex-col items-center justify-center gap-2 ${previewClass}`}>
                        <div className="opacity-30 scale-150">{bigIcon}</div>
                        <span className="text-[10px] font-semibold opacity-40 tracking-wide uppercase">
                            {file.name.split('.').pop() || 'FILE'}
                        </span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-300/80 dark:border-gray-700/60">
                <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${badgeClass}`}>
                    {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                </span>
                <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300 font-semibold">
                    {formatBytes(file.size)}
                </span>
            </div>
        </div>
    );
}

export default memo(FileCard);
