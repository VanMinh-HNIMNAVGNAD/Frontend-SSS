import { useState } from 'react';
import { useFiles } from '../context/FileContext';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import Breadcrumb from '../components/file-manager/Breadcrumb';
import { List, LayoutGrid, UploadCloud, FolderInput, Loader2 } from 'lucide-react';

export default function MyDrivePage() {
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
    uploadFile,
    breadcrumb,
    openFolder,
    clipboard,
    isPasting,
    pasteItems,
  } = useFiles();



  const [isDragging, setIsDragging] = useState(false);

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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach((file) => {
        uploadFile(file);
      });
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
          <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">Thả tệp vào đây để tải lên ngay!</h3>
          <p className="text-xs text-blue-500 mt-1">Tệp sẽ được tải lên Cloud storage an toàn</p>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <Breadcrumb path={breadcrumb} onNavigate={(id) => openFolder({ id })} />
        </div>

        {/* Action Buttons & View Switcher */}
        <div className="flex items-center gap-2">
          {clipboard?.items?.length > 0 && (
            <button
              disabled={isPasting}
              onClick={() => pasteItems()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-xs font-bold shadow-xs transition-colors cursor-pointer"
              title={`Dán ${clipboard.items.length} mục vào thư mục này (Ctrl+V) — Esc để bỏ`}
            >
              {isPasting ? (
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : (
                <FolderInput className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
              <span>Dán ({clipboard.items.length})</span>
            </button>
          )}

          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-full p-1 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setViewMode('list')}
              title="Xem dạng danh sách"
              className={`p-1.5 rounded-full transition-colors ${viewMode === 'list'
                  ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Xem dạng lưới"
              className={`p-1.5 rounded-full transition-colors ${viewMode === 'grid'
                  ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
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