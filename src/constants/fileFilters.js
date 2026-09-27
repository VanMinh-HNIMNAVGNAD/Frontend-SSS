/**
 * Bộ lọc "Loại tệp" và "Ngày sửa đổi" — một định nghĩa cho cả thanh lọc
 * (`FileFilterBar`) lẫn bộ lọc nâng cao trên thanh tìm kiếm (`SearchFilterModal`).
 *
 * Trước đây mỗi nơi tự khai danh sách riêng và chúng lệch nhau: thanh lọc có 8 loại,
 * bộ lọc nâng cao có 4 loại khác (trong đó "Tệp tin" mà thanh lọc không biết hiển thị),
 * và cùng một giá trị `pdf` được gọi là "Tài liệu & PDF" ở chỗ này, "Tài liệu PDF
 * (.pdf)" ở chỗ kia — trong khi backend trả về cả .docx, .txt, .md.
 *
 * `value` PHẢI khớp `FILE_TYPE_FILTERS` ở `backend/src/files/file-filters.ts`: backend
 * trả 400 cho giá trị nó không biết, thay vì lặng lẽ trả về mọi mục như lỗi `media` cũ.
 */
export const FILE_TYPE_FILTER_OPTIONS = [
  { value: 'folder', labelKey: 'filter.type.folder' },
  { value: 'file', labelKey: 'filter.type.file' },
  { value: 'pdf', labelKey: 'filter.type.pdf' },
  { value: 'image', labelKey: 'filter.type.image' },
  { value: 'spreadsheet', labelKey: 'filter.type.spreadsheet' },
  { value: 'presentation', labelKey: 'filter.type.presentation' },
  { value: 'media', labelKey: 'filter.type.media' },
  { value: 'code', labelKey: 'filter.type.code' },
  { value: 'archive', labelKey: 'filter.type.archive' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mốc bắt đầu của bộ lọc ngày, tính theo ĐỒNG HỒ MÁY người dùng.
 *
 * Gửi mốc này lên (`updatedFrom`) thay vì để backend tự tính: máy chủ chạy UTC, nên
 * "Hôm nay" của nó bắt đầu lúc 7h sáng giờ Việt Nam — tệp sửa lúc 1h sáng nay không
 * nằm trong "Hôm nay". Tính ở đây thì mốc đúng với múi giờ của chính người đang xem.
 *
 * @param {string} filterDate 'all' | 'today' | '7days' | '30days' | 'this-year'
 * @returns {Date|null} null = không lọc theo ngày
 */
export function dateFilterStart(filterDate, now = new Date()) {
  switch (filterDate) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7days':
      return new Date(now.getTime() - 7 * DAY_MS);
    case '30days':
      return new Date(now.getTime() - 30 * DAY_MS);
    case 'this-year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}
