import { useState, useRef, useEffect } from 'react';
import { useFiles, useDriveAccess } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTags } from '../../context/TagsContext';
import { Plus, FolderPlus, FileUp, FolderUp, Loader2 } from 'lucide-react';
import { collectInputEntries } from '../../utils/uploadTree';
import { alertDialog, promptDialog } from '../../utils/dialog';

export default function NewButton({ isCollapsed }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBuildingTree, setIsBuildingTree] = useState(false); // đang tạo sub-folders

  const {
    createFolder,
    enqueueUpload,
    uploadEntries,
    currentFolderId,
    currentSharedDriveId,
    currentTagId,
    activeTab,
    isInForeignFolder,
  } = useFiles();
  const { isDriveReadOnly } = useDriveAccess();
  const { t } = useLanguage();
  // Đứng ở trang Nhãn (##92): trang đó không phải thư mục — mục mới vào Drive của tôi và tự mang
  // nhãn đang xem. Nói trước ngay trong menu, đừng để người dùng tự đoán tệp đã đi đâu.
  const tagsCtx = useTags();
  const viewTag = activeTab === 'tags' ? tagsCtx?.tags.find((tag) => tag.id === currentTagId) ?? null : null;
  // Chỗ đang đứng không ghi được: thư mục người khác chia sẻ (##78) hoặc Bộ nhớ chung mình chỉ là
  // VIEWER (##79). Khoá ba lệnh và nói lý do ngay trong menu.
  const writeLockKey = isInForeignFolder
    ? 'newBtn.foreignFolder'
    : isDriveReadOnly
      ? 'newBtn.driveViewer'
      : null;
  const isWriteLocked = Boolean(writeLockKey);

  const dropdownRef   = useRef(null);
  const fileInputRef  = useRef(null); // upload nhiều file
  const folderInputRef = useRef(null); // upload folder (giữ cấu trúc)

  // Gán webkitdirectory qua ref để tránh ESLint prop warning
  const setFolderInputRef = (el) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  };

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateFolderPrompt = async () => {
    setIsOpen(false);
    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      await alertDialog(t('newBtn.needDrive.folder'));
      return;
    }
    const name = await promptDialog({
      message: t('newBtn.prompt.folderName'),
      defaultValue: t('newBtn.defaultFolderName'),
    });
    if (name && name.trim()) {
      createFolder(name.trim());
    }
  };

  /** Tải nhiều file lên — mỗi file thêm vào queue riêng biệt */
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      alertDialog(t('newBtn.needDrive.file'));
      e.target.value = '';
      setIsOpen(false);
      return;
    }
    files.forEach((file) => enqueueUpload(file));
    setIsOpen(false);
    e.target.value = '';
  };

  /**
   * Tải thư mục lên, GIỮ NGUYÊN CẤU TRÚC THƯ MỤC CON.
   *
   * Toàn bộ thuật toán (gom đường dẫn → tạo folder theo lô → enqueue từng tệp)
   * nay nằm trong `FileContext.uploadEntries`, dùng chung với menu chuột phải và
   * với kéo–thả. Ở đây chỉ còn việc đọc `input.files`.
   *
   * Hộp thoại của trình duyệt CHỈ cho chọn một thư mục mỗi lần (giới hạn của
   * `webkitdirectory`). Muốn nhiều thư mục cùng lúc thì kéo–thả vào vùng danh
   * sách; hoặc bấm nút này nhiều lần liên tiếp — các lần chọn sau không còn làm
   * gián đoạn/tải lại những gì đang tải dở nữa.
   */
  const handleFolderChange = async (e) => {
    const tree = collectInputEntries(e.target.files);
    e.target.value = '';
    if (tree.entries.length === 0) return;

    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      alertDialog(t('newBtn.needDrive.uploadFolder'));
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    setIsBuildingTree(true);
    try {
      await uploadEntries(tree);
    } finally {
      setIsBuildingTree(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Hidden input: chọn nhiều file */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        aria-label={t('newBtn.aria.pickFiles')}
      />

      {/* Hidden input: chọn folder (webkitdirectory) */}
      <input
        type="file"
        ref={setFolderInputRef}
        onChange={handleFolderChange}
        multiple
        className="hidden"
        aria-label={t('newBtn.aria.pickFolder')}
      />

      {/* Nút + Mới */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`glass-soft flex items-center justify-center gap-3 text-[var(--ink)] rounded-2xl hover:shadow-md active:scale-[0.98] font-medium text-sm transition-all duration-200 cursor-pointer ${
          isCollapsed ? 'w-12 h-12 p-0 rounded-full' : 'px-5 py-3'
        }`}
        title={t('newBtn.title')}
      >
        <Plus className="w-6 h-6 text-[var(--ink)] shrink-0 stroke-[2.5]" />
        {!isCollapsed && <span className="font-semibold tracking-wide text-[15px]">{t('newBtn.label')}</span>}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="glass-strong absolute top-full mt-2 rounded-[20px] p-1.5 w-64 z-50 left-0 animate-glass-in origin-top-left">
          {/* Thư mục người khác chia sẻ: nói lý do NGAY trong menu và khoá ba lệnh — không để
              người dùng chọn tệp, tải lên rồi mới bị từ chối (##78). */}
          {isWriteLocked && (
            <div role="note" className="mx-0.5 mb-1 rounded-xl bg-[var(--tone-warn-soft)] px-3 py-2">
              <p className="text-[12.5px] leading-snug text-[var(--ink)]">{t(writeLockKey)}</p>
            </div>
          )}
          {viewTag && (
            <div role="note" className="mx-0.5 mb-1 rounded-xl bg-[var(--chip-fill)] px-3 py-2">
              <p className="text-[12.5px] leading-snug text-[var(--ink-muted)]">{t('newBtn.tagView', { name: viewTag.name })}</p>
            </div>
          )}

          {/* Tạo thư mục mới */}
          <button
            onClick={handleCreateFolderPrompt}
            disabled={isWriteLocked}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm text-[var(--ink)] cursor-pointer pointer-coarse:active:bg-black/[0.05] dark:pointer-coarse:active:bg-white/[0.08] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FolderPlus className="w-5 h-5 text-[var(--ink-muted)]" />
            <span>{t('newBtn.newFolder')}</span>
          </button>

          <div className="my-1 border-t border-glass-divider" />

          {/* Tải nhiều file lên */}
          <button
            onClick={() => {
              setIsOpen(false);
              fileInputRef.current?.click();
            }}
            disabled={isWriteLocked}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm text-[var(--ink)] cursor-pointer pointer-coarse:active:bg-black/[0.05] dark:pointer-coarse:active:bg-white/[0.08] transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileUp className="w-5 h-5 text-[var(--ink-muted)]" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{t('newBtn.uploadFile')}</span>
            </div>
          </button>

          {/* Tải thư mục lên (giữ cấu trúc) */}
          <button
            onClick={() => {
              setIsOpen(false);
              folderInputRef.current?.click();
            }}
            disabled={isBuildingTree || isWriteLocked}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm text-[var(--ink)] cursor-pointer pointer-coarse:active:bg-black/[0.05] dark:pointer-coarse:active:bg-white/[0.08] transition-colors text-left ${
              isWriteLocked
                ? 'disabled:opacity-40 disabled:cursor-not-allowed'
                : 'disabled:opacity-60 disabled:cursor-wait'
            }`}
          >
            {isBuildingTree
              ? <Loader2 className="w-5 h-5 text-[var(--ink-muted)] animate-spin" />
              : <FolderUp className="w-5 h-5 text-[var(--ink-muted)]" />
            }
            <div className="flex flex-col items-start">
              <span className="font-medium">
                {isBuildingTree ? t('menu.buildingTree') : t('newBtn.uploadFolder')}
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}