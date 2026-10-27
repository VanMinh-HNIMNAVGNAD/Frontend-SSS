import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatBytes } from '../../utils/formatFileSize';

/**
 * Viên nhỏ ở đáy khung ảnh cho biết đang xem bản nào — kiểu Google Photos:
 *  • đang chờ bản 2048px → "Đang tải bản nét…";
 *  • đang xem bản 2048px của một ảnh gốc nét hơn → nút "Xem ảnh gốc · 47 MB" (phóng to quá
 *    độ nét của bản 2048 cũng tự tải, nút này cho người muốn xem ngay);
 *  • đang tải ảnh gốc → tiến độ;
 *  • tải/giải mã ảnh gốc hỏng → nói rõ là đang xem bản thu gọn.
 */
export default function ImageStagePill({ stage, sizeBytes, onLoadOriginal }) {
  const { t } = useLanguage();
  const base =
    'absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-plain glass-dark text-xs text-white/90 whitespace-nowrap';
  const original = stage.original;

  if (stage.stage === 'placeholder' && stage.src) {
    return (
      <div className={base}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('preview.image.loadingSharp')}
      </div>
    );
  }
  if (original?.status === 'loading') {
    const pct = original.progress == null ? null : Math.round(original.progress * 100);
    return (
      <div className={`${base} flex-col !gap-1 !py-2`}>
        <span className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {pct == null ? t('preview.image.loadingOriginal') : t('preview.image.loadingOriginalPct', { percent: pct })}
        </span>
        {pct != null && (
          <span className="block w-40 h-1 rounded-full bg-white/15 overflow-hidden">
            <span className="block h-full bg-white/70 transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
    );
  }
  if (original?.status === 'error') {
    return <div className={base}>{t('preview.image.originalFailed')}</div>;
  }
  if (stage.stage === 'preview' && stage.canUpgrade) {
    return (
      <button type="button" onClick={onLoadOriginal} className={`${base} cursor-pointer`}>
        {t('preview.image.viewOriginal', { size: formatBytes(sizeBytes) })}
      </button>
    );
  }
  return null;
}
