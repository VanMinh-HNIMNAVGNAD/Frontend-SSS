import { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, matchPath } from 'react-router-dom';
import toast from 'react-hot-toast';
import { filesApi, storageApi, sharingApi, chunkedApi } from '../services/api';
import { useAuth } from './AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { useUpload } from './UploadContext';
import { formatBytes } from '../utils/formatFileSize';

const FileContext = createContext();

// Chuẩn hoá 1 item trả về từ API GET /files về đúng shape UI đang dùng.
// `isSharedWithMe` = true khi item đến từ nguồn "được chia sẻ với tôi",
// dùng để UI phân biệt tệp của mình với tệp người khác chia sẻ cho mình.
const formatApiItem = (item, isSharedWithMe = false) => {
  const base = {
    ...item,
    size: Number(item.sizeBytes || 0),
    createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '',
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toLocaleString('vi-VN') : '',
  };

  if (isSharedWithMe) {
    return {
      ...base,
      isSharedWithMe: true,
      owner: item.sharedOwner?.fullName || 'Người dùng khác',
      sharedOwner: item.sharedOwner || null,
      sharedRole: item.sharedRole || 'VIEWER',
      sharedAt: item.sharedAt
        ? new Date(item.sharedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '',
    };
  }

  return {
    ...base,
    owner: 'Tôi',
  };
};

export function FileProvider({ children }) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  
  // Chỉ tính lại khi đường dẫn đổi — thứ tự kiểm tra giữ nguyên như bản cũ
  const activeTab = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/app/home')) return 'home';
    if (path.includes('/app/shared-drives')) return 'shared-drives';
    if (path.includes('/app/shared-with-me')) return 'shared-with-me';
    if (path.includes('/app/recent')) return 'recent';
    if (path.includes('/app/starred')) return 'starred';
    if (path.includes('/app/spam')) return 'spam';
    if (path.includes('/app/trash')) return 'trash';
    if (path.includes('/app/billing')) return 'billing';
    return 'my-drive';
  }, [location.pathname]);

  const folderMatch = matchPath('/app/:tab/folders/:folderId', location.pathname);
  const currentFolderId = folderMatch ? folderMatch.params.folderId : null;

  const [currentSharedDriveId, setCurrentSharedDriveId] = useState(null);

  useEffect(() => {
    if (activeTab !== 'shared-drives') {
      setCurrentSharedDriveId(null);
    }
  }, [activeTab]);

  const setActiveTab = useCallback((tab) => {
    if (tab !== 'shared-drives') {
      setCurrentSharedDriveId(null);
    }
    navigate(`/app/${tab}`);
  }, [navigate]);

  const setCurrentFolderId = useCallback((id) => {
    if (id) {
      navigate(`/app/${activeTab}/folders/${id}`);
    } else {
      navigate(`/app/${activeTab}`);
    }
  }, [navigate, activeTab]);

  const openFolder = useCallback((folder) => {
    setCurrentPage(1);
    if (!folder || !folder.id) {
      navigate(`/app/${activeTab}`);
      return;
    }
    if (folder.sharedDriveId) {
      setCurrentSharedDriveId(folder.sharedDriveId);
      navigate(`/app/shared-drives/folders/${folder.id}`);
    } else if (activeTab === 'shared-with-me') {
      navigate(`/app/shared-with-me/folders/${folder.id}`);
    } else {
      navigate(`/app/my-drive/folders/${folder.id}`);
    }
  }, [navigate, activeTab]);

  const [viewMode, setViewMode] = useState('list');
  // Dưới 1024px sidebar là lớp phủ (xem SideBar.jsx) nên mặc định phải thu gọn,
  // nếu không tablet/mobile vừa vào app đã bị lớp phủ che hết nội dung
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 1024);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Driver của tôi' }]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400); // B8: chỉ gọi API sau 400ms idle
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');

  // Sorting
  const [sortField, setSortField] = useState('name'); // 'name' | 'size' | 'type' | 'owner' | 'group' | 'updatedAt' | 'createdAt'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedId, setLastSelectedId] = useState(null);

  // Clipboard State (Cut / Copy / Paste)
  const [clipboard, setClipboard] = useState({ items: [], mode: null });
  const [isPasting, setIsPasting] = useState(false);

  // Refs to avoid stale closures in event listeners and asynchronous callbacks
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;

  const isPastingRef = useRef(isPasting);
  isPastingRef.current = isPasting;

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const currentFolderIdRef = useRef(currentFolderId);
  currentFolderIdRef.current = currentFolderId;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Ref tracking latest fetch request ID to prevent race conditions on concurrent fetches
  const fetchRequestIdRef = useRef(0);

  // Storage Analytics State
  const [analytics, setAnalytics] = useState(null);

  // Preview modal state
  const [previewItem, setPreviewItem] = useState(null);

  const openPreview = useCallback((item) => {
    if (item && !item.isFolder && item.type !== 'folder') {
      setPreviewItem(item);
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewItem(null);
  }, []);

  // Info drawer state
  const [infoDrawerItem, setInfoDrawerItem] = useState(null);
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
  const [infoDrawerTab, setInfoDrawerTab] = useState('details');

  // Upload Queue — delegate hoàn toàn sang UploadContext
  // FileContext chỉ dùng updateJob/enqueueJob/removeJob/resetJob từ UploadContext
  const {
    uploadQueue,
    setUploadQueue,
    uploadQueueRef,
    updateJob,
    enqueueJob,
    removeJob,
    resetJob,
  } = useUpload();

  const activeCountRef = useRef(0);   // số job đang chạy thực sự
  const pendingQueueRef = useRef([]); // mirror của uploadQueue để runner đọc không bị stale

  const CONCURRENCY = 2;    // 2 file song song
  const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10MB: file lớn hơn → dùng chunked upload

  // ── localStorage helpers (keyed by userId — ngăn resume vào tài khoản khác) ──
  const getChunkStateKey = (jobId) => `driveR_chunk_${user?.id || 'anon'}_${jobId}`;

  const saveChunkState = (jobId, state) => {
    try {
      localStorage.setItem(getChunkStateKey(jobId), JSON.stringify(state));
    } catch { /* quota exceeded — bỏ qua */ }
  };

  const loadChunkState = (jobId) => {
    try {
      const raw = localStorage.getItem(getChunkStateKey(jobId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const clearChunkState = (jobId) => {
    try { localStorage.removeItem(getChunkStateKey(jobId)); } catch { /* ignore */ }
  };

  const openInfoDrawer = useCallback((item, tab = 'details') => {
    setInfoDrawerItem(item);
    setInfoDrawerTab(tab);
    setIsInfoDrawerOpen(true);
  }, []);

  const closeInfoDrawer = useCallback(() => {
    setIsInfoDrawerOpen(false);
  }, []);

  const VALID_FILE_TABS = ['my-drive', 'starred', 'trash', 'spam', 'recent', 'shared-with-me', 'shared-drives'];

  // Fetch Storage Analytics
  const fetchAnalytics = useCallback(async () => {
    if (isAuthLoading || !isAuthenticated) return;
    try {
      const data = await filesApi.getStorageAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Lỗi khi tải thống kê bộ nhớ:', err);
    }
  }, [isAuthenticated, isAuthLoading]);

  // Trang chủ (activeTab === 'home') không phải 1 tab file thật: nó cần gộp dữ liệu
  // từ nhiều nguồn để dựng 3 khu vực (Driver riêng của tôi / Đã mở gần đây / Được
  // chia sẻ với tôi). Thứ tự dưới đây cũng là thứ tự gộp — 'recent' đứng đầu để
  // danh sách sau khi gộp giữ được thứ tự "mở gần đây nhất" do backend trả về.
  const HOME_SOURCE_TABS = ['recent', 'my-drive', 'shared-with-me'];

  // Fetch dữ liệu cho Trang chủ: gọi song song các tab hợp lệ của cùng API
  // GET /files (không thêm endpoint mới), rồi gộp và loại trùng theo id.
  const fetchHomeItems = useCallback(async () => {
    if (isAuthLoading || !isAuthenticated) return;

    // Dùng chung bộ đếm request với fetchFiles để response cũ không ghi đè response mới
    const requestId = ++fetchRequestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const responses = await Promise.all(
        HOME_SOURCE_TABS.map((tab) =>
          filesApi
            .getFilesAndFolders({
              tab,
              search: debouncedSearch || undefined,
              page: 1,
              limit: pageSize,
            })
            .catch((err) => {
              // Một nguồn lỗi không được làm trắng cả Trang chủ
              console.error(`Lỗi khi tải dữ liệu Trang chủ (tab ${tab}):`, err);
              return null;
            }),
        ),
      );

      // Nếu có request mới hơn đã được phát đi (vd user vừa chuyển tab), bỏ qua kết quả cũ
      if (requestId !== fetchRequestIdRef.current) return;

      const mergedById = new Map();
      responses.forEach((response, index) => {
        const isSharedSource = HOME_SOURCE_TABS[index] === 'shared-with-me';
        (response?.items || []).forEach((item) => {
          // Giữ bản xuất hiện đầu tiên (ưu tiên thứ tự trong HOME_SOURCE_TABS)
          if (!item || mergedById.has(item.id)) return;
          mergedById.set(item.id, formatApiItem(item, isSharedSource));
        });
      });

      setItems(Array.from(mergedById.values()));
      setError(responses.every((response) => response === null) ? 'Không thể tải danh sách tệp' : null);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated, isAuthLoading, debouncedSearch, pageSize]);

  // Fetch Files and Folders from Backend API
  const fetchFiles = useCallback(
    async (retries = 1) => {
      // Chờ cho đến khi AuthContext đã resolve xong mới fetch
      if (isAuthLoading || !isAuthenticated) return;
      // Trang chủ đi theo luồng gộp riêng (xem fetchHomeItems) vì cần dữ liệu nhiều tab
      if (activeTab === 'home') {
        await fetchHomeItems();
        return;
      }
      if (!VALID_FILE_TABS.includes(activeTab)) return; // Billing không cần danh sách file

      const requestId = ++fetchRequestIdRef.current;
      setIsLoading(true);
      setError(null);

      const doFetch = async (remainingRetries) => {
        try {
          const response = await filesApi.getFilesAndFolders({
            tab: activeTab,
            folderId: currentFolderId || undefined,
            sharedDriveId: activeTab === 'shared-drives' && currentSharedDriveId ? currentSharedDriveId : undefined,
            search: debouncedSearch || undefined,
            filterType: filterType !== 'all' ? filterType : undefined,
            filterDate: filterDate !== 'all' ? filterDate : undefined,
            filterSender: filterOwner !== 'all' ? filterOwner : undefined,
            page: currentPage,
            limit: pageSize,
          });

          // Nếu có request mới hơn đã được phát đi, bỏ qua kết quả cũ tránh race condition
          if (requestId !== fetchRequestIdRef.current) return;

          const rawItems = response.items || [];
          const formattedItems = rawItems.map((item) => formatApiItem(item, activeTab === 'shared-with-me'));

          setItems(formattedItems);
          if (response.meta) {
            setTotalItems(response.meta.total || formattedItems.length);
            setTotalPages(response.meta.totalPages || 1);
          }
          if (response.breadcrumb) {
            setBreadcrumb(response.breadcrumb);
          }
          setError(null);
        } catch (err) {
          if (requestId !== fetchRequestIdRef.current) return;

          if (remainingRetries > 0) {
            console.warn(`Lỗi khi lấy danh sách file, đang thử lại sau 1s (còn ${remainingRetries} lần thử):`, err);
            setError('Danh sách có thể chưa cập nhật, đang thử tải lại...');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (requestId !== fetchRequestIdRef.current) return;
            return await doFetch(remainingRetries - 1);
          }

          console.error('Lỗi khi lấy danh sách file sau khi thử lại:', err);
          setError(err.message || 'Không thể tải danh sách tệp');
          // Giữ lại danh sách items cũ, KHÔNG gọi setItems([]) để tránh làm trắng trang
        } finally {
          if (requestId === fetchRequestIdRef.current) {
            setIsLoading(false);
          }
        }
      };

      await doFetch(retries);
    },
    [isAuthenticated, isAuthLoading, activeTab, currentFolderId, currentSharedDriveId, debouncedSearch, filterType, filterDate, filterOwner, currentPage, pageSize, fetchHomeItems]
  );

  useEffect(() => {
    fetchFiles();
    fetchAnalytics();
  }, [fetchFiles, fetchAnalytics]);

  const resetFilters = useCallback(() => {
    setFilterType('all');
    setFilterDate('all');
    setFilterOwner('all');
    setFilterLocation('all');
    setSearchQuery('');
  }, []);

  // ── Selection Functions ──

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
    setLastSelectedId(id);
  }, []);

  /**
   * Chọn khoảng từ lastSelectedId đến endId (theo thứ tự hiển thị: folders trước, files sau).
   * Nếu không có lastSelectedId, chỉ chọn endId.
   */
  const selectRange = useCallback((endId, currentSortedFolders, currentSortedFiles) => {
    const allIds = [...(currentSortedFolders || []), ...(currentSortedFiles || [])].map((item) => item.id);
    const startId = lastSelectedId;
    if (!startId) {
      setSelectedIds((prev) => { const n = new Set(prev); n.add(endId); return n; });
      setLastSelectedId(endId);
      return;
    }
    const startIdx = allIds.indexOf(startId);
    const endIdx = allIds.indexOf(endId);
    if (startIdx === -1 || endIdx === -1) {
      setSelectedIds((prev) => { const n = new Set(prev); n.add(endId); return n; });
      setLastSelectedId(endId);
      return;
    }
    const [from, to] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
    const idsToSelect = allIds.slice(from, to + 1);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      idsToSelect.forEach((id) => n.add(id));
      return n;
    });
    setLastSelectedId(endId);
  }, [lastSelectedId]);

  const selectAll = useCallback((currentSortedFolders, currentSortedFiles) => {
    const allIds = [...(currentSortedFolders || []), ...(currentSortedFiles || [])].map((item) => item.id);
    setSelectedIds(new Set(allIds));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  const getSelectedItems = useCallback(
    (currentSortedFolders, currentSortedFiles) =>
      [...(currentSortedFolders || []), ...(currentSortedFiles || [])].filter((item) => selectedIds.has(item.id)),
    [selectedIds]
  );

  // Reset selection khi fetch lại data (tab thay đổi, folder thay đổi)
  // Giữ lại selection nếu item vẫn tồn tại
  useEffect(() => {
    if (selectedIds.size > 0) {
      const existingIds = new Set(items.map((i) => i.id));
      setSelectedIds((prev) => {
        const filtered = new Set([...prev].filter((id) => existingIds.has(id)));
        return filtered;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const folders = useMemo(() => items.filter((item) => item.type === 'folder'), [items]);
  const files = useMemo(() => items.filter((item) => item.type === 'file'), [items]);

  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
  }, [folders, sortField, sortDirection]);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        if (sortField === 'size') {
            valA = Number(a.sizeBytes) || 0;
            valB = Number(b.sizeBytes) || 0;
        } else if (sortField === 'type') {
            valA = a.mimeType || '';
            valB = b.mimeType || '';
        } else {
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
  }, [files, sortField, sortDirection]);

  // Storage Info Object
  const storageInfo = useMemo(() => ({
    usedBytes: analytics ? analytics.usedBytes : 0,
    usedGB: analytics ? analytics.usedGB : '0.00',
    usedMB: analytics ? (analytics.usedBytes / (1024 * 1024)).toFixed(2) : '0.00',
    usedFormatted: analytics ? formatBytes(analytics.usedBytes) : '0 Bytes',
    totalGB: analytics ? analytics.limitGB : '2.00',
    percentage: analytics ? analytics.percentageUsed : 0,
    categories: analytics?.categories || {},
  }), [analytics]);

  // Danh sách unique owners từ items hiện tại — dùng cho filter
  const uniqueOwners = useMemo(() => {
    const seen = new Set();
    const owners = [];
    for (const item of items) {
      const name = item.owner || 'Tôi';
      if (!seen.has(name)) {
        seen.add(name);
        owners.push(name);
      }
    }
    return owners;
  }, [items]);


  // Actions connecting to Backend
  /**
   * Bật/tắt dấu sao cho một tệp hoặc thư mục.
   *
   * Dùng luôn `isStarred` backend trả về (`PATCH /files/:id/star` → { id, isStarred })
   * thay vì tự đảo cờ ở client: đảo cờ mù thì khi request thất bại một phần, hoặc
   * khi cùng một tệp đang hiện ở hai chỗ, UI sẽ lệch hẳn với DB.
   *
   * `silent` dành cho thao tác hàng loạt (phím tắt chọn nhiều mục) — để phía gọi
   * gộp lại thành MỘT thông báo thay vì bắn N cái toast.
   *
   * @returns {{ ok: boolean, isStarred?: boolean, error?: Error }}
   *          Không throw để nút bấm gọi trực tiếp không tạo unhandled rejection.
   */
  const toggleStar = useCallback(async (id, { silent = false } = {}) => {
    try {
      const res = await filesApi.toggleStar(id);
      const isStarred = typeof res?.isStarred === 'boolean' ? res.isStarred : undefined;
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isStarred: isStarred ?? !item.isStarred } : item,
        ),
      );
      if (!silent) {
        if (isStarred === undefined) {
          toast.success('Đã cập nhật dấu sao');
        } else {
          toast.success(isStarred ? 'Đã thêm vào mục gắn sao' : 'Đã bỏ khỏi mục gắn sao');
        }
      }
      return { ok: true, isStarred };
    } catch (err) {
      if (!silent) toast.error(err.message || 'Không cập nhật được dấu sao');
      return { ok: false, error: err };
    }
  }, []);

  const moveToTrash = useCallback(async (id) => {
    try {
      await filesApi.moveToTrash(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      fetchAnalytics();
    } catch (err) {
      toast.error('Không thể chuyển vào thùng rác: ' + err.message);
    }
  }, [fetchAnalytics]);

  const restoreFromTrash = useCallback(async (id) => {
    try {
      await filesApi.restoreFromTrash(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      fetchAnalytics();
    } catch (err) {
      toast.error('Không thể khôi phục: ' + err.message);
    }
  }, [fetchAnalytics]);

  const deletePermanently = useCallback(async (id) => {
    try {
      await filesApi.deletePermanently(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      fetchAnalytics();
    } catch (err) {
      toast.error('Không thể xóa vĩnh viễn: ' + err.message);
    }
  }, [fetchAnalytics]);

  const emptyTrash = useCallback(async (id) => {
    try {
      await filesApi.emptyTrash();
      setItems([]);
      fetchAnalytics();
    } catch (err) {
      toast.error('Không thể dọn thùng rác: ' + err.message);
    }
  }, [fetchAnalytics]);

  /**
   * Đổi tên một tệp hoặc thư mục.
   *
   * Trả `{ ok, name?, error? }` chứ KHÔNG throw — giống `toggleStar` — để
   * RenameModal biết mà giữ modal mở khi lỗi. Trước đây hàm này nuốt lỗi và
   * modal thì tự đóng ngay sau khi gọi, nên một request 403/404 trôi qua đúng
   * như thể đã đổi tên xong rồi bị "revert" về tên cũ.
   */
  const renameItem = useCallback(async (id, newName) => {
    const name = (newName || '').trim();
    if (!name) return { ok: false, error: new Error('Tên mới không được để trống') };
    try {
      const updated = await filesApi.renameItem(id, { name });
      // Ưu tiên tên backend trả về (nó mới là tên đã lưu thật) — xem toggleStar.
      const savedName = updated?.name || name;
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name: savedName } : item)));
      // Bảng thông tin giữ ẢNH CHỤP của item tại thời điểm mở (openInfoDrawer), không
      // đọc lại từ `items` — không đồng bộ ở đây thì nó vẫn hiện tên CŨ ngay cạnh
      // danh sách đã đổi tên, và nút "Đổi tên" trong đó lại mở modal với tên cũ.
      setInfoDrawerItem((prev) => (prev && prev.id === id ? { ...prev, name: savedName } : prev));
      toast.success('Đã đổi tên');
      return { ok: true, name: savedName };
    } catch (err) {
      toast.error('Không thể đổi tên: ' + err.message);
      return { ok: false, error: err };
    }
  }, []);

  const createFolder = useCallback(async (folderName) => {
    if (!folderName || !folderName.trim()) return;
    let res;
    // 1. Thao tác chính: tạo thư mục ở backend
    try {
      setIsLoading(true);
      const payload = {
        name: folderName.trim(),
        ...(currentFolderId ? { parentId: currentFolderId } : {}),
        ...(activeTab === 'shared-drives' && currentSharedDriveId ? { sharedDriveId: currentSharedDriveId } : {}),
      };
      res = await filesApi.createFolder(payload);
    } catch (err) {
      toast.error('Không thể tạo thư mục: ' + err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }

    // 2. Bước đồng bộ lại danh sách (tách riêng, không báo lỗi tạo thư mục nếu fetch lỗi)
    try {
      await fetchFiles();
    } catch (fetchErr) {
      console.warn('Lỗi đồng bộ danh sách sau khi tạo thư mục:', fetchErr);
    }

    return res;
  }, [currentFolderId, activeTab, currentSharedDriveId, fetchFiles]);

  /**
   * Tạo folder im lặng (không trigger loading, không gọi fetchFiles).
   * Dùng khi xây cấu trúc thư mục khi upload folder.
   * @returns {Promise<string|null>} ID của folder vừa tạo
   */
  const createFolderSilent = useCallback(async (name, parentId, sharedDriveId = (activeTab === 'shared-drives' ? currentSharedDriveId : undefined)) => {
    if (!name || !name.trim()) return null;
    try {
      const payload = {
        name: name.trim(),
        ...(parentId ? { parentId } : {}),
        ...(sharedDriveId ? { sharedDriveId } : {}),
      };
      const res = await filesApi.createFolder(payload);
      // Backend trả về dạng { id, name, ... } hoặc wrap trong data
      return res?.id || res?.data?.id || null;
    } catch (err) {
      console.error(`Tạo folder "${name}" thất bại:`, err);
      return null; // Không throw — để caller tự xử lý fallback
    }
  }, [activeTab, currentSharedDriveId]);

  const moveItem = useCallback(async (id, targetParentId) => {
    // 1. Thao tác chính: di chuyển item ở backend
    try {
      await filesApi.moveItem(id, { targetParentId });
    } catch (err) {
      toast.error('Không thể di chuyển: ' + err.message);
      return;
    }

    // 2. Bước đồng bộ lại danh sách
    try {
      await fetchFiles();
    } catch (fetchErr) {
      console.warn('Lỗi đồng bộ danh sách sau khi di chuyển:', fetchErr);
    }
  }, [fetchFiles]);

  const copyItem = useCallback(async (id, targetParentId) => {
    // 1. Thao tác chính: sao chép item ở backend
    try {
      await filesApi.copyItem(id, { targetParentId });
    } catch (err) {
      toast.error('Không thể sao chép: ' + err.message);
      return;
    }

    // 2. Bước đồng bộ lại danh sách và thông số lưu trữ
    try {
      await fetchFiles();
      await fetchAnalytics();
    } catch (fetchErr) {
      console.warn('Lỗi đồng bộ danh sách sau khi sao chép:', fetchErr);
    }
  }, [fetchFiles, fetchAnalytics]);

  // ── Cut / Copy / Paste Actions (Snapshot-based Clipboard) ──

  const cutItems = useCallback((ids) => {
    const targetIds = ids && ids.length > 0 ? ids : Array.from(selectedIdsRef.current);
    if (targetIds.length === 0) return;

    // Snapshot dữ liệu ngay tại thời điểm cut từ items state hiện tại
    const snapshot = itemsRef.current
      .filter((item) => targetIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        parentId: item.parentId ?? null,
        name: item.name,
        type: item.type,
      }));

    if (snapshot.length === 0) return;

    setClipboard({
      items: snapshot,
      mode: 'cut',
    });
  }, []);

  const copyItems = useCallback((ids) => {
    const targetIds = ids && ids.length > 0 ? ids : Array.from(selectedIdsRef.current);
    if (targetIds.length === 0) return;

    // Snapshot dữ liệu ngay tại thời điểm copy từ items state hiện tại
    const snapshot = itemsRef.current
      .filter((item) => targetIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        parentId: item.parentId ?? null,
        name: item.name,
        type: item.type,
      }));

    if (snapshot.length === 0) return;

    setClipboard({
      items: snapshot,
      mode: 'copy',
    });
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard({ items: [], mode: null });
  }, []);

  const pasteItems = useCallback(
    async (targetParentId) => {
      const currentClip = clipboardRef.current;
      if (!currentClip.mode || currentClip.items.length === 0) return;
      if (isPastingRef.current) return; // Ngăn người dùng click liên tục gây trùng request

      const destId = targetParentId !== undefined ? targetParentId : (currentFolderIdRef.current || null);

      // No-op check dùng snapshot đã lưu: nếu mode cut và paste vào đúng folder ban đầu thì bỏ qua
      const toProcess =
        currentClip.mode === 'cut'
          ? currentClip.items.filter((entry) => (entry.parentId ?? null) !== (destId ?? null))
          : currentClip.items;

      // Nếu cut vào chính nơi cũ -> hoàn tất êm, xoá clipboard
      if (toProcess.length === 0) {
        if (currentClip.mode === 'cut') {
          clearClipboard();
        }
        return;
      }

      setIsPasting(true);
      let results;
      try {
        results = await Promise.allSettled(
          toProcess.map(async (entry) => {
            if (currentClip.mode === 'cut') {
              return await filesApi.moveItem(entry.id, { targetParentId: destId });
            } else {
              return await filesApi.copyItem(entry.id, { targetParentId: destId });
            }
          })
        );
      } catch (err) {
        console.error('Lỗi trong quá trình dán:', err);
        toast.error('Đã xảy ra lỗi khi dán: ' + (err.message || err));
        return;
      } finally {
        setIsPasting(false);
      }

      const rejected = [];
      let fulfilledCount = 0;

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          fulfilledCount++;
        } else {
          rejected.push({
            name: toProcess[idx].name,
            reason: res.reason?.message || 'Lỗi không xác định',
          });
        }
      });

      if (rejected.length > 0) {
        // Toast góc phải không phải chỗ để liệt kê từng mục: nêu số lượng + tên mục
        // đầu tiên, chi tiết đầy đủ đẩy ra console cho lúc cần truy vết.
        console.error(
          'Dán thất bại:',
          rejected.map((r) => `${r.name}: ${r.reason}`).join('\n'),
        );
        const firstError = `${rejected[0].name}: ${rejected[0].reason}`;
        toast.error(
          rejected.length === 1
            ? `Không xử lý được "${firstError}"`
            : `Có ${rejected.length}/${toProcess.length} mục xử lý thất bại (${firstError}, ...)`,
        );
      }

      // Nếu là cut thì xoá clipboard sau khi paste (kể cả có lỗi một phần)
      if (currentClip.mode === 'cut') {
        clearClipboard();
      }
      // Nếu là copy: giữ nguyên clipboard để paste nhiều lần

      // Đồng bộ lại danh sách tệp & thông số lưu trữ (tách riêng khỏi catch dán)
      if (fulfilledCount > 0) {
        try {
          await fetchFiles();
          await fetchAnalytics();
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ danh sách sau khi dán:', syncErr);
        }
      }
    },
    [clearClipboard, fetchFiles, fetchAnalytics]
  );

  // ── Global Keyboard Shortcuts Listener ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputActive =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        document.activeElement?.isContentEditable;

      // Không can thiệp nếu người dùng đang nhập văn bản trong ô input/textarea
      if (isInputActive) return;

      // Esc = huỷ clipboard đang chờ, cho cả cut VÀ copy. Sau khi copy, clipboard
      // được giữ lại để dán nhiều lần nên nút "Dán (n)" ở thanh công cụ vẫn hiện —
      // Esc là cách để tắt nó đi. Xử lý TRƯỚC cờ tắt phím tắt: đây là thao tác huỷ
      // bỏ, nếu chặn thì người dùng không còn cách nào dẹp nút Dán.
      if (e.key === 'Escape') {
        if (clipboardRef.current.items.length > 0) {
          clearClipboard();
        }
        return;
      }

      // Người dùng có thể tắt phím tắt trong Cài đặt → bỏ qua toàn bộ
      // (khoá do SettingsModal.jsx ghi: driveR_settings_shortcuts_enabled)
      if (localStorage.getItem('driveR_settings_shortcuts_enabled') === 'false') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault();
          copyItems();
        }
      } else if (isCtrlOrCmd && (e.key === 'x' || e.key === 'X')) {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault();
          cutItems();
        }
      } else if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
        if (clipboardRef.current.items.length > 0 && !isPastingRef.current) {
          e.preventDefault();
          pasteItems();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyItems, cutItems, pasteItems, clearClipboard]);

  // --- Upload Queue Engine ---
  // updateJob, enqueueJob, removeJob, resetJob — được inject từ UploadContext (xem trên)

  /** Chunked upload cho file > 10MB — resume được sau khi F5/đóng tab */
  const runChunkedUploadJob = useCallback(
    async (job) => {
      const { id, fileObj, parentId, sharedDriveId } = job;

      // ── Bước 1: Kiểm tra localStorage có session resume không ──
      let session = loadChunkState(id);
      let resumableUrl, storageKey, chunkSize, totalChunks;
      let chunksDone = 0;

      if (session && session.userId === user?.id) {
        // Resume session cũ
        ({ resumableUrl, storageKey, chunkSize, totalChunks, chunksDone } = session);
        updateJob(id, { status: 'uploading', percent: Math.round((chunksDone / totalChunks) * 95) });
      } else {
        // Khởi tạo session mới
        updateJob(id, { status: 'uploading', percent: 1 });
        const initRes = await chunkedApi.init({
          name: fileObj.name,
          totalSizeBytes: fileObj.size,
          mimeType: fileObj.type || 'application/octet-stream',
          parentId: parentId || undefined,
          sharedDriveId: sharedDriveId || undefined,
        });
        ({ resumableUrl, storageKey, chunkSize, totalChunks } = initRes);
        chunksDone = 0;

        // Lưu vào localStorage ngay — keyed by userId
        saveChunkState(id, {
          userId: user?.id,
          resumableUrl,
          storageKey,
          chunkSize,
          totalChunks,
          chunksDone: 0,
          fileName: fileObj.name,
          totalSizeBytes: fileObj.size,
          mimeType: fileObj.type || 'application/octet-stream',
          parentId: parentId || null,
          sharedDriveId: sharedDriveId || null,
        });
      }

      // ── Bước 2: PUT từng chunk lên GCS resumable URL ──
      for (let i = chunksDone; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end   = Math.min(start + chunkSize, fileObj.size);
        const chunk = fileObj.slice(start, end);

        await chunkedApi.uploadChunkDirect(
          resumableUrl,
          chunk,
          start,
          fileObj.size,
          () => {
            const percent = Math.round(((i + 0.5) / totalChunks) * 95);
            updateJob(id, { percent, status: 'uploading' });
          },
        );

        // Lưu progress sau mỗi chunk thành công
        chunksDone = i + 1;
        saveChunkState(id, {
          userId: user?.id,
          resumableUrl,
          storageKey,
          chunkSize,
          totalChunks,
          chunksDone,
          fileName: fileObj.name,
          totalSizeBytes: fileObj.size,
          mimeType: fileObj.type || 'application/octet-stream',
          parentId: parentId || null,
          sharedDriveId: sharedDriveId || null,
        });
        updateJob(id, { percent: Math.round((chunksDone / totalChunks) * 95) });
      }

      // ── Bước 3: Hoàn tất — backend tạo DB record và verify userId ──
      updateJob(id, { percent: 98, status: 'confirming' });
      const completeRes = await chunkedApi.complete({
        storageKey,
        name: fileObj.name,
        sizeBytes: fileObj.size,
        mimeType: fileObj.type || 'application/octet-stream',
        parentId: parentId || undefined,
        sharedDriveId: sharedDriveId || undefined,
      });

      // Thông báo nếu bị đổi tên
      const savedName = completeRes?.file?.name || completeRes?.finalName || fileObj.name;
      if (savedName !== fileObj.name) {
        updateJob(id, { fileName: savedName, renamedFrom: fileObj.name });
      }

      // Xoá localStorage — upload hoàn tất
      clearChunkState(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, fetchFiles, fetchAnalytics],
  );

  /** Thực thi upload cho 1 job (phân nhánh: chunked nếu > 10MB, thường nếu nhỏ hơn) */
  const runUploadJob = useCallback(
    async (job) => {
      const { id, fileObj, parentId, targetProvider, sharedDriveId } = job;
      updateJob(id, { status: 'uploading', percent: 0 });

      try {
        // ── Nếu file > 10MB → dùng GCS chunked resumable upload ──
        if (fileObj.size > CHUNK_THRESHOLD) {
          await runChunkedUploadJob(job);
          updateJob(id, { percent: 100, status: 'done' });
          setTimeout(() => removeJob(id), 5000);
          try {
            await fetchFiles();
            await fetchAnalytics();
          } catch (syncErr) {
            console.warn('Lỗi đồng bộ sau khi tải lên file chunked:', syncErr);
          }
          return;
        }

        // ── File nhỏ ≤ 10MB: flow cũ (presigned PUT hoặc proxy) ──
        let isUploaded = false;

        // 1. Thử Direct Presigned PUT
        try {
          const presignedData = await storageApi.getUploadUrl({
            name: fileObj.name,
            sizeBytes: fileObj.size,
            mimeType: fileObj.type || 'application/octet-stream',
            parentId: parentId || undefined,
            sharedDriveId: sharedDriveId || undefined,
            targetProvider,
          });

          const { uploadUrl, storageKey, storageProvider } = presignedData;

          await storageApi.uploadDirectToCloud(uploadUrl, fileObj, (percent) => {
            updateJob(id, { percent, status: 'uploading' });
          });

          updateJob(id, { percent: 99, status: 'confirming' });

          const confirmRes = await storageApi.confirmUpload({
            name: fileObj.name,
            sizeBytes: fileObj.size,
            mimeType: fileObj.type || 'application/octet-stream',
            storageKey,
            storageProvider,
            parentId: parentId || undefined,
            sharedDriveId: sharedDriveId || undefined,
          });

          // Backend có thể đổi tên nếu trùng (ví dụ: file.txt → file(1).txt)
          const savedName = confirmRes?.file?.name || confirmRes?.name || fileObj.name;
          if (savedName !== fileObj.name) {
            updateJob(id, { fileName: savedName, renamedFrom: fileObj.name });
          }

          isUploaded = true;
        } catch (directErr) {
          console.warn('Direct upload failed, falling back to proxy:', directErr);
        }

        // 2. Fallback qua Server Proxy
        if (!isUploaded) {
          const proxyRes = await storageApi.uploadProxy(
            fileObj,
            parentId,
            targetProvider,
            (percent) => {
              updateJob(id, { percent, status: 'uploading' });
            },
            sharedDriveId,
          );

          // Backend có thể đổi tên nếu trùng
          const savedNameProxy = proxyRes?.file?.name || proxyRes?.name || fileObj.name;
          if (savedNameProxy !== fileObj.name) {
            updateJob(id, { fileName: savedNameProxy, renamedFrom: fileObj.name });
          }
        }

        updateJob(id, { percent: 100, status: 'done' });
        // Tự xóa job done sau 5 giây
        setTimeout(() => removeJob(id), 5000);

        // Refresh sau khi 1 file xong (đồng bộ danh sách và dung lượng)
        try {
          await fetchFiles();
          await fetchAnalytics();
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ sau khi tải lên file:', syncErr);
        }
      } catch (err) {
        console.error(`Lỗi upload "${fileObj.name}":`, err);
        updateJob(id, { percent: 0, status: 'error', error: err.message });
      } finally {
        // Giảm bộ đếm và dispatch runner để chạy job tiếp theo
        activeCountRef.current -= 1;
        dispatchRunner();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runChunkedUploadJob, fetchFiles, fetchAnalytics],
  );

  /** Runner: lấy job pending từ ref, chạy tối đa CONCURRENCY job cùng lúc */
  const dispatchRunner = useCallback(() => {
    while (
      activeCountRef.current < CONCURRENCY &&
      pendingQueueRef.current.length > 0
    ) {
      const nextJob = pendingQueueRef.current.shift();
      if (!nextJob) break;
      activeCountRef.current += 1;
      runUploadJob(nextJob);
    }
  }, [runUploadJob]);

  /**
   * Thêm 1 file vào upload queue.
   * parentId: override folder đích (dùng khi upload folder có cấu trúc — mục 3).
   */
  const enqueueUpload = useCallback(
    (fileObj, parentId = currentFolderId, targetProvider = undefined, sharedDriveId = (activeTab === 'shared-drives' ? currentSharedDriveId : undefined)) => {
      if (!fileObj) return;
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const job = {
        id: jobId,
        fileName: fileObj.name,
        fileObj,
        parentId,
        sharedDriveId,
        targetProvider,
        percent: 0,
        status: 'pending',
      };
      // Thêm vào UploadContext (UI) và ref (runner)
      enqueueJob(job);
      pendingQueueRef.current.push(job);
      dispatchRunner();
    },
    [currentFolderId, activeTab, currentSharedDriveId, dispatchRunner, enqueueJob],
  );

  /**
   * Retry 1 job đang lỗi — reset trạng thái về pending và chạy lại.
   * Giữ nguyên jobId để UI không nhảy (không tạo row mới).
   */
  const retryUploadJob = useCallback(
    (jobId) => {
      const job = uploadQueueRef.current.find((j) => j.id === jobId && j.status === 'error');
      if (!job) return;

      const retriedJob = { ...job, percent: 0, status: 'pending', error: undefined, renamedFrom: undefined };
      // Reset job trong UploadContext state
      resetJob(jobId, { percent: 0, status: 'pending', error: undefined, renamedFrom: undefined });
      // Đưa lại vào pendingQueueRef để runner xử lý
      pendingQueueRef.current.push(retriedJob);
      // Dispatch runner (setTimeout để state flush trước)
      setTimeout(() => dispatchRunner(), 0);
    },
    [dispatchRunner, uploadQueueRef, resetJob],
  );

  // Backward-compat alias — code cũ gọi uploadFile vẫn hoạt động

  const uploadFile = enqueueUpload;

  // Backward compatibility alias for UI calls
  const uploadFileMock = useCallback((fileName) => {
    const blob = new Blob(['File content test'], { type: 'text/plain' });
    const file = new File([blob], fileName || 'test_document.txt', { type: 'text/plain' });
    enqueueUpload(file);
  }, [enqueueUpload]);

  const getDownloadUrl = useCallback(async (id) => {
    try {
      const res = await storageApi.getDownloadUrl(id);
      return res.downloadUrl;
    } catch (err) {
      toast.error('Lỗi lấy link tải: ' + err.message);
      return null;
    }
  }, []);

  const getPreviewUrl = useCallback(async (id) => {
    try {
      const res = await storageApi.getPreviewUrl(id);
      return res.previewUrl;
    } catch (err) {
      toast.error('Lỗi lấy link xem trước: ' + err.message);
      return null;
    }
  }, []);

  const getFileTextContent = useCallback(async (id) => {
    try {
      const res = await storageApi.getFileTextContent(id);
      return res.content;
    } catch (err) {
      console.error('Lỗi lấy nội dung tệp:', err);
      return null;
    }
  }, []);

  const createShareLink = useCallback(async (id, options = {}) => {
    try {
      return await sharingApi.createShareLink(id, options);
    } catch (err) {
      toast.error('Lỗi tạo link chia sẻ: ' + err.message);
      return null;
    }
  }, []);

  const handleSetCurrentFolderId = useCallback((id) => {
    setCurrentFolderId(id);
    setCurrentPage(1);
  }, [setCurrentFolderId]);

  const handleSetCurrentSharedDriveId = useCallback((driveId) => {
    setCurrentSharedDriveId(driveId);
    setCurrentPage(1);
  }, []);

  const handleSetActiveTab = useCallback((tab) => {
    if (tab !== 'shared-drives') {
      setCurrentSharedDriveId(null);
    }
    if (activeTab === tab && !currentFolderId) {
      if (tab === 'shared-drives') {
        setCurrentSharedDriveId(null);
      }
      return;
    }
    setActiveTab(tab);
    setCurrentPage(1);
  }, [activeTab, currentFolderId, setActiveTab]);

  // Gói toàn bộ context value trong useMemo: identity chỉ đổi khi một trong các
  // dependency dưới đây thực sự đổi, nhờ đó consumer dùng memo() không re-render vô ích.
  // Các setter từ useState (setViewMode, setCurrentPage, ...) được React đảm bảo
  // ổn định vĩnh viễn nên cố tình KHÔNG liệt kê trong mảng dependency.
  const contextValue = useMemo(() => ({
    items,
    currentFolderId,
    setCurrentFolderId: handleSetCurrentFolderId,
    currentSharedDriveId,
    setCurrentSharedDriveId: handleSetCurrentSharedDriveId,
    openFolder,
    activeTab,
    setActiveTab: handleSetActiveTab,
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    toggleSidebar,
    isLoading,
    error,
    triggerReload: fetchFiles,
    currentPage,
    setCurrentPage,
    pageSize,
    totalItems,
    totalPages,
    breadcrumb,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    filterDate,
    setFilterDate,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    filterOwner,
    setFilterOwner,
    filterLocation,
    setFilterLocation,
    resetFilters,
    storageInfo,
    uniqueOwners,
    folders: sortedFolders,
    files: sortedFiles,
    rawFolders: folders,
    rawFiles: files,
    currentFilteredItems: items,
    paginatedItems: items,
    toggleStar,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    emptyTrash,
    createFolder,
    createFolderSilent,
    moveItem,
    copyItem,
    uploadFile,
    enqueueUpload,
    retryUploadJob,
    uploadFileMock,
    renameItem,
    getDownloadUrl,
    getPreviewUrl,
    getFileTextContent,
    createShareLink,
    uploadQueue,
    infoDrawerItem,
    isInfoDrawerOpen,
    infoDrawerTab,
    openInfoDrawer,
    closeInfoDrawer,
    previewItem,
    openPreview,
    closePreview,
    // Selection
    selectedIds,
    selectedCount: selectedIds.size,
    lastSelectedId,
    toggleSelect,
    selectRange,
    selectAll,
    deselectAll,
    isSelected,
    getSelectedItems,
    // Clipboard (Cut / Copy / Paste)
    clipboard,
    isPasting,
    cutItems,
    copyItems,
    clearClipboard,
    pasteItems,
  }), [
    // ── State cơ bản ──
    items, folders, files, sortedFolders, sortedFiles,
    isLoading, error, viewMode, isSidebarCollapsed,
    currentPage, pageSize, totalItems, totalPages, breadcrumb,
    // ── Điều hướng / tab ──
    activeTab, currentFolderId, currentSharedDriveId,
    handleSetActiveTab, handleSetCurrentFolderId, handleSetCurrentSharedDriveId,
    openFolder, toggleSidebar,
    // ── Tìm kiếm / lọc / sắp xếp ──
    searchQuery, filterType, filterDate, filterOwner, filterLocation,
    sortField, sortDirection, resetFilters, uniqueOwners,
    // ── Lưu trữ ──
    storageInfo,
    // ── Hành động trên file/folder ──
    fetchFiles, toggleStar, moveToTrash, restoreFromTrash, deletePermanently,
    emptyTrash, createFolder, createFolderSilent, moveItem, copyItem, renameItem,
    getDownloadUrl, getPreviewUrl, getFileTextContent, createShareLink,
    // ── Upload ──
    uploadQueue, uploadFile, enqueueUpload, retryUploadJob, uploadFileMock,
    // ── Drawer / preview ──
    infoDrawerItem, isInfoDrawerOpen, infoDrawerTab, openInfoDrawer, closeInfoDrawer,
    previewItem, openPreview, closePreview,
    // ── Selection ──
    selectedIds, lastSelectedId, toggleSelect, selectRange, selectAll,
    deselectAll, isSelected, getSelectedItems,
    // ── Clipboard ──
    clipboard, isPasting, cutItems, copyItems, clearClipboard, pasteItems,
  ]);

  return (
    <FileContext.Provider value={contextValue}>
      {children}
    </FileContext.Provider>
  );
}

export const useFiles = () => useContext(FileContext);