import { useState, useEffect, useRef, useCallback } from 'react';
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
  ChevronRight,
  AlertTriangle,
  VolumeX,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import useMediaSupport from '../../hooks/useMediaSupport';
import useFragmentedMp4, { supportsFragmentedMp4 } from '../../hooks/useFragmentedMp4';
import { storageApi } from '../../services/api';
import { useAiPanel } from '../../context/AiPanelContext';
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

/**
 * Trình duyệt có dùng lõi Chromium (Edge, Chrome, Opera...) hay không.
 *
 * Cần biết vì cảnh báo "MP4 phân mảnh" CHỈ đúng với nhóm này: Firefox đọc tới
 * `moof` nào thì phát `moof` đó nên không hề gặp vấn đề, hiện cảnh báo ở đó chỉ
 * là nhiễu. Ưu tiên `userAgentData` vì chuỗi UA đang bị đóng băng dần.
 */
const IS_CHROMIUM = (() => {
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands)) return brands.some((b) => /Chromium/i.test(b.brand));
  return /Chrom(e|ium)|Edg\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
})();

/**
 * Chờ bấy nhiêu mà thẻ <video> vẫn chưa đủ dữ liệu để phát liên tục thì mới nói
 * ra chuyện container.
 *
 * Không cảnh báo ngay từ đầu: `moov-at-end` và cả một phần `fragmented` vẫn phát
 * được, chỉ chậm — dán cảnh báo lên một video đang chuẩn bị phát bình thường là
 * tự tạo báo động giả. Chỉ khi nó thực sự không lên thì câu giải thích mới có giá.
 */
const SLOW_START_AFTER_MS = 8000;

// Ngưỡng xem trước chung: dưới mức này thì MỞ, trên thì mời tải về.
// Khai một chỗ để backend (`getFileTextContent`) và ba nhánh preview không lệch nhau
// như trước (5MB cho text, 8MB cho docx, câu thông báo lại ghi 8MB).
const PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

// Trên mức này thì KHÔNG chạy Prism nữa: highlight một tệp vài MB làm treo tab
// (Prism tokenize đồng bộ trên main thread). Vẫn xem được, chỉ mất màu.
const SYNTAX_HIGHLIGHT_MAX_CHARS = 400 * 1024;

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
    // Giữ khớp với `resolvePreviewContentType` ở backend/src/storage/storage.service.ts
    /\.(txt|text|md|markdown|rst|adoc|log|env|conf|cfg|ini|toml|properties|csv|tsv|json|jsonc|json5|xml|yaml|yml|js|mjs|cjs|jsx|ts|mts|cts|tsx|py|pyi|rb|pl|pm|lua|r|swift|dart|scala|groovy|kt|kts|go|rs|c|h|cc|cxx|cpp|hpp|hh|hxx|m|mm|java|cs|vb|fs|php|html|htm|css|scss|sass|less|styl|vue|svelte|astro|sql|sh|bash|zsh|fish|ps1|bat|cmd|dockerfile|dockerignore|gitignore|editorconfig|makefile|mk|cmake|gradle|tf|tfvars|hcl|graphql|gql|proto|tex|bib|diff|patch|srt|vtt|ipynb)$/i.test(lower)
  );
};

/**
 * Tệp này có cần `playbackHint` / `fmp4` từ backend không?
 *
 * Chỉ video và audio cần: đó là kết quả backend phân tích container mp4 để biết
 * trình duyệt phát ngay được hay phải tải hết trước (`mp4-container.ts`), và nó chỉ
 * có ở endpoint LẺ. Ảnh, PDF, tài liệu thì hai đường trả về y hệt nhau, nên để
 * chúng đi đường gộp — mở xem trước một tấm ảnh vừa thấy thumbnail sẽ không tốn
 * request nào.
 *
 * Giữ khớp với `isVideo` / `isAudio` bên trong component: lệch nhau thì một loại
 * tệp sẽ đi sai đường và mất thông tin phát lại.
 */
const needsPlaybackInfo = (item) => {
  const mime = (item?.mimeType || '').toLowerCase();
  const name = (item?.name || '').toLowerCase();
  return (
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    /\.(mp4|webm|mov|mkv|mp3|wav|ogg|m4a)$/i.test(name)
  );
};

/**
 * Component Canvas chuyên dụng xem PDF nhiều trang, hỗ trợ High-DPI
 */
function PdfCanvasViewer({ url, zoom = 1, rotation = 0 }) {
  const { t } = useLanguage();
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
          throw new Error(t('preview.pdf.httpError', { status: response.status }));
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
          setError(t('preview.pdf.readFailed'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [url, t]);

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

        // `zoom` phải đi vào KÍCH THƯỚC CSS của canvas, không chỉ vào độ phân giải:
        // trước đây canvas có `max-w-full/max-h-full` + `height:auto` nên trình duyệt
        // co ảnh về vừa khung, zoom chỉ làm nét hơn chứ KHÔNG to ra — người dùng thấy
        // như nút zoom không hoạt động.
        //   • cssScale (1.5 * zoom) = kích thước hiển thị.
        //   • dpr thêm vào chỉ để bù màn hình HiDPI, không đổi kích thước hiển thị.
        const cssScale = 1.5 * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssViewport = page.getViewport({ scale: cssScale, rotation });
        const viewport = page.getViewport({ scale: cssScale * dpr, rotation });

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

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
        <p className="text-sm font-medium">{t('preview.pdf.rendering')}</p>
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
      {/* `items-start` + `m-auto` trên canvas: khi zoom < khung thì canvas vẫn giữa,
          khi zoom vượt khung thì nó không bị cắt mất phần trên mà cuộn được. */}
      <div className="flex-1 w-full overflow-auto flex items-start justify-center p-4">
        <canvas
          ref={canvasRef}
          className="m-auto rounded-lg shadow-2xl bg-white"
        />
      </div>

      {/* Thanh chuyển trang */}
      {numPages > 1 && (
        <div className="flex items-center gap-3 px-4 py-2 mt-2 bg-slate-900/90 border border-white/10 rounded-full shadow-lg shrink-0 select-none">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
            title={t('preview.page.prev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono text-slate-300 font-semibold">
            {t('preview.page.counter', { current: currentPage, total: numPages })}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded-full hover:bg-white/10 text-white disabled:opacity-30 transition-colors cursor-pointer"
            title={t('preview.page.next')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Khối cảnh báo codec cho trình phát — hiển thị kết luận của `useMediaSupport`.
 *
 * Cố ý LUÔN hiện (không phải chỉ khi rê chuột như lời nhắc chung): khi người xem
 * đang ngồi trước một video im lặng hoặc một khung đen, đó chính là lúc họ cần câu
 * trả lời, và họ không có lý do gì để rê chuột lên đúng đỉnh khung hình để tìm nó.
 *
 * `inline` = xếp vào luồng bố cục (dùng cho tệp âm thanh, vốn không có khung hình
 * để phủ lên); mặc định là phủ lên đỉnh trình phát video.
 */
function MediaSupportNotice({ diagnosis, fileName, onDownload, t, inline = false }) {
  if (!diagnosis) return null;

  const VISUALS = {
    'no-video-track': { Icon: EyeOff, tone: 'amber' },
    'no-audio-track': { Icon: VolumeX, tone: 'amber' },
    'decode-error': { Icon: AlertTriangle, tone: 'rose' },
    'src-unsupported': { Icon: AlertTriangle, tone: 'rose' },
    // Hai loại dưới đây nói về CẤU TRÚC tệp, không phải codec — tệp vẫn nguyên
    // vẹn và trình duyệt khác vẫn phát được, nên tông vàng chứ không phải đỏ.
    'fragmented-mp4': { Icon: Loader2, tone: 'amber' },
    'moov-at-end': { Icon: Loader2, tone: 'amber' },
  };
  const { Icon, tone } = VISUALS[diagnosis] || VISUALS['src-unsupported'];

  const TONES = {
    amber: 'bg-amber-950/85 border-amber-500/40 text-amber-100',
    rose: 'bg-rose-950/85 border-rose-500/40 text-rose-100',
  };

  const ext = (fileName || '').includes('.')
    ? fileName.slice(fileName.lastIndexOf('.') + 1).toUpperCase()
    : '';

  return (
    <div
      className={`${inline ? 'w-full' : 'absolute top-4 left-4 right-4 z-20'} ${TONES[tone]} backdrop-blur-md text-xs p-3.5 rounded-xl border shadow-xl flex flex-wrap items-start justify-between gap-3`}
      role="status"
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1 leading-relaxed">
          <p className="font-bold">
            {t(`preview.media.${diagnosis}.title`)}
            {ext ? ` (${ext})` : ''}
          </p>
          <p className="opacity-90">{t(`preview.media.${diagnosis}.body`)}</p>
        </div>
      </div>
      <button
        onClick={onDownload}
        className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors font-semibold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{t('preview.media.downloadAndOpenLocally')}</span>
      </button>
    </div>
  );
}

export default function FilePreviewModal({ item, onClose }) {
  const { t } = useLanguage();
  const { getPreviewUrl, getFileTextContent } = useFiles();
  // Panel AI dùng chung với menu chuột phải (`AiPanelProvider`). `aiItem` ở đây KHÔNG phải
  // để hiển thị gì — nó là thứ cho biết panel đang đè lên trên, dùng ở nhánh phím tắt.
  const { openAi, aiItem } = useAiPanel();
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Đổi giá trị là buộc thẻ <video>/<audio> dựng lại từ đầu. Cần đến vì hai chữ
  // ký sinh trong cùng một giây có thể ra ĐÚNG một URL — lúc đó setUrl() không
  // đổi state nên trình duyệt không tải lại gì cả và video đứng nguyên.
  const [mediaReloadNonce, setMediaReloadNonce] = useState(0);
  const mediaRetriedForRef = useRef(null); // id tệp đã thử làm mới URL một lần
  const resumeRef = useRef(null); // { at, playing } — chỗ đang phát trước khi tải lại

  // Backend phân loại cấu trúc tệp bằng một lần đọc 64KB đầu object: 'progressive'
  // | 'moov-at-end' | 'fragmented' | null. Xem `backend/src/storage/mp4-container.ts`.
  const [playbackHint, setPlaybackHint] = useState(null);

  // Với tệp phân mảnh, backend kèm luôn thứ cần để dựng luồng MSE:
  // `{ initSegmentBytes, mimeCodecs, durationSeconds }`. Xem `fmp4-manifest.ts`.
  const [fmp4, setFmp4] = useState(null);

  // Kết luận "mãi không phát được" LƯU KÈM tệp mà nó nói về, theo đúng lối của
  // `useMediaSupport`: đọc ra mới đối chiếu, khỏi cần một effect chỉ để dọn state.
  const [slowStart, setSlowStart] = useState({ key: null, value: false });

  useEffect(() => {
    if (!item) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setZoom(1);
    setRotation(0);
    resumeRef.current = null;

    if (isTextLikeFile(item.name, item.mimeType)) {
      setUrl(null);
      setPlaybackHint(null);
      setFmp4(null);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const fetchUrl = async () => {
      try {
        // `needsPlayback` bắt buộc với video/audio: chỉ đường LẺ mới mang về
        // `playbackHint` / `fmp4`. Thiếu cờ này thì cửa sổ xem trước nhận bản của
        // đường gộp (dùng cho thumbnail) và mất sạch thông tin phát lại — video
        // trên Chromium sẽ quay lại đúng lỗi "load rất lâu" mà
        // `preview-url-ttl.spec.ts` được viết ra để chặn.
        const res = await getPreviewUrl(item.id, { needsPlayback: needsPlaybackInfo(item) });
        // Trích xuất chính xác chuỗi URL (dù API trả về string hay object { previewUrl: "..." })
        const validUrl = typeof res === 'string' ? res : (res?.previewUrl || res?.url || null);

        if (isMounted) {
          setPlaybackHint(typeof res === 'string' ? null : res?.playbackHint ?? null);
          setFmp4(typeof res === 'string' ? null : res?.fmp4 ?? null);
          if (validUrl) {
            setUrl(validUrl);
          } else {
            setError(t('preview.noUrl'));
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || t('preview.loadFailed'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUrl();

    return () => {
      isMounted = false;
    };
  }, [item, t]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Panel AI mở ĐÈ lên cửa sổ này thì nó sở hữu bàn phím. Không có nhánh này thì một
      // phím Escape đóng CẢ HAI (hai listener cùng nghe trên window), và người dùng chỉ
      // muốn đóng panel lại mất luôn cửa sổ xem trước phía dưới.
      if (aiItem) return;

      // Đang gõ trong một ô nhập thì mọi phím tắt một chữ phải im. `r` là phím xoay ảnh,
      // nên thiếu nhánh này thì gõ chữ "r" ở bất kỳ ô nào cũng xoay tệp đang xem — trước
      // đây không ai gặp vì cửa sổ này không có ô nhập nào, giờ thì panel AI nằm ngay trên.
      const el = e.target;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;

      if (e.key === 'Escape') onClose && onClose();
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'r' || e.key === 'R') handleRotate();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, aiItem]);

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
  const isCodeOrText = item ? isTextLikeFile(name, item.mimeType) && Number(item.sizeBytes) <= PREVIEW_MAX_BYTES : false;
  const isDocx = item ? (
    (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword' ||
      /\.docx$/i.test(name)) && Number(item.sizeBytes) <= PREVIEW_MAX_BYTES
  ) : false;

  // Chẩn đoán codec cho thẻ <video>/<audio> — xem `hooks/useMediaSupport.js` để biết
  // vì sao "mất tiếng"/"mất hình" không sửa được ở phía web mà chỉ nói ra được.
  const {
    mediaRef,
    diagnosis: mediaDiagnosis,
    handlers: mediaHandlers,
  } = useMediaSupport({ kind: isVideo ? 'video' : 'audio', resetKey: item?.id });

  /**
   * Thẻ media báo lỗi: THỬ LẤY URL MỚI TRƯỚC, chỉ khi vẫn lỗi mới kết luận codec.
   *
   * Thứ tự này quan trọng. URL xem trước là chữ ký có hạn; hết hạn giữa lúc phát
   * thì cloud trả 403 kèm một mẩu XML, và Chromium (Edge/Chrome) báo đúng
   * `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) y như một tệp sai định dạng — nên nếu
   * đưa thẳng cho `useMediaSupport` thì người dùng đọc được câu "trình duyệt
   * không hỗ trợ định dạng này" cho một tệp .mp4 H.264 hoàn toàn bình thường.
   *
   * Chuyện này gần như CHỈ xảy ra trên Edge/Chrome: Firefox nạp trước cả tệp ngay
   * từ đầu nên nó tải xong trước khi chữ ký hết hạn, còn Chromium chỉ đệm quanh
   * đầu phát rồi xin `Range` mới suốt thời gian phát và mỗi lần người xem tua.
   *
   * Chỉ thử LẠI MỘT LẦN cho mỗi tệp: nếu URL vừa xin xong mà vẫn lỗi thì nguyên
   * nhân không phải hạn dùng, và vòng lặp xin URL vô hạn còn tệ hơn im lặng.
   */
  const handleMediaError = useCallback(() => {
    const el = mediaRef.current;

    if (!item || !el?.error || mediaRetriedForRef.current === item.id) {
      mediaHandlers.onError();
      return;
    }

    mediaRetriedForRef.current = item.id;
    resumeRef.current = { at: el.currentTime || 0, playing: !el.paused };

    storageApi.invalidatePreviewUrl(item.id);
    getPreviewUrl(item.id, { needsPlayback: needsPlaybackInfo(item) })
      .then((fresh) => {
        const freshUrl = typeof fresh === 'string' ? fresh : fresh?.previewUrl || null;
        if (!freshUrl) {
          mediaHandlers.onError();
          return;
        }
        setUrl(freshUrl);
        setMediaReloadNonce((n) => n + 1);
      })
      .catch(() => mediaHandlers.onError());
  }, [item, mediaRef, mediaHandlers, getPreviewUrl]);

  /** Sau khi tải lại vì lỗi ở trên: về đúng giây đang xem, phát tiếp nếu đang phát. */
  const handleMediaLoadedMetadata = useCallback(() => {
    mediaHandlers.onLoadedMetadata();

    const el = mediaRef.current;
    const resume = resumeRef.current;
    resumeRef.current = null;
    if (!el || !resume) return;

    if (resume.at > 0 && Number.isFinite(el.duration) && resume.at < el.duration) {
      el.currentTime = resume.at;
    }
    if (resume.playing) el.play().catch(() => {});
  }, [mediaRef, mediaHandlers]);

  // Khoá định danh CHO MỘT LẦN NẠP: đổi tệp hoặc tải lại vì lỗi thì phép đo
  // "mãi không phát được" phải bắt đầu lại từ đầu.
  const mediaKey = item ? `${item.id}:${mediaReloadNonce}` : null;
  const isSlowStart = slowStart.key === mediaKey && slowStart.value;

  /**
   * Tệp phân mảnh thì phát bằng MSE thay vì để `<video src>` tự lo.
   *
   * Bốn điều kiện, thiếu một là lùi về thẻ thường: đúng nhóm `fragmented`,
   * backend dựng được manifest, trình duyệt nhận bộ codec đó, và tệp có dung
   * lượng để tính `Range`. KHÔNG giới hạn ở Chromium: Firefox phát fMP4 kiểu
   * thường cũng được, nhưng đi qua MSE thì nó cũng không tải cả tệp về nữa.
   */
  const mseEligible =
    isVideo &&
    playbackHint === 'fragmented' &&
    !!fmp4 &&
    Number(item?.sizeBytes) > 0 &&
    supportsFragmentedMp4(fmp4.mimeCodecs);

  const { failed: mseFailed } = useFragmentedMp4({
    videoRef: mediaRef,
    url,
    manifest: mseEligible ? fmp4 : null,
    totalBytes: Number(item?.sizeBytes) || 0,
    enabled: mseEligible,
    resetKey: mediaKey,
  });

  // MSE chết giữa đường thì vẫn còn đường lùi — thà chậm còn hơn màn hình đen.
  const useMse = mseEligible && !mseFailed;

  useEffect(() => {
    if (!mediaKey || !isVideo || useMse) return;
    // Chỉ đo với hai cấu trúc thật sự có thể làm trình duyệt đứng. 'progressive'
    // mà chậm thì là đường truyền, không phải chuyện app nói hộ được.
    if (playbackHint !== 'fragmented' && playbackHint !== 'moov-at-end') return;

    const timer = setTimeout(() => {
      const el = mediaRef.current;
      // readyState < HAVE_FUTURE_DATA (3) = chưa đủ dữ liệu để phát liên tục.
      if (el && el.readyState < 3) setSlowStart({ key: mediaKey, value: true });
    }, SLOW_START_AFTER_MS);

    return () => clearTimeout(timer);
  }, [mediaKey, isVideo, playbackHint, mediaRef, useMse]);

  /**
   * Kết luận hiển thị cho người xem, gộp hai nguồn.
   *
   * Kết luận về CODEC (`useMediaSupport`) thắng: nó dựa trên chuyện đã xảy ra
   * thật với thẻ media, còn cấu trúc container chỉ là dự đoán. Cảnh báo container
   * chỉ lên tiếng khi video đã thực sự không phát nổi sau `SLOW_START_AFTER_MS`.
   *
   * Riêng 'fragmented' chỉ nói với Chromium: Firefox phát dạng này bình thường,
   * hiện cảnh báo ở đó là nói sai.
   */
  const containerDiagnosis =
    !isSlowStart || useMse ? null
      : playbackHint === 'fragmented' ? (IS_CHROMIUM ? 'fragmented-mp4' : null)
        : playbackHint === 'moov-at-end' ? 'moov-at-end'
          : null;
  const playerDiagnosis = mediaDiagnosis || containerDiagnosis;

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
            setTextContent(content || t('preview.text.loadFailed'));
          }
        })
        .catch(() => {
          if (isMounted) setTextContent(t('preview.text.loadFailedCode'));
        })
        .finally(() => {
          if (isMounted) setIsLoadingText(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isCodeOrText, item, t]);

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
        if (!response.ok) throw new Error(t('preview.docx.fetchFailed'));
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (isMounted) {
          setDocxHtml(
            result.value || `<p class="text-slate-400 italic">${t('preview.docx.empty')}</p>`,
          );
        }
      } catch (err) {
        if (isMounted) {
          console.error('[DOCX Preview Error]', err);
          setDocxError(err.message || t('preview.docx.convertFailed'));
        }
      } finally {
        if (isMounted) setDocxLoading(false);
      }
    };

    loadDocx();

    return () => {
      isMounted = false;
    };
  }, [isDocx, url, t]);

  if (!item) return null;

  return (
    // Panel AI mở ra ở cột phải và ĐÈ lên cửa sổ này. Không nhường chỗ thì nó che đúng
    // góc chứa thanh công cụ — kể cả nút Đóng — nên người dùng phải đóng panel mới đóng
    // được cửa sổ xem trước. Chừa ra đúng bề rộng của panel (26rem, 30rem từ `lg`) là hai
    // thứ đứng cạnh nhau: tài liệu bên trái, câu trả lời bên phải, không cái nào che cái
    // nào. Chỉ từ `sm` trở lên — trên điện thoại panel là hộp thoại giữa màn hình.
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200 text-white select-none transition-[padding] duration-200 ${
        aiItem ? 'sm:pr-[26rem] lg:pr-[30rem]' : ''
      }`}
    >
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
                title={t('preview.zoomOut')}
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
                title={t('preview.zoomIn')}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title={t('preview.rotate')}
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title={t('preview.resetZoom')}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
            </>
          )}

          {/* Hỏi AI ngay tại chỗ: trước đây muốn hỏi về tệp đang xem thì phải đóng cửa sổ
              này, tìm lại tệp trong danh sách rồi bấm chuột phải. Panel AI mở ra ở cạnh
              phải và ĐÈ lên chứ không đóng cửa sổ xem trước, nên vẫn nhìn được tài liệu
              trong lúc đọc câu trả lời — đó mới là điểm của cái nút này. */}
          <button
            onClick={() => openAi(item, 'chat')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
            title={t('preview.askAi')}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">{t('preview.askAi')}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{t('common.download')}</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all ml-2 cursor-pointer"
            title={t('preview.close')}
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
            <p className="text-sm font-medium">{t('preview.loading')}</p>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-md p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center space-y-3">
            <p className="text-sm text-red-300 font-medium">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all"
            >
              {t('preview.downloadToView')}
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
                {/* Lời nhắc chung: chỉ hiện khi RÊ CHUỘT và chỉ khi chưa phát hiện vấn đề
                    gì cụ thể. Đã có kết luận thật thì khối cảnh báo bên dưới nói rõ hơn,
                    hai khối cùng lúc chỉ chèn lên nhau. */}
                {!playerDiagnosis && (
                  <div className="absolute top-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md text-xs text-slate-300 p-3 rounded-xl border border-white/15 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 flex flex-wrap items-center justify-between gap-2 shadow-xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span className="leading-relaxed">
                        <strong>{t('preview.audio.noticeTitle')}</strong> {t('preview.audio.notice')}
                      </span>
                    </div>
                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-semibold shadow-sm text-xs shrink-0 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('preview.downloadOriginal')}</span>
                    </button>
                  </div>
                )}

                <MediaSupportNotice
                  diagnosis={playerDiagnosis}
                  fileName={item?.name}
                  onDownload={handleDownload}
                  t={t}
                />

                <video
                  key={`${item.id}:${mediaReloadNonce}`}
                  ref={mediaRef}
                  // Đi qua MSE thì KHÔNG đặt src ở đây: `useFragmentedMp4` gán
                  // objectURL của `MediaSource` vào thẻ. Đặt cả hai thì React ghi
                  // lại presigned URL và xoá luôn luồng vừa dựng.
                  src={useMse ? undefined : url}
                  controls
                  playsInline
                  // `auto`, KHÔNG phải `metadata`. Người dùng đã bấm đúp để mở cửa sổ
                  // này nên họ chắc chắn muốn xem — nạp trước là đúng việc.
                  //
                  // Trước đây đặt `metadata` với lý do "để `loadedmetadata` chắc chắn
                  // bắn ra" (phép thử mất hình dựa vào nó), nhưng sự kiện đó bắn ra ở
                  // MỌI mức preload, kể cả `auto`. Cái giá phải trả thì có thật và
                  // riêng Chromium: mặc định của Chrome/Edge là `auto`, ghi tay thành
                  // `metadata` là TẮT phần nạp trước của chúng — mở video xong Edge chỉ
                  // lấy vài chục KB đầu rồi ngồi im, đến lúc bấm play mới bắt đầu tải
                  // thật. Firefox không hề hạn chế đọc vượt như vậy nên vẫn "vào là
                  // phát", và đó chính là khác biệt người dùng thấy giữa hai trình duyệt.
                  preload="auto"
                  className="w-full max-h-[75vh] object-contain"
                  {...mediaHandlers}
                  onLoadedMetadata={handleMediaLoadedMetadata}
                  onError={handleMediaError}
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
                    key={`${item.id}:${mediaReloadNonce}`}
                    ref={mediaRef}
                    src={url}
                    controls
                    // Xem chú thích ở thẻ <video> phía trên về `auto` vs `metadata`.
                    preload="auto"
                    className="w-full"
                    {...mediaHandlers}
                    onLoadedMetadata={handleMediaLoadedMetadata}
                    onError={handleMediaError}
                  />
                </div>

                {/* Tệp âm thanh thì 'no-video-track' vô nghĩa — hook chỉ kết luận điều đó
                    khi kind === 'video', nên ở đây chỉ còn lỗi giải mã / không nhận nguồn. */}
                <MediaSupportNotice
                  diagnosis={mediaDiagnosis}
                  fileName={item?.name}
                  onDownload={handleDownload}
                  t={t}
                  inline
                />
                <button
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('preview.audio.download')}</span>
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
                      <p className="text-sm font-medium">{t('preview.docx.converting')}</p>
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
                      {copied ? t('preview.copied') : t('preview.copy')}
                    </button>
                    <span className="hidden sm:inline">UTF-8 • {formatBytes(item.sizeBytes)}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto text-xs text-slate-200 selection:bg-blue-500/40">
                  {isLoadingText ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-sm font-medium">{t('preview.text.loading')}</p>
                    </div>
                  ) : textContent ? (
                    isMd && mdViewMode === 'preview' ? (
                      <div
                        className="p-6 sm:p-10 max-w-4xl mx-auto markdown-preview-content"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(textContent, { breaks: true, gfm: true })
                        }}
                      />
                    ) : textContent.length > SYNTAX_HIGHLIGHT_MAX_CHARS ? (
                      // Ngưỡng preview nay là 10MB, nhưng Prism tokenize đồng bộ:
                      // đưa cho nó vài MB là treo tab. Tệp lớn hiển thị thô, đọc
                      // được và cuộn được, chỉ không có màu cú pháp.
                      <div className="flex flex-col h-full">
                        <div className="px-4 py-2 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
                          {t('preview.highlightOff', { size: formatBytes(item.sizeBytes) })}
                        </div>
                        <pre className="flex-1 overflow-auto p-4 m-0 text-xs font-mono text-slate-200 whitespace-pre">
                          {textContent}
                        </pre>
                      </div>
                    ) : (
                      <SyntaxHighlighter
                        language={(() => {
                          const ext = item?.name?.split('.').pop()?.toLowerCase();
                          const map = {
                            js: 'javascript', mjs: 'javascript', cjs: 'javascript',
                            jsx: 'jsx', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
                            py: 'python', pyi: 'python', json: 'json', jsonc: 'json', json5: 'json',
                            html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
                            sql: 'sql', md: 'markdown', markdown: 'markdown',
                            sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', env: 'bash',
                            ps1: 'powershell', bat: 'batch', cmd: 'batch',
                            java: 'java', kt: 'kotlin', kts: 'kotlin', go: 'go', rs: 'rust',
                            c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
                            cs: 'csharp', vb: 'vbnet', fs: 'fsharp',
                            php: 'php', rb: 'ruby', pl: 'perl', pm: 'perl', lua: 'lua',
                            r: 'r', swift: 'swift', dart: 'dart', scala: 'scala', groovy: 'groovy',
                            m: 'objectivec', mm: 'objectivec',
                            xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
                            cfg: 'ini', conf: 'ini', properties: 'ini',
                            vue: 'markup', svelte: 'markup', astro: 'markup',
                            graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
                            tf: 'hcl', tfvars: 'hcl', hcl: 'hcl',
                            dockerfile: 'docker', makefile: 'makefile', mk: 'makefile',
                            cmake: 'cmake', gradle: 'gradle',
                            diff: 'diff', patch: 'diff', tex: 'latex',
                            csv: 'text', tsv: 'text', log: 'text', txt: 'text',
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
                    <div className="text-slate-400 p-6 font-mono text-center">{t('preview.text.empty')}</div>
                  )}
                </div>
              </div>
            )}

            {!isImage && !isVideo && !isAudio && !isPdf && !isCodeOrText && !isDocx && (
              <div className="p-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm">
                <FileText className="w-16 h-16 text-blue-400" />
                <h4 className="font-bold text-white text-sm">{item.name}</h4>
                <p className="text-xs text-slate-400">
                  {Number(item.sizeBytes) > PREVIEW_MAX_BYTES
                    ? t('preview.tooBig')
                    : t('preview.unsupported')}
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
          <span>{t('preview.shortcuts')}</span>
        </div>
      </div>
    </div>
  );
}
