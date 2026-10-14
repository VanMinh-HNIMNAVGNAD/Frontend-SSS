import { useMemo } from 'react';
import { renderMarkdownSafe } from '../../utils/safeMarkdown';

/**
 * Markdown đã lọc (marked + DOMPurify) cho khung xem trước + trang chia sẻ — chunk LƯỜI (##85).
 *
 * Hai thư viện đó nặng 72KB (24KB nén) và trước đây được import tĩnh vào cửa sổ xem trước,
 * tức ai mở một tấm ảnh cũng tải chúng. Nơi dùng bọc `lazy()` + hiện chữ thô trong lúc chờ.
 *
 * `useMemo`: cửa sổ xem trước vẽ lại rất thường (phóng, xoay, chuyển tab bình luận) — bản cũ
 * gọi `renderMarkdownSafe` ngay trong JSX nên mỗi lần vẽ lại là phân tích + lọc lại cả tệp.
 */
export default function MarkdownPreview({ text, className }) {
  const html = useMemo(() => renderMarkdownSafe(text), [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
