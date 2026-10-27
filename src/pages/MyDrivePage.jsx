import { useState } from 'react';
import { useFiles, useClipboard } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import Breadcrumb from '../components/file-manager/Breadcrumb';
import PageHeader from '../components/common/PageHeader';
import { UploadCloud, FolderInput, Loader2 } from 'lucide-react';
import { collectDropEntries } from '../utils/uploadTree';

export default function MyDrivePage() {
    const { t } = useLanguage();
  const {
    viewMode,
    filterType,
    setFilterType,
    filterDate,
    setFilterDate,
    filterOwner,
    setFilterOwner,
    clearFilters,
    uploadEntries,
    breadcrumb,
    openFolder,
  } = useFiles();

  // Bảng tạm đi context riêng — xem chú thích ở FileContext.
  const { clipboard, isPasting, pasteItems } = useClipboard();



  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);

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
      {/* Kéo thả: tấm kính phủ lên vùng danh sách, viền đứt nét màu mực — không còn mảng xanh nhấp nháy */}
      {isDragging && (
        <div className="absolute inset-0 z-40 rounded-3xl glass-overlay border-2 border-dashed border-[var(--ink-subtle)] flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-fade-in">
          <div className="glass-strong relative w-16 h-16 rounded-full flex items-center justify-center mb-4 text-[var(--ink)]">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">{t('myDrive.drop.title')}</h3>
          <p className="text-xs text-[var(--ink-muted)] mt-1">{t('myDrive.drop.hint')}</p>
        </div>
      )}

      {/* Đang đọc cây thư mục vừa thả — với thư mục lớn bước này mất vài giây */}
      {isReadingDrop && (
        <div className="glass-strong glass-plain absolute top-3 right-3 z-40 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--ink)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ink-muted)]" />
          <span>{t('myDrive.drop.reading')}</span>
        </div>
      )}

      {/* Bỏ chặng gốc (`id: null`) mà backend luôn trả về: `Breadcrumb` tự vẽ nút gốc
          "cloudSSS của tôi" rồi, truyền nguyên thì gốc hiện HAI lần ("cloudSSS của tôi ›
          cloudSSS của tôi › …") — cùng cách SharedWithMePage vẫn làm (##77). */}
      <PageHeader
        title={
          <Breadcrumb
            path={breadcrumb.filter((crumb) => crumb.id !== null)}
            onNavigate={(id) => openFolder({ id })}
          />
        }
        actions={clipboard?.items?.length > 0 && (
          <button
            disabled={isPasting}
            onClick={() => pasteItems()}
            className="glass-soft flex items-center gap-1.5 h-8 px-3 text-[var(--ink)] disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-xs font-semibold transition-colors cursor-pointer"
            title={t('myDrive.pasteTitle', { count: clipboard.items.length })}
          >
            {isPasting ? (
              <Loader2 className="w-4 h-4 text-[var(--ink-muted)] animate-spin" />
            ) : (
              <FolderInput className="w-4 h-4 text-[var(--ink-muted)]" />
            )}
            <span>{t('myDrive.paste', { count: clipboard.items.length })}</span>
          </button>
        )}
      />

      {/* Quick Filters Bar */}
      <FileFilterBar
        filterType={filterType}
        setFilterType={setFilterType}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        filterOwner={filterOwner}
        setFilterOwner={setFilterOwner}
        onReset={clearFilters}
      />

      {/* View Container (List or Grid) */}
      <div className="flex-1 overflow-y-auto pt-2">
        {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
      </div>
    </div>
  );
}