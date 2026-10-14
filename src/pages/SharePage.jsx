import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { localeTagOf } from '../utils/locale';
import { languageHeaders } from '../utils/translate';
import { sharingApi } from '../services/api';
import { API_BASE_URL } from '../constants/api';
import { triggerDownload, zipTicketUrl, isZipTicketUnavailable } from '../utils/downloadItems';
import { formatBytes } from '../utils/formatFileSize';
import { loadPdfjs, openPdf } from '../utils/pdfRange';
import { isChunkLoadError, reloadOnceForNewVersion } from '../utils/chunkReload';
import DocxRenderer from '../components/file-manager/DocxRenderer';
import SheetPreview from '../components/file-manager/SheetPreview';
import { safeSessionStorage } from '../utils/safeStorage';
import ZoomableImage from '../components/file-manager/ZoomableImage';
import ImageStagePill from '../components/file-manager/ImageStagePill';
import { usePreviewImage } from '../hooks/usePreviewImage';
import { useZoomPan, ZOOM_MIN, ZOOM_MAX } from '../hooks/useZoomPan';

// pdf.js (`loadPdfjs`) và bộ tô màu mã nguồn chỉ tải khi người nhận link mở đúng loại tệp đó —
// trước ##85 chúng là import tĩnh, nên link chia sẻ một tấm ảnh cũng kéo theo ~1MB JS.
const CodeHighlighter = lazy(() => import('../components/file-manager/CodeHighlighter'));
const MarkdownPreview = lazy(() => import('../components/file-manager/MarkdownPreview'));

// ─── Hằng số: loại MIME hỗ trợ preview ──────────────────────────────────────
const PREVIEW_IMAGE = (mime, name) => mime?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name ?? '');
const PREVIEW_VIDEO = (mime, name) => mime?.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(name ?? '');
const PREVIEW_AUDIO = (mime, name) => mime?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(name ?? '');
const PREVIEW_PDF   = (mime, name) => mime?.includes('pdf') || /\.pdf$/i.test(name ?? '');
// CHỈ .docx: `.doc` là định dạng nhị phân OLE mà không trình dựng nào chạy ở trình
// duyệt đọc được — xem chú thích ở `isWordFile` trong FilePreviewModal.jsx.
const PREVIEW_DOCX  = (mime, name) =>
  mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
  /\.docx$/i.test(name ?? '');
const PREVIEW_TEXT  = (mime, name) =>
  mime?.startsWith('text/') ||
  /\.(js|jsx|ts|tsx|py|html|css|json|sql|md|markdown|txt|text|rst|adoc|xml|yaml|yml|sh|env|conf|log|csv|tsv|ini|toml|properties|c|cpp|h|hpp|java|go|rs|kt|php|vue|svelte|cs)$/i.test(name ?? '');
// Xét SAU `PREVIEW_TEXT` ở mọi nơi dùng: Windows gắn mime `application/vnd.ms-excel`
// cho cả .csv, mà .csv thì thuộc về khung văn bản.
const PREVIEW_SHEET = (mime, name) =>
  !PREVIEW_TEXT(mime, name) &&
  (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet' ||
    /\.(xlsx|xlsm|xltx|xls|ods)$/i.test(name ?? ''));
const isMarkdownFile = (name = '') => /\.(md|markdown)$/i.test(name ?? '');

// docx/xlsx được dựng TRỌN trên main thread của người nhận link (docx-preview, SheetJS):
// tệp vài trăm MB là treo rồi sập tab. Cùng ngưỡng với `FilePreviewModal` (10MB) — trước
// 02/10/2026 trang chia sẻ không có ngưỡng nào (ledger ##64).
const SHARE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
// Văn bản thì chỉ đọc phần ĐẦU tệp: đủ cho 150.000 ký tự hiển thị, không kéo cả tệp 1GB
// vào RAM chỉ để cắt bỏ gần hết.
const TEXT_PREVIEW_READ_BYTES = 512 * 1024;
const isTooLargeToRender = (file) => Number(file?.sizeBytes) > SHARE_PREVIEW_MAX_BYTES;

/** Đọc tối đa `limit` byte đầu của response rồi huỷ phần còn lại. */
async function readTextHead(res, limit) {
  if (!res.body?.getReader) {
    const text = await res.text();
    return { text, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (received >= limit) {
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(received, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, bytes.length - offset);
    if (take <= 0) break;
    bytes.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  // `stream: true` để ký tự nhiều byte bị cắt đôi ở mép không thành rác ở cuối.
  return { text: new TextDecoder().decode(bytes, { stream: truncated }), truncated };
}

// ─── Helper: icon MIME ────────────────────────────────────────────────────────
function mimeColor(mimeType, type, name) {
  if (type === 'folder') return 'text-amber-400';
  if (PREVIEW_IMAGE(mimeType, name)) return 'text-emerald-400';
  if (PREVIEW_VIDEO(mimeType, name)) return 'text-violet-400';
  if (PREVIEW_AUDIO(mimeType, name)) return 'text-pink-400';
  if (PREVIEW_PDF(mimeType, name)) return 'text-rose-400';
  if (PREVIEW_DOCX(mimeType, name)) return 'text-blue-400';
  if (PREVIEW_SHEET(mimeType, name)) return 'text-green-500';
  if (PREVIEW_TEXT(mimeType, name)) return 'text-emerald-400';
  return 'text-slate-400';
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} aria-hidden="true" />;
}

function SharePageSkeleton() {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col">
      <header className="border-b border-white/8 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </main>
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────────────────
function SharePageError({ message, onGoHome }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col items-center justify-center px-4">
      <a href="/" className="mb-10 text-2xl font-bold tracking-tight select-none">
        cloud<span className="text-indigo-400">SSS</span>
      </a>
      <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mb-6 ring-1 ring-rose-500/30">
        <svg className="w-10 h-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold mb-3 text-center">{t('sharePage.error.title')}</h1>
      <p className="text-white/50 text-center max-w-sm mb-8">
        {message || t('sharePage.error.body')}
      </p>
      <button
        onClick={onGoHome}
        className="px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors cursor-pointer"
      >
        {t('sharePage.backHome')}
      </button>
    </div>
  );
}

// ─── PDF Canvas Viewer (dùng pdfjs-dist, không dùng iframe) ──────────────────
function PdfCanvasViewer({ url, sizeBytes, zoom: externalZoom, rotation: externalRotation }) {
  const { t } = useLanguage();
  const [pdfDoc, setPdfDoc]       = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages]   = useState(0);
  const [zoom, setZoom]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const canvasRef                 = useRef(null);
  const renderTaskRef             = useRef(null);

  const effectiveZoom = externalZoom !== undefined ? externalZoom : zoom;
  const effectiveRotation = externalRotation !== undefined ? externalRotation : 0;

  // 1. Mở PDF THEO ĐOẠN (HTTP Range) — người nhận link không phải tải cả tệp vào RAM mới
  //    thấy trang 1. Xem `utils/pdfRange.js`.
  useEffect(() => {
    if (!url) return;
    let mounted = true;
    let opened = null;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    loadPdfjs()
      .then((pdfjsLib) => {
        if (!mounted) return null;
        opened = openPdf(pdfjsLib, url, {
          sizeHint: sizeBytes,
          onError: (err) => {
            console.error('[PDF]', err);
            if (mounted) setError(t('sharePage.pdf.failed'));
          },
        });
        return opened.promise;
      })
      .then((doc) => {
        if (!mounted || !doc) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      })
      .catch((err) => {
        if (!mounted || err?.name === 'AbortError') return;
        // Chunk pdf.js của bản build cũ vừa bị thay khi deploy — tải lại trang một lần.
        if (isChunkLoadError(err) && reloadOnceForNewVersion()) return;
        console.error('[PDF]', err);
        setError(t('sharePage.pdf.failed'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      opened?.destroy();
    };
  }, [url, sizeBytes, t]);

  // 2. Vẽ trang lên canvas khi page/zoom thay đổi
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }

    (async () => {
      try {
        const page     = await pdfDoc.getPage(currentPage);
        const canvas   = canvasRef.current;
        if (!canvas) return;
        const ctx      = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 * effectiveZoom, rotation: effectiveRotation });

        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[PDF render]', err);
        }
      }
    })();

    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, currentPage, effectiveZoom, effectiveRotation]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-64 text-white/40">
        <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
        </svg>
        <span className="text-sm">{t('sharePage.pdf.decoding')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-rose-300 text-sm text-center py-10 bg-rose-500/10 rounded-xl border border-rose-500/20 px-6">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Canvas */}
      <div className="w-full overflow-auto flex justify-center max-h-[65vh]">
        <canvas
          ref={canvasRef}
          className="max-w-full rounded-lg shadow-2xl bg-white"
          style={{ height: 'auto' }}
        />
      </div>

      {/* Điều hướng trang + Thu phóng (nếu không có external controls) */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/8 rounded-full select-none">
        {externalZoom === undefined && (
          <>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              title={t('sharePage.zoomOut')}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM13.5 10.5h-6" />
              </svg>
            </button>
            <span className="text-xs text-white/40 font-mono w-12 text-center">
              {Math.round(effectiveZoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              title={t('sharePage.zoomIn')}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
              </svg>
            </button>
            <span className="w-px h-4 bg-white/10 mx-1" />
          </>
        )}

        {numPages > 1 && (
          <>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
              title={t('preview.page.prev')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-xs font-mono text-white/50 whitespace-nowrap">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
              title={t('preview.page.next')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Word DOCX Preview ──────────────────────────────────────────────────────
//
// Bản cục bộ dùng `mammoth.convertToHtml` đã bị bỏ: mammoth cố ý chỉ giữ cấu trúc
// ngữ nghĩa và vứt font, cỡ chữ, căn lề, giãn dòng, khổ giấy — nên tài liệu nào mở
// ra cũng thành văn bản thuần. `DocxRenderer` dựng lại đúng định dạng thật và được
// dùng chung với cửa sổ xem trước trong Drive, để hai nơi không lệch nhau nữa.

// ─── Code / Text Preview ────────────────────────────────────────────────────
function CodeTextPreview({ url, name }) {
  const { t } = useLanguage();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [copied, setCopied]   = useState(false);
  const [mdViewMode, setMdViewMode] = useState('preview'); // 'preview' | 'source'

  const isMd = isMarkdownFile(name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: 'text/plain, text/markdown, */*',
          },
        });
        if (!res.ok) throw new Error('fetch failed');
        const head = await readTextHead(res, TEXT_PREVIEW_READ_BYTES);
        let text = head.text;
        if (text.length > 150_000) text = text.slice(0, 150_000) + t('sharePage.text.truncated');
        else if (head.truncated) text += t('sharePage.text.truncated');
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url, t]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-64 text-white/40">
        <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
        </svg>
        <span className="text-sm font-medium">{t('sharePage.text.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-white/30 text-sm text-center h-40 flex items-center justify-center">
        {t('sharePage.text.unreadable')}
      </div>
    );
  }

  const ext = (name || '').split('.').pop()?.toLowerCase();
  const langMap = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', json: 'json', html: 'html', css: 'css',
    sql: 'sql', md: 'markdown', markdown: 'markdown', sh: 'bash', bash: 'bash',
    java: 'java', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp',
    cs: 'csharp', php: 'php', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    env: 'bash', txt: 'text'
  };
  const language = langMap[ext] || 'text';

  return (
    <div className="w-full max-w-5xl mx-auto rounded-xl overflow-hidden border border-white/10 bg-[#0d1117] flex flex-col text-left">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/10 text-xs text-white/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-white/80 truncate">{name}</span>
          {isMd && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono hidden sm:inline-block">
              Markdown
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isMd && (
            <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-white/10">
              <button
                onClick={() => setMdViewMode('preview')}
                className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer ${
                  mdViewMode === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('sharePage.previewLabel')}
              </button>
              <button
                onClick={() => setMdViewMode('source')}
                className={`px-2 py-1 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer ${
                  mdViewMode === 'source' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('sharePage.sourceLabel')}
              </button>
            </div>
          )}
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white transition-colors cursor-pointer"
          >
            {copied ? t('preview.copied') : t('sharePage.copyCode')}
          </button>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh] text-xs font-mono">
        {isMd && mdViewMode === 'preview' ? (
          <Suspense fallback={<pre className="m-0 p-6 sm:p-8 text-white/80 whitespace-pre-wrap">{content}</pre>}>
            <MarkdownPreview
              className="p-6 sm:p-8 max-w-4xl mx-auto markdown-preview-content font-sans"
              text={content}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<pre className="m-0 p-4 text-white/80 whitespace-pre">{content}</pre>}>
            <CodeHighlighter
              language={language}
              showLineNumbers={true}
              customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
              wrapLines={true}
            >
              {content}
            </CodeHighlighter>
          </Suspense>
        )}
      </div>
    </div>
  );
}

function RestrictedPreviewNotice({ file, message }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-white/30 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <FileTypeIcon mimeType={file.mimeType} type={file.type} name={file.name} />
      </div>
      <div className="space-y-1 max-w-md">
        <p className="text-sm text-white/80 font-medium">{message}</p>
        <p className="text-xs text-white/25">{t('sharePage.downloadOnly')}</p>
      </div>
    </div>
  );
}

// ─── Preview Area (dispatch theo MIME cho file đơn gốc) ───────────────────────
/**
 * Ảnh của tệp được chia sẻ (khung chính, không thu phóng): bản 2048px nếu server có, không
 * thì ảnh gốc như cũ. Khách mở link trên điện thoại là người được lợi nhất — trước đây một
 * ảnh 40MB là 40MB dữ liệu di động chỉ để xem vừa màn hình. Muốn bản gốc thì đã có nút Tải.
 */
function SharedInlineImage({ file, previewUrl, token, authToken }) {
  const image = usePreviewImage({
    file,
    originalUrl: previewUrl,
    loadPreview: () => sharingApi.getSharedPreviewImage(token, undefined, authToken || undefined),
    cacheKey: `share:${token}`,
  });
  if (!image.src) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
        </svg>
      </div>
    );
  }
  return <img src={image.src} alt={file.name} className="max-h-[70vh] max-w-full object-contain rounded-xl mx-auto block" />;
}

function PreviewArea({ file, previewUrl, loadingPreview, previewBlocked, token, authToken }) {
  const { t } = useLanguage();
  const { mimeType, name } = file;

  if (loadingPreview) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-64 text-white/40">
        <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
        </svg>
        <span className="text-sm">{t('sharePage.preview.loading')}</span>
      </div>
    );
  }

  if (previewBlocked) {
    return <RestrictedPreviewNotice file={file} message={t('sharePage.preview.blocked')} />;
  }

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-white/30">
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <span className="text-sm">{t('sharePage.preview.unsupported')}</span>
        <span className="text-xs text-white/20">{t('sharePage.preview.downloadToRead')}</span>
      </div>
    );
  }

  if (PREVIEW_IMAGE(mimeType, name)) {
    return <SharedInlineImage file={file} previewUrl={previewUrl} token={token} authToken={authToken} />;
  }
  if (PREVIEW_VIDEO(mimeType, name)) {
    return <video controls className="max-h-[70vh] w-full rounded-xl bg-black" preload="metadata" src={previewUrl} />;
  }
  if (PREVIEW_AUDIO(mimeType, name)) {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <svg className="w-14 h-14 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
        </svg>
        <audio controls className="w-full max-w-md" src={previewUrl} />
      </div>
    );
  }
  if (PREVIEW_PDF(mimeType, name)) {
    return <PdfCanvasViewer url={previewUrl} sizeBytes={file.sizeBytes} />;
  }
  if ((PREVIEW_DOCX(mimeType, name) || PREVIEW_SHEET(mimeType, name)) && isTooLargeToRender(file)) {
    return (
      <RestrictedPreviewNotice
        file={file}
        message={t('sharePage.preview.tooLarge', {
          size: formatBytes(file.sizeBytes),
          limit: formatBytes(SHARE_PREVIEW_MAX_BYTES),
        })}
      />
    );
  }
  if (PREVIEW_DOCX(mimeType, name)) {
    return (
      <div className="w-full max-h-[70vh] overflow-auto rounded-xl bg-slate-900/60 p-4 sm:p-6">
        <DocxRenderer url={previewUrl} />
      </div>
    );
  }
  if (PREVIEW_SHEET(mimeType, name)) {
    return (
      <div className="w-full h-[70vh] rounded-xl overflow-hidden border border-white/10 bg-[#0d1117] flex flex-col text-left">
        <SheetPreview url={previewUrl} />
      </div>
    );
  }
  if (PREVIEW_TEXT(mimeType, name)) {
    return <CodeTextPreview url={previewUrl} name={name} />;
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-white/30">
      <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <span className="text-sm">{t('sharePage.preview.unsupported')}</span>
    </div>
  );
}

// ─── Modal Xem Trước File Con trong Thư Mục Được Chia Sẻ ─────────────────────
function ChildFilePreviewModal({
  file,
  previewUrl,
  loading,
  error,
  previewBlocked,
  isDownloadAllowed,
  onDownload,
  onClose,
  token,
  authToken,
}) {
  const { t } = useLanguage();
  // Ảnh nạp theo tầng — bản 2048px trước, ảnh gốc khi phóng to. Xem `hooks/usePreviewImage.js`.
  const image = usePreviewImage({
    file,
    originalUrl: previewUrl,
    loadPreview: () => sharingApi.getSharedPreviewImage(token, file?.id, authToken || undefined),
    cacheKey: `share:${token}`,
  });
  // { zoom, x, y } — xem ZoomableImage.jsx. PDF chỉ dùng `zoom`, ảnh dùng cả độ lệch.
  const { view, setView, zoomIn, zoomOut, reset: resetView } = useZoomPan();
  const zoom = view.zoom;
  const [rotation, setRotation] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    resetView();
    setRotation(0);
  }, [file, resetView]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose && onClose();
      if (e.key === '=' || e.key === '+') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, zoomIn, zoomOut]);

  if (!file) return null;

  const mime = file.mimeType || '';
  const name = file.name || '';
  const isImg = PREVIEW_IMAGE(mime, name);
  const isVid = PREVIEW_VIDEO(mime, name);
  const isAud = PREVIEW_AUDIO(mime, name);
  const isPdf = PREVIEW_PDF(mime, name);
  // Quá ngưỡng thì rơi xuống khung "tải về" bên dưới, kèm câu nói rõ vì sao.
  const tooLarge = (PREVIEW_DOCX(mime, name) || PREVIEW_SHEET(mime, name)) && isTooLargeToRender(file);
  const isDoc = PREVIEW_DOCX(mime, name) && !tooLarge;
  const isSheet = PREVIEW_SHEET(mime, name) && !tooLarge;
  const isTxt = PREVIEW_TEXT(mime, name);

  const handleDownloadClick = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await onDownload(file);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200 text-white select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Header & Controls */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
            <span className={`shrink-0 ${mimeColor(file.mimeType, file.type, file.name)}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate max-w-md" title={file.name}>
              {file.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{formatBytes(file.sizeBytes)}</span>
              {file.mimeType && (
                <>
                  <span>•</span>
                  <span className="uppercase text-[11px] font-mono">{file.mimeType.split('/').pop()?.split(';')[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {(isImg || isPdf) && previewUrl && (
            <>
              <button
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all cursor-pointer"
                title={t('preview.zoomOut')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM13.5 10.5h-6" />
                </svg>
              </button>
              <span className="text-xs font-mono px-2 py-1 bg-white/10 rounded-lg text-slate-300 min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all cursor-pointer"
                title={t('preview.zoomIn')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
                </svg>
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title={t('preview.rotate')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
            </>
          )}

          {isDownloadAllowed && (
            <button
              onClick={handleDownloadClick}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-60"
            >
              {downloading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
              <span>{downloading ? t('sharePage.downloading') : t('common.download')}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all ml-2 cursor-pointer"
            title={t('preview.close')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-6 relative">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <svg className="w-10 h-10 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" />
            </svg>
            <p className="text-sm font-medium">{t('preview.loading')}</p>
          </div>
        )}

        {previewBlocked && !loading && !error && (
          <RestrictedPreviewNotice
            file={file}
            message={t('sharePage.preview.blocked')}
          />
        )}

        {error && !loading && !previewBlocked && (
          <div className="max-w-md p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center space-y-3">
            <p className="text-sm text-red-300 font-medium">{error}</p>
            {isDownloadAllowed && (
              <button
                onClick={handleDownloadClick}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer"
              >
                {t('preview.downloadToView')}
              </button>
            )}
          </div>
        )}

        {!loading && !error && !previewBlocked && previewUrl && (
          <>
            {isImg && image.src && (
              <ZoomableImage
                src={image.src}
                alt={file.name}
                view={view}
                onViewChange={setView}
                rotation={rotation}
                className="p-4"
                fitToBox={image.stage !== 'original' || Boolean(image.fullSize)}
                fullSize={image.fullSize}
                onDemand={image.reportDemand}
              />
            )}
            {isImg && (
              <ImageStagePill stage={image} sizeBytes={Number(file.sizeBytes) || 0} onLoadOriginal={image.requestOriginal} />
            )}

            {isVid && (
              <div className="max-w-4xl max-h-full w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/10 relative group flex flex-col items-center justify-center">
                <video src={previewUrl} controls playsInline className="w-full max-h-[75vh] object-contain" />
              </div>
            )}

            {isAud && (
              <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-6 text-center max-w-md w-full">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-pink-500/30 to-purple-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30 shadow-inner">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                  </svg>
                </div>
                <div className="space-y-1 max-w-full">
                  <h4 className="font-bold text-white text-base truncate px-2" title={file.name}>
                    {file.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {t('preview.audio.label', { size: formatBytes(file.sizeBytes) })}
                  </p>
                </div>
                <div className="w-full bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                  <audio src={previewUrl} controls className="w-full" />
                </div>
              </div>
            )}

            {isPdf && (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-slate-900/80 border border-white/10 shadow-2xl flex flex-col items-center justify-center">
                <PdfCanvasViewer url={previewUrl} sizeBytes={file.sizeBytes} zoom={zoom} rotation={rotation} />
              </div>
            )}

            {isDoc && (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-auto bg-slate-900/60 border border-white/10 shadow-2xl p-4 sm:p-8">
                <DocxRenderer url={previewUrl} onDownload={isDownloadAllowed ? handleDownloadClick : undefined} />
              </div>
            )}

            {isSheet && (
              <div className="w-full h-full max-w-6xl rounded-2xl overflow-hidden bg-[#0d1117] border border-white/10 shadow-2xl flex flex-col text-left">
                <SheetPreview url={previewUrl} onDownload={isDownloadAllowed ? handleDownloadClick : undefined} />
              </div>
            )}

            {isTxt && (
              <CodeTextPreview url={previewUrl} name={file.name} />
            )}

            {!isImg && !isVid && !isAud && !isPdf && !isDoc && !isSheet && !isTxt && (
              <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
                <svg className="w-16 h-16 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <h4 className="font-bold text-white text-sm">{file.name}</h4>
                <p className="text-xs text-slate-400">
                  {tooLarge
                    ? t('sharePage.preview.tooLarge', {
                        size: formatBytes(file.sizeBytes),
                        limit: formatBytes(SHARE_PREVIEW_MAX_BYTES),
                      })
                    : t('sharePage.preview.unsupportedDirect')}
                </p>
                {isDownloadAllowed && (
                  <button
                    onClick={handleDownloadClick}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-xl text-white shadow-lg transition-all cursor-pointer"
                  >
                    {t('preview.downloadOriginal')}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {!loading && !error && !previewBlocked && !previewUrl && (
          <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
            <svg className="w-16 h-16 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <h4 className="font-bold text-white text-sm">{file.name}</h4>
            <p className="text-xs text-slate-400">{t('sharePage.preview.cannot')}</p>
            {isDownloadAllowed && (
              <button
                onClick={handleDownloadClick}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-xl text-white shadow-lg transition-all cursor-pointer"
              >
                {t('preview.downloadOriginal')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Info Bar */}
      <div className="px-6 py-3 bg-slate-900/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>{file.name}</span>
          <span>•</span>
          <span>{formatBytes(file.sizeBytes)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{t('preview.shortcuts')}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Folder Browser — bảng danh sách file con ────────────────────────────────
function FolderBrowser({ token, rootFolderName, isDownloadAllowed, onOpenFile, shareAuthToken }) {
  const { t, language } = useLanguage();
  const locale = localeTagOf(language);
  const [stack, setStack]         = useState([{ id: null, name: rootFolderName }]); // breadcrumb stack
  const [children, setChildren]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [zipLoading, setZipLoading] = useState(false);

  const currentFolderId = stack[stack.length - 1].id;

  // Tải danh sách file con khi thay đổi folder
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    sharingApi.getSharedChildren(token, currentFolderId || undefined, shareAuthToken || undefined)
      .then((data) => {
        if (!cancelled) setChildren(data.items || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('sharePage.folder.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, currentFolderId, shareAuthToken, t]);

  // Mở subfolder
  function handleOpenFolder(item) {
    setStack((s) => [...s, { id: item.id, name: item.name }]);
  }

  // Breadcrumb back
  function handleBreadcrumb(index) {
    setStack((s) => s.slice(0, index + 1));
  }

  // Tải ZIP toàn bộ thư mục gốc
  async function handleDownloadZip() {
    if (zipLoading) return;
    setZipLoading(true);
    try {
      // `X-Lang`: `fetch` trần không qua interceptor của axios, phải tự gắn để câu lỗi đúng tiếng (##81).
      const headers = {
        ...languageHeaders(),
        ...(shareAuthToken ? { Authorization: `Bearer ${shareAuthToken}` } : {}),
      };

      // Đường chính: xin vé rồi để trình duyệt tự tải — có thanh tiến trình, không gom
      // cả thư mục vào RAM của tab. `fetch` thô chứ không qua axios: interceptor của axios
      // ghi đè `Authorization` bằng token của người đang đăng nhập, làm mất token mật khẩu
      // của link chia sẻ.
      const ticketRes = await fetch(`${API_BASE_URL}/shares/${token}/download-zip/ticket`, {
        method: 'POST',
        headers,
      });
      if (ticketRes.ok) {
        const body = await ticketRes.json();
        const ticket = body?.data?.ticket ?? body?.ticket;
        if (ticket) {
          triggerDownload(zipTicketUrl(ticket));
          return;
        }
      } else if (!isZipTicketUnavailable({ status: ticketRes.status })) {
        let message = t('sharePage.folder.zipFailed');
        try {
          const errJson = await ticketRes.json();
          message = errJson?.message || message;
        } catch {
          // response không phải JSON hợp lệ — dùng message mặc định
        }
        alert(message);
        return;
      }

      // Đường lùi (backend chưa có endpoint vé / Redis hỏng): tải cả ZIP vào blob như cũ.
      const res = await fetch(`${API_BASE_URL}/shares/${token}/download-url`, { headers });

      if (!res.ok) {
        let message = t('sharePage.folder.zipFailed');
        try {
          const errJson = await res.json();
          message = errJson?.message || message;
        } catch {
          // response không phải JSON hợp lệ — dùng message mặc định
        }
        alert(message);
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${rootFolderName || 'cloudSSS_download'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err?.message || t('sharePage.folder.zipFailed'));
    } finally {
      setZipLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden">
      {/* Header bảng */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-white/40 min-w-0 overflow-hidden flex-1">
          {stack.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1 min-w-0">
              {idx > 0 && <span className="mx-0.5 text-white/20">/</span>}
              <button
                onClick={() => handleBreadcrumb(idx)}
                disabled={idx === stack.length - 1}
                className="hover:text-white disabled:text-white/70 disabled:cursor-default transition-colors truncate max-w-[120px]"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Nút tải ZIP */}
        {isDownloadAllowed && (
          <button
            onClick={handleDownloadZip}
            disabled={zipLoading}
            className="shrink-0 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {zipLoading ? t('sharePage.folder.zipping') : t('sharePage.folder.downloadZip')}
          </button>
        )}
      </div>

      {/* Nội dung */}
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-12 text-white/30 text-sm">{error}</div>
      ) : children.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/25">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
          <span className="text-sm">{t('sharePage.folder.empty')}</span>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {/* Header hàng */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-2 text-xs text-white/25 uppercase tracking-widest font-medium">
            <span />
            <span>{t('sharePage.col.name')}</span>
            <span className="text-right hidden sm:block">{t('sharePage.col.size')}</span>
            <span className="text-right hidden sm:block">{t('sharePage.col.modified')}</span>
          </div>

          {children.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-3 items-center hover:bg-white/[0.03] transition-colors group cursor-pointer"
              onDoubleClick={() => {
                if (item.type === 'folder') {
                  handleOpenFolder(item);
                } else {
                  onOpenFile(item);
                }
              }}
              onClick={(e) => {
                if (item.type === 'folder') {
                  handleOpenFolder(item);
                } else {
                  onOpenFile(item);
                }
              }}
              title={item.type === 'folder'
                ? t('sharePage.openFolder', { name: item.name })
                : t('sharePage.previewItem', { name: item.name })}
            >
              {/* Icon */}
              <span className={`shrink-0 ${mimeColor(item.mimeType, item.type, item.name)}`}>
                {item.type === 'folder' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.25 6a2.25 2.25 0 0 1 2.25-2.25h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 0 12.62 6.75H19.5A2.25 2.25 0 0 1 21.75 9v9a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 18V6Z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                )}
              </span>

              {/* Tên */}
              <span className="truncate text-sm text-white/80 group-hover:text-white transition-colors">
                {item.name}
              </span>

              {/* Dung lượng */}
              <span className="text-xs text-white/30 text-right hidden sm:block whitespace-nowrap">
                {item.type === 'file' ? formatBytes(item.sizeBytes) : '—'}
              </span>

              {/* Ngày */}
              <span className="text-xs text-white/25 text-right hidden sm:block whitespace-nowrap">
                {item.updatedAt
                  ? new Date(item.updatedAt).toLocaleDateString(locale)
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── File Icon (đơn giản, dùng cho tiêu đề) ──────────────────────────────────
function FileTypeIcon({ mimeType, type, name }) {
  const color = mimeColor(mimeType, type, name);
  if (type === 'folder') {
    return (
      <svg className={`w-14 h-14 ${color}`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M2.25 6a2.25 2.25 0 0 1 2.25-2.25h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 0 12.62 6.75H19.5A2.25 2.25 0 0 1 21.75 9v9a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 18V6Z" />
      </svg>
    );
  }
  return (
    <svg className={`w-14 h-14 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SharePage() {
  const { t, language } = useLanguage();
  const locale = localeTagOf(language);
  const { token }  = useParams();
  const navigate   = useNavigate();

  const [shareData, setShareData]           = useState(null);
  const [shareAuthToken, setShareAuthToken] = useState(safeSessionStorage.getItem('shareAuthToken') || '');
  const [passwordInput, setPasswordInput]   = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError]   = useState('');
  const [previewUrl, setPreviewUrl]         = useState(null);
  const [loadingPage, setLoadingPage]       = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [error, setError]                   = useState(null);

  // File con được chọn để xem preview (khi đang duyệt folder)
  const [selectedChild, setSelectedChild]       = useState(null);
  const [childPreviewUrl, setChildPreviewUrl]   = useState(null);
  const [childPreviewLoading, setChildPreviewLoading] = useState(false);
  const [childPreviewBlocked, setChildPreviewBlocked] = useState(false);
  const [childPreviewError, setChildPreviewError] = useState(null);

  // ── Bước 1: Lấy metadata share link ──────────────────────────────────────
  useEffect(() => {
    if (!token) { setError(t('sharePage.badToken')); setLoadingPage(false); return; }
    let cancelled = false;

    sharingApi.getSharedItem(token)
      .then((data) => {
        if (!cancelled) {
          setShareData(data);
          document.title = `${data.file?.name ?? t('sharePage.sharedFile')} — cloudSSS`;
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('sharePage.linkGone'));
      })
      .finally(() => { if (!cancelled) setLoadingPage(false); });

    return () => { cancelled = true; };
  }, [token, t]);

  // ── Bước 2: Tự động tải preview URL cho FILE ──────────────────────────────
  useEffect(() => {
    if (!shareData || shareData.file.type === 'folder') return;
    if (shareData.hasPassword && !shareAuthToken) return;

    const { file } = shareData;
    const canPreview =
      PREVIEW_IMAGE(file.mimeType, file.name) || PREVIEW_VIDEO(file.mimeType, file.name) ||
      PREVIEW_AUDIO(file.mimeType, file.name) || PREVIEW_PDF(file.mimeType, file.name)   ||
      PREVIEW_DOCX(file.mimeType, file.name)  || PREVIEW_SHEET(file.mimeType, file.name) ||
      PREVIEW_TEXT(file.mimeType, file.name);

    if (!canPreview) return;

    let cancelled = false;
    setLoadingPreview(true);
    setPreviewBlocked(false);
    setPreviewUrl(null);

    sharingApi.getSharedPreviewUrl(token, undefined, shareAuthToken || undefined)
      .then((res) => {
        if (!cancelled) {
          const url = typeof res === 'string' ? res : (res?.previewUrl || res?.url);
          setPreviewUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled && err?.response?.status === 403) {
          setPreviewBlocked(true);
        }
      }) // Preview không bắt buộc
      .finally(() => { if (!cancelled) setLoadingPreview(false); });

    return () => { cancelled = true; };
  }, [shareData, token, shareAuthToken]);

  // ── Handler: Tải xuống (file gốc) ─────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (downloadLoading) return;
    setDownloadLoading(true);
    try {
      const res = await sharingApi.getSharedDownloadUrl(token, undefined, shareAuthToken || undefined);
      const url = typeof res === 'string' ? res : (res?.downloadUrl || res?.url);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = shareData?.file?.name || 'cloudSSS_download';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      alert(err?.message || t('sharePage.file.downloadFailed'));
    } finally {
      setDownloadLoading(false);
    }
  }, [downloadLoading, token, shareData, shareAuthToken, t]);

  // ── Handler: Mở preview file con trong folder ─────────────────────────────
  const handleOpenChildFile = useCallback(async (childFile) => {
    if (!childFile || childFile.type === 'folder') return;

    setSelectedChild(childFile);
    setChildPreviewUrl(null);
    setChildPreviewError(null);
    setChildPreviewBlocked(false);
    setChildPreviewLoading(true);

    try {
      const res = await sharingApi.getSharedPreviewUrl(token, childFile.id, shareAuthToken || undefined);
      const url = typeof res === 'string' ? res : (res?.previewUrl || res?.url);
      if (url) {
        setChildPreviewUrl(url);
      } else {
        setChildPreviewError(t('sharePage.child.noPreviewUrl'));
      }
    } catch (err) {
      if (err?.response?.status === 403) {
        setChildPreviewBlocked(true);
      } else {
        setChildPreviewError(err?.message || t('sharePage.child.previewFailed'));
      }
    } finally {
      setChildPreviewLoading(false);
    }
  }, [token, shareAuthToken, t]);

  // ── Handler: Tải xuống riêng file con trong folder ─────────────────────────
  const handleDownloadChild = useCallback(async (childFile) => {
    if (!childFile) return;
    try {
      const res = await sharingApi.getSharedDownloadUrl(token, childFile.id, shareAuthToken || undefined);
      const url = typeof res === 'string' ? res : (res?.downloadUrl || res?.url);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
          a.download = childFile.name || 'cloudSSS_download';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      alert(err?.message || t('sharePage.file.downloadFailed'));
    }
  }, [token, shareAuthToken, t]);

  const handleVerifyPassword = useCallback(async (event) => {
    event.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError(t('sharePage.password.required'));
      return;
    }

    setPasswordSubmitting(true);
    setPasswordError('');

    try {
      const res = await sharingApi.verifySharePassword(token, passwordInput.trim());
      const nextToken = res?.accessToken || res?.token;
      if (!nextToken) {
        throw new Error(t('sharePage.password.noToken'));
      }
      setShareAuthToken(nextToken);
      safeSessionStorage.setItem('shareAuthToken', nextToken);
      setPasswordInput('');
    } catch (err) {
      setPasswordError(err?.message || t('sharePage.password.wrong'));
    } finally {
      setPasswordSubmitting(false);
    }
  }, [passwordInput, token, t]);

  // ── Render: Loading ───────────────────────────────────────────────────────
  if (loadingPage) return <SharePageSkeleton />;

  // ── Render: Error ─────────────────────────────────────────────────────────
  if (error || !shareData) {
    return <SharePageError message={error} onGoHome={() => navigate('/')} />;
  }

  const { file, owner, isDownloadAllowed, expiresAt, hasPassword } = shareData;
  const isFolder = file.type === 'folder';
  const requiresPassword = Boolean(hasPassword) && !shareAuthToken;

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-[#0f1117] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl">
          <div className="mb-6 flex items-center justify-center text-indigo-400">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-center mb-2">{t('sharePage.password.title')}</h1>
          <p className="text-sm text-white/60 text-center mb-6">
            {t('sharePage.password.hint')}
          </p>
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/40">{t('auth.password.label')}</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={t('sharePage.password.placeholder')}
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none ring-0 placeholder:text-white/25 focus:border-indigo-500"
                autoFocus
              />
            </div>
            {passwordError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {passwordError}
              </div>
            )}
            <button
              type="submit"
              disabled={passwordSubmitting}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {passwordSubmitting ? t('sharePage.password.submitting') : t('sharePage.password.submit')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col">

      {/* ── Header sticky ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#0f1117]/90 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Logo */}
          <a href="/" className="text-lg font-bold tracking-tight shrink-0 select-none hover:opacity-80 transition-opacity">
            cloud<span className="text-indigo-400">SSS</span>
          </a>

          {/* Người chia sẻ */}
          <div className="flex items-center gap-2 text-sm text-white/60 min-w-0 overflow-hidden">
            {owner?.avatarUrl ? (
              <img src={owner.avatarUrl} alt={owner.fullName} className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold shrink-0">
                {(owner?.fullName ?? 'D').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate">
              <span className="text-white/40 mr-1">{t('sharePage.sharedBy')}</span>
              <span className="font-medium text-white/80">{owner?.fullName ?? t('profile.defaultName')}</span>
            </span>
          </div>

          {/* Nút tải xuống */}
          {isDownloadAllowed && !isFolder && (
            <button
              onClick={handleDownload}
              disabled={downloadLoading}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-medium transition-all shadow-lg shadow-indigo-500/25 cursor-pointer"
            >
              {downloadLoading
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z" /></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              }
              <span className="hidden sm:inline">{downloadLoading ? t('sharePage.downloading') : t('common.download')}</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">

        {/* Tiêu đề file */}
        <div className="flex items-start gap-4 mb-8">
          <div className="shrink-0 mt-1">
            <FileTypeIcon mimeType={file.mimeType} type={file.type} name={file.name} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold break-words leading-tight mb-2" title={file.name}>
              {file.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/40">
              {!isFolder && <span>{formatBytes(file.sizeBytes)}</span>}
              {file.mimeType && !isFolder && (
                <span className="uppercase tracking-wide text-xs font-mono bg-white/5 px-2 py-0.5 rounded">
                  {file.mimeType.split('/').pop()?.split(';')[0]}
                </span>
              )}
              {isFolder && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  {t('fileType.folder')}
                </span>
              )}
              {expiresAt && (
                <span className="flex items-center gap-1 text-amber-400/70">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {t('sharePage.expiresOn', {
                    date: new Date(expiresAt).toLocaleDateString(locale),
                  })}
                </span>
              )}
              {hasPassword && (
                <span className="flex items-center gap-1 text-white/30">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  {t('sharePage.protected')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── FOLDER: Bảng duyệt file con ─────────────────────────────────── */}
        {isFolder ? (
          <FolderBrowser
            token={token}
            rootFolderName={file.name}
            isDownloadAllowed={isDownloadAllowed}
            onOpenFile={handleOpenChildFile}
            shareAuthToken={shareAuthToken}
          />
        ) : (
          /* ── FILE: Preview Panel ─────────────────────────────────────────── */
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden" aria-label={t('sharePage.previewAria')}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <span className="text-xs font-medium text-white/40 uppercase tracking-widest">{t('sharePage.previewLabel')}</span>
              {isDownloadAllowed && (
                <button
                  onClick={handleDownload}
                  disabled={downloadLoading}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {downloadLoading ? t('sharePage.downloading') : t('common.download')}
                </button>
              )}
            </div>
            <div className="p-4 sm:p-6">
              <PreviewArea
                file={file}
                previewUrl={previewUrl}
                loadingPreview={loadingPreview}
                previewBlocked={previewBlocked}
                token={token}
                authToken={shareAuthToken}
              />
            </div>
          </section>
        )}

        {/* Modal xem trước file con khi chọn trong bảng */}
        {selectedChild && (
          <ChildFilePreviewModal
            file={selectedChild}
            previewUrl={childPreviewUrl}
            loading={childPreviewLoading}
            error={childPreviewError}
            previewBlocked={childPreviewBlocked}
            isDownloadAllowed={isDownloadAllowed}
            onDownload={handleDownloadChild}
            token={token}
            authToken={shareAuthToken}
            onClose={() => {
              setSelectedChild(null);
              setChildPreviewUrl(null);
              setChildPreviewError(null);
              setChildPreviewBlocked(false);
            }}
          />
        )}

        {/* Footer CTA */}
        <div className="mt-12 text-center">
          <p className="text-white/25 text-sm">
            {t('sharePage.cta.question')}{' '}
            <a href="/register" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">
              {t('sharePage.cta.register')}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
