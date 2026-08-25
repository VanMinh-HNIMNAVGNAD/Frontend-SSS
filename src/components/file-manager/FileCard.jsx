import { useState, useEffect, memo } from 'react';
import { storageApi } from '../../services/api';
import { formatBytes } from '../../utils/formatFileSize';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
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
    Star, 
    MoreVertical, 
    CheckSquare,
    Square,
    ShieldAlert,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

const fileTypeStyles = {
    pdf: {
        bg: 'bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 border-rose-200',
        badgeBg: 'bg-rose-100 text-rose-700',
        icon: <FileText className="w-5 h-5 text-rose-500 shrink-0" />,
        previewBg: 'bg-rose-500/10 text-rose-600',
        label: 'PDF Document'
    },
    sheet: {
        bg: 'bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 border-emerald-200',
        badgeBg: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
        icon: <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        previewBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        label: 'Spreadsheet'
    },
    image: {
        bg: 'bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 border-purple-200',
        badgeBg: 'bg-purple-100 text-purple-700',
        icon: <ImageIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />,
        previewBg: 'bg-purple-500/10 text-purple-700',
        label: 'Image'
    },
    video: {
        bg: 'bg-violet-50 dark:bg-violet-500/15 hover:bg-violet-100 border-violet-200',
        badgeBg: 'bg-violet-100 text-violet-700',
        icon: <Video className="w-5 h-5 text-violet-600 shrink-0" />,
        previewBg: 'bg-violet-500/10 text-violet-700',
        label: 'Video Clip'
    },
    audio: {
        bg: 'bg-pink-50 dark:bg-pink-500/15 hover:bg-pink-100 border-pink-200',
        badgeBg: 'bg-pink-100 text-pink-700',
        icon: <Music className="w-5 h-5 text-pink-600 shrink-0" />,
        previewBg: 'bg-pink-500/10 text-pink-700',
        label: 'Audio File'
    },
    database: {
        bg: 'bg-cyan-50 dark:bg-cyan-500/15 hover:bg-cyan-100 border-cyan-200',
        badgeBg: 'bg-cyan-100 text-cyan-700',
        icon: <Database className="w-5 h-5 text-cyan-600 shrink-0" />,
        previewBg: 'bg-cyan-500/10 text-cyan-700',
        label: 'Database SQL'
    },
    figma: {
        bg: 'bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 border-purple-200',
        badgeBg: 'bg-purple-100 text-purple-700',
        icon: <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />,
        previewBg: 'bg-purple-500/10 text-purple-700',
        label: 'Figma Design'
    },
    doc: {
        bg: 'bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 border-blue-200',
        badgeBg: 'bg-blue-100 text-blue-700 dark:text-blue-300',
        icon: <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />,
        previewBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
        label: 'Document'
    },
    markdown: {
        bg: 'bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 border-indigo-200',
        badgeBg: 'bg-indigo-100 text-indigo-700',
        icon: <FileCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />,
        previewBg: 'bg-indigo-500/10 text-indigo-700',
        label: 'Markdown'
    },
    archive: {
        bg: 'bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 border-amber-200',
        badgeBg: 'bg-amber-100 text-amber-700',
        icon: <FileArchive className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        previewBg: 'bg-amber-500/10 text-amber-700',
        label: 'Archive'
    },
    code: {
        bg: 'bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 border-amber-200',
        badgeBg: 'bg-amber-100 text-amber-700',
        icon: <FileCode className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        previewBg: 'bg-amber-500/10 text-amber-700',
        label: 'Source Code'
    },
    default: {
        bg: 'bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/5 border-slate-200 dark:border-gray-700',
        badgeBg: 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300',
        icon: <File className="w-5 h-5 text-slate-500 dark:text-gray-400 shrink-0" />,
        previewBg: 'bg-slate-500/10 text-slate-700 dark:text-gray-300',
        label: 'File'
    }
};

function getFileTypeCategory(name = '') {
    const n = name.toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.xlsx') || n.endsWith('.csv') || n.endsWith('.xls')) return 'sheet';
    if (/\.(png|jpg|jpeg|svg|webp|gif|bmp|ico)$/i.test(n)) return 'image';
    if (/\.(mp4|mkv|mov|webm)$/i.test(n)) return 'video';
    if (/\.(mp3|wav|flac|ogg|m4a)$/i.test(n)) return 'audio';
    if (/\.(sql|db|sqlite)$/i.test(n)) return 'database';
    if (n.endsWith('.fig')) return 'figma';
    if (/\.(md|markdown)$/i.test(n)) return 'markdown';
    if (/\.(docx|doc|txt|pptx|log|env|conf|ini)$/i.test(n)) return 'doc';
    if (/\.(zip|rar|7z|tar|gz)$/i.test(n)) return 'archive';
    // Danh sách mở rộng toàn bộ các file code
    if (/\.(js|jsx|ts|tsx|py|java|c|cpp|h|hpp|cs|go|rb|php|sh|bash|zsh|json|xml|yaml|yml|toml|css|scss|sass|html|htm|vue|svelte|kt|swift|rs|dart|lua|prisma|graphql)$/i.test(n)) {
        return 'code';
    }
    return 'default';
}

// Giới hạn dung lượng để tải thumbnail: 10MB
const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;

function FileCard({ file, onDoubleClick, onContextMenu, onStarToggle, onOpenInfo, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    const cat = getFileTypeCategory(file?.name);
    const style = fileTypeStyles[cat] || fileTypeStyles.default;

    // thumbType: 'image' | 'video' | 'sheet' | 'text' | null
    const [thumbType, setThumbType] = useState(null);
    const [thumbUrl, setThumbUrl] = useState(null);     // image, video
    const [textContent, setTextContent] = useState(null); // text, code, docx
    const [sheetData, setSheetData] = useState(null);   // xlsx rows [row][col]

    useEffect(() => {
        if (!file?.id) return;

        // Nếu file quá lớn (> 10MB) → fallback icon ngay, không gọi API, không hiện loading
        const sizeOk = !file.size || file.size <= MAX_THUMBNAIL_SIZE;
        if (!sizeOk) return;

        let isMounted = true;

        const n = file.name.toLowerCase();

        // ── Image / Video: dùng presigned URL trực tiếp ──────────────
        if (cat === 'image' || cat === 'video') {
            storageApi.getPreviewUrl(file.id)
                .then(res => {
                    if (isMounted && res?.previewUrl) {
                        setThumbUrl(res.previewUrl);
                        setThumbType(cat); // 'image' | 'video'
                    }
                })
                .catch(() => {});

        // ── PDF: render Canvas qua pdfjsLib buffer (không dùng iframe) ──
        } else if (cat === 'pdf') {
            (async () => {
                try {
                    const res = await storageApi.getPreviewUrl(file.id);
                    if (!res?.previewUrl || !isMounted) return;

                    const pdfData = await fetch(res.previewUrl).then(r => r.arrayBuffer());
                    if (!isMounted) return;

                    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
                    const pdf = await loadingTask.promise;
                    if (!isMounted) return;

                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport }).promise;

                    if (isMounted) {
                        setThumbUrl(canvas.toDataURL('image/jpeg', 0.8));
                        setThumbType('image');
                    }
                } catch { /* fallback icon */ }
            })();

        // ── XLSX / CSV: fetch binary → SheetJS parse → mini table ──
        } else if (cat === 'sheet') {
            (async () => {
                try {
                    const res = await storageApi.getPreviewUrl(file.id);
                    if (!res?.previewUrl || !isMounted) return;
                    const response = await fetch(res.previewUrl);
                    if (!response.ok || !isMounted) return;
                    const buffer = await response.arrayBuffer();
                    if (!isMounted) return;
                    const wb = XLSX.read(buffer, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    if (isMounted && rows.length > 0) {
                        setSheetData(rows.slice(0, 4)); // tối đa 4 hàng đầu
                        setThumbType('sheet');
                    }
                } catch { /* fallback icon */ }
            })();

        // ── DOCX / DOC: fetch binary → mammoth → text ──
        } else if (cat === 'doc' && (n.endsWith('.docx') || n.endsWith('.doc'))) {
            (async () => {
                try {
                    const res = await storageApi.getPreviewUrl(file.id);
                    if (!res?.previewUrl || !isMounted) return;
                    const response = await fetch(res.previewUrl);
                    if (!response.ok || !isMounted) return;
                    const buffer = await response.arrayBuffer();
                    if (!isMounted) return;
                    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
                    if (isMounted && result?.value?.trim()) {
                        setTextContent(result.value.slice(0, 150));
                        setThumbType('text');
                    }
                } catch { /* fallback icon */ }
            })();

        // ── Markdown: text preview riêng ──
        } else if (cat === 'markdown') {
            setThumbType('markdown');

        // ── TXT / LOG / ENV / CONF / INI: text preview ──
        } else if (cat === 'doc' && (n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.env') || n.endsWith('.conf') || n.endsWith('.ini'))) {
            storageApi.getFileTextContent(file.id)
                .then(res => {
                    if (isMounted && res?.content) {
                        setTextContent(res.content.slice(0, 150));
                        setThumbType('text');
                    }
                })
                .catch(() => {});

        // ── Code / JSON / YAML / XML / Shell / ... → text preview ──
        } else if (cat === 'code') {
            storageApi.getFileTextContent(file.id)
                .then(res => {
                    if (isMounted && res?.content) {
                        setTextContent(res.content.slice(0, 150));
                        setThumbType('text');
                    }
                })
                .catch(() => {});
        }
        // archive, audio, database, figma, pptx, default → fallback icon, không gọi API

        return () => {
            isMounted = false;
        };
    }, [cat, file?.id, file?.size]);

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
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onStarToggle && onStarToggle(file.id);
                            }}
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-amber-500 rounded-full hover:bg-white/60 transition-colors"
                            title={file.isStarred ? 'Bo danh dau sao' : 'Danh dau sao'}
                        >
                            <Star className={`w-4 h-4 ${file.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={(e) => onContextMenu && onContextMenu(e, file)}
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
                    <div className="w-full h-full rounded-lg overflow-hidden bg-emerald-50/60 p-1">
                        <table className="w-full text-left border-collapse" style={{ fontSize: '6px', lineHeight: '1.2' }}>
                            <tbody>
                                {sheetData.map((row, ri) => (
                                    <tr key={ri} className={ri === 0 ? 'bg-emerald-100/80 font-bold' : ''}>
                                        {Array.from({ length: Math.min(row.length, 5) }).map((_, ci) => (
                                            <td
                                                key={ci}
                                                className="border border-emerald-200/50 px-0.5 py-px truncate text-emerald-900 opacity-80"
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
