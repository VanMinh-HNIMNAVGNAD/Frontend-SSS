import { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, matchPath } from 'react-router-dom';
import toast from 'react-hot-toast';
import { filesApi, storageApi, sharingApi, chunkedApi } from '../services/api';
import { useAuth } from './AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { useUploadActions } from './UploadContext';
import { formatBytes } from '../utils/formatFileSize';
import { buildSortedDirPaths } from '../utils/uploadTree';
import { CHUNK_THRESHOLD } from '../constants/upload';

const FileContext = createContext();

// ── Kiểu hiển thị (list / grid) ─────────────────────────────────────────────
// Khoá localStorage riêng cho preference này. Đọc/ghi bọc try/catch vì chế độ
// ẩn danh hoặc iframe có thể chặn storage — chặn thì phiên đó không nhớ chứ
// KHÔNG được làm sập cả app.
// Tiền tố khoá localStorage của các phiên chunked upload còn dở. Khoá đầy đủ:
// `driveR_chunk_<userId>_<jobId>`. Khai báo một chỗ vì cả getChunkStateKey(),
// clearChunkState() và listResumableSessions() đều phải dựng đúng cùng dạng khoá.
const CHUNK_STATE_PREFIX = 'driveR_chunk_';

const VIEW_MODE_KEY = 'driver.viewMode';
const VIEW_MODES = ['list', 'grid'];
const DEFAULT_VIEW_MODE = 'list';

/** Lazy initializer của useState: chỉ chạy đúng một lần lúc mount. */
function readViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return VIEW_MODES.includes(saved) ? saved : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

function safeSetViewMode(value) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, value);
  } catch {
    /* bỏ qua: không lưu được thì phiên này vẫn dùng bình thường */
  }
}

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

/**
 * So khớp NÔNG hai phiên bản của cùng một item.
 * Mục đích duy nhất: biết được item nào KHÔNG đổi sau một lần đồng bộ với server.
 */
const isSameItemData = (prev, next) => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (a === b) continue;
    // sharedOwner… là object mới sau mỗi lần parse JSON — so sánh theo nội dung
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
    }
    return false;
  }
  return true;
};

/**
 * Trộn danh sách mới từ server vào danh sách đang hiển thị.
 *
 * Tập hợp và THỨ TỰ luôn theo server; hàm này chỉ TÁI SỬ DỤNG object cũ cho
 * những item không đổi. FileCard/FolderCard đều là `memo()` nên giữ nguyên
 * reference = không re-render = thumbnail không phải tải lại. Nếu không có gì
 * đổi thì trả về đúng mảng cũ để React bỏ qua luôn lần render đó.
 */
const mergeItemsPreservingRefs = (prevItems, nextItems) => {
  const prevById = new Map(prevItems.map((item) => [item.id, item]));
  let changed = prevItems.length !== nextItems.length;

  const merged = nextItems.map((next, index) => {
    const prev = prevById.get(next.id);
    if (prev && isSameItemData(prev, next)) {
      if (prevItems[index] !== prev) changed = true; // cùng dữ liệu nhưng đổi vị trí
      return prev;
    }
    changed = true;
    return next;
  });

  return changed ? merged : prevItems;
};

/**
 * GCS giữ một phiên resumable upload 7 ngày rồi tự xoá. Quá hạn thì bản ghi
 * trong localStorage chỉ còn là rác — đừng mời người dùng "tải tiếp" một phiên
 * mà máy chủ đã quên.
 */
const RESUMABLE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Số byte đã đẩy lên theo bản ghi localStorage.
 *
 * Bản ghi cũ (trước khi chuyển sang đếm theo byte) chỉ có `chunksDone` — vẫn
 * phải đọc được, nếu không thì ngay lần cập nhật này mọi phiên đang dở của người
 * dùng đều bị tính là 0% và tải lại từ đầu.
 */
const readUploadedBytes = (session) => {
  if (!session) return 0;
  if (typeof session.uploadedBytes === 'number') return session.uploadedBytes;
  if (typeof session.chunksDone === 'number' && typeof session.chunkSize === 'number') {
    return Math.min(session.chunksDone * session.chunkSize, session.totalSizeBytes || Infinity);
  }
  return 0;
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

  // Kiểu hiển thị (danh sách / lưới) là lựa chọn của người dùng nên phải sống
  // sót qua F5 và qua việc đóng/mở lại app — useState thuần chỉ nằm trong RAM
  // của tab hiện tại, nên trước đây reload là quay về 'list'.
  const [viewMode, setViewModeState] = useState(readViewMode);

  // Bọc setter để mọi nơi gọi setViewMode('grid') đều tự động ghi localStorage,
  // thay vì bắt từng trang (MyDrivePage, TrashPage, ...) phải nhớ ghi thủ công.
  // Vẫn hỗ trợ dạng updater function để giống hợp đồng của setState.
  const setViewMode = useCallback((value) => {
    setViewModeState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const safe = VIEW_MODES.includes(next) ? next : prev;
      safeSetViewMode(safe);
      return safe;
    });
  }, []);
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

  /**
   * Ảnh chụp "người dùng đang xem gì" để các callback bất đồng bộ (upload chạy
   * nền xong sau vài giây) biết item vừa tạo có thuộc màn hình hiện tại hay
   * không, mà không cần đưa cả bộ filter vào dependency của runUploadJob.
   */
  const viewRef = useRef(null);
  viewRef.current = {
    activeTab,
    currentFolderId,
    currentSharedDriveId,
    search: debouncedSearch,
    filterType,
    filterDate,
    filterOwner,
  };

  /**
   * Chèn / cập nhật item vào danh sách đang hiển thị mà KHÔNG gọi lại API.
   *
   * Đây là thứ thay thế cho `fetchFiles()` sau mỗi lần upload xong: tải 30 tệp
   * trước đây là 30 lần tải lại toàn bộ thư mục (skeleton nháy, thumbnail dựng
   * lại từ đầu, cuộn trang nhảy); giờ mỗi tệp xong chỉ thêm đúng một card.
   *
   * @param {object|object[]} raw  entity thô từ backend (`{ file }` của
   *                               confirm-upload / chunked complete / proxy)
   * @param {boolean} skipExisting  true = id đã có thì bỏ qua, không ghi đè
   *                                (dùng cho folder optimistic, tránh đè dữ
   *                                liệu thật bằng dữ liệu tự dựng ở client)
   */
  const upsertItems = useCallback((raw, { skipExisting = false } = {}) => {
    const incoming = (Array.isArray(raw) ? raw : [raw]).filter((item) => item && item.id);
    if (incoming.length === 0) return;

    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      const appended = [];
      let changed = false;

      incoming.forEach((item) => {
        const existing = byId.get(item.id);
        if (existing && skipExisting) return;

        const formatted = formatApiItem(item, viewRef.current?.activeTab === 'shared-with-me');
        const next = existing ? { ...existing, ...formatted } : formatted;
        if (existing && isSameItemData(existing, next)) return;

        changed = true;
        byId.set(item.id, next);
        if (!existing) appended.push(item.id);
      });

      if (!changed) return prev;

      // Item mới xuống cuối; sortedFolders/sortedFiles sẽ tự xếp lại đúng chỗ
      return [...prev.map((item) => byId.get(item.id) || item), ...appended.map((id) => byId.get(id))];
    });
  }, []);

  /**
   * Item vừa tạo có thuộc đúng màn hình người dùng đang xem không.
   * Nếu không (đang ở tab khác, đã đi sang thư mục khác, hoặc đang bật tìm
   * kiếm/lọc — lúc đó tập kết quả do server quyết định) thì không chèn gì cả:
   * lần đồng bộ im lặng ở cuối hàng đợi sẽ lo phần còn lại.
   */
  const belongsToCurrentView = useCallback((entity) => {
    const view = viewRef.current;
    if (!view || !entity) return false;
    if (!['my-drive', 'home', 'shared-drives'].includes(view.activeTab)) return false;
    if (view.search) return false;
    if (view.filterType !== 'all' || view.filterDate !== 'all' || view.filterOwner !== 'all') return false;

    const parentId = entity.parentId ?? null;
    const viewFolderId = view.currentFolderId ?? null;
    if (parentId !== viewFolderId) return false;

    if (view.activeTab === 'shared-drives') {
      const driveId = entity.sharedDriveId ?? null;
      if (!viewFolderId && driveId !== (view.currentSharedDriveId ?? null)) return false;
    } else if (entity.sharedDriveId && !viewFolderId) {
      return false;
    }

    return true;
  }, []);

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

  // Upload Queue — delegate hoàn toàn sang UploadContext.
  // Dùng `useUploadActions` (không phải `useUpload`): FileContext chỉ điều khiển
  // hàng đợi chứ không vẽ tiến độ, nên nó KHÔNG được phép render lại theo từng %.
  const {
    uploadQueueRef,
    updateJob,
    enqueueJob,
    removeJob,
    resetJob,
  } = useUploadActions();

  const activeCountRef = useRef(0);   // số job đang chạy thực sự
  const pendingQueueRef = useRef([]); // mirror của uploadQueue để runner đọc không bị stale

  const CONCURRENCY = 2;    // 2 file song song (CHUNK_THRESHOLD nằm ở constants/upload.js
                           // vì bảng tiến trình cũng cần biết tệp nào tạm dừng được)

  /**
   * jobId → AbortController của request đang chạy. Nút "Huỷ" cắt đúng request
   * này; không có nó thì bấm huỷ chỉ đổi được nhãn trên màn hình còn dữ liệu
   * vẫn tiếp tục chảy lên cloud.
   */
  const abortControllersRef = useRef(new Map());

  /** jobId → { storageKey, storageProvider, resumableUrl } để còn dọn rác khi huỷ */
  const uploadSessionsRef = useRef(new Map());

  /** Những job người dùng đã bấm huỷ — để phân biệt "bị huỷ" với "lỗi thật" */
  const canceledJobIdsRef = useRef(new Set());

  /**
   * Những job đang TẠM DỪNG. Khác huỷ ở đúng chỗ quan trọng nhất: phiên trên GCS
   * và bản ghi localStorage được GIỮ NGUYÊN, nên bấm "Tiếp tục" là đẩy tiếp từ
   * byte đang dở chứ không tải lại từ đầu.
   */
  const pausedJobIdsRef = useRef(new Set());

  /**
   * jobId → timer dọn dòng "Đã huỷ" khỏi bảng tiến trình.
   * Giữ lại để còn huỷ timer khi người dùng bấm "Tải lại" ngay sau đó — không
   * thì dòng vừa được bật lại đã bị chính timer cũ xoá mất.
   */
  const cancelCleanupTimersRef = useRef(new Map());

  // ── localStorage helpers (keyed by userId — ngăn resume vào tài khoản khác) ──
  // Cả bốn hàm PHẢI là useCallback theo `user?.id`. Trước đây chúng là hàm thuần
  // trong thân component nên callback nào có dependency array không chứa chúng
  // (cancelUploadJob, discardResumableSession) sẽ giữ mãi bản của lần render đầu
  // — lần render mà profile chưa tải xong nên `user` còn null và khoá bị tính ra
  // `..._anon_<jobId>`. Hệ quả: bấm "Bỏ" xoá một khoá không tồn tại, bản ghi
  // thật nằm nguyên đó và mỗi lần vào lại app là lại bị hỏi đúng phiên đó.
  const getChunkStateKey = useCallback(
    (jobId) => `${CHUNK_STATE_PREFIX}${user?.id || 'anon'}_${jobId}`,
    [user?.id],
  );

  const saveChunkState = useCallback((jobId, state) => {
    try {
      // `savedAt` để biết phiên đã cũ bao lâu: session resumable của GCS chỉ sống
      // 7 ngày, quá hạn thì đề nghị "tải tiếp" chỉ tổ làm người dùng mất công.
      localStorage.setItem(getChunkStateKey(jobId), JSON.stringify({ ...state, savedAt: Date.now() }));
    } catch { /* quota exceeded — bỏ qua */ }
  }, [getChunkStateKey]);

  const loadChunkState = useCallback((jobId) => {
    try {
      const raw = localStorage.getItem(getChunkStateKey(jobId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [getChunkStateKey]);

  const clearChunkState = useCallback((jobId) => {
    try {
      const key = getChunkStateKey(jobId);
      const existed = localStorage.getItem(key) !== null;
      localStorage.removeItem(key);
      if (existed) return;

      // Không thấy khoá mong đợi → quét theo jobId để bỏ cho hết. jobId là uuid
      // nên không thể trùng giữa hai phiên; đây là lưới an toàn dọn cả những bản
      // ghi đã bị ghi dưới khoá khác (di sản của lỗi khoá `anon` nói trên).
      // "Bỏ" phải là bỏ hẳn — còn sót một bản ghi là app còn hỏi lại.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CHUNK_STATE_PREFIX) && k.endsWith(`_${jobId}`)) {
          localStorage.removeItem(k);
        }
      }
    } catch { /* ignore */ }
  }, [getChunkStateKey]);

  /**
   * Liệt kê các phiên tải lên còn dở của CHÍNH người dùng này.
   *
   * Đây là thứ khiến "tải tiếp sau khi F5" trở nên khả thi: nội dung tệp thì
   * trình duyệt không giữ lại được qua một lần tải lại trang (đối tượng File
   * chết theo tab), nhưng phiên trên GCS thì vẫn còn — chỉ cần người dùng chọn
   * lại đúng tệp đó là đẩy tiếp từ chỗ đang dở.
   *
   * Bỏ qua: phiên của tài khoản khác, phiên quá 7 ngày (GCS đã xoá), và phiên
   * của job đang chạy ngay trong phiên làm việc hiện tại.
   */
  const listResumableSessions = useCallback(() => {
    const prefix = `${CHUNK_STATE_PREFIX}${user?.id || 'anon'}_`;
    const activeJobIds = new Set(uploadQueueRef.current.map((job) => job.id));
    const sessions = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        let data;
        try {
          data = JSON.parse(localStorage.getItem(key));
        } catch {
          localStorage.removeItem(key); // bản ghi hỏng — dọn luôn
          continue;
        }

        if (!data || data.userId !== user?.id) continue;

        const jobId = key.slice(prefix.length);
        if (activeJobIds.has(jobId)) continue;

        const ageMs = Date.now() - (data.savedAt || 0);
        if (ageMs > RESUMABLE_SESSION_TTL_MS) {
          localStorage.removeItem(key);
          continue;
        }

        const uploadedBytes = readUploadedBytes(data);
        sessions.push({
          ...data,
          jobId,
          uploadedBytes,
          percent: data.totalSizeBytes ? Math.round((uploadedBytes / data.totalSizeBytes) * 100) : 0,
        });
      }
    } catch {
      return []; // localStorage bị chặn (ẩn danh, iframe) — coi như không có phiên nào
    }

    return sessions.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }, [user?.id, uploadQueueRef]);

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
  const fetchHomeItems = useCallback(async ({ silent = false } = {}) => {
    if (isAuthLoading || !isAuthenticated) return;

    // Dùng chung bộ đếm request với fetchFiles để response cũ không ghi đè response mới
    const requestId = ++fetchRequestIdRef.current;
    if (!silent) setIsLoading(true);
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

      setItems((prev) => mergeItemsPreservingRefs(prev, Array.from(mergedById.values())));
      setError(responses.every((response) => response === null) ? 'Không thể tải danh sách tệp' : null);
    } finally {
      if (!silent && requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated, isAuthLoading, debouncedSearch, pageSize]);

  // Fetch Files and Folders from Backend API
  const fetchFiles = useCallback(
    async (retries = 1, { silent = false } = {}) => {
      // Chờ cho đến khi AuthContext đã resolve xong mới fetch
      if (isAuthLoading || !isAuthenticated) return;
      // Trang chủ đi theo luồng gộp riêng (xem fetchHomeItems) vì cần dữ liệu nhiều tab
      if (activeTab === 'home') {
        await fetchHomeItems({ silent });
        return;
      }
      if (!VALID_FILE_TABS.includes(activeTab)) return; // Billing không cần danh sách file

      const requestId = ++fetchRequestIdRef.current;
      // `silent` = đồng bộ nền (sau khi upload xong): KHÔNG bật skeleton, chỉ
      // trộn dữ liệu mới vào danh sách đang hiện — người dùng không thấy gì nháy
      if (!silent) setIsLoading(true);
      if (!silent) setError(null);

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

          setItems((prev) => mergeItemsPreservingRefs(prev, formattedItems));
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
            if (!silent) setError('Danh sách có thể chưa cập nhật, đang thử tải lại...');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (requestId !== fetchRequestIdRef.current) return;
            return await doFetch(remainingRetries - 1);
          }

          console.error('Lỗi khi lấy danh sách file sau khi thử lại:', err);
          if (!silent) setError(err.message || 'Không thể tải danh sách tệp');
          // Giữ lại danh sách items cũ, KHÔNG gọi setItems([]) để tránh làm trắng trang
        } finally {
          if (!silent && requestId === fetchRequestIdRef.current) {
            setIsLoading(false);
          }
        }
      };

      await doFetch(retries);
    },
    [isAuthenticated, isAuthLoading, activeTab, currentFolderId, currentSharedDriveId, debouncedSearch, filterType, filterDate, filterOwner, currentPage, pageSize, fetchHomeItems]
  );

  /**
   * Ref tới bản `fetchFiles` MỚI NHẤT.
   *
   * Bắt buộc cho lần đồng bộ nền sau khi upload xong: hàng đợi chạy nhiều giây,
   * người dùng có thể đã sang thư mục khác. Nếu dùng `fetchFiles` mà callback
   * đóng gói lúc bắt đầu upload thì request phát ra mang folderId CŨ nhưng lại
   * là request mới nhất — nó sẽ thắng và đổ danh sách thư mục cũ lên màn hình
   * thư mục mới.
   */
  const fetchFilesRef = useRef(null);
  fetchFilesRef.current = fetchFiles;

  useEffect(() => {
    fetchFiles();
    fetchAnalytics();
  }, [fetchFiles, fetchAnalytics]);

  /**
   * Hai bộ gộp (debounce) dùng cho hàng đợi upload.
   *
   * Trước đây MỖI tệp xong đều gọi `fetchFiles()` + `fetchAnalytics()`. Tải một
   * thư mục 40 tệp = 80 request và 40 lần dựng lại toàn bộ danh sách. Giờ:
   *  - card của tệp vừa xong được chèn ngay tại chỗ (xem `upsertItems`),
   *  - thống kê dung lượng gộp lại còn 1 lần / 1.2s,
   *  - và chỉ khi hàng đợi rỗng hẳn mới đồng bộ lại với server MỘT lần, ở chế
   *    độ im lặng (không skeleton) để bắt các thay đổi phía server mà client
   *    không đoán được (đổi tên do trùng, cờ spam, quota…).
   */
  const analyticsTimerRef = useRef(null);
  const silentSyncTimerRef = useRef(null);

  const scheduleAnalyticsRefresh = useCallback(() => {
    if (analyticsTimerRef.current) clearTimeout(analyticsTimerRef.current);
    analyticsTimerRef.current = setTimeout(() => {
      analyticsTimerRef.current = null;
      fetchAnalytics();
    }, 1200);
  }, [fetchAnalytics]);

  const scheduleSilentSync = useCallback(() => {
    if (silentSyncTimerRef.current) clearTimeout(silentSyncTimerRef.current);

    const tick = () => {
      // Còn tệp đang tải thì hoãn tiếp — lần đồng bộ này chỉ có ý nghĩa khi hàng
      // đợi đã rỗng hẳn, chen vào giữa chừng là tải lại danh sách vô ích
      if (activeCountRef.current > 0 || pendingQueueRef.current.length > 0) {
        silentSyncTimerRef.current = setTimeout(tick, 1500);
        return;
      }
      silentSyncTimerRef.current = null;
      fetchFilesRef.current?.(0, { silent: true });
    };

    silentSyncTimerRef.current = setTimeout(tick, 1500);
  }, []);

  useEffect(() => () => {
    if (analyticsTimerRef.current) clearTimeout(analyticsTimerRef.current);
    if (silentSyncTimerRef.current) clearTimeout(silentSyncTimerRef.current);
  }, []);

  /** Tệp vừa upload xong: chèn card mới, hẹn cập nhật quota + đồng bộ cuối hàng đợi */
  const onUploadedFile = useCallback((entity) => {
    if (entity && belongsToCurrentView(entity)) {
      upsertItems(entity);
    }
    scheduleAnalyticsRefresh();
    scheduleSilentSync();
  }, [belongsToCurrentView, upsertItems, scheduleAnalyticsRefresh, scheduleSilentSync]);

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
      const payload = {
        name: folderName.trim(),
        ...(currentFolderId ? { parentId: currentFolderId } : {}),
        ...(activeTab === 'shared-drives' && currentSharedDriveId ? { sharedDriveId: currentSharedDriveId } : {}),
      };
      res = await filesApi.createFolder(payload);
    } catch (err) {
      toast.error('Không thể tạo thư mục: ' + err.message);
      throw err;
    }

    // 2. Backend trả nguyên entity thư mục vừa tạo → chèn đúng MỘT card, không bật
    // skeleton và không tải lại cả danh sách. `scheduleSilentSync` lo phần đối
    // chiếu với server (ví dụ tên bị tự đổi vì trùng) ở chế độ im lặng.
    const created = res?.id ? res : res?.data?.id ? res.data : null;
    if (created && belongsToCurrentView(created)) {
      upsertItems(created);
    }
    scheduleSilentSync();

    return res;
  }, [currentFolderId, activeTab, currentSharedDriveId, belongsToCurrentView, upsertItems, scheduleSilentSync]);

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

  /**
   * Chunked upload cho tệp > 10MB — tải tiếp được sau khi mất mạng, bấm Huỷ hụt,
   * hay F5.
   *
   * Điểm tiếp tục được tính theo BYTE chứ không theo chỉ số chunk: khi đứt mạng
   * giữa lúc PUT, GCS vẫn giữ phần đầu của chunk đó, nên tính theo chunk là ném
   * đi vài MB đã đẩy lên rồi. Và số byte ấy HỎI THẲNG GCS (qua backend) chứ
   * không tin con số client tự ghi — client có thể đã tắt máy đúng lúc đang gửi.
   */
  const runChunkedUploadJob = useCallback(
    async (job, signal) => {
      const { id, fileObj, parentId, sharedDriveId } = job;
      const totalSize = fileObj.size;

      // ── Bước 1: Có phiên cũ trong localStorage không? ──
      let session = loadChunkState(id);
      let resumableUrl, storageKey, chunkSize;
      let uploadedBytes = 0;

      if (session && session.userId === user?.id && session.resumableUrl && session.storageKey) {
        ({ resumableUrl, storageKey, chunkSize } = session);
        chunkSize = chunkSize || CHUNK_THRESHOLD;
        uploadedBytes = readUploadedBytes(session);

        // Nguồn sự thật là GCS, không phải localStorage
        updateJob(id, { status: 'uploading', percent: Math.round((uploadedBytes / totalSize) * 95) });
        const remote = await chunkedApi
          .status({ storageKey, resumableUrl, totalSizeBytes: totalSize })
          .catch((err) => {
            console.warn('Không hỏi được trạng thái phiên tải lên, dùng số liệu cục bộ:', err);
            return null;
          });

        if (remote?.expired) {
          // Phiên đã hết hạn/bị huỷ trên GCS → bỏ hẳn, khởi tạo lại từ đầu
          clearChunkState(id);
          session = null;
        } else if (remote) {
          uploadedBytes = remote.completed ? totalSize : Math.min(remote.receivedBytes || 0, totalSize);
        }
      } else {
        session = null;
      }

      // ── Bước 2: Chưa có phiên hợp lệ → xin GCS một session mới ──
      if (!session) {
        updateJob(id, { status: 'uploading', percent: 1 });
        const initRes = await chunkedApi.init({
          name: fileObj.name,
          totalSizeBytes: totalSize,
          mimeType: fileObj.type || 'application/octet-stream',
          parentId: parentId || undefined,
          sharedDriveId: sharedDriveId || undefined,
        });
        ({ resumableUrl, storageKey, chunkSize } = initRes);
        chunkSize = chunkSize || CHUNK_THRESHOLD;
        uploadedBytes = 0;
      }

      // Ghi lại ngay để nút Huỷ có cái mà dọn, và để F5 còn tìm thấy phiên này
      uploadSessionsRef.current.set(id, { storageKey, resumableUrl, storageProvider: 'google_cloud' });

      const persist = (bytes) =>
        saveChunkState(id, {
          userId: user?.id,
          resumableUrl,
          storageKey,
          chunkSize,
          uploadedBytes: bytes,
          fileName: fileObj.name,
          totalSizeBytes: totalSize,
          mimeType: fileObj.type || 'application/octet-stream',
          lastModified: fileObj.lastModified || null,
          parentId: parentId || null,
          sharedDriveId: sharedDriveId || null,
        });

      persist(uploadedBytes);

      // ── Bước 3: PUT tiếp từ đúng byte đang dở ──
      while (uploadedBytes < totalSize) {
        const end = Math.min(uploadedBytes + chunkSize, totalSize);
        const chunk = fileObj.slice(uploadedBytes, end);
        const chunkStart = uploadedBytes;

        await chunkedApi.uploadChunkDirect(
          resumableUrl,
          chunk,
          chunkStart,
          totalSize,
          (chunkPercent) => {
            // Tiến độ trong lòng một chunk cũng phải hiện ra: với chunk 10MB trên
            // đường truyền chậm, thanh tiến trình đứng im hàng chục giây là dấu
            // hiệu duy nhất người dùng có, và nó nói sai.
            const sentInChunk = Math.round((chunk.size * chunkPercent) / 100);
            const percent = Math.round(((chunkStart + sentInChunk) / totalSize) * 95);
            updateJob(id, { percent, status: 'uploading' });
          },
          signal,
        );

        uploadedBytes = end;
        persist(uploadedBytes);
        updateJob(id, { percent: Math.round((uploadedBytes / totalSize) * 95) });
      }

      // ── Bước 4: Hoàn tất — backend tạo DB record và verify userId ──
      updateJob(id, { percent: 98, status: 'confirming' });
      const completeRes = await chunkedApi.complete({
        storageKey,
        name: fileObj.name,
        sizeBytes: totalSize,
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
      uploadSessionsRef.current.delete(id);

      // Trả entity về cho runUploadJob chèn thẳng vào danh sách
      return completeRes?.file || null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id],
  );

  /** Thực thi upload cho 1 job (phân nhánh: chunked nếu > 10MB, thường nếu nhỏ hơn) */
  const runUploadJob = useCallback(
    async (job) => {
      const { id, fileObj, parentId, targetProvider, sharedDriveId } = job;

      // Người dùng có thể đã bấm huỷ / tạm dừng trong lúc job còn nằm chờ tới lượt
      if (canceledJobIdsRef.current.has(id) || pausedJobIdsRef.current.has(id)) {
        activeCountRef.current -= 1;
        dispatchRunner();
        return;
      }

      const controller = new AbortController();
      abortControllersRef.current.set(id, controller);
      const { signal } = controller;

      updateJob(id, { status: 'uploading', percent: 0 });

      try {
        // ── Nếu file > 10MB → dùng GCS chunked resumable upload ──
        if (fileObj.size > CHUNK_THRESHOLD) {
          const uploadedEntity = await runChunkedUploadJob(job, signal);
          updateJob(id, { percent: 100, status: 'done' });
          setTimeout(() => removeJob(id), 5000);
          onUploadedFile(uploadedEntity);
          return;
        }

        // ── File nhỏ ≤ 10MB: flow cũ (presigned PUT hoặc proxy) ──
        let isUploaded = false;
        let uploadedEntity = null;

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

          // Ghi lại trước khi đẩy: bấm Huỷ giữa chừng thì đây là thứ duy nhất
          // cho biết phải xoá object nào trên cloud
          uploadSessionsRef.current.set(id, { storageKey, storageProvider });

          await storageApi.uploadDirectToCloud(
            uploadUrl,
            fileObj,
            (percent) => {
              updateJob(id, { percent, status: 'uploading' });
            },
            signal,
          );

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

          uploadedEntity = confirmRes?.file || null;
          isUploaded = true;
          uploadSessionsRef.current.delete(id); // đã có hàng trong DB, không còn là rác
        } catch (directErr) {
          // Huỷ KHÔNG phải là "direct upload hỏng" — rơi xuống proxy lúc này là
          // tải lại đúng tệp người dùng vừa bảo dừng.
          if (signal.aborted || canceledJobIdsRef.current.has(id)) throw directErr;
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
            signal,
          );

          // Backend có thể đổi tên nếu trùng
          const savedNameProxy = proxyRes?.file?.name || proxyRes?.name || fileObj.name;
          if (savedNameProxy !== fileObj.name) {
            updateJob(id, { fileName: savedNameProxy, renamedFrom: fileObj.name });
          }
          uploadedEntity = proxyRes?.file || null;

          // Lần PUT trực tiếp hỏng có thể đã để lại một object dở trên cloud mà
          // không hàng nào trong `files` trỏ tới. Proxy vừa tạo hàng mới rồi, nên
          // mẩu kia là rác — dọn ngay, đừng để tích lại theo từng lần lỗi mạng.
          const orphan = uploadSessionsRef.current.get(id);
          if (orphan?.storageKey) {
            uploadSessionsRef.current.delete(id);
            storageApi
              .abortUpload({ storageKey: orphan.storageKey, storageProvider: orphan.storageProvider })
              .catch((cleanupErr) => console.warn('Không dọn được tệp dở của lần tải trực tiếp:', cleanupErr));
          }
        }

        updateJob(id, { percent: 100, status: 'done' });
        // Tự xóa job done sau 5 giây
        setTimeout(() => removeJob(id), 5000);

        // Chỉ thêm đúng card của tệp vừa xong — KHÔNG tải lại cả thư mục
        onUploadedFile(uploadedEntity);
      } catch (err) {
        // Bị huỷ hoặc tạm dừng thì không phải lỗi: không hiện đỏ, không mời "Thử lại"
        const wasAborted =
          signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
        const wasPaused = pausedJobIdsRef.current.has(id) && wasAborted;
        const wasCanceled = !wasPaused && (canceledJobIdsRef.current.has(id) || wasAborted);

        if (wasPaused) {
          // Giữ nguyên % đang có: đó là thông tin "đã tải tới đâu" của người dùng
          updateJob(id, { status: 'paused', error: undefined });
        } else if (wasCanceled) {
          updateJob(id, { status: 'canceled', percent: 0, error: undefined });
        } else {
          console.error(`Lỗi upload "${fileObj.name}":`, err);
          updateJob(id, { percent: 0, status: 'error', error: err.message });
        }
      } finally {
        abortControllersRef.current.delete(id);
        // Giảm bộ đếm và dispatch runner để chạy job tiếp theo
        activeCountRef.current -= 1;
        dispatchRunner();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runChunkedUploadJob, onUploadedFile],
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
      const job = uploadQueueRef.current.find(
        (j) => j.id === jobId && (j.status === 'error' || j.status === 'canceled'),
      );
      if (!job) return;

      // Job vừa bị huỷ: gỡ cờ huỷ và huỷ timer dọn dòng, nếu không thì job chạy
      // lại được vài giây rồi biến mất khỏi bảng tiến trình
      canceledJobIdsRef.current.delete(jobId);
      const pendingCleanup = cancelCleanupTimersRef.current.get(jobId);
      if (pendingCleanup) {
        clearTimeout(pendingCleanup);
        cancelCleanupTimersRef.current.delete(jobId);
      }

      const retriedJob = { ...job, percent: 0, status: 'pending', error: undefined, renamedFrom: undefined };
      // Reset job trong UploadContext state
      resetJob(jobId, { percent: 0, status: 'pending', error: undefined, renamedFrom: undefined });
      uploadSessionsRef.current.delete(jobId);
      // Đưa lại vào pendingQueueRef để runner xử lý
      pendingQueueRef.current.push(retriedJob);
      // Dispatch runner (setTimeout để state flush trước)
      setTimeout(() => dispatchRunner(), 0);
    },
    [dispatchRunner, uploadQueueRef, resetJob],
  );

  /**
   * HUỶ một tệp đang tải lên.
   *
   * Ba việc, thiếu việc nào cũng là huỷ giả:
   *  1. Nhấc job khỏi hàng đợi (nếu còn đang chờ tới lượt).
   *  2. Cắt request đang chạy bằng AbortController — không có bước này thì dữ
   *     liệu vẫn chảy lên cloud sau khi màn hình đã ghi "Đã huỷ".
   *  3. Nhờ backend dọn phần đã đẩy lên: huỷ session resumable và xoá object
   *     chưa được `confirm-upload` ghi vào DB. Bỏ bước này thì mỗi lần huỷ để
   *     lại một mẩu rác không ai xoá được nữa nhưng vẫn tính tiền lưu trữ.
   */
  const cancelUploadJob = useCallback(
    async (jobId) => {
      const job = uploadQueueRef.current.find((j) => j.id === jobId);
      if (!job || job.status === 'done' || job.status === 'canceled') return;

      canceledJobIdsRef.current.add(jobId);
      pausedJobIdsRef.current.delete(jobId); // huỷ một tệp đang tạm dừng cũng là huỷ
      pendingQueueRef.current = pendingQueueRef.current.filter((j) => j.id !== jobId);

      abortControllersRef.current.get(jobId)?.abort();
      updateJob(jobId, { status: 'canceled', percent: 0, error: undefined });

      // Thông tin phiên: ưu tiên bản trong bộ nhớ, ngã về localStorage (job chunked
      // được khôi phục sau F5 thì chỉ còn bản này)
      const inMemory = uploadSessionsRef.current.get(jobId);
      const stored = inMemory ? null : loadChunkState(jobId);
      const session =
        inMemory ||
        (stored?.storageKey
          ? { storageKey: stored.storageKey, resumableUrl: stored.resumableUrl, storageProvider: 'google_cloud' }
          : null);

      uploadSessionsRef.current.delete(jobId);
      clearChunkState(jobId);

      if (session?.storageKey) {
        try {
          await storageApi.abortUpload({
            storageKey: session.storageKey,
            storageProvider: session.storageProvider,
            resumableUrl: session.resumableUrl,
          });
        } catch (err) {
          // Dọn rác hỏng không phải chuyện của người dùng — họ chỉ muốn dừng
          console.warn('Không dọn được phần đã tải lên trên cloud:', err);
        }
      }

      // Giữ dòng "Đã huỷ" một lát cho người dùng thấy việc đã xảy ra, rồi dẹp
      const timer = setTimeout(() => {
        cancelCleanupTimersRef.current.delete(jobId);
        canceledJobIdsRef.current.delete(jobId);
        removeJob(jobId);
      }, 4000);
      cancelCleanupTimersRef.current.set(jobId, timer);
    },
    [updateJob, removeJob, uploadQueueRef, loadChunkState, clearChunkState],
  );

  /**
   * TẠM DỪNG một tệp đang tải (chỉ có nghĩa với tệp > 10MB — luồng chunked).
   *
   * Cắt request đang chạy NHƯNG không đụng gì tới phiên trên GCS: phần đã đẩy
   * lên còn nguyên, `fileObj` vẫn nằm trong job, nên "Tiếp tục" là đẩy nốt phần
   * còn thiếu. Đây chính là khác biệt với "Huỷ" — huỷ thì xoá sạch và lần sau
   * phải tải lại từ đầu.
   */
  const pauseUploadJob = useCallback(
    (jobId) => {
      const job = uploadQueueRef.current.find((j) => j.id === jobId);
      if (!job || !['pending', 'uploading', 'confirming'].includes(job.status)) return;
      if (!(job.fileObj?.size > CHUNK_THRESHOLD)) return; // tệp nhỏ không có gì để quay lại

      pausedJobIdsRef.current.add(jobId);
      pendingQueueRef.current = pendingQueueRef.current.filter((j) => j.id !== jobId);
      abortControllersRef.current.get(jobId)?.abort();
      updateJob(jobId, { status: 'paused', error: undefined });
    },
    [updateJob, uploadQueueRef],
  );

  /** Tải tiếp một tệp đang tạm dừng — trong CÙNG phiên làm việc, không cần chọn lại tệp */
  const resumePausedJob = useCallback(
    (jobId) => {
      const job = uploadQueueRef.current.find((j) => j.id === jobId && j.status === 'paused');
      if (!job || !job.fileObj) return;

      pausedJobIdsRef.current.delete(jobId);
      resetJob(jobId, { status: 'pending', error: undefined });
      pendingQueueRef.current.push({ ...job, status: 'pending' });
      // setTimeout để state kịp flush trước khi runner đọc lại hàng đợi
      setTimeout(() => dispatchRunner(), 0);
    },
    [resetJob, dispatchRunner, uploadQueueRef],
  );

  /** Huỷ toàn bộ tệp chưa xong — dùng cho nút "Huỷ tất cả" ở bảng tiến trình */
  const cancelAllUploads = useCallback(async () => {
    const unfinished = uploadQueueRef.current.filter(
      (job) => job.status !== 'done' && job.status !== 'canceled',
    ); // 'paused' và 'error' cũng nằm trong đây: đều là việc còn dở
    await Promise.all(unfinished.map((job) => cancelUploadJob(job.id)));
  }, [cancelUploadJob, uploadQueueRef]);

  /**
   * TẢI TIẾP một phiên còn dở sau khi F5 / đóng tab.
   *
   * Người dùng buộc phải chọn lại đúng tệp: trình duyệt không cho giữ nội dung
   * tệp qua một lần tải lại trang, đó là giới hạn của nền tảng chứ không phải
   * lựa chọn thiết kế. Đổi lại, phần đã đẩy lên GCS vẫn còn nguyên nên chỉ tải
   * nốt phần thiếu.
   *
   * Kiểm tra tên + kích thước (+ ngày sửa nếu có) trước khi nối tiếp: ghép nhầm
   * tệp vào một phiên đang dở sẽ tạo ra một tệp hỏng mà không báo lỗi ở đâu cả.
   */
  const resumeUpload = useCallback(
    (session, file) => {
      if (!session?.jobId || !file) return { ok: false, reason: 'missing' };
      if (session.totalSizeBytes && file.size !== session.totalSizeBytes) {
        return { ok: false, reason: 'size' };
      }
      if (session.fileName && file.name !== session.fileName) {
        return { ok: false, reason: 'name' };
      }
      if (session.lastModified && file.lastModified && file.lastModified !== session.lastModified) {
        return { ok: false, reason: 'modified' };
      }

      const job = {
        id: session.jobId, // giữ nguyên id = giữ nguyên khoá localStorage của phiên
        fileName: file.name,
        fileObj: file,
        parentId: session.parentId || null,
        sharedDriveId: session.sharedDriveId || undefined,
        targetProvider: undefined,
        percent: session.percent || 0,
        status: 'pending',
        isResumed: true,
      };

      canceledJobIdsRef.current.delete(session.jobId);
      enqueueJob(job);
      pendingQueueRef.current.push(job);
      dispatchRunner();
      return { ok: true };
    },
    [enqueueJob, dispatchRunner],
  );

  /**
   * Bỏ hẳn một phiên dở: dọn phần đã đẩy lên cloud rồi xoá bản ghi cục bộ.
   *
   * Dọn cloud TRƯỚC rồi mới xoá bản ghi: `storageKey`/`resumableUrl` chỉ còn
   * nằm trong chính bản ghi đó, xoá xong là không còn gì để dọn nữa.
   *
   * Trả về `{ cloudCleaned }` để UI nói được sự thật khi bước dọn thất bại —
   * bản ghi cục bộ vẫn bị xoá (người dùng đã quyết định bỏ, không hỏi lại nữa),
   * còn phiên trên GCS thì tự hết hiệu lực sau 7 ngày.
   */
  const discardResumableSession = useCallback(async (session) => {
    if (!session?.jobId) return { cloudCleaned: true };

    let cloudCleaned = true;
    if (session.storageKey) {
      try {
        await storageApi.abortUpload({
          storageKey: session.storageKey,
          storageProvider: session.storageProvider || 'google_cloud',
          resumableUrl: session.resumableUrl,
        });
      } catch (err) {
        console.warn('Không dọn được phiên tải lên đã bỏ:', err);
        cloudCleaned = false;
      }
    }

    clearChunkState(session.jobId);
    return { cloudCleaned };
  }, [clearChunkState]);

  // Backward-compat alias — code cũ gọi uploadFile vẫn hoạt động

  const uploadFile = enqueueUpload;

  /**
   * Tải lên MỘT HOẶC NHIỀU thư mục/tệp, giữ nguyên cấu trúc thư mục con.
   *
   * Trước đây logic này được sao chép ở ba chỗ (NewButton, FileGridView,
   * FileListView) và mỗi chỗ đều kết thúc bằng `triggerReload()` — tức là tải
   * lại toàn bộ danh sách. Giờ nó nằm một chỗ, và chỉ chèn thêm card của những
   * thư mục gốc vừa tạo.
   *
   * @param {{entries: {file: File, relativePath: string}[], dirPaths: string[]}} tree
   *        Kết quả của `collectInputEntries` (input) hoặc `collectDropEntries`
   *        (kéo–thả, hỗ trợ nhiều thư mục cùng lúc) trong `utils/uploadTree`.
   */
  const uploadEntries = useCallback(
    async (tree, { parentId, sharedDriveId } = {}) => {
      const entries = tree?.entries || [];
      const dirPaths = tree?.dirPaths || [];
      if (entries.length === 0 && dirPaths.length === 0) {
        return { fileCount: 0, folderCount: 0 };
      }

      const view = viewRef.current;
      const targetParentId = parentId !== undefined ? parentId : view.currentFolderId;
      const effectiveSharedDriveId =
        sharedDriveId !== undefined
          ? sharedDriveId
          : view.activeTab === 'shared-drives'
            ? view.currentSharedDriveId
            : undefined;

      const sortedDirPaths = buildSortedDirPaths({ entries, dirPaths });

      let batchFolderIdMap = {};
      if (sortedDirPaths.length > 0) {
        try {
          batchFolderIdMap = await filesApi.createFoldersBatch(
            sortedDirPaths,
            targetParentId,
            effectiveSharedDriveId,
          );
        } catch (error) {
          console.error('Lỗi khi tạo hàng loạt thư mục:', error);
          toast.error('Không thể tạo toàn bộ cấu trúc thư mục, một số tệp có thể bị đặt sai vị trí.');
        }
      }

      // '' = thư mục đang mở
      const folderIdMap = { '': targetParentId ?? null, ...batchFolderIdMap };

      // Thư mục gốc (cấp 1) là thứ duy nhất người dùng thấy ngay → chèn card cho
      // chúng. `skipExisting` vì khi tải trùng tên, backend trả về id thư mục CŨ;
      // ghi đè bằng dữ liệu tự dựng ở client sẽ làm mất ngày tạo thật.
      const now = new Date().toISOString();
      const rootFolders = sortedDirPaths
        .filter((path) => !path.includes('/') && batchFolderIdMap[path])
        .map((path) => ({
          id: batchFolderIdMap[path],
          name: path,
          type: 'folder',
          parentId: targetParentId ?? null,
          sharedDriveId: effectiveSharedDriveId ?? null,
          sizeBytes: 0,
          isStarred: false,
          isTrash: false,
          isSpam: false,
          createdAt: now,
          updatedAt: now,
        }))
        .filter(belongsToCurrentView);

      if (rootFolders.length > 0) {
        upsertItems(rootFolders, { skipExisting: true });
      }

      entries.forEach(({ file, relativePath }) => {
        const parts = relativePath.split('/');
        const dirPath = parts.slice(0, -1).join('/');
        const targetId = folderIdMap[dirPath] ?? targetParentId;
        enqueueUpload(file, targetId, undefined, effectiveSharedDriveId);
      });

      // Cây thư mục sâu (folder con) chỉ hiện ra khi người dùng mở vào — lần đồng
      // bộ im lặng sau khi hàng đợi rỗng sẽ chỉnh lại mọi thứ cho khớp server.
      scheduleSilentSync();

      return { fileCount: entries.length, folderCount: sortedDirPaths.length };
    },
    [belongsToCurrentView, upsertItems, enqueueUpload, scheduleSilentSync],
  );

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
    /**
     * Nạp lại /files/analytics theo yêu cầu. Cần cho hai chỗ mà dung lượng đổi mà
     * KHÔNG đi qua thao tác file nào, nên không effect nào trong file này bắt được:
     *   • mua gói xong (hạn mức tăng — trang /billing/success),
     *   • bấm "Đồng bộ lại dung lượng" ở trang Gói dịch vụ.
     * Trước đây trang Gói dịch vụ phải window.location.reload() mới cập nhật được
     * thanh dung lượng ở Sidebar — Sidebar đọc chính `storageInfo` này.
     */
    refreshStorageInfo: fetchAnalytics,
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
    uploadEntries,
    retryUploadJob,
    cancelUploadJob,
    cancelAllUploads,
    pauseUploadJob,
    resumePausedJob,
    listResumableSessions,
    resumeUpload,
    discardResumableSession,
    uploadFileMock,
    renameItem,
    getDownloadUrl,
    getPreviewUrl,
    getFileTextContent,
    createShareLink,
    // uploadQueue CỐ TÌNH không nằm ở đây: nó đổi liên tục theo % tiến độ, mà
    // contextValue này được cả FileGridView/FileListView/SideBar… tiêu thụ —
    // để lại thì mỗi 2% tiến độ là một lần render toàn bộ màn hình danh sách.
    // Ai cần hàng đợi thì dùng `useUpload()` (UploadProgress đang làm đúng vậy).
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
    openFolder, toggleSidebar, setViewMode,
    // ── Tìm kiếm / lọc / sắp xếp ──
    searchQuery, filterType, filterDate, filterOwner, filterLocation,
    sortField, sortDirection, resetFilters, uniqueOwners,
    // ── Lưu trữ ──
    storageInfo, fetchAnalytics,
    // ── Hành động trên file/folder ──
    fetchFiles, toggleStar, moveToTrash, restoreFromTrash, deletePermanently,
    emptyTrash, createFolder, createFolderSilent, moveItem, copyItem, renameItem,
    getDownloadUrl, getPreviewUrl, getFileTextContent, createShareLink,
    // ── Upload ──
    uploadFile, enqueueUpload, uploadEntries, retryUploadJob, uploadFileMock,
    cancelUploadJob, cancelAllUploads, pauseUploadJob, resumePausedJob,
    listResumableSessions, resumeUpload, discardResumableSession,
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