/**
 * Tách tên tệp thành phần tên và phần mở rộng.
 *
 * QUY ƯỚC (phải giống hệt `splitFileName` trong `backend/src/files/files.service.ts`,
 * và cũng là quy ước các luồng upload đang dùng khi chống trùng tên):
 * chỉ DUY NHẤT đoạn sau dấu chấm CUỐI CÙNG là phần mở rộng.
 *
 *   'abc.xyz.mno' → { base: 'abc.xyz', ext: '.mno' }  ← chỉ khoá '.mno'
 *   'README'      → { base: 'README',  ext: '' }
 *   '.env'        → { base: '.env',    ext: '' }      ← tệp ẩn, dấu chấm ở đầu
 *   'abc.'        → { base: 'abc.',    ext: '' }      ← chấm cuối, không có đuôi
 *
 * Lý do lấy đúng đoạn cuối: hệ điều hành, trình duyệt và bảng màu/icon trong app
 * (`utils/fileColors.js`, `utils/getFileIcon`) đều chỉ đọc đoạn cuối để suy ra
 * định dạng. Với 'abc.xyz.mno' thì '.xyz' chỉ là một phần của tên, người dùng
 * sửa nó cũng không làm tệp đổi định dạng — nên nó vẫn được cho sửa.
 *
 * @param {string} name
 * @returns {{ base: string, ext: string }} `ext` gồm cả dấu chấm, hoặc '' nếu không có
 */
export function splitFileName(name) {
  const raw = typeof name === 'string' ? name : '';
  const dot = raw.lastIndexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return { base: raw, ext: '' };
  return { base: raw.slice(0, dot), ext: raw.slice(dot) };
}

/**
 * Phần mở rộng đã chuẩn hoá chữ thường, dùng để SO SÁNH hai tên với nhau.
 * @param {string} name
 * @returns {string} ví dụ '.mp3', hoặc '' nếu tên không có phần mở rộng
 */
export function fileExtension(name) {
  return splitFileName(name).ext.toLowerCase();
}
