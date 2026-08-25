import { useState, useEffect } from 'react';
import { useFiles } from '../../context/FileContext';
import { filesApi } from '../../services/api';
import { Trash2, HardDrive, X, Sparkles, Check, AlertTriangle, FileText } from 'lucide-react';

export default function QuickCleanupModal({ isOpen, onClose }) {
  const { items, emptyTrash, moveToTrash, storageInfo } = useFiles();
  const [isCleaningTrash, setIsCleaningTrash] = useState(false);
  const [largeFiles, setLargeFiles] = useState(null);

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

  if (!isOpen) return null;

  const trashItems = items.filter((i) => i.isTrash);
  const trashBytes = trashItems.reduce((acc, curr) => acc + Number(curr.sizeBytes || curr.size || 0), 0);
  const trashMB = (trashBytes / (1024 * 1024)).toFixed(2);

  const handleEmptyTrashNow = async () => {
    try {
      setIsCleaningTrash(true);
      await emptyTrash();
      alert('Đã dọn dẹp sạch Thùng rác! Thu hồi bộ nhớ thành công.');
    } catch (err) {
      alert('Lỗi dọn thùng rác: ' + err.message);
    } finally {
      setIsCleaningTrash(false);
    }
  };

  const handleDeleteLargeFile = async (id) => {
    await moveToTrash(id);
    setLargeFiles((prev) => (prev || []).filter((f) => f.id !== id));
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#282a2c] rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-6 relative border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Dọn dẹp bộ nhớ thông minh</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Gợi ý thu hồi bộ nhớ tức thì để giải phóng dung lượng</p>
          </div>
        </div>

        {/* Suggestion 1: Empty Trash */}
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">Dọn sạch Thùng rác ({trashItems.length} tệp)</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">Có thể thu hồi ngay {trashMB} MB</div>
              </div>
            </div>
            <button
              onClick={handleEmptyTrashNow}
              disabled={isCleaningTrash || trashItems.length === 0}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isCleaningTrash ? 'Đang dọn...' : 'Dọn ngay'}
            </button>
          </div>
        </div>

        {/* Suggestion 2: Large Files */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center justify-between">
            <span>{(largeFiles || []).length} tệp lớn nhất nên xem xét xóa</span>
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{'>'} 10 MB</span>
          </h4>

          {largeFiles === null ? (
            <div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
              Đang quét toàn bộ drive...
            </div>
          ) : largeFiles.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-xs text-gray-500 dark:text-gray-400">
              🎉 Bạn chưa có tệp lớn nào vượt quá 10MB!
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {largeFiles.map((file) => {
                const mb = (Number(file.sizeBytes || file.size || 0) / (1024 * 1024)).toFixed(1);
                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-xl text-xs hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate font-semibold text-gray-900 dark:text-gray-100">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">{mb} MB</span>
                      <button
                        onClick={() => handleDeleteLargeFile(file.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded-md transition-colors"
                        title="Chuyển vào Thùng rác"
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

        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
