import { memo } from 'react';
import { formatBytes } from '../../utils/formatFileSize';
import { useFileThumbnail, getFileTypeCategory } from '../../hooks/useFileThumbnail';
import StarButton from '../common/StarButton';
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

const fileTypeStyles = {
    pdf: {
        bg: 'bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 border-rose-200 dark:border-rose-900/50',
        badgeBg: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
        icon: <FileText className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0" />,
        previewBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
        label: 'PDF Document'
    },
    sheet: {
        bg: 'bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border-emerald-200 dark:border-emerald-900/50',
        badgeBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
        icon: <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        previewBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        label: 'Spreadsheet'
    },
    image: {
        bg: 'bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 dark:hover:bg-purple-500/25 border-purple-200 dark:border-purple-900/50',
        badgeBg: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
        icon: <ImageIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />,
        previewBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
        label: 'Image'
    },
    video: {
        bg: 'bg-violet-50 dark:bg-violet-500/15 hover:bg-violet-100 dark:hover:bg-violet-500/25 border-violet-200 dark:border-violet-900/50',
        badgeBg: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
        icon: <Video className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0" />,
        previewBg: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
        label: 'Video Clip'
    },
    audio: {
        bg: 'bg-pink-50 dark:bg-pink-500/15 hover:bg-pink-100 dark:hover:bg-pink-500/25 border-pink-200 dark:border-pink-900/50',
        badgeBg: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
        icon: <Music className="w-5 h-5 text-pink-600 dark:text-pink-400 shrink-0" />,
        previewBg: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
        label: 'Audio File'
    },
    database: {
        bg: 'bg-cyan-50 dark:bg-cyan-500/15 hover:bg-cyan-100 dark:hover:bg-cyan-500/25 border-cyan-200 dark:border-cyan-900/50',
        badgeBg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
        icon: <Database className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0" />,
        previewBg: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
        label: 'Database SQL'
    },
    figma: {
        bg: 'bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 dark:hover:bg-purple-500/25 border-purple-200 dark:border-purple-900/50',
        badgeBg: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
        icon: <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />,
        previewBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
        label: 'Figma Design'
    },
    doc: {
        bg: 'bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 border-blue-200 dark:border-blue-900/50',
        badgeBg: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
        icon: <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />,
        previewBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
        label: 'Document'
    },
    markdown: {
        bg: 'bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 border-indigo-200 dark:border-indigo-900/50',
        badgeBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
        icon: <FileCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />,
        previewBg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
        label: 'Markdown'
    },
    archive: {
        bg: 'bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border-amber-200 dark:border-amber-900/50',
        badgeBg: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        icon: <FileArchive className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        previewBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        label: 'Archive'
    },
    code: {
        bg: 'bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border-amber-200 dark:border-amber-900/50',
        badgeBg: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        icon: <FileCode className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        previewBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        label: 'Source Code'
    },
    default: {
        bg: 'bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border-slate-200 dark:border-gray-700',
        badgeBg: 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300',
        icon: <File className="w-5 h-5 text-slate-500 dark:text-gray-400 shrink-0" />,
        previewBg: 'bg-slate-500/10 text-slate-700 dark:text-gray-300',
        label: 'File'
    }
};

function FileCard({ file, onDoubleClick, onContextMenu, onStarToggle, onOpenInfo, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    const cat = getFileTypeCategory(file?.name);
    const style = fileTypeStyles[cat] || fileTypeStyles.default;

    // Thumbnail: logic tải/parse nằm trong hook dùng chung với Trang chủ
    const { thumbType, thumbUrl, textContent, sheetData } = useFileThumbnail(file);

    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, file)}
            className={`group relative flex flex-col justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5 h-52 ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50 dark:bg-blue-500/15' : style.bg}`}
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
                    {style.icon}
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
            <div className="flex-1 my-2.5 rounded-xl bg-white/90 dark:bg-white/5 border border-gray-100/80 dark:border-gray-700/60 flex flex-col items-center justify-center p-1.5 text-center overflow-hidden relative group-hover:border-blue-200 transition-colors">
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
                        <div className="p-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                            <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="text-[8px] font-mono font-bold tracking-[0.2em] px-1.5 py-0.5 rounded-md bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                            MARKDOWN
                        </span>
                    </div>

                ) : thumbType === 'text' && textContent ? (
                    /* ── Text / Code / JSON / DOCX ── */
                    <div className={`w-full h-full rounded-lg p-2 overflow-hidden ${style.previewBg}`}>
                        <pre
                            className="text-[8px] font-mono leading-tight opacity-60 whitespace-pre-wrap break-all text-left"
                            style={{ maxHeight: '100%', overflow: 'hidden' }}
                        >
                            {textContent}
                        </pre>
                    </div>

                ) : (
                    /* ── Fallback: icon mặc định (không có chữ "Đang tải...") ── */
                    <div className={`w-full h-full rounded-lg flex flex-col items-center justify-center gap-2 ${style.previewBg}`}>
                        <div className="opacity-30 scale-150">{style.icon}</div>
                        <span className="text-[10px] font-semibold opacity-40 tracking-wide uppercase">
                            {file.name.split('.').pop() || 'FILE'}
                        </span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/50 dark:border-gray-700/60">
                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${style.badgeBg}`}>
                    {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                </span>
                <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300 font-medium">
                    {formatBytes(file.size)}
                </span>
            </div>
        </div>
    );
}

export default memo(FileCard);
