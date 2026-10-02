import { marked } from 'marked';
import createDOMPurify from 'dompurify';

/**
 * Markdown do NGƯỜI DÙNG viết (tệp .md trong Drive, tệp trên trang chia sẻ) → HTML đã lọc,
 * dùng được cho `dangerouslySetInnerHTML`.
 *
 * Vì sao phải lọc: `marked` KHÔNG dọn HTML thô. Một tệp .md chứa
 * `<img src=x onerror=…>` đi thẳng ra DOM, mà chế độ xem mặc định của cả khung xem trước
 * lẫn trang chia sẻ là "preview". Chỉ cần chia sẻ một tệp .md (hoặc gửi một link chia sẻ)
 * là script chạy trong origin của app và đọc được access token trong localStorage —
 * tức chiếm được tài khoản người mở tệp. DOMPurify gỡ `<script>`, mọi thuộc tính `on*`
 * và URL `javascript:`/`vbscript:`/`data:` ở chỗ không phải ảnh.
 *
 * Không escape SẠCH mọi HTML như khung AI (`renderMarkdown` trong GeminiModal): README
 * thật hay dùng HTML hợp lệ (`<details>`, `<br>`, `<img width>`, `<p align="center">`),
 * escape hết thì tệp của chính người dùng hiển thị sai.
 *
 * Chặn thêm những thứ DOMPurify mặc định vẫn cho qua nhưng ở đây chỉ có hại:
 *   • `<form>`, ô nhập, nút — một tệp .md dựng được ô "Nhập lại mật khẩu" trông y như
 *     của app, nằm ngay trong khung xem trước;
 *   • `<style>` và thuộc tính `style` — CSS trong tệp không thoát ra script được, nhưng
 *     phủ lên được giao diện của chính app (che nút, giả hộp thoại).
 *   • SVG/MathML (`USE_PROFILES: { html: true }`) — markdown không cần, mà đó là chỗ các
 *     lỗi mutation-XSS hay nằm.
 */

// Instance riêng chứ không dùng instance mặc định: hook bên dưới chỉ được áp cho
// markdown người dùng, không lan sang chỗ nào khác lỡ import `dompurify` sau này.
const purifier = createDOMPurify(window);

// Link ra ngoài mở tab mới: bấm một link trong tệp .md mà điều hướng cả trang thì
// người dùng mất luôn khung xem trước đang mở. `noopener` để trang kia không đụng
// được `window.opener` của app.
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A') return;
  const href = node.getAttribute('href') || '';
  if (/^https?:\/\//i.test(href)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
  FORBID_ATTR: ['style'],
};

/**
 * @param {string} text Nội dung markdown thô
 * @returns {string} HTML đã lọc
 */
export function renderMarkdownSafe(text) {
  const html = marked.parse(String(text ?? ''), { breaks: true, gfm: true });
  return purifier.sanitize(html, PURIFY_CONFIG);
}
