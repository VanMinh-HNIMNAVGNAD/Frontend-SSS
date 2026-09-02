import { Fragment } from 'react';

/**
 * Chèn NODE React vào chỗ trống {tên} của một câu đã dịch.
 *
 * `t()` của LanguageContext chỉ chèn được chuỗi. Nhưng nhiều câu cần in đậm đúng
 * một phần — vd. thanh phân trang "Hiển thị **1** - **30** trong **214** mục".
 * Cách cũ là chẻ câu ra ghép trong JSX:
 *
 *     Hiển thị <span className="font-bold">{from}</span> - ... trong ... mục
 *
 * Ghép như vậy là khoá cứng TRẬT TỰ TỪ tiếng Việt vào mọi ngôn ngữ: tiếng Anh
 * viết "Showing 1 - 30 of 214 items", còn tiếng Nhật đặt số ở chỗ khác nữa. Dịch
 * kiểu đó không bao giờ đúng được, và người dịch cũng không thấy cả câu.
 *
 * Nên giữ NGUYÊN một khoá cho cả câu, rồi tách theo placeholder lúc render:
 *
 *     tRich(t('list.pagination.showing'), {
 *       from: <b>1</b>, to: <b>30</b>, total: <b>214</b>,
 *     })
 *
 * Placeholder không được truyền thì giữ nguyên `{tên}` — cùng quy ước với `t()`,
 * để khoá dịch thiếu tham số hiện thành lỗi nhìn thấy được thay vì "undefined".
 *
 * @param {string} template Câu đã dịch, còn nguyên các chỗ trống `{tên}`
 * @param {Record<string, import('react').ReactNode>} params
 * @returns {import('react').ReactNode}
 */
export default function tRich(template, params = {}) {
  if (typeof template !== 'string') return template;

  // Giữ lại chính placeholder trong kết quả split (capture group) để biết chỗ nào cần thay
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part);
    const value = match && Object.prototype.hasOwnProperty.call(params, match[1])
      ? params[match[1]]
      : part;
    // key theo vị trí là đủ và ổn định: mảng chỉ đổi khi chính câu dịch đổi
    return <Fragment key={index}>{value}</Fragment>;
  });
}
