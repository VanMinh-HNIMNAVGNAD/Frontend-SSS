import { useState, useEffect } from 'react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { filesApi } from '../../services/api';
import { Trash2, HardDrive, X, Check, AlertTriangle, FileText } from 'lucide-react';

export default function QuickCleanupModal({ isOpen, onClose }) {
  const { emptyTrash, moveToTrash, storageInfo } = useFiles();
  const { t } = useLanguage();
  const [isCleaningTrash, setIsCleaningTrash] = useState(false);
  const [largeFiles, setLargeFiles] = useState(null);
  // Số mục trong thùng rác, hỏi SERVER mỗi lần mở (`meta.total`). Trước ##79 đếm từ `items` của
  // trang đang mở: modal mở từ thanh bên, nên ở Drive của tôi luôn ra "0 tệp" và nút bị khoá; ở
  // Thùng rác thì chỉ đếm trang 1. `null` = đang hỏi.
  const [trashCount, setTrashCount] = useState(null);
  const [trashReloadToken, setTrashReloadToken] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    filesApi
      .getLargestFiles(3)
      .then((files) => {
        if (!cancelled) setLargeFiles(files || []);
      })
      .catch(() => {
        if (!cancelled) setLargeFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    filesApi
      .getFilesAndFolders({ tab: 'trash', page: 1, limit: 1 }, { background: true })
      .then((res) => {
        if (!cancelled) setTrashCount(Number(res?.meta?.total) || 0);
      })
      .catch(() => {
        if (!cancelled) setTrashCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, trashReloadToken]);

  if (!isOpen) return null;

  // Byte thùng rác tính vào dung lượng CỦA MÌNH — cùng nguồn với biểu đồ dung lượng.
  const trashBytes = Number(storageInfo?.categories?.trashed?.bytes) || 0;
  const trashMB = (trashBytes / (1024 * 1024)).toFixed(2);

  const handleEmptyTrashNow = async () => {
    setIsCleaningTrash(true);
    try {
      // `emptyTrash` không throw: lỗi đã có toast riêng. Chỉ báo "xong" khi server nói xong.
      const res = await emptyTrash();
      if (res?.ok) alert(t('cleanup.done'));
    } finally {
      setIsCleaningTrash(false);
      setTrashReloadToken((n) => n + 1);
    }
  };

  const handleDeleteLargeFile = async (id) => {
    await moveToTrash(id);
    setLargeFiles((prev) => (prev || []).filter((f) => f.id !== id));
  };

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4 duration-200 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-strong rounded-[28px] w-full max-w-lg p-6 space-y-6 relative border animate-glass-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('cleanup.title')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('cleanup.subtitle')}</p>
          </div>
        </div>

        {/* Suggestion 1: Empty Trash */}
        <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-400/15 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  {t('cleanup.emptyTrash', { count: trashCount ?? '…' })}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('cleanup.reclaimable', { size: trashMB })}
                </div>
              </div>
            </div>
            <button
              onClick={handleEmptyTrashNow}
              disabled={isCleaningTrash || !trashCount}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isCleaningTrash ? t('cleanup.trashing') : t('cleanup.trashNow')}
            </button>
          </div>
        </div>

        {/* Suggestion 2: Large Files */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center justify-between">
            <span>{t('cleanup.largeFiles', { count: (largeFiles || []).length })}</span>
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{'>'} 10 MB</span>
          </h4>

          {largeFiles === null ? (
            <div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
              {t('cleanup.scanning')}
            </div>
          ) : largeFiles.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
              {t('cleanup.noLargeFiles')}
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {largeFiles.map((file) => {
                const mb = (Number(file.sizeBytes || file.size || 0) / (1024 * 1024)).toFixed(1);
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-xl text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.07] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate font-semibold text-gray-900 dark:text-gray-100">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-amber-600 dark:text-amber-300 font-mono">{mb} MB</span>
                      <button
                        onClick={() => handleDeleteLargeFile(file.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md transition-colors"
                        title={t('cleanup.moveToTrash')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 border-t flex justify-end border-glass-divider">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-full transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
