/**
 * Dựng lưới hiển thị cho một trang tính đã đọc bằng SheetJS.
 *
 * Tách khỏi component (`components/file-manager/SheetPreview.jsx`) vì đây là phần
 * DUY NHẤT có thể sai một cách âm thầm: vùng gộp ô tính lệch một ô thì bảng vẫn
 * hiện ra bình thường, chỉ là mọi cột sau đó trượt đi so với bản trong Excel — kiểu
 * lỗi không ai nhìn ảnh chụp mà thấy được. Ở dạng hàm thuần thì nó chạy được dưới
 * Node với một workbook thật, không cần dựng DOM.
 */

/**
 * Trần hiển thị. Một sheet 50.000 hàng × 100 cột là 5 triệu `<td>` — trình duyệt
 * đứng hình trước khi vẽ xong. Cắt ở đây rồi nói thẳng là đã cắt, còn hơn để cửa
 * sổ treo không lời giải thích.
 */
export const MAX_ROWS = 500;
export const MAX_COLS = 60;

/**
 * @param {object} XLSX     module SheetJS đã nạp (cần `utils`)
 * @param {object} sheet    một worksheet — `workbook.Sheets[tên]`
 * @returns {{rows: Array, cols: Array, truncated: boolean, totalRows: number, totalCols: number}}
 */
export function buildSheetGrid(XLSX, sheet) {
  const empty = { rows: [], cols: [], truncated: false, totalRows: 0, totalCols: 0 };
  if (!XLSX || !sheet || !sheet['!ref']) return empty;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
  const lastCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1);

  // Ô nằm TRONG một vùng gộp (trừ ô góc trên trái) không được dựng `<td>` riêng.
  // Bỏ bước này thì mỗi vùng gộp đẩy phần còn lại của hàng lệch sang phải và bảng
  // không còn khớp với bản trong Excel nữa.
  const anchors = new Map();
  const covered = new Set();
  for (const merge of sheet['!merges'] ?? []) {
    anchors.set(`${merge.s.r}:${merge.s.c}`, merge);
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (r !== merge.s.r || c !== merge.s.c) covered.add(`${r}:${c}`);
      }
    }
  }

  const cols = [];
  for (let c = range.s.c; c <= lastCol; c += 1) {
    cols.push({ index: c, label: XLSX.utils.encode_col(c) });
  }

  const rows = [];
  for (let r = range.s.r; r <= lastRow; r += 1) {
    const cells = [];
    for (let c = range.s.c; c <= lastCol; c += 1) {
      if (covered.has(`${r}:${c}`)) continue;

      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      const merge = anchors.get(`${r}:${c}`);

      cells.push({
        address,
        // `cell.w` là chuỗi ĐÃ ÁP ĐỊNH DẠNG mà Excel hiển thị (1.234.567 ₫), có được
        // nhờ đọc workbook với `cellNF` + `cellText`. `cell.v` chỉ là giá trị thô.
        text: cell ? (cell.w ?? (cell.v == null ? '' : String(cell.v))) : '',
        numeric: cell?.t === 'n',
        // Kẹp span lại trong cửa sổ đang hiển thị: một vùng gộp tràn quá
        // MAX_ROWS/MAX_COLS mà giữ nguyên span sẽ làm vỡ khung bảng.
        rowSpan: merge ? Math.min(merge.e.r, lastRow) - r + 1 : 1,
        colSpan: merge ? Math.min(merge.e.c, lastCol) - c + 1 : 1,
      });
    }
    rows.push({ index: r, cells });
  }

  return {
    rows,
    cols,
    truncated: range.e.r > lastRow || range.e.c > lastCol,
    totalRows: range.e.r - range.s.r + 1,
    totalCols: range.e.c - range.s.c + 1,
  };
}
