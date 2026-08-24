import { useState, useEffect, useRef } from 'react';
import { formatBytes } from '../../utils/formatFileSize';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Maximize2, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  FileText, 
  Loader2, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useFiles } from '../../context/FileContext';
import { storageApi } from '../../services/api';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { marked } from 'marked';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Khởi tạo Worker an toàn cho PDF.js
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

const isMarkdownFile = (fileName = '') => {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
};

const isTextLikeFile = (fileName = '', mimeType = '') => {
  const lower = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  return (
    isMarkdownFile(fileName) ||
    mime === 'text/markdown' ||
    mime.startsWith('text/') ||
    /\.(txt|md|markdown|log|env|conf|ini|csv|json|xml|yaml|yml|js|jsx|ts|tsx|py|html|css|sql|sh|c|cpp|h|hpp|java|go|rs|kt|php|vue|svelte|cs)$/i.test(lower)
  );
};

/**
 * Component Canvas chuyên dụng xem PDF nhiều trang, hỗ trợ High-DPI
 */
function PdfCanvasViewer({ url, zoom = 1, rotation = 0 }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  // 1. Tải tài liệu PDF nhị phân từ URL
  useEffect(() => {
    if (!url || typeof url !== 'string') return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Máy chủ lưu trữ phản hồi mã lỗi: ${response.status}`);
        }
        const pdfData = await response.arrayBuffer();
        if (!isMounted) return;

        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const loadedPdf = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
      } catch (err) {
        if (isMounted) {
          console.error('[PDF Preview Error]', err);
          setError('Không thể đọc dữ liệu PDF từ Cloud. Vui lòng tải xuống để xem.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [url]);

  // 2. Vẽ trang PDF lên Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    // Hủy render task trước nếu người dùng bấm trang/zoom liên tục
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
    }

    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');

        // Scale 1.5x cơ sở để chữ sắc nét
        const scale = 1.5 * zoom;
        const viewport = page.getViewport({ scale, rotation });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[PDF Render Error]', err);
        }
      }
    })();

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, currentPage, zoom, rotation]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm font-medium">Đang giải mã và kết xuất trang PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-md">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center overflow-hidden">
      {/* Vùng Canvas hiển thị PDF */}
      <div className="flex-1 w-full overflow-auto flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white transition-all duration-100"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* Thanh chuyển trang */}
      {numPages > 1 && (
        <div className="flex items-center gap-3 px-4 py-2 mt-2 bg-slate-900/90 border border-white/10 rounded-full shadow-lg shrink-0 select-none">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono text-slate-300 font-semibold">
            Trang {currentPage} / {numPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
            title="Trang sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function FilePreviewModal({ item, onClose }) {
  const { getPreviewUrl, getFileTextContent } = useFiles();
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!item) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setZoom(1);
    setRotation(0);

    if (isTextLikeFile(item.name, item.mimeType)) {
      setUrl(null);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const fetchUrl = async () => {
      try {
        const res = await getPreviewUrl(item.id);
        // Trích xuất chính xác chuỗi URL (dù API trả về string hay object { previewUrl: "..." })
        const validUrl = typeof res === 'string' ? res : (res?.previewUrl || res?.url || null);

        if (isMounted) {
          if (validUrl) {
            setUrl(validUrl);
          } else {
            setError('Không thể lấy được liên kết xem trước từ Cloud.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Lỗi khi tải bản xem trước tệp');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUrl();

    return () => {
      isMounted = false;
    };
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose && onClose();
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'r' || e.key === 'R') handleRotate();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleDownload = async () => {
    if (isTextLikeFile(item.name, item.mimeType)) {
      const textResponse = await storageApi.getFileTextContent(item.id).catch(() => null);
      const fallbackContent = textResponse?.content ?? textResponse ?? textContent;
      if (typeof fallbackContent === 'string' && fallbackContent.length > 0) {
        const blob = new Blob([fallbackContent], { type: item.mimeType || 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      }
      return;
    }

    const downloadUrl = await storageApi.getDownloadUrl(item.id).catch(() => null);
    const resolvedUrl = typeof downloadUrl === 'string' ? downloadUrl : downloadUrl?.downloadUrl;

    if (resolvedUrl) {
      const a = document.createElement('a');
      a.href = resolvedUrl;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const mime = (item?.mimeType || '').toLowerCase();
  const name = item?.name || '';
  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name);
  const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name);
  const isAudio = mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(name);
  const isPdf = mime.includes('pdf') || /\.pdf$/i.test(name);
  const isMd = isMarkdownFile(name) || mime === 'text/markdown';
  const isCodeOrText = item ? isTextLikeFile(name, item.mimeType) && Number(item.sizeBytes) <= 5 * 1024 * 1024 : false;
  const isDocx = item ? (
    (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword' ||
      /\.docx$/i.test(name)) && Number(item.sizeBytes) <= 8 * 1024 * 1024
  ) : false;

  const [copied, setCopied] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [mdViewMode, setMdViewMode] = useState('preview'); // 'preview' | 'source'

  const handleCopyText = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (isCodeOrText && item) {
      let isMounted = true;
      setIsLoadingText(true);
      setTextContent(null);
      setMdViewMode('preview');

      getFileTextContent(item.id)
        .then((text) => {
          if (!isMounted) return;
          const content = text?.content !== undefined ? text.content : (typeof text === 'string' ? text : '');
          if (content && !content.startsWith('// Không thể tải trực tiếp') && !content.startsWith('// Lỗi khi đọc')) {
            setTextContent(content);
          } else {
            setTextContent(content || 'Không thể tải nội dung tệp');
          }
        })
        .catch(() => {
          if (isMounted) setTextContent('Không thể tải nội dung tệp văn bản / mã nguồn');
        })
        .finally(() => {
          if (isMounted) setIsLoadingText(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isCodeOrText, item]);

  const [docxHtml, setDocxHtml] = useState(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(null);

  useEffect(() => {
    if (!isDocx || !url) return;

    let isMounted = true;
    setDocxLoading(true);
    setDocxError(null);
    setDocxHtml(null);

    const loadDocx = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Không thể tải tệp Word từ đám mây.');
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (isMounted) {
          setDocxHtml(result.value || '<p class="text-slate-400 italic">Tài liệu không có nội dung văn bản.</p>');
        }
      } catch (err) {
        if (isMounted) {
          console.error('[DOCX Preview Error]', err);
          setDocxError(err.message || 'Lỗi khi chuyển đổi tệp Word (.docx)');
        }
      } finally {
        if (isMounted) setDocxLoading(false);
      }
    };

    loadDocx();

    return () => {
      isMounted = false;
    };
  }, [isDocx, url]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200 text-white select-none">
      {/* Top Floating Header & Controls */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
            {isImage ? <FileImage className="w-5 h-5" /> : isVideo ? <FileVideo className="w-5 h-5" /> : isAudio ? <FileAudio className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate max-w-md" title={item.name}>
              {item.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{formatBytes(item.sizeBytes)}</span>
              <span>•</span>
              <span className="capitalize">{item.storageProvider?.replace('_', ' ') || 'Google Cloud'}</span>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {(isImage || isPdf) && url && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all cursor-pointer"
                title="Thu nhỏ (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 py-1 bg-white/10 rounded-lg text-slate-300 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all cursor-pointer"
                title="Phóng to (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title="Xoay 90 độ (R)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title="Về kích thước gốc"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
            </>
          )}

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải xuống</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all ml-2 cursor-pointer"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-6 relative">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Đang nạp dữ liệu bản xem trước...</p>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-md p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center space-y-3">
            <p className="text-sm text-red-300 font-medium">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all"
            >
              Tải tệp về máy để xem
            </button>
          </div>
        )}

        {!loading && !error && (url || isCodeOrText) && (
          <>
            {isImage && (
              <div className="w-full h-full flex items-center justify-center overflow-auto p-4 cursor-grab active:cursor-grabbing">
                <img
                  src={url}
                  alt={item.name}
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10"
                />
              </div>
            )}

            {isVideo && (
              <div className="max-w-4xl max-h-full w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 relative group flex flex-col items-center justify-center">
                <div className="absolute top-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md text-xs text-slate-300 p-3 rounded-xl border border-white/15 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 flex flex-wrap items-center justify-between gap-2 shadow-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="leading-relaxed">
                      <strong>Lưu ý về âm thanh:</strong> Nếu video mất tiếng, tệp có thể dùng codec AC3/DTS. Vui lòng tải về mở bằng VLC.
                    </span>
                  </div>
                  <button 
                    onClick={handleDownload} 
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-semibold shadow-sm text-xs shrink-0 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file gốc</span>
                  </button>
                </div>

                <video
                  src={url}
                  controls
                  playsInline
                  className="w-full max-h-[75vh] object-contain"
                />
              </div>
            )}

            {isAudio && (
              <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-6 text-center max-w-md w-full">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500/30 to-purple-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shadow-inner animate-pulse">
                  <FileAudio className="w-10 h-10" />
                </div>
                <div className="space-y-1 max-w-full">
                  <h4 className="font-bold text-white text-base truncate px-2" title={item.name}>
                    {item.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Âm thanh • {formatBytes(item.sizeBytes)}
                  </p>
                </div>
                <div className="w-full bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                  <audio
                    src={url}
                    controls
                    className="w-full"
                  />
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải xuống tệp âm thanh gốc</span>
                </button>
              </div>
            )}

            {/* Render PDF Canvas chất lượng cao không bị popup tải về */}
            {isPdf && (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-slate-900/80 border border-white/10 shadow-2xl flex flex-col items-center justify-center">
                <PdfCanvasViewer url={url} zoom={zoom} rotation={rotation} />
              </div>
            )}

            {isDocx && (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-[#0d1117] border border-white/10 shadow-2xl flex flex-col">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-white/10 text-xs font-mono text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    <span className="font-semibold text-slate-200">{item.name}</span>
                  </div>
                  <span>Word Document • {formatBytes(item.sizeBytes)}</span>
                </div>
                <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-950/60 flex justify-center">
                  {docxLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-sm font-medium">Đang chuyển đổi tài liệu Word...</p>
                    </div>
                  ) : docxError ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md my-auto">
                      <p className="text-sm text-red-300 font-medium">{docxError}</p>
                      <button
                        onClick={handleDownload}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all"
                      >
                        Tải tệp về máy để xem
                      </button>
                    </div>
                  ) : (
                    <div
                      className="w-full max-w-3xl bg-white text-slate-900 p-8 sm:p-12 rounded-xl shadow-2xl min-h-full h-fit prose prose-slate max-w-none docx-preview-content [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_th]:bg-slate-100 [&_p]:mb-3 [&_p]:leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3"
                      dangerouslySetInnerHTML={{ __html: docxHtml || '' }}
                    />
                  )}
                </div>
              </div>
            )}

            {isCodeOrText && (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-[#0d1117] border border-white/10 shadow-2xl flex flex-col">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-white/10 text-xs font-mono text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${isMd ? 'bg-sky-400' : 'bg-emerald-500'}`} />
                    <span className="font-semibold text-slate-200 truncate">{item.name}</span>
                    {isMd && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono hidden sm:inline-block">
                        Markdown
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {isMd && (
                      <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-white/10">
                        <button
                          onClick={() => setMdViewMode('preview')}
                          className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer ${
                            mdViewMode === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Xem trước
                        </button>
                        <button
                          onClick={() => setMdViewMode('source')}
                          className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer ${
                            mdViewMode === 'source' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Mã nguồn
                        </button>
                      </div>
                    )}
                    <button
                      onClick={handleCopyText}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-sans font-semibold text-slate-200 transition-colors cursor-pointer"
                    >
                      {copied ? '✓ Đã sao chép' : 'Sao chép'}
                    </button>
                    <span className="hidden sm:inline">UTF-8 • {formatBytes(item.sizeBytes)}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto text-xs text-slate-200 selection:bg-blue-500/40">
                  {isLoadingText ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-sm font-medium">Đang tải nội dung...</p>
                    </div>
                  ) : textContent ? (
                    isMd && mdViewMode === 'preview' ? (
                      <div
                        className="p-6 sm:p-10 max-w-4xl mx-auto markdown-preview-content"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(textContent, { breaks: true, gfm: true })
                        }}
                      />
                    ) : (
                      <SyntaxHighlighter
                        language={(() => {
                          const ext = item?.name?.split('.').pop()?.toLowerCase();
                          const map = {
                            js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
                            py: 'python', json: 'json', html: 'html', css: 'css',
                            sql: 'sql', md: 'markdown', markdown: 'markdown', sh: 'bash', bash: 'bash',
                            java: 'java', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp',
                            cs: 'csharp', php: 'php', xml: 'xml', yaml: 'yaml', yml: 'yaml',
                            env: 'bash', txt: 'text'
                          };
                          return map[ext] || 'text';
                        })()}
                        style={vscDarkPlus}
                        showLineNumbers={true}
                        customStyle={{ margin: 0, padding: '1rem', background: 'transparent', minHeight: '100%' }}
                        wrapLines={true}
                      >
                        {textContent}
                      </SyntaxHighlighter>
                    )
                  ) : (
                    <div className="text-slate-400 p-6 font-mono text-center">Không có nội dung văn bản</div>
                  )}
                </div>
              </div>
            )}

            {!isImage && !isVideo && !isAudio && !isPdf && !isCodeOrText && !isDocx && (
              <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
                <FileText className="w-16 h-16 text-blue-400" />
                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                <p className="text-xs text-slate-400">
                  {Number(item.sizeBytes) > 8 * 1024 * 1024
                    ? 'Dung lượng tệp lớn (>8MB), vui lòng tải về để xem.'
                    : 'Định dạng tệp không hỗ trợ xem trước trực tiếp.'}
                </p>
                <button
                  onClick={handleDownload}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl text-white shadow-lg transition-all"
                >
                  Tải xuống tệp gốc
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Info Bar */}
      <div className="px-6 py-3 bg-slate-900/60 border-t border-white/10 flex items-center justify-end text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span>Phím tắt: ESC (Đóng), +/- (Thu phóng), R (Xoay)</span>
        </div>
      </div>
    </div>
  );
}
