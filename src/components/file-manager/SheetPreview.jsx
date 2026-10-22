import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { buildSheetGrid, MAX_ROWS, MAX_COLS } from '../../utils/sheetGrid';

/**
 * Xem trước bảng tính (.xlsx / .xlsm / .xls / .ods).
 *
 * SheetJS đã nằm sẵn trong dự án và đã chạy đúng việc này ở `useFileThumbnail`
 * (đọc 4 hàng đầu làm thumbnail) — cửa sổ xem trước chỉ là thiếu nhánh, nên đây
 * dùng lại đúng lối nạp lười đó thay vì thêm thư viện mới.
 *
 * KHÔNG dựng bằng `XLSX.utils.sheet_to_html` + `dangerouslySetInnerHTML`: nội dung
 * bảng tính là dữ liệu người dùng tải lên, và mỗi sink innerHTML thêm vào là một
 * cửa nữa cho XSS trong chính origin đang giữ token. Dựng bằng phần tử React thì
 * React tự thoát chuỗi, và đổi lại còn bám sát Excel hơn: có tiêu đề cột A/B/C,
 * số hàng, và vùng gộp ô.
 */

let xlsxPromise = null;
const loadXlsx = () => (xlsxPromise ??= import('xlsx'));

export default function SheetPreview({ url, onDownload }) {
  const { t } = useLanguage();
  const [lib, setLib] = useState(null);
  const [book, setBook] = useState(null);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!url) return undefined;

    let cancelled = false;
    setStatus('loading');
    setMessage(null);
    setBook(null);
    setActive(0);

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(t('preview.sheet.fetchFailed'));
        const buffer = await response.arrayBuffer();
        const XLSX = await loadXlsx();
        if (cancelled) return;

        // `cellDates` để ô ngày ra đúng ngày thay vì số serial của Excel; `cellNF`
        // + `cellText` để SheetJS điền sẵn `cell.w` — chuỗi ĐÃ ÁP ĐỊNH DẠNG mà
        // Excel hiển thị, tức 1.234.567 ₫ chứ không phải 1234567.
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellDates: true,
          cellNF: true,
          cellText: true,
        });
        if (!workbook.SheetNames?.length) throw new Error(t('preview.sheet.empty'));

        setLib(XLSX);
        setBook(workbook);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[Sheet Preview Error]', err);
        setMessage(err?.message || t('preview.sheet.failed'));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, t]);

  const grid = useMemo(() => {
    if (!lib || !book) return null;
    return buildSheetGrid(lib, book.Sheets[book.SheetNames[active]]);
  }, [lib, book, active]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400 m-auto">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">{t('preview.sheet.loading')}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md m-auto">
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
    );
  }

  const headerCell =
    'sticky top-0 z-20 bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400 font-semibold text-[11px] px-2 py-1 border-b border-r dark:border-white/10 text-center border-glass-divider';
  const indexCell =
    'sticky left-0 z-10 bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400 font-normal text-[11px] px-2 py-1 border-b border-r dark:border-white/10 text-right tabular-nums border-glass-divider';

  return (
    // `flex-1 min-h-0` chứ không phải `h-full`: cả hai nơi gọi đều đặt component
    // này làm con của một flex column CÓ SẴN một thanh tiêu đề phía trên, nên
    // `h-full` = 100% chiều cao cha sẽ đẩy bảng tràn xuống dưới đúng bằng chiều
    // cao thanh đó. `min-h-0` để vùng cuộn bên trong co lại được thay vì nở ra
    // theo nội dung — mặc định của flex item là `min-height:auto`.
    <div className="flex-1 flex flex-col min-h-0">
      {grid?.truncated && (
        <div className="px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          {t('preview.sheet.truncated', {
            rows: Math.min(MAX_ROWS, grid.totalRows),
            cols: Math.min(MAX_COLS, grid.totalCols),
            totalRows: grid.totalRows,
            totalCols: grid.totalCols,
          })}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {grid && grid.rows.length > 0 ? (
          <table className="border-collapse text-xs text-slate-800 dark:text-slate-200">
            <thead>
              <tr>
                <th className={`${headerCell} left-0 z-30`} />
                {grid.cols.map((col) => (
                  <th key={col.index} className={headerCell}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.index} className="even:bg-slate-50/60 dark:even:bg-white/[0.02]">
                  <th scope="row" className={indexCell}>
                    {row.index + 1}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.address}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={`px-2 py-1 border-b border-r dark:border-white/[0.07] whitespace-pre max-w-xs truncate align-top border-glass-divider ${
                        cell.numeric ? 'text-right tabular-nums' : 'text-left'
                      }`}
                      title={cell.text || undefined}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-400 p-6 text-center text-sm">{t('preview.sheet.empty')}</p>
        )}
      </div>

      {book && book.SheetNames.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto border-t dark:border-white/10 bg-slate-100 dark:bg-black/20 shrink-0 border-glass-divider">
          {book.SheetNames.map((sheetName, index) => (
            <button
              key={sheetName}
              onClick={() => setActive(index)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                index === active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
