import { useState } from 'react';
import { useFiles, useClipboard } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import Breadcrumb from '../components/file-manager/Breadcrumb';
import { List, LayoutGrid, UploadCloud, FolderInput, Loader2 } from 'lucide-react';
import { collectDropEntries } from '../utils/uploadTree';

export default function MyDrivePage() {
    const { t } = useLanguage();
  const {
    viewMode,
    setViewMode,
    currentFolderId,
    setCurrentFolderId,
    items,
    filterType,
    setFilterType,
    filterDate,
    setFilterDate,
    filterOwner,
    setFilterOwner,
    resetFilters,
    uploadEntries,
    breadcrumb,
    openFolder,
  } = useFiles();

  // Bảng tạm đi context riêng — xem chú thích ở FileContext.
  const { clipboard, isPasting, pasteItems } = useClipboard();



  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);

  const currentFolder = items.find((i) => i.id === currentFolderId);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  /**
   * Thả tệp VÀ thư mục — kể cả nhiều thư mục cùng lúc.
   *
   * `dataTransfer.files` bỏ trắng mọi thư mục, nên trước đây kéo cả thư mục vào
   * app thì không có gì xảy ra. Phải đi qua `webkitGetAsEntry()` (xem
   * `utils/uploadTree`) — và đây cũng là cách DUY NHẤT của trình duyệt để nhận
   * nhiều thư mục trong một thao tác, vì hộp thoại `webkitdirectory` chỉ cho
   * chọn một thư mục mỗi lần.
   */
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Phải đọc DataTransfer NGAY tại đây: sau await đầu tiên trình duyệt thu hồi items
    const treePromise = collectDropEntries(e.dataTransfer);

    setIsReadingDrop(true);
    try {
      const tree = await treePromise;
      if (tree.entries.length === 0 && tree.dirPaths.length === 0) return;
      await uploadEntries(tree);
    } finally {
      setIsReadingDrop(false);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-full relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/10 border-4 border-dashed border-blue-500 rounded-3xl z-40 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-pulse">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">{t('myDrive.drop.title')}</h3>
          <p className="text-xs text-blue-500 mt-1">{t('myDrive.drop.hint')}</p>
        </div>
      )}

      {/* Đang đọc cây thư mục vừa thả — với thư mục lớn bước này mất vài giây */}
      {isReadingDrop && (
        <div className="absolute top-3 right-3 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{t('myDrive.drop.reading')}</span>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <Breadcrumb path={breadcrumb} onNavigate={(id) => openFolder({ id })} />
        </div>

        {/* Action Buttons & View Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          {clipboard?.items?.length > 0 && (
            <button
              disabled={isPasting}
              onClick={() => pasteItems()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 border border-blue-300 dark:border-blue-800/60 text-blue-800 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title={t('myDrive.pasteTitle', { count: clipboard.items.length })}
            >
              {isPasting ? (
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : (
                <FolderInput className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
              <span>{t('myDrive.paste', { count: clipboard.items.length })}</span>
            </button>
          )}

          <div className="flex items-center bg-gray-200/90 dark:bg-gray-700 rounded-full p-0.5 border border-gray-300 dark:border-gray-700">
            <button
              onClick={() => setViewMode('list')}
              title={t('view.list')}
              className={`p-1.5 rounded-full transition-colors ${viewMode === 'list'
                  ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title={t('view.grid')}
              className={`p-1.5 rounded-full transition-colors ${viewMode === 'grid'
                  ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filters Bar */}
      <FileFilterBar
        filterType={filterType}
        setFilterType={setFilterType}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        filterOwner={filterOwner}
        setFilterOwner={setFilterOwner}
        onReset={resetFilters}
      />

      {/* View Container (List or Grid) */}
      <div className="flex-1 overflow-y-auto mt-2">
        {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
      </div>
    </div>
  );
}