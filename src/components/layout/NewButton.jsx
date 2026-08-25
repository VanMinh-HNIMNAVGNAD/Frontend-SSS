import { useState, useRef, useEffect } from 'react';
import { useFiles } from '../../context/FileContext';
import { Plus, FolderPlus, FileUp, FolderUp, Loader2 } from 'lucide-react';
import { filesApi } from '../../services/api';

export default function NewButton({ isCollapsed }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBuildingTree, setIsBuildingTree] = useState(false); // đang tạo sub-folders

  const {
    createFolder,
    createFolderSilent,
    enqueueUpload,
    currentFolderId,
    currentSharedDriveId,
    activeTab,
    triggerReload,
  } = useFiles();

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

  const handleCreateFolderPrompt = () => {
    setIsOpen(false);
    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tạo thư mục mới.');
      return;
    }
    const name = prompt('Nhập tên thư mục mới:', 'Thư mục chưa đặt tên');
    if (name) {
      createFolder(name);
    }
  };

  /** Tải nhiều file lên — mỗi file thêm vào queue riêng biệt */
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tải tệp lên.');
      e.target.value = '';
      setIsOpen(false);
      return;
    }
    files.forEach((file) => enqueueUpload(file));
    setIsOpen(false);
    e.target.value = '';
  };

  /**
   * Tải folder lên và GIỮ NGUYÊN CẤU TRÚC THƯ MỤC.
   *
   * Thuật toán:
   * 1. Parse tất cả webkitRelativePath → xây tập hợp dir paths duy nhất
   * 2. Sắp xếp từ nông → sâu (cha trước con)
   * 3. Tạo từng folder tuần tự, lưu path → folderId vào map
   * 4. Enqueue từng file vào đúng parentId
   * 5. Refresh sau khi tất cả folder được tạo
   */
  const handleFolderChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (activeTab === 'shared-drives' && !currentSharedDriveId && !currentFolderId) {
      alert('Vui lòng mở một Bộ nhớ dùng chung trước khi tải thư mục lên.');
      e.target.value = '';
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    e.target.value = '';
    setIsBuildingTree(true);

    try {
      // --- Bước 1: Gom tất cả đường dẫn thư mục duy nhất ---
      const dirPathSet = new Set();
      files.forEach((file) => {
        const parts = file.webkitRelativePath.split('/');
        // Thêm mọi ancestor path (trừ tên file ở cuối)
        for (let depth = 1; depth < parts.length; depth++) {
          dirPathSet.add(parts.slice(0, depth).join('/'));
        }
      });

      // --- Bước 2: Sắp xếp từ nông → sâu ---
      const sortedDirPaths = Array.from(dirPathSet).sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b);
      });

      // --- Bước 3: Tạo hàng loạt folder trên server ---
      let batchFolderIdMap = {};
      const effectiveSharedDriveId = activeTab === 'shared-drives' ? currentSharedDriveId : undefined;
      if (sortedDirPaths.length > 0) {
        try {
          batchFolderIdMap = await filesApi.createFoldersBatch(
            sortedDirPaths,
            currentFolderId,
            effectiveSharedDriveId,
          );
        } catch (error) {
          console.error('Lỗi khi tạo hàng loạt thư mục:', error);
          alert('Không thể tạo toàn bộ cấu trúc thư mục, một số tệp có thể bị đặt sai vị trí.');
        }
      }

      // 'batchFolderIdMap' trả về dạng: { 'A': 'uuid1', 'A/B': 'uuid2' }
      // '' (chuỗi rỗng) = root = currentFolderId
      const folderIdMap = { '': currentFolderId, ...batchFolderIdMap };

      // --- Bước 4: Enqueue từng file vào đúng parentId ---
      files.forEach((file) => {
        const parts     = file.webkitRelativePath.split('/');
        const dirPath   = parts.slice(0, -1).join('/'); // '' nếu file ở root folder
        const targetId  = folderIdMap[dirPath] ?? currentFolderId;
        enqueueUpload(file, targetId, undefined, effectiveSharedDriveId);
      });

      // --- Bước 5: Refresh để hiện cây folder vừa tạo ---
      triggerReload();
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
        aria-label="Chọn nhiều tệp để tải lên"
      />

      {/* Hidden input: chọn folder (webkitdirectory) */}
      <input
        type="file"
        ref={setFolderInputRef}
        onChange={handleFolderChange}
        multiple
        className="hidden"
        aria-label="Chọn thư mục để tải lên"
      />

      {/* Nút + Mới */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center gap-3 bg-white dark:bg-[#282a2c] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xs hover:shadow-md hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 font-medium text-sm transition-all duration-200 ${
          isCollapsed ? 'w-12 h-12 p-0 rounded-full' : 'px-5 py-3'
        }`}
        title="Tạo mới tệp hoặc thư mục"
      >
        <Plus className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 stroke-[2.5]" />
        {!isCollapsed && <span className="font-semibold tracking-wide text-[15px]">Mới</span>}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 bg-white dark:bg-[#282a2c] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 w-64 z-50 animate-in fade-in zoom-in-95 duration-150 left-0">
          {/* Tạo thư mục mới */}
          <button
            onClick={handleCreateFolderPrompt}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <FolderPlus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span>Thư mục mới</span>
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          {/* Tải nhiều file lên */}
          <button
            onClick={() => {
              setIsOpen(false);
              fileInputRef.current?.click();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <FileUp className="w-5 h-5 text-blue-500" />
            <div className="flex flex-col items-start">
              <span className="font-medium">Tải tệp lên</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Chọn nhiều tệp cùng lúc</span>
            </div>
          </button>

          {/* Tải thư mục lên (giữ cấu trúc) */}
          <button
            onClick={() => {
              setIsOpen(false);
              folderInputRef.current?.click();
            }}
            disabled={isBuildingTree}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left disabled:opacity-60 disabled:cursor-wait"
          >
            {isBuildingTree
              ? <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
              : <FolderUp className="w-5 h-5 text-amber-500" />
            }
            <div className="flex flex-col items-start">
              <span className="font-medium">
                {isBuildingTree ? 'Đang xây cây thư mục...' : 'Tải thư mục lên'}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Giữ nguyên cấu trúc thư mục</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}