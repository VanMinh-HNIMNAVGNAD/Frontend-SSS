import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Xem trước .docx GIỮ NGUYÊN ĐỊNH DẠNG.
 *
 * Trước đây chỗ này dùng `mammoth.convertToHtml`, và đó là lựa chọn sai việc:
 * mammoth CỐ Ý chỉ xuất HTML ngữ nghĩa (`<p>`, `<h1>`, `<table>`) và vứt bỏ font,
 * cỡ chữ, màu, căn lề, thụt dòng, giãn dòng, độ rộng cột, header/footer, ngắt
 * trang. Nó được sinh ra để BÓC nội dung ra khỏi Word, không phải để hiển thị lại
 * một tài liệu Word — nên kết quả luôn là "văn bản thuần, mất hết căn lề", dù có
 * dán thêm bao nhiêu class Tailwind lên vùng chứa.
 *
 * `docx-preview` đi đường khác: nó đọc `styles.xml` + `numbering.xml` + `sectPr`
 * rồi sinh CSS tương ứng, dựng mỗi trang thành một `<section>` đúng khổ giấy và lề
 * thật. Đổi lại nó ghi thẳng vào DOM chứ không trả chuỗi HTML, nên phải cho nó một
 * nút trống do `ref` giữ và React tuyệt đối không được render con vào nút đó.
 *
 * Mammoth VẪN CÒN DÙNG ở `hooks/useFileThumbnail.js` — chỗ đó chỉ cần 150 ký tự
 * đầu làm thumbnail, tức đúng việc mà mammoth làm tốt nhất.
 */

/**
 * Nạp theo yêu cầu, ghi nhớ ở phạm vi module.
 *
 * Thư viện này cộng cả `jszip` là vài trăm KB. Cửa sổ xem trước đã là chunk tải
 * lười rồi, nhưng người mở một tấm ảnh thì không có lý do gì phải tải kèm bộ máy
 * dựng Word — cùng lối nghĩ với SheetJS/pdf.js ở `useFileThumbnail`.
 */
let docxPreviewPromise = null;
const loadDocxPreview = () => (docxPreviewPromise ??= import('docx-preview'));
// Bộ khử link nguy hiểm nằm chung tệp với marked + DOMPurify (72KB) — import tĩnh ở đây từng
// kéo cả hai vào cửa sổ xem trước của MỌI loại tệp (##85). Nạp cùng lúc với docx-preview,
// TRƯỚC khi dựng tài liệu: nạp hỏng thì không có gì được vẽ ra, không có cảnh link chưa khử.
let linkGuardPromise = null;
const loadLinkGuard = () => (linkGuardPromise ??= import('../../utils/safeMarkdown'));

export default function DocxRenderer({ url, onDownload }) {
  const { t } = useLanguage();
  const hostRef = useRef(null);
  const styleRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!url) return undefined;

    let cancelled = false;
    setStatus('loading');
    setMessage(null);

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(t('preview.docx.fetchFailed'));
        const blob = await response.blob();
        const [{ renderAsync }, { neutralizeUnsafeLinks }] = await Promise.all([
          loadDocxPreview(),
          loadLinkGuard(),
        ]);
        if (cancelled) return;

        const host = hostRef.current;
        if (!host) return;

        // Dọn tay trước mỗi lượt: `renderAsync` chỉ CHÈN THÊM, nên đổi tệp mà
        // không xoá là hai tài liệu nối đuôi nhau trong cùng một khung.
        host.replaceChildren();
        styleRef.current?.replaceChildren();

        await renderAsync(blob, host, styleRef.current ?? undefined, {
          className: 'docx',
          // Bọc mỗi trang trong một `<section>` riêng — đây chính là thứ dựng lại
          // khổ giấy và lề, bỏ đi là quay về một khối văn bản chảy tràn.
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          // Ảnh nhúng thành data URL: `blob:` sống theo vòng đời object URL và
          // đã có lúc ảnh biến mất trước cả khi người dùng cuộn tới.
          useBase64URL: true,
          trimXmlDeclaration: true,
        });
        // docx-preview chép nguyên đích hyperlink trong tệp — kể cả `javascript:…`. Tệp
        // .docx do người khác chia sẻ (hay qua link công khai) mà để vậy thì bấm vào một
        // dòng chữ là chạy script trong origin của app.
        neutralizeUnsafeLinks(host);

        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[DOCX Preview Error]', err);
        setMessage(err?.message || t('preview.docx.convertFailed'));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, t]);

  return (
    <div className="w-full">
      {/* `docx-preview` đổ CSS sinh từ styles.xml vào đây. Nằm trong cây React nên
          nó tự biến mất khi cửa sổ đóng, thay vì bám lại ở <head> qua từng lượt mở. */}
      <div ref={styleRef} className="hidden" />

      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">{t('preview.docx.converting')}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md mx-auto">
          <p className="text-sm text-red-300 font-medium">{message}</p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer"
            >
              {t('preview.downloadToView')}
            </button>
          )}
        </div>
      )}

      {/* Luôn nằm trong cây, chỉ ẩn đi khi chưa xong: `renderAsync` cần nút này
          có thật lúc effect chạy, mà effect thì chạy sau lượt render đầu tiên. */}
      <div ref={hostRef} className={`docx-preview-host ${status === 'ready' ? '' : 'hidden'}`} />
    </div>
  );
}
