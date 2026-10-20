import { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, matchPath } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  filesApi,
  storageApi,
  sharingApi,
  sharedDrivesApi,
  chunkedApi,
  isBackendUnreachable,
  subscribeFileMutations,
  UPLOAD_BATCH_SIZE,
} from '../services/api';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { useDebounce } from '../hooks/useDebounce';
import { useUploadActions } from './UploadContext';
import { formatBytes } from '../utils/formatFileSize';
import { buildSortedDirPaths, chunkDirPaths } from '../utils/uploadTree';
import { CHUNK_THRESHOLD, isResumableSize } from '../constants/upload';
import { localeTagOf } from '../utils/locale';
import { tOutsideReact } from '../utils/translate';
import { dateFilterStart } from '../constants/fileFilters';
import { readNamespace, writeManyCached, clearPersistentCache, cacheScope } from '../utils/persistentCache';
import { primeThumbnailsForUpload } from '../utils/thumbnailPrimer';
import { createPipelinedBatcher } from '../utils/uploadBatcher';
import { safeLocalStorage } from '../utils/safeStorage';

const FileContext = createContext();

/**
 * Lỗi từ backend mà đường proxy chắc chắn cũng trả y hệt: không có quyền, thư mục
 * cha không còn, hết dung lượng. Gặp chúng thì báo lỗi luôn, đừng đẩy lại cả tệp
 * qua dyno chỉ để nhận đúng câu trả lời đó lần thứ hai.
 */
const PROXY_WONT_HELP = new Set([403, 404, 413]);

/**
 * Xin URL trước cho tối đa ngần này tệp đang chờ, trong cùng một request.
 *
 * Không lấy hẳn `UPLOAD_BATCH_SIZE` (50): URL GCS sống 15 phút, và tệp thứ 50 chỉ
 * được PUT sau khi 49 tệp trước xong. Mạng rất chậm thì chữ ký có thể hết hạn trước
 * khi tới lượt — vẫn chạy được (PUT hỏng → lùi về proxy) nhưng phí một lượt. 30 tệp
 * với 10 làn song song là ba "đợt", đủ xa để không phải chờ URL, đủ gần để hiếm khi
 * chữ ký kịp hết hạn.
 */
const UPLOAD_URL_PREFETCH = 30;

/** Tệp đi đường presigned PUT một phát và được gộp lô. Tệp 0 byte bị DTO từ chối (`Min(1)`) nên đi lẻ. */
const isBatchableUpload = (job) =>
  Boolean(job?.fileObj) && job.fileObj.size > 0 && job.fileObj.size <= CHUNK_THRESHOLD;

const toUploadUrlPayload = (job) => ({
  name: job.fileObj.name,
  sizeBytes: job.fileObj.size,
  mimeType: job.fileObj.type || 'application/octet-stream',
  parentId: job.parentId || undefined,
  sharedDriveId: job.sharedDriveId || undefined,
  targetProvider: job.targetProvider,
});

/** Phần tử `ok: false` của một lô → Error mang `status` phẳng, giống lỗi của axios instance. */
const uploadItemError = (item) => {
  const err = new Error(item?.message || tOutsideReact('upload.itemFailed'));
  err.status = item?.status;
  return err;
};

/**
 * Ba context tách khỏi FileContext, cùng sống trong FileProvider.
 *
 * Lý do tách — `contextValue` của FileContext gói khoảng chín mươi khoá vào một
 * object. React so sánh context value bằng reference, nên chỉ cần MỘT khoá đổi
 * là mọi component gọi `useFiles()` phải render lại: bấm chọn một tệp làm
 * Sidebar, thanh dung lượng, nút "Mới", thanh bộ lọc và cả hàng đợi upload cùng
 * render theo, dù không cái nào trong số đó quan tâm tệp nào đang được chọn.
 * `memo()` trên FileCard cũng vô hiệu vì bản thân FileCard cũng đọc context.
 *
 * Ba mảnh dưới đây là ba mảnh đổi nhiều nhất và có ít người dùng nhất — đúng
 * tiêu chí để tách. State vẫn nằm nguyên trong FileProvider, chỉ có value là
 * chia thành nhiều đường dẫn để mỗi component đăng ký đúng thứ nó cần.
 */
const SelectionContext = createContext();
const ClipboardContext = createContext();
const PreviewContext = createContext();
// Vai trò của người dùng trong các Bộ nhớ chung — tách riêng để menu chuột phải không render lại
// theo từng thay đổi của danh sách tệp. Xem `driveAccessValue`.
const DriveAccessContext = createContext(null);

// ── Kiểu hiển thị (list / grid) ─────────────────────────────────────────────
// Khoá localStorage riêng cho preference này. Đọc/ghi bọc try/catch vì chế độ
// ẩn danh hoặc iframe có thể chặn storage — chặn thì phiên đó không nhớ chứ
// KHÔNG được làm sập cả app.
// Tiền tố khoá localStorage của các phiên chunked upload còn dở. Khoá đầy đủ:
// `driveR_chunk_<userId>_<jobId>`. Khai báo một chỗ vì cả getChunkStateKey(),
// clearChunkState() và listResumableSessions() đều phải dựng đúng cùng dạng khoá.
const CHUNK_STATE_PREFIX = 'driveR_chunk_';

/**
 * Trần số khung nhìn được giữ trong bộ nhớ đệm danh sách (xem `listCacheRef`).
 *
 * 60 chứ không phải 24: một khung nhìn là một bản ghi JSON cỡ vài chục KB, nên cả
 * trần này cũng chỉ vài MB — không đáng gì so với việc phải hỏi lại máy chủ ở Mỹ.
 * Con số cũ được đặt khi bộ đệm chỉ sống trong RAM của một phiên duyệt; nay nó
 * sống qua cả F5 nên "vài chục thư mục vừa mở" phải hiểu là vài chục thư mục của
 * cả buổi làm việc, không phải của mười phút vừa rồi.
 */
const LIST_CACHE_MAX = 60;

/**
 * Bao lâu thì một khung nhìn đã lưu bị coi là quá cũ để dùng lại.
 *
 * Cùng một con số 60 phút với `CONTENT_TTL_MS` trong `utils/ttlCache.js`, và cùng
 * một lập luận: thay đổi do CHÍNH người đang ngồi đó gây ra đã được cập nhật tại
 * chỗ vào `items` rồi (đánh dấu sao, đổi tên, xoá, dán, upload xong) — TTL này chỉ
 * là trần cho thay đổi đến từ người khác hoặc từ thiết bị khác.
 *
 * Nâng từ 15 lên 60 phút KHÔNG kéo dài độ trễ thấy thay đổi của người khác, và đây
 * là chỗ dễ đọc nhầm nhất trong tệp này: ngưỡng quyết định điều đó là
 * `LIST_REVALIDATE_AFTER_MS` (60 GIÂY) — quá ngưỡng ấy thì mọi lượt vào thư mục
 * đều có một lượt gọi nền cập nhật. TTL ở đây chỉ trả lời một câu khác: bản đã lưu
 * còn đáng VẼ RA trong lúc chờ lượt gọi đó không, hay phải dựng skeleton. Nên cái
 * đổi được là: quay lại một thư mục sau nửa tiếng thì thấy nội dung ngay rồi nó tự
 * đúng lại sau một nhịp, thay vì nhìn skeleton.
 */
const LIST_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Dưới ngưỡng này thì KHÔNG gọi mạng nữa, kể cả gọi nền.
 *
 * Đây là chỗ chữa đúng lời phàn nàn "mới có tí đã phải load lại": bấm qua lại
 * My Drive ↔ Có gắn sao ↔ một thư mục con, hay đóng/mở một modal, đều diễn ra
 * trong vài giây — và trước đây mỗi lượt như vậy vẫn là một request thật, kéo
 * theo thanh tiến trình ở đỉnh trang. Trong 60 giây đầu, bản đã lưu được coi là
 * ĐÚNG và app im lặng hoàn toàn.
 *
 * Quá 60 giây thì vẫn vẽ bản đã lưu ngay lập tức, nhưng có thêm một lượt gọi NỀN
 * để cập nhật — lượt gọi đó bị đánh dấu `background` nên không có skeleton và
 * cũng không có thanh tiến trình.
 */
const LIST_REVALIDATE_AFTER_MS = 60 * 1000;

/**
 * Namespace của bộ đệm danh sách trong kho bền (`utils/persistentCache.js`).
 *
 * Đổi tên khi HÌNH DẠNG item đổi: bản lưu cũ không có `updatedAtMs`/`createdAtMs`
 * (v2), mà vẽ nó ra trước lượt gọi mạng thì sắp theo ngày sẽ sai cho tới lúc server
 * trả lời. Namespace cũ tự hết hạn theo TTL, không cần dọn tay.
 */
const LIST_PERSIST_NS = 'file-list-v2';

/**
 * Gom nhiều lượt ghi thành một lượt xuống đĩa.
 *
 * Cần vì effect đồng bộ cache chạy theo MỌI thay đổi của `items` — chọn nhiều tệp
 * rồi đánh dấu sao là hàng chục lần ghi liên tiếp cho cùng một khung nhìn. Ghi
 * thẳng mỗi lần là mở hàng chục giao dịch IndexedDB cho một kết quả cuối cùng
 * duy nhất.
 */
const LIST_PERSIST_DEBOUNCE_MS = 800;

const VIEW_MODE_KEY = 'driver.viewMode';
const VIEW_MODES = ['list', 'grid'];
const DEFAULT_VIEW_MODE = 'list';

/**
 * Cột sắp xếp mà SERVER xếp được trước khi cắt trang (##83) — khớp `FILE_SORT_FIELDS` ở
 * `backend/src/files/file-filters.ts` (backend có thêm `createdAt`, giao diện không dùng).
 *
 * Trước đây chỉ trình duyệt sắp, trên đúng 50 mục của trang đang mở: thư mục 120 tệp chọn
 * "Kích thước (Lớn-Nhỏ)" không thấy tệp lớn nhất nếu nó nằm ở trang 2. `owner` vẫn chỉ sắp
 * trong trang (tên chủ được gắn sau truy vấn ở backend).
 */
const SERVER_SORT_FIELDS = new Set(['name', 'size', 'type', 'updatedAt']);

/**
 * Đang TÌM KIẾM thì Trang chủ là trang KẾT QUẢ trên mọi nơi (##90): Drive của tôi, Được chia sẻ với
 * tôi, Bộ nhớ chung (##83) — cả ba đều tìm cả cây con. Không hỏi 'recent' như lúc gợi ý: tệp đã mở
 * của mình vốn nằm trong hai nguồn kia, hỏi thêm chỉ là một request trùng.
 */
const HOME_SEARCH_SOURCE_TABS = ['my-drive', 'shared-with-me', 'shared-drives'];

/**
 * Mỗi nguồn của trang kết quả trả tối đa chừng này mục (trần backend 200). Còn nhiều hơn thì trang
 * nói rõ "đang hiện N/M kết quả đầu" (`totalItems`) thay vì lặng lẽ cắt như 6 ô/mục trước đây.
 */
const HOME_SEARCH_LIMIT = 100;

/**
 * Backend CŨ (trước ##83) bật `forbidNonWhitelisted` và chưa biết `sortBy`/`sortDir`: nó trả
 * 400 cho MỌI danh sách có hai tham số này. Frontend lên Vercel trước backend (Cloud Build lâu
 * hơn vài phút) là cả app trắng danh sách trong khoảng đó — nên nhận ra đúng lỗi này để gửi
 * lại không kèm sắp xếp, thay vì bắt người dùng chờ deploy.
 */
const isUnsupportedSortError = (err) =>
  err?.status === 400 &&
  Array.isArray(err?.details) &&
  err.details.some((d) => d?.field === 'sortBy' || d?.field === 'sortDir');

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
//
// `locale`: thẻ BCP-47 để định dạng ngày. Bản cũ ghi cứng 'vi-VN' nên ngày tháng
// vẫn ra kiểu Việt Nam khi giao diện đã sang English.
//
// `owner` để NULL cho tệp của chính mình (và cho tệp chia sẻ không rõ tên chủ):
// bản cũ nhồi sẵn chuỗi 'Tôi' vào đây, nên nhánh dự phòng `item.owner || t(...)`
// ở FileListView/HomePage/FileInfoDrawer không bao giờ chạy và cột "Chủ sở hữu"
// đứng nguyên tiếng Việt. Chuỗi hiển thị thuộc về nơi render, không thuộc dữ liệu.
const formatApiItem = (item, isSharedWithMe = false, locale = 'vi-VN') => {
  const base = {
    ...item,
    size: Number(item.sizeBytes || 0),
    createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : '',
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toLocaleString(locale) : '',
    // Mốc thời gian dạng số để SẮP XẾP. `createdAt`/`updatedAt` ở trên đã thành chuỗi
    // hiển thị ("17:00:00 20/9/2026"), và đem chuỗi đó so theo bảng chữ cái là xếp theo
    // GIỜ TRONG NGÀY: "Sửa đổi mới nhất" từng đưa tệp 20/9 lên trên tệp 26/9.
    createdAtMs: Date.parse(item.createdAt) || 0,
    updatedAtMs: Date.parse(item.updatedAt) || 0,
  };

  if (isSharedWithMe) {
    return {
      ...base,
      isSharedWithMe: true,
      owner: item.sharedOwner?.fullName || null,
      sharedOwner: item.sharedOwner || null,
      sharedRole: item.sharedRole || 'VIEWER',
      sharedAt: item.sharedAt
        ? new Date(item.sharedAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '',
    };
  }

  return {
    ...base,
    // Mục của thành viên KHÁC (Bộ nhớ chung, Thùng rác, Gắn sao): backend kèm `ownerName` (##79).
    // Trước đây luôn `null` nên cột "Chủ sở hữu" ghi "Tôi" cho mọi tệp trong drive.
    owner: item.ownerName || null,
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
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  // Thẻ locale cho `formatApiItem` — ngày tháng của item phải theo ngôn ngữ đang chọn
  const locale = localeTagOf(language);

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
    if (path.includes('/app/tags')) return 'tags';
    if (path.includes('/app/billing')) return 'billing';
    return 'my-drive';
  }, [location.pathname]);

  const folderMatch = matchPath('/app/:tab/folders/:folderId', location.pathname);
  const currentFolderId = folderMatch ? folderMatch.params.folderId : null;
  // Trang "Nhãn" (##91): mọi mục gắn một nhãn, ở bất cứ đâu — backend `tab=tagged`.
  const tagMatch = matchPath('/app/tags/:tagId', location.pathname);
  const currentTagId = tagMatch ? tagMatch.params.tagId : null;
  // Đang đứng trong thư mục NGƯỜI KHÁC chia sẻ: backend không nhận tải lên / tạo thư mục vào đó
  // (##78). Nút "Mới", menu chuột phải và phím tắt đọc cờ này để nói trước — trước đây người dùng
  // chọn tệp, tải lên xong mới nhận câu sai "Thư mục cha không tồn tại".
  const isInForeignFolder = activeTab === 'shared-with-me' && Boolean(currentFolderId);

  const [currentSharedDriveId, setCurrentSharedDriveId] = useState(null);

  useEffect(() => {
    if (activeTab !== 'shared-drives') {
      setCurrentSharedDriveId(null);
    }
  }, [activeTab]);

  // Vai trò của mình trong từng Bộ nhớ chung (driveId → 'ADMIN' | 'MEMBER' | 'VIEWER'), đọc từ
  // GET /shared-drives — đã có bộ đệm `sharedDrivesCache` (60 giây, xoá khi drive đổi) nên đổi tab
  // không tốn request. Trước ##79 giao diện không biết vai trò: VIEWER vẫn thấy Đổi tên / Cắt / Xoá /
  // Chia sẻ / Đổi màu / Tải lên, MEMBER thấy "Xoá vĩnh viễn" ở Thùng rác — bấm vào mới nhận 403.
  // Nạp ở MỌI tab chứ không riêng Bộ nhớ chung: mục drive còn hiện ở Thùng rác, Gắn sao, Gần đây.
  const [driveRoles, setDriveRoles] = useState(() => new Map());
  // Tên từng Bộ nhớ chung (driveId → tên), nạp cùng lượt với vai trò: dòng "trong <nơi chứa>" của
  // kết quả tìm kiếm cần tên drive cho mục nằm ở GỐC drive (##90).
  const [driveNames, setDriveNames] = useState(() => new Map());
  useEffect(() => {
    // Đổi tài khoản thì trang được tải lại (xem `pageOwnerRef` ở AuthContext) nên không cần xoá
    // bảng vai trò lúc đăng xuất.
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    sharedDrivesApi
      .getAll()
      .then((drives) => {
        if (cancelled || !Array.isArray(drives)) return;
        setDriveRoles(new Map(drives.map((d) => [d.id, d.userRole])));
        setDriveNames(new Map(drives.map((d) => [d.id, d.name])));
      })
      .catch(() => {
        /* không đọc được vai trò ⇒ giữ hành vi cũ (hiện đủ lệnh, backend vẫn là nơi chặn) */
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, activeTab, currentSharedDriveId]);

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

  // Từ khoá tìm kiếm. Khai báo TRƯỚC `openFolder` vì nó xoá từ khoá (React Compiler không
  // cho đọc biến khai báo phía sau). Các bộ lọc còn lại nằm ở mục "Search & Filters".
  const [searchQuery, setSearchQueryState] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 400); // B8: chỉ gọi API sau 400ms idle
  // Xoá từ khoá thì có hiệu lực NGAY, không chờ 400ms: mở một thư mục từ kết quả tìm kiếm
  // (`openFolder` xoá từ khoá) mà còn chờ thì thư mục mới bị tải một lượt với từ khoá cũ —
  // một request thừa và một nhịp hiện danh sách đã lọc trước khi hiện đủ.
  const debouncedSearch = searchQuery.trim() === '' ? '' : debouncedQuery;

  const openFolder = useCallback((folder) => {
    setCurrentPage(1);
    // Mở một thư mục là ĐI TỚI nó, không phải lọc tiếp trong nó: từ khoá còn đọng lại thì
    // thư mục vừa mở chỉ hiện những mục khớp từ khoá (tìm kiếm nay đi cả cây con — ##77),
    // trông như thư mục bị thiếu tệp. Google Drive cũng xoá ô tìm kiếm khi mở một kết quả.
    setSearchQueryState('');
    if (!folder || !folder.id) {
      navigate(`/app/${activeTab}`);
      return;
    }
    if (folder.sharedDriveId) {
      setCurrentSharedDriveId(folder.sharedDriveId);
      navigate(`/app/shared-drives/folders/${folder.id}`);
    } else if (activeTab === 'shared-with-me' || folder.isSharedWithMe) {
      // `isSharedWithMe`: thư mục của NGƯỜI KHÁC mở từ Trang chủ (mục "Được chia sẻ với tôi",
      // "Đã mở gần đây", kết quả tìm kiếm). Đi đường Drive của tôi thì backend lọc
      // `owner_id = tôi` nên thư mục hiện ra RỖNG (##77).
      navigate(`/app/shared-with-me/folders/${folder.id}`);
    } else {
      navigate(`/app/my-drive/folders/${folder.id}`);
    }
  }, [navigate, activeTab]);

  /**
   * Mở NƠI CHỨA một mục — dòng "trong 📁 …" của kết quả tìm kiếm (##90): thư mục cha nếu người
   * xem được thấy nó (backend chỉ gửi `parentName` khi đó), không thì gốc của vùng chứa mục (gốc
   * Drive của tôi, gốc Bộ nhớ chung của nó, "Được chia sẻ với tôi"). Xoá từ khoá như `openFolder`.
   */
  const openItemLocation = useCallback((item) => {
    if (!item) return;
    if (item.parentId && item.parentName) {
      openFolder({ id: item.parentId, sharedDriveId: item.sharedDriveId, isSharedWithMe: item.isSharedWithMe });
      return;
    }
    setCurrentPage(1);
    setSearchQueryState('');
    if (item.sharedDriveId) {
      setCurrentSharedDriveId(item.sharedDriveId);
      navigate('/app/shared-drives');
    } else if (item.isSharedWithMe) {
      navigate('/app/shared-with-me');
    } else {
      navigate('/app/my-drive');
    }
  }, [navigate, openFolder]);

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
  // Đang tải NHƯNG vẫn còn nội dung hợp lệ để hiển thị — xem `scopeKey`.
  // Các view làm mờ danh sách thay vì thay nó bằng skeleton.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Chặng gốc mang `nameKey` (khoá dịch) thay vì `name` đã chốt chuỗi: giá trị này
  // nằm trong useState nên chỉ chạy MỘT lần lúc mount, chuỗi cứng ở đây sẽ đứng
  // nguyên tiếng Việt suốt phiên. Nơi render dịch `nameKey` nếu có.
  const [breadcrumb, setBreadcrumb] = useState([
    { id: null, nameKey: 'file.breadcrumb.myDrive' },
  ]);

  // Search & Filters — state từ khoá khai báo ở trên, trước `openFolder` (nó xoá từ khoá).
  const [filterType, setFilterTypeState] = useState('all');
  const [filterDate, setFilterDateState] = useState('all');
  const [filterOwner, setFilterOwnerState] = useState('all');

  // Đổi câu hỏi (từ khoá, bộ lọc) là quay về trang 1. Trước đây số trang giữ nguyên:
  // đang ở trang 2 mà lọc ra ít hơn 50 mục thì màn hình hiện một trang trống.
  const setSearchQuery = useCallback((value) => {
    setSearchQueryState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);
  const setFilterType = useCallback((value) => {
    setFilterTypeState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);
  const setFilterDate = useCallback((value) => {
    setFilterDateState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);
  const setFilterOwner = useCallback((value) => {
    setFilterOwnerState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);

  /**
   * "Người sở hữu" chỉ có nghĩa ở Bộ nhớ dùng chung — nơi duy nhất một danh sách có
   * mục của người khác mà backend lọc được theo chủ. Ở cloudSSS của tôi, Gắn sao,
   * Thùng rác… mọi mục đều của bạn nên "người khác" luôn ra rỗng; ở "Được chia sẻ với
   * tôi" backend bỏ qua nó. Ngoài Bộ nhớ dùng chung thì coi như không lọc — kể cả khi
   * lựa chọn còn đọng lại từ lần trước — để không có bộ lọc vô hình nào làm rỗng trang.
   */
  const ownerFilterApplies = activeTab === 'shared-drives';
  const effectiveFilterOwner = ownerFilterApplies ? filterOwner : 'all';

  // Sorting
  const [sortField, setSortFieldState] = useState('name'); // 'name' | 'size' | 'type' | 'owner' | 'group' | 'updatedAt' | 'createdAt'
  const [sortDirection, setSortDirectionState] = useState('asc'); // 'asc' | 'desc'
  // Đổi cách sắp là quay về trang 1 — từ ##83 server sắp TRƯỚC khi cắt trang, nên "trang 3"
  // của thứ tự cũ không còn là trang 3 của thứ tự mới. Nhận cả hàm cập nhật như setState.
  const setSortField = useCallback((value) => {
    setSortFieldState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);
  const setSortDirection = useCallback((value) => {
    setSortDirectionState(value);
    setCurrentPage(1);
  }, [setCurrentPage]);

  // Server có xếp cột đang chọn không — xem `SERVER_SORT_FIELDS`. "Gần đây" luôn giữ thứ tự
  // lượt mở do server trả. Chuỗi (không phải object) để làm dependency/khoá bộ đệm được.
  const serverSortKey =
    activeTab !== 'recent' && SERVER_SORT_FIELDS.has(sortField) ? `${sortField}:${sortDirection}` : '';
  // `false` sau khi backend trả 400 vì chưa biết `sortBy` — xem `isUnsupportedSortError`.
  // Ref chứ không state: chỉ cần đúng cho các lượt gọi SAU, không cần vẽ lại gì.
  const serverSortSupportedRef = useRef(true);

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
    currentTagId,
    search: debouncedSearch,
    filterType,
    filterDate,
    filterOwner: effectiveFilterOwner,
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

        const formatted = formatApiItem(item, viewRef.current?.activeTab === 'shared-with-me', locale);
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
  }, [locale]);

  /**
   * Item vừa tạo có thuộc đúng màn hình người dùng đang xem không.
   * Nếu không (đang ở tab khác, đã đi sang thư mục khác, hoặc đang bật tìm
   * kiếm/lọc — lúc đó tập kết quả do server quyết định) thì không chèn gì cả:
   * lần đồng bộ im lặng ở cuối hàng đợi sẽ lo phần còn lại.
   */
  const belongsToCurrentView = useCallback((entity) => {
    const view = viewRef.current;
    if (!view || !entity) return false;
    const isTagView = view.activeTab === 'tags';
    if (!isTagView && !['my-drive', 'home', 'shared-drives'].includes(view.activeTab)) return false;

    // Tệp bị Spam Guard gắn cờ lúc upload KHÔNG thuộc về mấy tab này — cả ba đều lọc
    // `is_spam = false` phía server. Thiếu chốt này thì card của nó vẫn được chèn vào
    // My Drive, người dùng thấy tệp nằm đó khoảng 1,5 giây rồi lượt đồng bộ im lặng
    // cuối hàng đợi xoá mất, không kèm một lời giải thích nào. `onUploadedFile` là
    // nơi báo cho họ biết tệp đã bị chuyển vào Nội dung rác.
    if (entity.isSpam || entity.isTrash) return false;

    if (view.search) return false;
    if (view.filterType !== 'all' || view.filterDate !== 'all' || view.filterOwner !== 'all') return false;

    // Trang "Nhãn" (##92): mục mang đúng nhãn đang xem, ở bất cứ thư mục nào.
    if (isTagView) return Boolean(view.currentTagId) && (entity.tags ?? []).some((tag) => tag.id === view.currentTagId);

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

  // ── Bộ nhớ đệm danh sách theo từng "khung nhìn" ───────────────────────────
  //
  // Vấn đề được sửa: trước đây mọi lần đổi tab / mở thư mục / đổi bộ lọc đều đi
  // đúng một đường — xoá sạch màn hình, dựng skeleton, chờ mạng. Máy chủ đặt ở
  // Mỹ còn người dùng ở Việt Nam nên mỗi lượt khứ hồi tốn ~265ms kể cả khi
  // backend trả lời tức thì; bấm qua lại My Drive ↔ Có gắn sao là tải lại đúng
  // thứ vừa tải xong vài giây trước. Cảm giác thu được là "app tự reload".
  //
  // Nay theo lối stale-while-revalidate: quay lại một khung nhìn đã xem thì vẽ
  // ngay bản đã lưu (0ms, không skeleton) rồi vẫn gọi server ở chế độ nền để
  // cập nhật. Người dùng thấy nội dung tức thì; thanh tiến trình mảnh ở đỉnh
  // trang (GlobalProgressBar) là thứ duy nhất báo còn đang đồng bộ.
  //
  // Cache nằm trong ref chứ không phải state: ghi vào nó KHÔNG được kéo theo
  // một lần render nào. Và nằm trong provider chứ không phải module-level, để
  // đăng xuất là mất theo — dữ liệu file của người này không được sống sót sang
  // phiên của người khác trên cùng trình duyệt.
  const listCacheRef = useRef(new Map());

  /**
   * Khung nhìn mà `items` / `breadcrumb` / `totalItems` hiện tại đang MÔ TẢ.
   *
   * Không được suy ra từ `cacheKey`: giữa lúc bấm sang tab khác và lúc dữ liệu
   * tab đó về, `cacheKey` đã là tab mới trong khi `items` vẫn là của tab cũ.
   * Thiếu ref này thì effect đồng bộ bên dưới sẽ ghi danh sách tab cũ vào ô
   * cache của tab mới — lần sau mở tab mới ra sẽ thấy nội dung của tab cũ.
   */
  const itemsKeyRef = useRef(null);

  /**
   * Những khung nhìn đã đổi mà chưa kịp ghi xuống đĩa, cùng cái hẹn giờ xả chúng.
   * Xem `LIST_PERSIST_DEBOUNCE_MS`.
   */
  const dirtyListKeysRef = useRef(new Set());
  const persistTimerRef = useRef(null);

  /**
   * Đã nạp xong bộ đệm từ đĩa hay chưa.
   *
   * Là STATE chứ không phải ref vì `fetchFiles` phải đợi nó: nếu lượt tải đầu tiên
   * chạy trước khi đĩa được đọc lên thì mỗi lần F5 vẫn dựng skeleton rồi mới nhận
   * ra "à, có cache" — tức là mất trắng phần lợi ích chính của việc lưu bền. Đưa nó
   * vào dependency của `fetchFiles` khiến effect tải dữ liệu tự chạy lại đúng một
   * lần khi đĩa đã sẵn sàng.
   */
  const [isListCacheHydrated, setIsListCacheHydrated] = useState(false);

  /** Ghi những khung nhìn đang bẩn xuống đĩa trong MỘT giao dịch. */
  const flushListCache = useCallback(() => {
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;

    const dirty = dirtyListKeysRef.current;
    if (!dirty.size) return;

    const rows = [];
    const owner = cacheScope();
    for (const key of dirty) {
      const hit = listCacheRef.current.get(key);
      // Có thể đã bị LRU đẩy ra trong lúc chờ — không có gì để ghi thì thôi. Bản của tài khoản
      // KHÁC tài khoản đang giữ token thì không ghi: `writeManyCached` xếp nó vào ngăn của
      // người đang đăng nhập (##89).
      if (hit && hit.owner === owner) rows.push({ key, value: hit, expiresAt: hit.cachedAt + LIST_CACHE_TTL_MS });
    }
    dirty.clear();
    void writeManyCached(LIST_PERSIST_NS, rows);
  }, []);

  const readListCache = useCallback((key) => {
    const cache = listCacheRef.current;
    const hit = cache.get(key);
    if (!hit) return null;
    // Khoá khung nhìn không mang id tài khoản, nên mỗi bản ghi tự mang chủ của nó (##89). Trang
    // mở bằng token của A rồi mới thành B (quay về từ Google/GitHub sau "Thêm tài khoản") đã kịp
    // nạp bộ đệm của A từ đĩa — không có chốt này thì lần vẽ đầu của B là danh sách tệp của A.
    if (hit.owner !== cacheScope()) {
      cache.delete(key);
      return null;
    }
    // Quá hạn thì coi như chưa từng có: người dùng sẽ thấy skeleton một lần, đúng
    // như trước khi có bộ đệm. Xoá luôn để nó không nằm chiếm chỗ trong trần LRU.
    if (Date.now() - hit.cachedAt > LIST_CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    // Chạm vào thì đẩy xuống cuối Map — Map giữ thứ tự chèn nên đây là LRU đủ dùng
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }, []);

  /**
   * @param {object} snapshot  `{ items, breadcrumb, totalItems, totalPages }`
   * @param {boolean} [opts.fromServer]  Lượt ghi này có phải dữ liệu VỪA lấy từ
   *   máy chủ không. Chỉ khi đó mốc `cachedAt` mới được làm mới.
   *
   *   Phân biệt này là cần thiết: phần lớn lượt ghi vào đây đến từ effect đồng bộ
   *   bên dưới, tức từ những sửa đổi TẠI CHỖ trên `items`. Nếu chúng cũng làm mới
   *   mốc thời gian thì một khung nhìn được người dùng thao tác liên tục sẽ không
   *   bao giờ đến hạn — và app sẽ không bao giờ biết người khác vừa thêm gì vào
   *   thư mục đó.
   */
  const writeListCache = useCallback((key, snapshot, { fromServer = false } = {}) => {
    const cache = listCacheRef.current;
    const previous = cache.get(key);
    const cachedAt = fromServer ? Date.now() : previous?.cachedAt ?? Date.now();

    cache.delete(key);
    cache.set(key, { ...snapshot, cachedAt, owner: cacheScope() });
    // Giữ trần để một phiên duyệt nhiều thư mục không phình bộ nhớ vô hạn
    while (cache.size > LIST_CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }

    dirtyListKeysRef.current.add(key);
    if (!persistTimerRef.current) {
      persistTimerRef.current = setTimeout(flushListCache, LIST_PERSIST_DEBOUNCE_MS);
    }
  }, [flushListCache]);

  /**
   * Đánh dấu HẾT HẠN những khung nhìn đã lưu mà `matches(key, view)` chọn (`view` = khoá đã parse).
   *
   * Vì sao cần: `readListCache` + ngưỡng `LIST_REVALIDATE_AFTER_MS` khiến
   * `fetchFiles()` KHÔNG gọi server trong 60 giây đầu sau lượt tải thật. Phần lớn
   * thao tác không vướng vào đó vì chúng sửa `items` tại chỗ (đổi tên, gắn sao,
   * xoá) — nhưng di chuyển / sao chép thì không: chúng đổi nội dung của thư mục
   * NGUỒN và thư mục ĐÍCH ở phía server rồi trông cậy hoàn toàn vào `fetchFiles()`
   * để vẽ lại. Gặp đúng ô cache còn tươi thì lượt gọi ấy thoát sớm, và người dùng
   * thấy dán xong mà màn hình không đổi gì.
   *
   * Đẩy lùi `cachedAt` thay vì xoá hẳn ô cache: xoá sẽ dựng lại skeleton cho một
   * màn hình vốn đang có nội dung gần đúng. Lùi đúng bằng ngưỡng revalidate thì
   * bản đã lưu vẫn được vẽ ngay, nhưng lượt gọi nền LUÔN chạy để sửa lại.
   */
  const staleListViewsWhere = useCallback((matches) => {
    const cache = listCacheRef.current;
    const staleAt = Date.now() - LIST_REVALIDATE_AFTER_MS;

    for (const [key, value] of cache) {
      let view;
      try {
        view = JSON.parse(key);
      } catch {
        continue; // Khoá lạ (bản cache của phiên bản cũ) — bỏ qua, TTL sẽ dọn
      }
      if (!matches(key, view)) continue;
      if (value.cachedAt <= staleAt) continue; // Đã quá hạn sẵn

      cache.set(key, { ...value, cachedAt: staleAt });
      // Ghi xuống đĩa nữa, nếu không thì F5 sẽ nạp lại đúng bản vừa bị làm cũ.
      dirtyListKeysRef.current.add(key);
    }

    if (dirtyListKeysRef.current.size > 0 && !persistTimerRef.current) {
      persistTimerRef.current = setTimeout(flushListCache, LIST_PERSIST_DEBOUNCE_MS);
    }
  }, [flushListCache]);

  /** Làm cũ mọi khung nhìn của các thư mục `folderIds` (`null` = gốc). */
  const staleListViewsForFolders = useCallback((folderIds) => {
    const affected = new Set(folderIds.map((id) => id ?? null));
    if (affected.size === 0) return;
    staleListViewsWhere((_key, view) => affected.has(view.folderId ?? null));
  }, [staleListViewsWhere]);

  // Một thao tác ghi lên tệp vừa xong ở BẤT CỨ đâu (##92): màn hình đang xem đã tự sửa tại chỗ,
  // còn bản lưu của mọi màn hình khác có thể đã sai — bỏ tệp vào thùng rác ở cloudSSS của tôi thì
  // trang Nhãn vẫn còn nó, khôi phục ở Thùng rác thì cloudSSS của tôi vẫn thiếu nó. Làm cũ để lần
  // mở tới vẫn vẽ ngay bản đã lưu nhưng luôn hỏi lại máy chủ.
  useEffect(
    () => subscribeFileMutations(() => staleListViewsWhere((key) => key !== itemsKeyRef.current)),
    [staleListViewsWhere],
  );

  /**
   * Nạp bộ đệm từ đĩa, một lần cho mỗi lần mở trang.
   *
   * Chỉ đọc, không lọc gì thêm: `readNamespace` đã bỏ qua bản hết hạn và đã giới
   * hạn theo id người dùng đang giữ token. Cắt bớt cho vừa trần LRU bằng cách giữ
   * những bản MỚI nhất — hai phiên trước để lại nhiều hơn trần thì bản cũ nhất là
   * bản đáng bỏ nhất.
   */
  useEffect(() => {
    let cancelled = false;

    // Chặn cứng thời gian chờ. `fetchFiles` bị KHOÁ cho tới khi cờ này bật, nên
    // một lần đọc đĩa treo (IndexedDB có thể im lặng không phát sự kiện nào trong
    // vài trường hợp hiếm: hồ sơ trình duyệt hỏng, tab bị đóng băng) sẽ không chỉ
    // làm mất bộ đệm mà làm mất LUÔN danh sách tệp. Quá 1,5 giây thì chạy tiếp mà
    // không có bộ đệm — chậm hơn, nhưng app vẫn dùng được.
    const withDeadline = Promise.race([
      readNamespace(LIST_PERSIST_NS).catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);

    withDeadline.then((rows) => {
      if (cancelled) return;
      const cache = listCacheRef.current;
      rows
        .filter((row) => row.value?.items && Number.isFinite(row.value.cachedAt))
        .sort((a, b) => a.value.cachedAt - b.value.cachedAt)
        .slice(-LIST_CACHE_MAX)
        .forEach((row) => {
          // Không đè lên thứ đã có trong RAM: nếu lượt tải đầu tiên đã kịp về thì
          // bản trên đĩa là bản CŨ HƠN.
          // Chủ của bản ghi là ngăn `readNamespace` đã đọc (`row.scope`) — KHÔNG phải token lúc
          // này: lượt đổi mã OAuth có thể đã xong trong lúc chờ đĩa, và bản của A sẽ bị dán nhãn B.
          if (!cache.has(row.key)) cache.set(row.key, { ...row.value, owner: row.scope });
        });
      setIsListCacheHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Xả nốt phần còn nợ khi tab bị ẩn hoặc bị đóng.
   *
   * `visibilitychange` chứ không phải `beforeunload`: trên di động, tab bị hệ điều
   * hành thu hồi thường KHÔNG có `beforeunload` nào cả. Đây cũng đúng là thời điểm
   * cần ghi — người dùng vừa rời đi, và cái họ sẽ gặp khi quay lại chính là thứ
   * đang nằm trong hàng đợi này.
   */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushListCache();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushListCache);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushListCache);
      flushListCache();
    };
  }, [flushListCache]);

  /**
   * Danh tính của khung nhìn hiện tại. Mọi tham số ĐỔI KẾT QUẢ của GET /files
   * đều phải có mặt, nếu không hai khung nhìn khác nhau sẽ dùng chung một ô.
   *
   * `locale` cũng nằm trong khoá: `formatApiItem` đã nướng chuỗi ngày tháng theo
   * ngôn ngữ vào từng item, nên bản lưu của tiếng Việt không dùng lại được cho
   * tiếng Anh — đổi ngôn ngữ phải là một lần tải mới.
   */
  const cacheKey = useMemo(
    () =>
      JSON.stringify({
        tab: activeTab,
        folderId: currentFolderId || null,
        driveId: activeTab === 'shared-drives' ? currentSharedDriveId || null : null,
        tagId: activeTab === 'tags' ? currentTagId : null,
        search: debouncedSearch || '',
        filterType,
        filterDate,
        filterOwner: effectiveFilterOwner,
        // Server cắt trang THEO cột sắp xếp (##83): cùng thư mục, sắp khác là trang khác.
        sort: serverSortKey,
        page: currentPage,
        limit: pageSize,
        locale,
      }),
    [
      activeTab, currentFolderId, currentSharedDriveId, currentTagId, debouncedSearch,
      filterType, filterDate, effectiveFilterOwner, serverSortKey, currentPage, pageSize, locale,
    ],
  );

  /**
   * "Đang đứng ở đâu" — tab và thư mục — tách khỏi "đang hỏi gì" (tìm kiếm, bộ
   * lọc, số trang).
   *
   * Phân biệt này quyết định lúc nào được phép giữ danh sách cũ trên màn hình:
   *  • Đổi CHỖ ĐỨNG (My Drive → Thùng rác) mà vẫn để danh sách cũ nằm đó là nói
   *    dối — người dùng đang nhìn nội dung của một nơi họ đã rời đi. Chỗ này
   *    phải dựng skeleton.
   *  • Đổi CÂU HỎI trong cùng một chỗ (gõ tìm kiếm, chọn "chỉ ảnh", sang trang
   *    2) thì danh sách cũ vẫn là nội dung của đúng nơi này, chỉ chưa lọc lại.
   *    Xoá nó đi để dựng skeleton là làm màn hình nhấp nháy sau mỗi 400ms gõ
   *    phím. Chỗ này chỉ làm mờ và chờ.
   */
  const scopeKey = useMemo(
    () =>
      JSON.stringify({
        tab: activeTab,
        folderId: currentFolderId || null,
        driveId: activeTab === 'shared-drives' ? currentSharedDriveId || null : null,
        tagId: activeTab === 'tags' ? currentTagId : null,
        locale,
      }),
    [activeTab, currentFolderId, currentSharedDriveId, currentTagId, locale],
  );

  /** Chỗ đứng mà `items` hiện tại thuộc về (xem `scopeKey`). */
  const itemsScopeRef = useRef(null);

  // Storage Analytics State
  const [analytics, setAnalytics] = useState(null);

  // Preview modal state
  const [previewItem, setPreviewItem] = useState(null);
  // Danh sách tệp ĐANG HIỂN THỊ (đúng thứ tự sắp xếp) lúc mở xem trước — để nút ‹ › và
  // phím ←/→ trong cửa sổ xem trước đi sang tệp kế bên, như Google Drive. Chỉ tệp, bỏ thư
  // mục. Không truyền thì không có nút chuyển (vd. mở từ ngăn thông tin).
  const [previewList, setPreviewList] = useState(null);
  // Cột mở sẵn khi vào xem trước — 'comments' khi đi từ thông báo nhận xét (##91), còn lại null.
  const [previewPanel, setPreviewPanel] = useState(null);

  const openPreview = useCallback((item, list, options) => {
    if (item && !item.isFolder && item.type !== 'folder') {
      setPreviewItem(item);
      setPreviewList(
        Array.isArray(list) ? list.filter((f) => f && !f.isFolder && f.type !== 'folder') : null,
      );
      setPreviewPanel(options?.panel === 'comments' ? 'comments' : null);
    }
  }, []);

  /** Chuyển sang tệp khác TRONG cùng danh sách — giữ nguyên `previewList`. */
  const showPreviewItem = useCallback((item) => {
    if (item && !item.isFolder && item.type !== 'folder') setPreviewItem(item);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewItem(null);
    setPreviewList(null);
    setPreviewPanel(null);
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
    trackJobBytes,
    enqueueJob,
    resetJob,
  } = useUploadActions();

  const activeCountRef = useRef(0);   // số job đang chạy thực sự
  const pendingQueueRef = useRef([]); // mirror của uploadQueue để runner đọc không bị stale

  /**
   * Số tệp được PUT cùng lúc (CHUNK_THRESHOLD nằm ở constants/upload.js vì bảng tiến
   * trình cũng cần biết tệp nào tạm dừng được).
   *
   * Trước là 2, và với ảnh vài trăm KB thì 2 làn không bao giờ lấp nổi đường truyền:
   * phần lớn thời gian của mỗi tệp là CHỜ backend (xin URL, xác nhận), không phải đẩy
   * byte. Nay hai bước chờ đó đã đi theo lô và không còn giữ làn (xem `runUploadJob`),
   * nên 10 làn là 10 PUT thật sự chạy song song. PUT đi thẳng lên GCS qua HTTP/2, không
   * dính trần 6 kết nối mỗi host của HTTP/1.1.
   */
  const CONCURRENCY = 10;

  /**
   * Số tệp đã PUT xong, đã NHẢ làn, đang chờ lô xác nhận. Lượt đồng bộ cuối hàng đợi
   * phải đợi cả chúng — nếu không nó chạy lúc hàng `files` còn chưa được ghi.
   */
  const confirmingCountRef = useRef(0);

  /** jobId → Promise URL đã xin trước theo lô (xem `getUploadTarget`). */
  const uploadTargetsRef = useRef(new Map());

  /** Gộp nhiều lần gọi `enqueueUpload` trong cùng một tick thành MỘT lượt khởi chạy. */
  const dispatchScheduledRef = useRef(false);

  /**
   * Bộ gom lô cho bước xác nhận. Tạo một lần cho cả vòng đời provider: nó chỉ dùng
   * `storageApi`, không đọc state nào của React.
   */
  const [confirmBatcher] = useState(() =>
    createPipelinedBatcher({
      maxBatchSize: UPLOAD_BATCH_SIZE,
      run: async (payloads) => {
        const res = await storageApi.confirmUploadsBatch(payloads);
        if (!res) {
          // Backend chưa có đường lô: xác nhận lẻ từng tệp, như trước.
          return Promise.all(
            payloads.map((payload) =>
              storageApi
                .confirmUpload(payload)
                .catch((err) => (err instanceof Error ? err : new Error(String(err)))),
            ),
          );
        }
        return payloads.map((_, i) => {
          const item = res.items?.[i];
          return item?.ok ? { file: item.file } : uploadItemError(item);
        });
      },
    }),
  );

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
    const junkKeys = [];

    try {
      // Chụp danh sách khoá TRƯỚC, xoá SAU. localStorage.key(i) đánh theo chỉ số:
      // removeItem() giữa vòng lặp dồn mọi mục phía sau lên một bậc, rồi `i++`
      // nhảy qua đúng mục vừa dồn vào chỗ `i`. Tức là mỗi bản ghi rác bị dọn giữa
      // chừng lại làm MỘT phiên còn tốt biến mất khỏi bảng "tải tiếp" — thứ khó
      // thấy nhất vì phiên đó vẫn nằm nguyên trong localStorage.
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }

      for (const key of keys) {
        let data;
        try {
          data = JSON.parse(localStorage.getItem(key));
        } catch {
          junkKeys.push(key); // bản ghi hỏng
          continue;
        }

        if (!data || data.userId !== user?.id) continue;

        // Không có kích thước thì không kiểm được tệp người dùng chọn lại có đúng
        // tệp cũ không (resumeUpload chỉ so sánh khi `totalSizeBytes` tồn tại) —
        // nối bừa vào phiên dở sẽ tạo ra tệp hỏng mà không báo lỗi ở đâu cả. Và
        // dưới ngưỡng chunked thì vốn chẳng có phiên nào trên GCS để quay lại.
        // Cả hai trường hợp đều là rác: bỏ hẳn thay vì mời tải tiếp.
        if (!isResumableSize(data.totalSizeBytes)) {
          junkKeys.push(key);
          continue;
        }

        const jobId = key.slice(prefix.length);
        if (activeJobIds.has(jobId)) continue;

        const ageMs = Date.now() - (data.savedAt || 0);
        if (ageMs > RESUMABLE_SESSION_TTL_MS) {
          junkKeys.push(key);
          continue;
        }

        const uploadedBytes = readUploadedBytes(data);
        sessions.push({
          ...data,
          jobId,
          uploadedBytes,
          percent: Math.min(100, Math.round((uploadedBytes / data.totalSizeBytes) * 100)),
        });
      }

      junkKeys.forEach((key) => localStorage.removeItem(key));
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

  const VALID_FILE_TABS = ['my-drive', 'starred', 'trash', 'spam', 'recent', 'shared-with-me', 'shared-drives', 'tags'];

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
    // Chưa đọc xong bộ đệm trên đĩa thì chưa biết có phải gọi mạng hay không —
    // xem `isListCacheHydrated`.
    if (!isListCacheHydrated) return;

    // Dùng chung bộ đếm request với fetchFiles để response cũ không ghi đè response mới
    const requestId = ++fetchRequestIdRef.current;

    // Đã xem Trang chủ rồi thì vẽ lại bản cũ ngay và đi thẳng xuống lượt gọi nền:
    // Trang chủ tốn tới BA request song song, để nó dựng skeleton mỗi lần quay về
    // là chỗ nhức mắt nhất trong toàn app.
    const key = cacheKey;
    const cached = silent ? null : readListCache(key);
    if (cached) {
      itemsKeyRef.current = key;
      itemsScopeRef.current = scopeKey;
      setItems((prev) => mergeItemsPreservingRefs(prev, cached.items));
      setTotalItems(cached.totalItems);
      setTotalPages(cached.totalPages);
      setError(null);

      // Bản vừa vẽ còn rất mới ⇒ dừng ở đây: không request, không thanh tiến trình.
      // Trang chủ là chỗ được lợi nhiều nhất vì mỗi lượt của nó là BA request.
      if (Date.now() - cached.cachedAt < LIST_REVALIDATE_AFTER_MS) {
        // BẮT BUỘC tắt cờ trước khi thoát — xem chú thích ở `finally` của
        // `fetchFiles`: lượt gọi bật skeleton và lượt gọi tắt nó không nhất thiết
        // là một. Đang chờ một khung nhìn chưa có cache mà người dùng bấm sang
        // Trang chủ (đã có cache) thì lượt cũ đã bị `requestId` loại, còn lượt này
        // thoát ở đây — không ai tắt skeleton, và nó đứng đó vĩnh viễn.
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
    }

    // Chỉ khi KHÔNG có gì để vẽ mới được xoá màn hình đi dựng skeleton;
    // còn đứng nguyên Trang chủ mà chỉ đổi từ khoá thì làm mờ (xem `scopeKey`).
    const sameScope = itemsScopeRef.current === scopeKey;
    const showSkeleton = !silent && !cached && !sameScope;
    const showRefreshing = !silent && !cached && sameScope;
    if (showSkeleton) setIsLoading(true);
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    // Đang TÌM KIẾM thì hỏi thêm Bộ nhớ chung (##83): ô tìm kiếm hứa "tìm trong cloudSSS",
    // nhưng ba nguồn mặc định không có tệp nào trong drive — gõ đúng tên một tệp của drive ở
    // Trang chủ ra rỗng. Không tìm kiếm thì giữ ba nguồn như cũ (Trang chủ là gợi ý, không phải
    // danh sách mọi drive).
    //
    // Và kết quả tìm kiếm tôn trọng thanh lọc + cách sắp của trang kết quả (##90) — trước đây Trang
    // chủ bỏ qua mọi bộ lọc, nên chọn "Hình ảnh" xong gõ tìm ở đây vẫn ra đủ mọi loại.
    const isSearch = Boolean(debouncedSearch);
    const sourceTabs = isSearch ? HOME_SEARCH_SOURCE_TABS : HOME_SOURCE_TABS;
    const searchFilters = isSearch
      ? {
          filterType: filterType !== 'all' ? filterType : undefined,
          filterDate: filterDate !== 'all' ? filterDate : undefined,
          updatedFrom: dateFilterStart(filterDate)?.toISOString(),
          ...(serverSortKey && serverSortSupportedRef.current ? { sortBy: sortField, sortDir: sortDirection } : {}),
        }
      : {};

    try {
      const responses = await Promise.all(
        sourceTabs.map((tab) =>
          filesApi
            .getFilesAndFolders(
              {
                tab,
                search: debouncedSearch || undefined,
                ...searchFilters,
                page: 1,
                limit: isSearch ? HOME_SEARCH_LIMIT : pageSize,
              },
              // Không bật thanh tiến trình toàn cục khi: (a) đây là lượt đồng bộ
              // nền sau upload, hoặc (b) người dùng ĐÃ có nội dung trên màn hình
              // nhờ bộ đệm. Ở cả hai trường hợp không ai đang ngồi chờ cả — vẽ
              // thanh chạy lên là báo bận cho một việc không hề chặn ai.
              { background: silent || Boolean(cached) },
            )
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
        const isSharedSource = sourceTabs[index] === 'shared-with-me';
        (response?.items || []).forEach((item) => {
          // Giữ bản xuất hiện đầu tiên (ưu tiên thứ tự trong HOME_SOURCE_TABS)
          if (!item || mergedById.has(item.id)) return;
          mergedById.set(item.id, formatApiItem(item, isSharedSource, locale));
        });
      });

      const allFailed = responses.every((response) => response === null);
      const merged = Array.from(mergedById.values());
      // Tổng số kết quả THẬT của các nguồn (mỗi nguồn chỉ trả `HOME_SEARCH_LIMIT` mục đầu) — trang
      // kết quả so với số đang hiện để nói "đang hiện N/M". Ba nguồn tìm kiếm không chồng nhau.
      const totalItemsForView = isSearch
        ? responses.reduce((sum, response) => sum + (response?.meta?.total ?? response?.items?.length ?? 0), 0)
        : merged.length;

      // Cả ba nguồn cùng chết: giữ nguyên những gì đang hiện (có thể là bản cache
      // vừa vẽ ở trên) thay vì thay bằng một Trang chủ trống trơn.
      if (!allFailed) {
        itemsKeyRef.current = key;
        itemsScopeRef.current = scopeKey;
        setItems((prev) => mergeItemsPreservingRefs(prev, merged));
        setTotalItems(Math.max(totalItemsForView, merged.length));
        setTotalPages(1);
        writeListCache(
          key,
          { items: merged, breadcrumb: null, totalItems: Math.max(totalItemsForView, merged.length), totalPages: 1 },
          { fromServer: true },
        );
      }
      setError(allFailed && !cached ? t('file.list.loadFailed') : null);
    } finally {
      // Vô điều kiện — xem chú thích cùng chỗ trong `fetchFiles`.
      if (requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [isAuthenticated, isAuthLoading, isListCacheHydrated, debouncedSearch, filterType, filterDate, serverSortKey, sortField, sortDirection, pageSize, locale, t, cacheKey, scopeKey, readListCache, writeListCache]);

  // Fetch Files and Folders from Backend API
  const fetchFiles = useCallback(
    async (retries = 1, { silent = false } = {}) => {
      // Chờ cho đến khi AuthContext đã resolve xong mới fetch
      if (isAuthLoading || !isAuthenticated) return;
      // …và cho đến khi bộ đệm trên đĩa đã được đọc lên (xem `isListCacheHydrated`).
      if (!isListCacheHydrated) return;
      // Trang chủ đi theo luồng gộp riêng (xem fetchHomeItems) vì cần dữ liệu nhiều tab
      if (activeTab === 'home') {
        await fetchHomeItems({ silent });
        return;
      }
      if (!VALID_FILE_TABS.includes(activeTab)) return; // Billing không cần danh sách file

      const requestId = ++fetchRequestIdRef.current;

      // Khung nhìn này đã xem rồi → vẽ lại bản đã lưu NGAY, rồi vẫn đi tiếp
      // xuống lượt gọi server bên dưới để cập nhật. Đây là điểm khác biệt lớn
      // nhất so với bản cũ: chuyển tab không còn phải chờ mạng mới thấy gì.
      const key = cacheKey;
      const cached = silent ? null : readListCache(key);
      if (cached) {
        itemsKeyRef.current = key;
        itemsScopeRef.current = scopeKey;
        setItems((prev) => mergeItemsPreservingRefs(prev, cached.items));
        if (cached.breadcrumb) setBreadcrumb(cached.breadcrumb);
        setTotalItems(cached.totalItems);
        setTotalPages(cached.totalPages);
        setError(null);

        // Vừa lấy về chưa lâu ⇒ KHÔNG gọi mạng nữa. Đây là chỗ chữa "mới có tí đã
        // phải load lại": bấm qua lại giữa các tab hay ra vào một thư mục trong
        // vòng một phút giờ không sinh một request nào, nên cũng không có gì kéo
        // thanh tiến trình ở đỉnh trang.
        //
        // Quá ngưỡng đó thì vẫn đi tiếp xuống dưới, nhưng lượt gọi ấy là gọi NỀN:
        // màn hình đã có nội dung, người dùng không đang chờ nó.
        if (Date.now() - cached.cachedAt < LIST_REVALIDATE_AFTER_MS) {
          // Tắt cờ trước khi thoát, cùng lý do với `finally` bên dưới: lượt gọi
          // đang bật skeleton có thể là một lượt KHÁC, và nó sẽ bị `requestId`
          // loại trước khi kịp chạm tới `finally` của chính nó.
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }
      }

      // `silent` = đồng bộ nền (sau khi upload xong): KHÔNG bật skeleton, chỉ
      // trộn dữ liệu mới vào danh sách đang hiện — người dùng không thấy gì nháy.
      // `cached` cho kết quả y hệt: đã có cái để vẽ thì đừng xoá nó đi.
      // Không cả hai, nhưng vẫn đứng nguyên chỗ cũ (chỉ đổi bộ lọc / từ khoá /
      // số trang) thì làm mờ danh sách hiện có thay vì thay bằng skeleton.
      const sameScope = itemsScopeRef.current === scopeKey;
      const showSkeleton = !silent && !cached && !sameScope;
      const showRefreshing = !silent && !cached && sameScope;
      if (showSkeleton) {
        setIsLoading(true);
        setError(null);
      }
      if (showRefreshing) setIsRefreshing(true);

      const doFetch = async (remainingRetries) => {
        // Đọc ở MỖI lần thử: lần thử trước có thể vừa phát hiện backend cũ chưa hiểu sắp xếp.
        const withServerSort = Boolean(serverSortKey) && serverSortSupportedRef.current;
        try {
          const response = await filesApi.getFilesAndFolders(
            {
              // Trang "Nhãn" là `tab=tagged` ở backend (##91).
              tab: activeTab === 'tags' ? 'tagged' : activeTab,
              tagId: activeTab === 'tags' && currentTagId ? currentTagId : undefined,
              folderId: currentFolderId || undefined,
              sharedDriveId: activeTab === 'shared-drives' && currentSharedDriveId ? currentSharedDriveId : undefined,
              search: debouncedSearch || undefined,
              filterType: filterType !== 'all' ? filterType : undefined,
              filterDate: filterDate !== 'all' ? filterDate : undefined,
              // Mốc theo giờ máy người dùng — xem `dateFilterStart`. Tính NGAY lúc gọi,
              // không đưa vào dependency: "7 ngày qua" trôi theo từng mili giây.
              updatedFrom: dateFilterStart(filterDate)?.toISOString(),
              filterSender: effectiveFilterOwner !== 'all' ? effectiveFilterOwner : undefined,
              ...(withServerSort ? { sortBy: sortField, sortDir: sortDirection } : {}),
              page: currentPage,
              limit: pageSize,
            },
            // Không thanh tiến trình khi `silent` (đồng bộ nền cuối hàng đợi
            // upload) HOẶC khi đã vẽ được bản đệm: cả hai đều là lượt cập nhật
            // âm thầm cho một màn hình vốn đã dùng được.
            { background: silent || Boolean(cached) },
          );

          // Nếu có request mới hơn đã được phát đi, bỏ qua kết quả cũ tránh race condition
          if (requestId !== fetchRequestIdRef.current) return;

          const rawItems = response.items || [];
          const formattedItems = rawItems.map((item) => formatApiItem(item, activeTab === 'shared-with-me', locale));

          itemsKeyRef.current = key;
          itemsScopeRef.current = scopeKey;
          setItems((prev) => mergeItemsPreservingRefs(prev, formattedItems));

          const nextTotalItems = response.meta ? response.meta.total || formattedItems.length : formattedItems.length;
          const nextTotalPages = response.meta ? response.meta.totalPages || 1 : 1;
          if (response.meta) {
            setTotalItems(nextTotalItems);
            setTotalPages(nextTotalPages);
          }
          let nextBreadcrumb = null;
          if (response.breadcrumb) {
            // Chặng gốc do backend đặt tên ('Driver của tôi', xem FilesService)
            // — thay bằng khoá dịch để nó theo ngôn ngữ giao diện. Các chặng sau
            // là tên thư mục thật của người dùng, giữ nguyên.
            nextBreadcrumb = response.breadcrumb.map((crumb) =>
              crumb.id === null ? { id: null, nameKey: 'file.breadcrumb.myDrive' } : crumb,
            );
            setBreadcrumb(nextBreadcrumb);
          }
          setError(null);

          // Ghi thẳng vào cache ở đây thay vì chỉ dựa vào effect đồng bộ bên dưới:
          // khi dữ liệu mới trùng khít dữ liệu đang hiện, `mergeItemsPreservingRefs`
          // cố tình trả về đúng mảng cũ để React bỏ qua lần render — không có
          // render thì effect không chạy, và ô cache của khung nhìn này sẽ trống.
          writeListCache(
            key,
            {
              items: formattedItems,
              breadcrumb: nextBreadcrumb,
              totalItems: nextTotalItems,
              totalPages: nextTotalPages,
            },
            { fromServer: true },
          );
        } catch (err) {
          if (requestId !== fetchRequestIdRef.current) return;

          // Backend cũ chưa biết `sortBy`/`sortDir` (frontend lên trước backend): gửi lại NGAY,
          // không kèm sắp xếp, và thôi gửi cho các lượt sau — trình duyệt vẫn sắp trong trang.
          if (withServerSort && isUnsupportedSortError(err)) {
            serverSortSupportedRef.current = false;
            return await doFetch(remainingRetries);
          }

          if (remainingRetries > 0) {
            console.warn(`Lỗi khi lấy danh sách file, đang thử lại sau 1s (còn ${remainingRetries} lần thử):`, err);
            if (showSkeleton || showRefreshing) setError(t('file.list.retrying'));
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (requestId !== fetchRequestIdRef.current) return;
            return await doFetch(remainingRetries - 1);
          }

          console.error('Lỗi khi lấy danh sách file sau khi thử lại:', err);
          // Đang hiện bản cache thì im lặng nuốt lỗi: người dùng có dữ liệu (hơi cũ)
          // để làm việc, đập một câu lỗi đỏ lên trên đó là làm hỏng một màn hình
          // vốn đang dùng được.
          if (showSkeleton || showRefreshing) setError(err.message || t('file.list.loadFailed'));
          // Giữ lại danh sách items cũ, KHÔNG gọi setItems([]) để tránh làm trắng trang
        } finally {
          // Tắt VÔ ĐIỀU KIỆN, không hỏi lượt này có tự bật cờ hay không.
          //
          // Lượt gọi bật skeleton và lượt gọi tắt nó không nhất thiết là một:
          // đang chờ một tab chưa có cache (skeleton đang bật) mà người dùng đổi
          // bộ lọc sang một tổ hợp ĐÃ có cache thì lượt mới không bật cờ nào,
          // còn lượt cũ bị `requestId` loại ở đầu hàm nên không bao giờ chạm tới
          // finally của nó. Kiểm tra theo cờ riêng của từng lượt sẽ để skeleton
          // kẹt vĩnh viễn. React bỏ qua setState khi giá trị không đổi nên gọi
          // thừa ở đây không tốn một lần render nào.
          if (requestId === fetchRequestIdRef.current) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        }
      };

      await doFetch(retries);
    },
    [isAuthenticated, isAuthLoading, isListCacheHydrated, activeTab, currentFolderId, currentSharedDriveId, currentTagId, debouncedSearch, filterType, filterDate, effectiveFilterOwner, serverSortKey, sortField, sortDirection, currentPage, pageSize, fetchHomeItems, locale, t, cacheKey, scopeKey, readListCache, writeListCache]
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
  }, [fetchFiles]);

  /**
   * Thống kê dung lượng đi effect RIÊNG, không đi ké effect tải danh sách.
   *
   * Trước đây hai lời gọi nằm chung một effect có dependency là `fetchFiles`.
   * `fetchFiles` đổi identity theo tab, thư mục, bộ lọc, số trang và cả từ khoá
   * tìm kiếm — nên GET /files/analytics bị gọi lại theo từng cú bấm sidebar,
   * từng lần mở thư mục, thậm chí từng nhịp gõ phím (sau debounce). Đó là một
   * nửa số request của mọi lần chuyển tab, và không lần nào trong số đó cần
   * thiết: hạn mức chỉ đổi khi upload / xoá / mua gói, và cả ba đường đó đều đã
   * tự gọi `refreshStorageInfo()` rồi.
   *
   * `fetchAnalytics` chỉ phụ thuộc trạng thái đăng nhập, nên effect này thực tế
   * chạy đúng một lần mỗi phiên.
   */
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  /**
   * Giữ ô cache của khung nhìn hiện tại khớp với những gì đang hiển thị.
   *
   * Cần thiết vì phần lớn thao tác trong app cập nhật `items` tại chỗ, KHÔNG đi
   * qua `fetchFiles`: đánh dấu sao, đổi tên, xoá vào thùng rác, dán, và mỗi tệp
   * upload xong. Không có effect này thì cache đóng băng ở lần tải cuối, và rời
   * tab rồi quay lại sẽ thấy tệp vừa xoá sống dậy trong khoảnh khắc trước khi
   * lượt đồng bộ nền kịp sửa lại.
   */
  useEffect(() => {
    const key = itemsKeyRef.current;
    if (!key) return;
    writeListCache(key, { items, breadcrumb, totalItems, totalPages });
  }, [items, breadcrumb, totalItems, totalPages, writeListCache]);

  /**
   * Đổi chủ (đăng xuất, đăng nhập tài khoản khác) thì đốt sạch cache.
   * Tên tệp của người này không được phép loé lên trong phiên của người kia.
   *
   * Phải so với chủ TRƯỚC ĐÓ chứ không thể chạy vô điều kiện như bản cũ. Bản cũ
   * đúng vì bộ đệm khi ấy luôn rỗng lúc mount; nay nó được nạp từ đĩa, mà `user`
   * thì đến muộn (một lượt gọi `/users/me`), nên "undefined → id" cũng là một lần
   * đổi giá trị — chạy vô điều kiện sẽ xoá sạch đúng thứ vừa nạp lên, và mỗi lần
   * F5 lại quay về dựng skeleton.
   *
   * Bốn tình huống: mount (null → null) và đăng nhập xong (null → A) thì KHÔNG
   * xoá; đổi tài khoản (A → B) và đăng xuất (A → null) thì xoá.
   */
  const previousUserIdRef = useRef(null);
  useEffect(() => {
    const previous = previousUserIdRef.current;
    const next = user?.id ?? null;
    previousUserIdRef.current = next;
    if (previous === null || previous === next) return;

    listCacheRef.current.clear();
    itemsKeyRef.current = null;
    dirtyListKeysRef.current.clear();
    // Và cả bản trên đĩa. Quét SẠCH chứ không chỉ namespace của người hiện tại:
    // lúc effect này chạy thì token trong localStorage đã là của người MỚI, nên
    // `cacheScope()` trỏ nhầm chỗ — xoá theo tiền tố sẽ để lại nguyên phần dữ
    // liệu của người vừa rời đi, đúng thứ cần xoá.
    void clearPersistentCache();
  }, [user?.id]);

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
      if (
        activeCountRef.current > 0 ||
        pendingQueueRef.current.length > 0 ||
        confirmingCountRef.current > 0
      ) {
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

  // ── Mục mới tạo ở trang "Nhãn" (##92) ─────────────────────────────────────
  //
  // Trang Nhãn không phải một thư mục: tải lên hay tạo thư mục khi đang đứng ở đó vẫn vào GỐC
  // Drive của tôi — không có chỗ nào khác để đặt chúng. Bản ##91 chỉ dừng ở đó, nên người dùng
  // tải tệp lên ngay trong trang Nhãn, thấy nó nằm ở Drive của tôi, quay lại trang Nhãn thì vẫn
  // trống trơn. Nay mục mới tự mang nhãn đang xem và hiện ngay trên trang đó.
  //
  // Việc gắn do TagsContext làm — nó giữ tên, màu và số mục của từng nhãn — nhưng TagsContext là
  // CON của provider này, nên nó đăng ký hàm gắn vào đây (`registerAutoTagger`).
  const autoTaggerRef = useRef(null);
  const registerAutoTagger = useCallback((tagger) => {
    autoTaggerRef.current = tagger;
    return () => {
      if (autoTaggerRef.current === tagger) autoTaggerRef.current = null;
    };
  }, []);

  /**
   * Gắn nhãn `tagId` lên các mục vừa tạo, rồi chèn chúng vào trang Nhãn nếu người dùng còn đứng
   * đúng trang đó. Không ai chờ nó và nó không ném: tệp đã lên xong, nhãn là phần thêm — gắn hỏng
   * thì TagsContext báo, còn mục vẫn nằm yên ở Drive của tôi.
   */
  const tagCreatedItems = useCallback(async (tagId, entities) => {
    const tagger = autoTaggerRef.current;
    const targets = entities.filter((entity) => entity?.id && !entity.isSpam && !entity.isTrash);
    if (!tagId || !tagger || targets.length === 0) return;

    const result = await tagger(tagId, targets.map((entity) => entity.id));
    if (!result) return;
    if (result.chip) {
      const applied = new Set(result.applied);
      const shown = targets
        .filter((entity) => applied.has(entity.id))
        .map((entity) => ({
          ...entity,
          tags: [...(entity.tags ?? []).filter((tag) => tag.id !== tagId), result.chip],
        }))
        .filter(belongsToCurrentView);
      // `skipExisting`: thư mục gốc của một lượt tải thư mục là bản DỰNG Ở CLIENT — tải trùng tên
      // thì backend trả id thư mục cũ, và bản dựng không được đè lên dữ liệu thật đang hiện.
      if (shown.length > 0) upsertItems(shown, { skipExisting: true });
    }
    // Lượt đồng bộ cuối hàng đợi có thể đã chạy TRƯỚC khi nhãn kịp gắn: hẹn thêm một lượt sau
    // mốc này để danh sách đang xem (và chip nhãn trên từng hàng) khớp máy chủ.
    scheduleSilentSync();
  }, [belongsToCurrentView, upsertItems, scheduleSilentSync]);

  /**
   * Tệp vừa upload xong: chèn card mới, hẹn cập nhật quota + đồng bộ cuối hàng đợi.
   *
   * @param {object} entity      Hàng `files` backend vừa tạo.
   * @param {File}   [sourceFile] Chính tệp người dùng đã chọn. Truyền vào để dựng
   *   thumbnail NGAY TỪ BẢN TRONG RAM — không có nó thì lát nữa cái thẻ hiện ra sẽ
   *   tải lại đúng tệp này từ cloud chỉ để thu nhỏ (xem `utils/thumbnailPrimer.js`).
   * @param {string|null} [tagId] Nhãn tệp phải mang — tệp được tải lên từ trang Nhãn (##92).
   */
  const onUploadedFile = useCallback((entity, sourceFile, tagId = null) => {
    if (entity && belongsToCurrentView(entity)) {
      upsertItems(entity);
    } else if (entity) {
      // Tệp lên xong ở chỗ người dùng KHÔNG đang xem: tải từ trang Nhãn thì tệp vào gốc Drive
      // của tôi, hoặc người dùng đã sang thư mục khác giữa chừng. Bản lưu của thư mục đích có
      // thể còn "tươi" (`LIST_REVALIDATE_AFTER_MS`), mở ra sẽ không hỏi máy chủ — và thiếu đúng
      // tệp vừa tải (##92).
      staleListViewsForFolders([entity.parentId ?? null]);
    }
    if (entity && tagId) void tagCreatedItems(tagId, [entity]);

    // Chạy nền, không chờ, không chặn gì: đây là việc làm THÊM cho lần sau.
    if (entity && sourceFile) primeThumbnailsForUpload(entity, sourceFile);

    // Tải lên xong nhưng Spam Guard gắn cờ: tệp KHÔNG hiện ở thư mục đích, nên phải
    // nói ra. Không có thông báo này thì hàng đợi báo "xong 100%" mà thư mục vẫn
    // trống — trông y hệt một lần upload thất bại trong im lặng.
    if (entity?.isSpam) {
      toast(t('file.upload.flaggedSpam', { name: entity.name }), { duration: 6000 });
    }

    scheduleAnalyticsRefresh();
    scheduleSilentSync();
  }, [belongsToCurrentView, upsertItems, staleListViewsForFolders, tagCreatedItems, scheduleAnalyticsRefresh, scheduleSilentSync, t]);

  const resetFilters = useCallback(() => {
    setFilterTypeState('all');
    setFilterDateState('all');
    setFilterOwnerState('all');
    setSearchQueryState('');
    setCurrentPage(1);
  }, [setCurrentPage]);

  /**
   * Nút "Xóa bộ lọc" của thanh lọc: CHỈ Loại / Ngày / Người sở hữu (##90). Trước đây nút này gọi
   * `resetFilters`, nên đang tìm "báo cáo" + lọc "PDF" mà bấm bỏ bộ lọc là mất luôn từ khoá vừa gõ.
   * `resetFilters` (xoá cả từ khoá) còn cho nút ← "về danh sách" của trang kết quả Bộ nhớ chung.
   */
  const clearFilters = useCallback(() => {
    setFilterTypeState('all');
    setFilterDateState('all');
    setFilterOwnerState('all');
    setCurrentPage(1);
  }, [setCurrentPage]);

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

  /**
   * Đọc `selectedIdsRef` chứ không phải `selectedIds`, để hàm này ổn định VĨNH
   * VIỄN. Nó là khoá duy nhất liên quan tới việc chọn còn ở lại trong
   * `contextValue` (Header và MainLayout cần nó cho các thao tác hàng loạt);
   * nếu nó đổi identity theo từng cú bấm chọn thì cả `contextValue` đổi theo,
   * và việc tách SelectionContext ra thành công cốc.
   *
   * Ref luôn mang giá trị mới nhất và hàm chỉ được gọi tại thời điểm người dùng
   * bấm — không có nguy cơ đọc phải state cũ.
   */
  const getSelectedItems = useCallback(
    (currentSortedFolders, currentSortedFiles) =>
      [...(currentSortedFolders || []), ...(currentSortedFiles || [])].filter((item) =>
        selectedIdsRef.current.has(item.id),
      ),
    []
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

  /**
   * So sánh hai mục theo cột đang chọn — dùng chung cho thư mục và tệp.
   *
   * • Tên: thứ tự TỰ NHIÊN theo ngôn ngữ giao diện (`Intl.Collator`, `numeric`). So
   *   chuỗi thô như trước thì "Thư mục 10" đứng trước "Thư mục 2", còn "Ảnh", "Đề
   *   cương" bị đẩy xuống sau "Zalo" vì chữ có dấu nằm ngoài bảng a–z.
   * • Ngày: so MỐC THỜI GIAN (`updatedAtMs`), không so chuỗi hiển thị — xem `formatApiItem`.
   * • Hoà nhau (ví dụ mọi thư mục đều "0 byte" khi sắp theo kích thước) thì xếp theo
   *   tên, để thứ tự luôn đoán được thay vì phụ thuộc thứ tự server trả về.
   */
  const compareItems = useMemo(() => {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    const byName = (a, b) => collator.compare(a.name || '', b.name || '');
    const byField = {
      size: (a, b) => (Number(a.sizeBytes) || 0) - (Number(b.sizeBytes) || 0),
      updatedAt: (a, b) => (a.updatedAtMs || 0) - (b.updatedAtMs || 0),
      createdAt: (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0),
      type: (a, b) => collator.compare(a.mimeType || '', b.mimeType || ''),
      owner: (a, b) => collator.compare(a.owner || '', b.owner || ''),
    };
    const sign = sortDirection === 'desc' ? -1 : 1;
    return (a, b) => {
      const primary = sortField === 'name' ? byName(a, b) : byField[sortField]?.(a, b) || 0;
      if (primary !== 0) return sign * primary;
      return sortField === 'name' ? 0 : byName(a, b);
    };
  }, [locale, sortField, sortDirection]);

  // "Gần đây" giữ NGUYÊN thứ tự server trả về — mở gần nhất trước. Trang này không có
  // thanh sắp xếp, nên trước đây nó lặng lẽ dùng lựa chọn toàn cục (mặc định Tên A-Z)
  // và "Gần đây" hiện ra theo bảng chữ cái.
  const keepServerOrder = activeTab === 'recent';

  const sortedFolders = useMemo(
    () => (keepServerOrder ? folders : [...folders].sort(compareItems)),
    [folders, compareItems, keepServerOrder],
  );

  const sortedFiles = useMemo(
    () => (keepServerOrder ? files : [...files].sort(compareItems)),
    [files, compareItems, keepServerOrder],
  );

  // Storage Info Object
  const storageInfo = useMemo(() => ({
    usedBytes: analytics ? analytics.usedBytes : 0,
    // Hạn mức theo BYTE — Sidebar tự tính "Đã đầy / Vượt hạn mức" từ đây (`getStorageStatus`),
    // vì `percentage` của backend bị kẹp ở 100 nên không phân biệt được 100% với 600% (##87).
    limitBytes: analytics ? Number(analytics.limitBytes) || 0 : 0,
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
      const name = item.owner || t('list.owner.me');
      if (!seen.has(name)) {
        seen.add(name);
        owners.push(name);
      }
    }
    return owners;
  }, [items, t]);


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
    // Đổi icon NGAY, không chờ mạng. Backend `toggleStar` chạy 3-4 câu SQL tuần tự
    // (SELECT file → UPDATE → INSERT activity_logs), và dyno Heroku ở Mỹ nói chuyện
    // với Supabase pooler ap-southeast-1 nên mỗi lượt là ~1s. Trước đây icon chỉ
    // sáng lên sau khi request xong, nên người dùng thấy "bấm sao mà load rất lâu"
    // dù chẳng có gì phải tải.
    let rolledBack = false;
    const rollback = () => {
      if (rolledBack) return;
      rolledBack = true;
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isStarred: !item.isStarred } : item)),
      );
    };

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isStarred: !item.isStarred } : item)),
    );

    try {
      const res = await filesApi.toggleStar(id);
      const isStarred = typeof res?.isStarred === 'boolean' ? res.isStarred : undefined;
      // Chốt lại theo giá trị backend trả về: nếu hai bên lệch (vd. tab khác vừa
      // bấm cùng mục) thì server là nguồn đúng, không giữ giá trị đoán trước.
      if (isStarred !== undefined) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, isStarred } : item)),
        );
      }
      if (!silent) {
        if (isStarred === undefined) {
          toast.success(t('file.star.updated'));
        } else {
          toast.success(isStarred ? t('file.star.added') : t('file.star.removed'));
        }
      }
      return { ok: true, isStarred };
    } catch (err) {
      rollback();
      if (!silent) toast.error(err.message || t('file.star.failed'));
      return { ok: false, error: err };
    }
  }, [t]);

  /**
   * Cập nhật màu tùy chỉnh cho file/folder.
   * Dùng optimistic update: đổi màu ngay, rollback nếu API thất bại.
   * @param {string} id      — id của file/folder
   * @param {string|null} color — mã hex '#RRGGBB' hoặc null để reset
   */
  const updateColor = useCallback(async (id, color) => {
    const prevColor = (() => {
      // Lưu lại màu cũ để rollback
      const found = items.find((item) => item.id === id);
      return found?.customColor ?? null;
    })();

    // Optimistic update ngay lập tức
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, customColor: color } : item)),
    );

    try {
      await filesApi.updateColor(id, color);
      toast.success(t(color ? 'color.changed' : 'color.resetDone'));
      return { ok: true };
    } catch (err) {
      // Rollback về màu cũ
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, customColor: prevColor } : item)),
      );
      toast.error(err.message || t('color.changeFailed'));
      return { ok: false, error: err };
    }
  }, [items, t]);

  /**
   * Đổi `tags` của các mục đang hiện TẠI CHỖ (##91) — gắn/gỡ nhãn ở menu chuột phải phải thấy
   * ngay trên hàng, không đợi một lượt tải lại danh sách. `ids = null` là MỌI mục (đổi tên, đổi
   * màu hay xoá một nhãn). `updater(tags) → tags`.
   *
   * Ở trang "Nhãn", mục vừa bị gỡ đúng nhãn đang xem thì rời danh sách luôn — để nó nằm lại là
   * nói dối về chính thứ người dùng vừa làm.
   */
  const patchItemTags = useCallback((ids, updater) => {
    const wanted = ids == null ? null : new Set(Array.isArray(ids) ? ids : [ids]);
    /** `list` sau khi sửa chip; `viewTagId` = nhãn của trang Nhãn mà danh sách thuộc về, nếu có. */
    const patchList = (list, viewTagId) => {
      let changed = false;
      const next = [];
      for (const item of list) {
        if (wanted && !wanted.has(item.id)) {
          next.push(item);
          continue;
        }
        const tags = updater(Array.isArray(item.tags) ? item.tags : []);
        if (tags === item.tags) {
          next.push(item);
          continue;
        }
        changed = true;
        if (viewTagId && !tags.some((tag) => tag.id === viewTagId)) continue;
        next.push({ ...item, tags });
      }
      return changed ? next : list;
    };

    const currentViewTagId = viewRef.current?.activeTab === 'tags' ? viewRef.current?.currentTagId : null;
    setItems((prev) => patchList(prev, currentViewTagId));

    // Bản lưu của các màn hình KHÁC (##92): đổi tên / màu / xoá nhãn ở trang Nhãn thì chip ở
    // cloudSSS của tôi — vừa xem, bản lưu còn "tươi" nên mở lại không hỏi máy chủ — phải đổi
    // ngay. Màn hình đang xem đã có effect đồng bộ ghi lại.
    const cache = listCacheRef.current;
    for (const [key, snapshot] of cache) {
      if (key === itemsKeyRef.current || !Array.isArray(snapshot.items)) continue;
      let view;
      try {
        view = JSON.parse(key);
      } catch {
        continue; // Khoá lạ (bản cache của phiên bản cũ) — bỏ qua, TTL sẽ dọn
      }
      const patched = patchList(snapshot.items, view.tab === 'tags' ? view.tagId : null);
      if (patched === snapshot.items) continue;
      const removed = snapshot.items.length - patched.length;
      cache.set(key, {
        ...snapshot,
        items: patched,
        totalItems: Math.max(0, (snapshot.totalItems ?? snapshot.items.length) - removed),
      });
      dirtyListKeysRef.current.add(key);
    }
    if (dirtyListKeysRef.current.size > 0 && !persistTimerRef.current) {
      persistTimerRef.current = setTimeout(flushListCache, LIST_PERSIST_DEBOUNCE_MS);
    }
  }, [flushListCache]);

  /**
   * Ba hàm thùng rác dưới đây dùng chung một hợp đồng với `toggleStar`:
   * trả `{ ok, error }` và KHÔNG throw, kèm tuỳ chọn `silent`.
   *
   * `silent` dành cho thao tác hàng loạt (thanh Header khi chọn nhiều mục):
   *   • không bắn toast — phía gọi gộp N kết quả thành ĐÚNG MỘT thông báo,
   *     thay vì xếp chồng 10 toast đỏ khi xóa 10 tệp mà lỗi cả 10;
   *   • không gọi `fetchAnalytics()` — N mục là N lượt gọi /files/analytics
   *     cho cùng một con số cuối cùng; phía gọi tự làm mới một lần
   *     (`refreshStorageInfo`) sau khi chạy hết vòng lặp.
   * Việc loại mục khỏi danh sách tại chỗ thì vẫn giữ: đó là phản hồi UI.
   */
  const moveToTrash = useCallback(async (id, { silent = false } = {}) => {
    try {
      await filesApi.moveToTrash(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (!silent) fetchAnalytics();
      return { ok: true };
    } catch (err) {
      if (!silent) toast.error(t('file.trash.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [fetchAnalytics, t]);

  /**
   * Bản LÔ của `moveToTrash` — một request cho cả tập đang chọn.
   *
   * Hợp đồng khác hai hàm đơn ở trên vì việc nó làm khác: nó KHÔNG có `silent`, vì nó đã
   * là cái "một lượt" mà `silent` sinh ra để phục vụ. Trả `{ ok, succeeded, failed }`,
   * trong đó `failed` là mảng `{ id, reason }` do server trả về — phía gọi tự ghép id
   * thành tên để hiện thông báo.
   *
   * Danh sách chỉ loại đúng những id server báo THÀNH CÔNG. Loại cả tập rồi mới biết ba
   * mục lỗi là tự tạo ra một khoảng giao diện nói dối cho tới lượt tải lại kế tiếp.
   */
  const moveToTrashBulk = useCallback(async (ids) => {
    try {
      const res = await filesApi.moveToTrashBulk(ids);
      const succeeded = new Set(res?.succeeded ?? []);
      setItems((prev) => prev.filter((item) => !succeeded.has(item.id)));
      return { ok: true, succeeded: res?.succeeded ?? [], failed: res?.failed ?? [] };
    } catch (err) {
      return { ok: false, error: err, succeeded: [], failed: [] };
    }
  }, []);

  const restoreFromTrash = useCallback(async (id, { silent = false } = {}) => {
    try {
      await filesApi.restoreFromTrash(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (!silent) fetchAnalytics();
      return { ok: true };
    } catch (err) {
      if (!silent) toast.error(t('file.restore.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [fetchAnalytics, t]);

  /**
   * Gỡ một mục khỏi Nội dung rác — nó quay lại đúng thư mục đã tải lên.
   *
   * Tách khỏi `restoreFromTrash` vì hai chuyện khác hẳn nhau: tệp spam KHÔNG nằm
   * trong thùng rác (`is_trash = false`), nên `PATCH /files/:id/restore` không đổi
   * được cột nào. Trả về `{ ok, parentName }` để phía gọi nói được tệp đã về đâu —
   * người dùng đang đứng ở trang Nội dung rác nên không tự thấy.
   */
  const markNotSpam = useCallback(async (id, { silent = false } = {}) => {
    try {
      const res = await filesApi.markNotSpam(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      return { ok: true, parentName: res?.parentName ?? null, parentId: res?.parentId ?? null };
    } catch (err) {
      if (!silent) toast.error(t('file.notSpam.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [t]);

  const deletePermanently = useCallback(async (id, { silent = false } = {}) => {
    try {
      await filesApi.deletePermanently(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (!silent) fetchAnalytics();
      return { ok: true };
    } catch (err) {
      if (!silent) toast.error(t('file.deleteForever.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [fetchAnalytics, t]);

  /** Bản LÔ của `deletePermanently`. Xem `moveToTrashBulk` về hợp đồng trả về. */
  const deletePermanentlyBulk = useCallback(async (ids) => {
    try {
      const res = await filesApi.deletePermanentlyBulk(ids);
      const succeeded = new Set(res?.succeeded ?? []);
      setItems((prev) => prev.filter((item) => !succeeded.has(item.id)));
      return { ok: true, succeeded: res?.succeeded ?? [], failed: res?.failed ?? [] };
    } catch (err) {
      return { ok: false, error: err, succeeded: [], failed: [] };
    }
  }, []);

  /**
   * Dọn thùng rác. Trả `{ ok, deletedCount, skippedCount }` (không throw) để phía gọi biết kết
   * quả thật — trước ##79 lỗi bị nuốt ở đây nên hộp "Dọn dẹp nhanh" vẫn báo "đã dọn xong".
   *
   * `skippedCount`: mục trong Bộ nhớ chung mà mình chỉ là MEMBER — thùng rác hiện chúng (để khôi
   * phục được) nhưng chỉ ADMIN xoá vĩnh viễn. Còn mục bị giữ lại thì nạp lại danh sách thay vì xoá
   * trắng: xoá trắng là danh sách rỗng giả, F5 lại hiện ra.
   */
  const emptyTrash = useCallback(async () => {
    try {
      const res = await filesApi.emptyTrash();
      const skippedCount = Number(res?.skippedCount) || 0;
      if (skippedCount > 0) {
        // `silent`: bỏ qua bộ đệm danh sách (còn "tươi" < 60 giây nên `fetchFiles()` thường sẽ
        // vẽ lại đúng bản cũ — kể cả các tệp vừa xoá — mà không hỏi server) và trộn kết quả mới.
        fetchFiles(0, { silent: true });
        toast(t('trash.empty.keptDriveItems', { count: skippedCount }), { icon: 'ℹ️', duration: 7000 });
      } else {
        setItems([]);
      }
      fetchAnalytics();
      return { ok: true, deletedCount: Number(res?.deletedCount) || 0, skippedCount };
    } catch (err) {
      toast.error(t('file.emptyTrash.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [fetchAnalytics, fetchFiles, t]);

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
    if (!name) return { ok: false, error: new Error(t('file.rename.emptyName')) };
    try {
      const updated = await filesApi.renameItem(id, { name });
      // Ưu tiên tên backend trả về (nó mới là tên đã lưu thật) — xem toggleStar.
      const savedName = updated?.name || name;
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name: savedName } : item)));
      // Bảng thông tin giữ ẢNH CHỤP của item tại thời điểm mở (openInfoDrawer), không
      // đọc lại từ `items` — không đồng bộ ở đây thì nó vẫn hiện tên CŨ ngay cạnh
      // danh sách đã đổi tên, và nút "Đổi tên" trong đó lại mở modal với tên cũ.
      setInfoDrawerItem((prev) => (prev && prev.id === id ? { ...prev, name: savedName } : prev));
      toast.success(t('file.rename.done'));
      return { ok: true, name: savedName };
    } catch (err) {
      toast.error(t('file.rename.failed', { reason: err.message }));
      return { ok: false, error: err };
    }
  }, [t]);

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
      toast.error(t('file.createFolder.failed', { reason: err.message }));
      throw err;
    }

    // 2. Backend trả nguyên entity thư mục vừa tạo → chèn đúng MỘT card, không bật
    // skeleton và không tải lại cả danh sách. `scheduleSilentSync` lo phần đối
    // chiếu với server (ví dụ tên bị tự đổi vì trùng) ở chế độ im lặng.
    const created = res?.id ? res : res?.data?.id ? res.data : null;
    if (created && belongsToCurrentView(created)) {
      upsertItems(created);
    } else if (created) {
      // Tạo từ trang Nhãn: thư mục nằm ở gốc Drive của tôi — xem `onUploadedFile`.
      staleListViewsForFolders([created.parentId ?? null]);
    }
    // Trang Nhãn (##92): thư mục mới mang luôn nhãn đang xem.
    if (created && activeTab === 'tags' && currentTagId) void tagCreatedItems(currentTagId, [created]);
    scheduleSilentSync();

    return res;
  }, [currentFolderId, activeTab, currentSharedDriveId, currentTagId, belongsToCurrentView, upsertItems, staleListViewsForFolders, tagCreatedItems, scheduleSilentSync, t]);

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

  /**
   * `silent` như ở `moveToTrash`: bỏ toast VÀ bỏ luôn bước đồng bộ lại. Ở đây
   * bước đồng bộ mới là chỗ đắt — di chuyển 10 mục mà mỗi mục một lượt
   * `fetchFiles()` là 10 lần tải lại cả trang danh sách cho cùng một kết quả.
   * Phía gọi hàng loạt tự gọi `triggerReload` (+ `refreshStorageInfo`) một lần.
   */
  const moveItem = useCallback(async (id, targetParentId, { silent = false } = {}) => {
    // 1. Thao tác chính: di chuyển item ở backend
    try {
      await filesApi.moveItem(id, { targetParentId });
    } catch (err) {
      if (!silent) toast.error(t('file.move.failed', { reason: err.message }));
      return { ok: false, error: err };
    }

    // 2. Bước đồng bộ lại danh sách
    if (!silent) {
      try {
        await fetchFiles();
      } catch (fetchErr) {
        console.warn('Lỗi đồng bộ danh sách sau khi di chuyển:', fetchErr);
      }
    }
    return { ok: true };
  }, [fetchFiles, t]);

  const copyItem = useCallback(async (id, targetParentId, { silent = false } = {}) => {
    // 1. Thao tác chính: sao chép item ở backend
    try {
      await filesApi.copyItem(id, { targetParentId });
    } catch (err) {
      if (!silent) toast.error(t('file.copy.failed', { reason: err.message }));
      return { ok: false, error: err };
    }

    // 2. Bước đồng bộ lại danh sách và thông số lưu trữ
    if (!silent) {
      try {
        await fetchFiles();
        await fetchAnalytics();
      } catch (fetchErr) {
        console.warn('Lỗi đồng bộ danh sách sau khi sao chép:', fetchErr);
      }
    }
    return { ok: true };
  }, [fetchFiles, fetchAnalytics, t]);

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
        // Để `pasteItems` phân biệt gốc Bộ nhớ chung với gốc Drive của tôi (cả hai `parentId` null).
        sharedDriveId: item.sharedDriveId ?? null,
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
        // Để `pasteItems` phân biệt gốc Bộ nhớ chung với gốc Drive của tôi (cả hai `parentId` null).
        sharedDriveId: item.sharedDriveId ?? null,
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

      // Dán vào GỐC (không có thư mục đích) phải nói rõ gốc CỦA AI (##77): gốc Bộ nhớ chung đang
      // mở, hay gốc Drive của tôi (`null`). Không nói thì backend tự đoán theo vùng chứa của mục
      // — tệp cắt từ Bộ nhớ chung dán vào gốc Drive của tôi chỉ quay về gốc drive cũ, bản sao
      // dán vào gốc một drive lại rơi về Drive của tôi.
      const view = viewRef.current;
      const rootDriveId = view?.activeTab === 'shared-drives' ? view.currentSharedDriveId || null : null;
      // Trang danh sách các Bộ nhớ chung (chưa vào drive nào) không có "gốc" nào để dán vào —
      // Ctrl+V ở đó trước đây âm thầm chuyển mục về Drive của tôi.
      if (!destId && view?.activeTab === 'shared-drives' && !rootDriveId) return;
      const destination = destId
        ? { targetParentId: destId }
        : { targetParentId: null, targetSharedDriveId: rootDriveId };

      // No-op check dùng snapshot đã lưu: nếu mode cut và paste vào đúng folder ban đầu thì bỏ qua.
      // Ở gốc thì phải cùng cả VÙNG: gốc Bộ nhớ chung và gốc Drive của tôi đều có `parentId` null.
      const isSamePlace = (entry) =>
        destId
          ? (entry.parentId ?? null) === destId
          : (entry.parentId ?? null) === null && (entry.sharedDriveId ?? null) === rootDriveId;
      const toProcess =
        currentClip.mode === 'cut'
          ? currentClip.items.filter((entry) => !isSamePlace(entry))
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
              return await filesApi.moveItem(entry.id, destination);
            } else {
              return await filesApi.copyItem(entry.id, destination);
            }
          })
        );
      } catch (err) {
        console.error('Lỗi trong quá trình dán:', err);
        toast.error(t('file.paste.failed', { reason: err.message || err }));
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
            reason: res.reason?.message || t('file.unknownError'),
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
            ? t('file.paste.oneFailed', { detail: firstError })
            : t('file.paste.manyFailed', {
                failed: rejected.length,
                total: toProcess.length,
                detail: firstError,
              }),
        );
      }

      // Nếu là cut thì xoá clipboard sau khi paste (kể cả có lỗi một phần)
      if (currentClip.mode === 'cut') {
        clearClipboard();
      }
      // Nếu là copy: giữ nguyên clipboard để paste nhiều lần

      // Đồng bộ lại danh sách tệp & thông số lưu trữ (tách riêng khỏi catch dán)
      if (fulfilledCount > 0) {
        // BẮT BUỘC đứng trước `fetchFiles()`. Dán là thao tác DUY NHẤT đổi nội
        // dung thư mục mà không tự sửa `items` tại chỗ — nó trông cậy hoàn toàn
        // vào lượt đồng bộ ngay dưới. Mà lượt đó sẽ thoát sớm nếu ô cache của
        // khung nhìn còn trong ngưỡng `LIST_REVALIDATE_AFTER_MS`, tức là suốt 60
        // giây đầu sau khi mở thư mục — đúng khoảng thời gian người ta thực sự
        // cắt/dán. Kết quả: server đã chuyển tệp xong mà màn hình không đổi gì.
        //
        // Đích luôn bị ảnh hưởng. Nguồn thì chỉ khi CẮT — sao chép không lấy gì
        // ra khỏi thư mục cũ.
        const affectedFolders = [destId];
        if (currentClip.mode === 'cut') {
          affectedFolders.push(...toProcess.map((entry) => entry.parentId ?? null));
        }
        staleListViewsForFolders(affectedFolders);

        try {
          await fetchFiles();
          await fetchAnalytics();
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ danh sách sau khi dán:', syncErr);
        }
      }
    },
    [clearClipboard, fetchFiles, fetchAnalytics, staleListViewsForFolders, t]
  );

  /**
   * "Di chuyển tới…" (##90): chuyển `entries` vào nơi chọn trong hộp thoại `MoveModal` — như Cắt
   * rồi Dán vào đó, nhưng KHÔNG đi qua bảng tạm (bảng tạm đang giữ gì vẫn giữ nguyên).
   *
   * `destination`: `{ folderId }`, hoặc một GỐC `{ folderId: null, sharedDriveId }` (`null` = gốc
   * Drive của tôi) — cùng hợp đồng `targetParentId` / `targetSharedDriveId` của Dán (##77). Mục đã
   * nằm sẵn ở đó thì bỏ qua. Lỗi từng mục được báo ở đây (một toast); trả `{ moved, failed }`.
   */
  const moveItemsTo = useCallback(async (entries, { folderId = null, sharedDriveId = null } = {}) => {
    const isSamePlace = (entry) =>
      folderId
        ? (entry.parentId ?? null) === folderId
        : (entry.parentId ?? null) === null && (entry.sharedDriveId ?? null) === (sharedDriveId ?? null);
    const toMove = (entries || []).filter((entry) => entry?.id && !isSamePlace(entry));
    if (toMove.length === 0) return { moved: 0, failed: 0 };

    const destination = folderId
      ? { targetParentId: folderId }
      : { targetParentId: null, targetSharedDriveId: sharedDriveId ?? null };
    const results = await Promise.allSettled(
      toMove.map((entry) => filesApi.moveItem(entry.id, destination)),
    );

    const rejected = [];
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        rejected.push({ name: toMove[idx].name, reason: res.reason?.message || t('file.unknownError') });
      }
    });
    if (rejected.length > 0) {
      // Cùng cách báo của Dán: số lượng + mục đầu tiên, chi tiết đầy đủ ra console.
      console.error('Di chuyển thất bại:', rejected.map((r) => `${r.name}: ${r.reason}`).join('\n'));
      const detail = `${rejected[0].name}: ${rejected[0].reason}`;
      toast.error(
        rejected.length === 1
          ? t('file.moveTo.oneFailed', { detail })
          : t('file.moveTo.manyFailed', { failed: rejected.length, total: toMove.length, detail }),
      );
    }

    const moved = toMove.length - rejected.length;
    if (moved > 0) {
      // Như Dán, di chuyển không tự sửa `items` tại chỗ: phải làm cũ ô cache của nguồn lẫn đích
      // trước lượt đồng bộ, nếu không trong 60 giây đầu màn hình đứng nguyên (xem `pasteItems`).
      staleListViewsForFolders([folderId, ...toMove.map((entry) => entry.parentId ?? null)]);
      try {
        await fetchFiles();
      } catch (syncErr) {
        console.warn('Lỗi đồng bộ danh sách sau khi di chuyển:', syncErr);
      }
    }
    return { moved, failed: rejected.length };
  }, [fetchFiles, staleListViewsForFolders, t]);

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
      if (safeLocalStorage.getItem('driveR_settings_shortcuts_enabled') === 'false') return;

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
  // updateJob, trackJobBytes, enqueueJob, resetJob — được inject từ UploadContext (xem trên)
  //
  // Job xong / huỷ KHÔNG tự gỡ khỏi hàng đợi nữa (##89): bảng tiến trình dọn cả đợt một lượt
  // khi đợt xong. Gỡ từng dòng là thứ làm danh sách dồn lên và thanh tổng tụt lại sau mỗi tệp.

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
        // Phần đã nằm sẵn trên cloud: tính vào tiến độ, KHÔNG tính vào tốc độ.
        trackJobBytes(id, session ? uploadedBytes : 0, { baseline: true });
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
        trackJobBytes(id, 0, { baseline: true });
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
          tagId: job.tagId || null,
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
          (chunkPercent, loadedInChunk) => {
            // Tiến độ trong lòng một chunk cũng phải hiện ra: với chunk 10MB trên
            // đường truyền chậm, thanh tiến trình đứng im hàng chục giây là dấu
            // hiệu duy nhất người dùng có, và nó nói sai.
            const sentInChunk = Math.min(
              chunk.size,
              loadedInChunk ?? Math.round((chunk.size * chunkPercent) / 100),
            );
            trackJobBytes(id, chunkStart + sentInChunk);
            const percent = Math.round(((chunkStart + sentInChunk) / totalSize) * 95);
            updateJob(id, { percent, status: 'uploading' });
          },
          signal,
        );

        uploadedBytes = end;
        persist(uploadedBytes);
        trackJobBytes(id, uploadedBytes);
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

  /**
   * URL PUT cho một tệp nhỏ — xin THEO LÔ, và xin trước cho các tệp sắp tới lượt.
   *
   * Tệp đầu tiên chưa có URL sẽ xin cho chính nó cùng tới `UPLOAD_URL_PREFETCH - 1`
   * tệp đang chờ phía sau, trong một request. Các tệp đó tới lượt thì lấy luôn URL đã
   * có sẵn. 300 ảnh nhờ vậy là ~10 request thay vì 300.
   *
   * Lùi về `getUploadUrl` lẻ khi backend chưa có đường lô, hoặc cả lô bị từ chối vì
   * một lý do không phải mất mạng (vd. 400 do một phần tử lạ) — đường lẻ cho mỗi tệp
   * câu trả lời riêng của nó. Mất mạng thì ném ra như cũ: đường lẻ cũng sẽ chết.
   * Lỗi của RIÊNG một tệp trong lô (`ok: false`) ném ra với đúng `status` của nó.
   */
  const getUploadTarget = useCallback((job) => {
    const viaSingle = () => storageApi.getUploadUrl(toUploadUrlPayload(job));

    const prefetched = uploadTargetsRef.current.get(job.id);
    if (prefetched) {
      uploadTargetsRef.current.delete(job.id);
      return prefetched.then((target) => target ?? viaSingle());
    }
    if (!isBatchableUpload(job)) return viaSingle();

    const upcoming = pendingQueueRef.current
      .filter(
        (j) =>
          j.id !== job.id &&
          isBatchableUpload(j) &&
          !uploadTargetsRef.current.has(j.id) &&
          !canceledJobIdsRef.current.has(j.id),
      )
      .slice(0, UPLOAD_URL_PREFETCH - 1);

    const request = storageApi.getUploadUrlsBatch([job, ...upcoming].map(toUploadUrlPayload));
    const targetAt = (i) =>
      request.then(
        (res) => {
          if (!res) return null; // chưa có đường lô
          const item = res.items?.[i];
          if (item?.ok) return item;
          throw uploadItemError(item);
        },
        (err) => {
          if (isBackendUnreachable(err)) throw err;
          console.warn('Xin URL theo lô thất bại, chuyển sang xin lẻ:', err);
          return null;
        },
      );

    upcoming.forEach((j, i) => {
      const target = targetAt(i + 1);
      // Tệp có thể bị huỷ trước khi tới lượt và không ai `await` promise này nữa.
      target.catch(() => {});
      uploadTargetsRef.current.set(j.id, target);
    });

    return targetAt(0).then((target) => target ?? viaSingle());
  }, []);

  /** Thực thi upload cho 1 job (phân nhánh: chunked nếu > 10MB, thường nếu nhỏ hơn) */
  const runUploadJob = useCallback(
    async (job) => {
      const { id, fileObj, parentId, sharedDriveId } = job;

      // Người dùng có thể đã bấm huỷ / tạm dừng trong lúc job còn nằm chờ tới lượt
      if (canceledJobIdsRef.current.has(id) || pausedJobIdsRef.current.has(id)) {
        activeCountRef.current -= 1;
        dispatchRunner();
        return;
      }

      const controller = new AbortController();
      abortControllersRef.current.set(id, controller);
      const { signal } = controller;

      /**
       * Nhả làn cho tệp tiếp theo mà KHÔNG kết thúc job này. Gọi ngay sau khi PUT xong:
       * phần còn lại chỉ là chờ lô xác nhận, không dùng chút băng thông nào, và giữ
       * làn trong lúc đó là để 10 làn đứng chờ backend thay vì đẩy byte.
       */
      let holdsSlot = true;
      const releaseSlot = () => {
        if (!holdsSlot) return;
        holdsSlot = false;
        activeCountRef.current -= 1;
        confirmingCountRef.current += 1;
        dispatchRunner();
      };

      updateJob(id, { status: 'uploading', percent: 0 });

      try {
        // ── Nếu file > 10MB → dùng GCS chunked resumable upload ──
        if (fileObj.size > CHUNK_THRESHOLD) {
          const uploadedEntity = await runChunkedUploadJob(job, signal);
          updateJob(id, { percent: 100, status: 'done' });
          onUploadedFile(uploadedEntity, fileObj, job.tagId);
          return;
        }

        // Tệp nhỏ luôn đi từ byte 0 (kể cả lượt thử lại) — không có phần nào nằm sẵn trên cloud.
        trackJobBytes(id, 0, { baseline: true });

        // ── File nhỏ ≤ 10MB: flow cũ (presigned PUT hoặc proxy) ──
        let isUploaded = false;
        let uploadedEntity = null;

        // 1a. Xin URL đẩy trực tiếp.
        //
        // CỐ Ý tách khỏi khối try có đường lùi qua proxy ở dưới. Request này đi tới
        // BACKEND CỦA MÌNH, và `/files/upload-proxy` cũng đi tới đúng host đó — chỉ
        // nặng hơn vì mang theo cả tệp. Nên nếu nó chết vì MẤT MẠNG thì proxy không
        // phải đường lùi mà là một lượt thất bại thứ hai, chậm hơn, và thay thông
        // điệp lỗi thật bằng lỗi của lượt thử vô ích đó.
        //
        // Đây là đúng chuỗi đã xảy ra ngày 09/09/2026 (xem `.ai/error.md` #14):
        // `/files/upload-url` chết với `net::ERR_NETWORK_CHANGED` → cả tệp bị đẩy
        // sang proxy → proxy cũng chết vì mạng vẫn đang xuống. Log Heroku cùng lúc
        // đó cho thấy server hoàn toàn khoẻ (`upload-url` trả 201 trong ~670ms).
        //
        // Mọi lỗi CÓ phản hồi từ server (cloud không cấp URL, provider từ chối…) vẫn
        // rơi xuống proxy như trước — ở đó proxy đúng là câu trả lời.
        let presignedData = null;
        try {
          presignedData = await getUploadTarget(job);
        } catch (urlErr) {
          if (signal.aborted || canceledJobIdsRef.current.has(id)) throw urlErr;
          // Cả đường lô lẫn đường lẻ đã tự thử lại 2 lần có backoff trước khi tới
          // đây, nên tới được đây nghĩa là mạng mất chứ không phải nhấp một nhịp.
          if (isBackendUnreachable(urlErr)) throw urlErr;
          // Không có quyền / hết dung lượng: proxy sẽ trả đúng câu đó, sau khi đã
          // đẩy cả tệp qua dyno. Báo luôn.
          if (PROXY_WONT_HELP.has(urlErr?.status)) throw urlErr;
          console.warn('Không xin được URL đẩy trực tiếp, chuyển sang proxy:', urlErr);
        }

        // 1b. Thử Direct Presigned PUT (chỉ khi 1a đã cấp được URL)
        if (presignedData) {
          try {
            const { uploadUrl, storageKey, storageProvider } = presignedData;

            // Ghi lại trước khi đẩy: bấm Huỷ giữa chừng thì đây là thứ duy nhất
            // cho biết phải xoá object nào trên cloud
            uploadSessionsRef.current.set(id, { storageKey, storageProvider });

            await storageApi.uploadDirectToCloud(
              uploadUrl,
              fileObj,
              (percent, loaded) => {
                trackJobBytes(id, loaded);
                updateJob(id, { percent, status: 'uploading' });
              },
              signal,
            );

            updateJob(id, { percent: 99, status: 'confirming' });
            releaseSlot();

            // Xác nhận theo lô: các tệp PUT xong trong lúc một lô đang bay sẽ đi chung
            // lô sau (xem `utils/uploadBatcher.js`). Backend chưa có đường lô thì bộ
            // gom tự lùi về `confirm-upload` lẻ.
            let confirmRes;
            try {
              confirmRes = await confirmBatcher.add(id, {
                name: fileObj.name,
                sizeBytes: fileObj.size,
                mimeType: fileObj.type || 'application/octet-stream',
                storageKey,
                storageProvider,
                parentId: parentId || undefined,
                sharedDriveId: sharedDriveId || undefined,
              });
            } catch (confirmErr) {
              // Chỉ đánh dấu lỗi của BACKEND ở bước này — lỗi PUT lên cloud (vd. 403 do
              // chữ ký hết hạn) vẫn phải được proxy cứu như trước.
              if (PROXY_WONT_HELP.has(confirmErr?.status)) confirmErr.skipProxy = true;
              throw confirmErr;
            }

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
            // Mất mạng ở `confirm-upload` (request tới backend của mình) cũng vậy:
            // proxy đi tới cùng host nên chắc chắn cũng chết, chỉ tốn thêm một lượt
            // đẩy cả tệp. Lỗi khi PUT thẳng lên CLOUD thì KHÔNG vào nhánh này —
            // `isBackendUnreachable` chỉ nhận lỗi của request qua axios instance của
            // backend — nên ca bucket cấu hình CORS sai vẫn được proxy cứu như trước.
            if (isBackendUnreachable(directErr) || directErr?.skipProxy) throw directErr;
            console.warn('Direct upload failed, falling back to proxy:', directErr);
          }
        }

        // 2. Fallback qua Server Proxy
        if (!isUploaded) {
          const proxyRes = await storageApi.uploadProxy(
            fileObj,
            parentId,
            job.targetProvider,
            (percent, loaded) => {
              trackJobBytes(id, loaded);
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

        // Chỉ thêm đúng card của tệp vừa xong — KHÔNG tải lại cả thư mục
        onUploadedFile(uploadedEntity, fileObj, job.tagId);
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
        if (holdsSlot) {
          // Giảm bộ đếm và dispatch runner để chạy job tiếp theo
          holdsSlot = false;
          activeCountRef.current -= 1;
          dispatchRunner();
        } else {
          // Làn đã nhả từ lúc PUT xong — chỉ còn gỡ khỏi nhóm "đang chờ xác nhận"
          confirmingCountRef.current -= 1;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runChunkedUploadJob, onUploadedFile, getUploadTarget, confirmBatcher],
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
   * tagId: nhãn tệp phải mang khi lên xong — mặc định là nhãn của trang Nhãn đang đứng (##92).
   */
  const enqueueUpload = useCallback(
    (
      fileObj,
      parentId = currentFolderId,
      targetProvider = undefined,
      sharedDriveId = (activeTab === 'shared-drives' ? currentSharedDriveId : undefined),
      tagId = (activeTab === 'tags' ? currentTagId : null),
    ) => {
      if (!fileObj) return;
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const job = {
        id: jobId,
        fileName: fileObj.name,
        fileObj,
        parentId,
        sharedDriveId,
        tagId,
        targetProvider,
        percent: 0,
        status: 'pending',
      };
      // Thêm vào UploadContext (UI) và ref (runner)
      enqueueJob(job);
      pendingQueueRef.current.push(job);

      // Các nút gọi hàm này trong một vòng `forEach` — khởi chạy SAU vòng đó, để tệp
      // đầu tiên thấy cả hàng đợi và xin URL cho cả lô. Khởi chạy ngay thì 10 tệp đầu
      // mỗi tệp một request, vì lúc chúng bắt đầu hàng đợi mới có đúng mình chúng.
      if (!dispatchScheduledRef.current) {
        dispatchScheduledRef.current = true;
        queueMicrotask(() => {
          dispatchScheduledRef.current = false;
          dispatchRunner();
        });
      }
    },
    [currentFolderId, activeTab, currentSharedDriveId, currentTagId, dispatchRunner, enqueueJob],
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

      // Job vừa bị huỷ: gỡ cờ huỷ, nếu không thì runner bỏ qua nó ngay ở dòng đầu
      canceledJobIdsRef.current.delete(jobId);

      const retriedJob = { ...job, percent: 0, status: 'pending', error: undefined, renamedFrom: undefined };
      // Reset job trong UploadContext state
      resetJob(jobId, { percent: 0, status: 'pending', error: undefined, renamedFrom: undefined });
      uploadSessionsRef.current.delete(jobId);
      uploadTargetsRef.current.delete(jobId);
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

      // Đã nằm trong một lô xác nhận đang bay: hàng `files` sắp (hoặc đã) được ghi.
      // Huỷ lúc này chỉ có thể đua với lượt ghi đó — `abortUpload` tới trước thì xoá
      // mất object của một tệp sắp có hàng trong DB. Để nó xong; tệp sẽ hiện ra.
      if (confirmBatcher.isInFlight(jobId)) return;

      canceledJobIdsRef.current.add(jobId);
      pausedJobIdsRef.current.delete(jobId); // huỷ một tệp đang tạm dừng cũng là huỷ
      pendingQueueRef.current = pendingQueueRef.current.filter((j) => j.id !== jobId);
      uploadTargetsRef.current.delete(jobId);

      abortControllersRef.current.get(jobId)?.abort();
      // Còn nằm chờ trong lô xác nhận thì rút ra: không có hàng nào được ghi, và
      // `abortUpload` bên dưới dọn object đã PUT lên.
      confirmBatcher.cancel(jobId, new Error('canceled'));
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

      // Dòng "Đã huỷ" ở lại đúng chỗ (kèm nút Tải lại) tới khi cả đợt xong rồi được dọn một
      // lượt — gỡ nó ngay là kéo cả danh sách bên dưới dồn lên (##89).
    },
    [updateJob, uploadQueueRef, loadChunkState, clearChunkState, confirmBatcher],
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
        tagId: session.tagId || null,
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
        const res = await storageApi.abortUpload({
          storageKey: session.storageKey,
          storageProvider: session.storageProvider || 'google_cloud',
          resumableUrl: session.resumableUrl,
        });

        // 2xx KHÔNG có nghĩa là đã dọn xong. Backend cố tình nuốt lỗi của bước
        // DELETE lên GCS (huỷ hộ người dùng, không phải việc của họ) và báo lại
        // qua cờ `sessionCanceled`. Không đọc cờ đó thì `cloudCleaned` luôn true
        // và lời hứa "nói được sự thật" ở doc trên là lời hứa suông.
        // Chỉ xét khi CÓ gửi resumableUrl: không gửi thì backend bỏ qua bước huỷ
        // session và trả về false vì chưa từng chạy, không phải vì thất bại.
        if (session.resumableUrl && res?.sessionCanceled === false) {
          console.warn('Backend không huỷ được session resumable trên GCS:', res);
          cloudCleaned = false;
        }
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
    async (tree, { parentId, sharedDriveId, tagId } = {}) => {
      const entries = tree?.entries || [];
      const dirPaths = tree?.dirPaths || [];
      if (entries.length === 0 && dirPaths.length === 0) {
        return { fileCount: 0, folderCount: 0, skippedCount: 0 };
      }

      const view = viewRef.current;
      const targetParentId = parentId !== undefined ? parentId : view.currentFolderId;
      const effectiveSharedDriveId =
        sharedDriveId !== undefined
          ? sharedDriveId
          : view.activeTab === 'shared-drives'
            ? view.currentSharedDriveId
            : undefined;
      // Tải lên ở trang Nhãn (##92): mục CẤP 1 — thư mục gốc của cây và tệp nằm thẳng ở chỗ chọn
      // — mang nhãn đang xem. Tệp bên trong các thư mục đó thì không: nhãn trên thư mục đã dẫn tới.
      const rootTagId =
        tagId !== undefined ? tagId : view.activeTab === 'tags' ? view.currentTagId : null;

      const sortedDirPaths = buildSortedDirPaths({ entries, dirPaths });

      // Tạo cây theo LÔ, gửi nối tiếp — xem `chunkDirPaths`. Gửi cả cây trong một request
      // là thứ đã làm thư mục lớn bị đổ phẳng: request vượt trần body của backend, không
      // thư mục nào được tạo, và mọi tệp rơi về thư mục đang mở. Một lô hỏng không kéo các
      // lô sau theo: lô nào cũng tự mang đủ tổ tiên của nó.
      const batchFolderIdMap = {};
      let folderError = null;
      const chunks = chunkDirPaths(sortedDirPaths);

      // Cây lớn tạo mất vài giây mà menu "Mới" đã đóng ngay khi chọn thư mục — không báo gì
      // thì trông như bấm không ăn. Cây nhỏ xong trước hạn chờ nên không hiện gì cả.
      let progressToastId = null;
      const progressText = () =>
        t('file.folderTree.progress', {
          done: sortedDirPaths.filter((path) => batchFolderIdMap[path]).length,
          total: sortedDirPaths.length,
        });
      const progressTimer =
        chunks.length > 0
          ? setTimeout(() => {
              progressToastId = toast.loading(progressText());
            }, 800)
          : null;

      try {
        for (const chunk of chunks) {
          try {
            const created = await filesApi.createFoldersBatch(
              chunk,
              targetParentId,
              effectiveSharedDriveId,
            );
            Object.assign(batchFolderIdMap, created);
          } catch (error) {
            console.error('Lỗi khi tạo hàng loạt thư mục:', error);
            folderError ??= error;
          }
          if (progressToastId) toast.loading(progressText(), { id: progressToastId });
        }
      } finally {
        clearTimeout(progressTimer);
        if (progressToastId) toast.dismiss(progressToastId);
      }

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
        }));
      const shownFolders = rootFolders.filter(belongsToCurrentView);

      if (shownFolders.length > 0) {
        upsertItems(shownFolders, { skipExisting: true });
      }
      // Thư mục đích không phải chỗ đang xem (vd. tải từ trang Nhãn) — xem `onUploadedFile`.
      if (shownFolders.length < rootFolders.length) staleListViewsForFolders([targetParentId ?? null]);
      if (rootTagId) void tagCreatedItems(rootTagId, rootFolders);

      // Tệp chỉ đi vào ĐÚNG thư mục của nó. Thư mục đó không tạo được thì tệp KHÔNG được
      // tải lên: trước đây nó rơi về thư mục đang mở, nên một lỗi tạo cây là cả cây bị đổ
      // phẳng vào một chỗ (tệp trùng tên còn bị đổi thành "a (1).txt"…) — sai mà khó dọn.
      // Tệp nằm thẳng ở chỗ thả/chọn (`dirPath` rỗng) không cần thư mục nào.
      let skippedCount = 0;
      entries.forEach(({ file, relativePath }) => {
        const dirPath = relativePath.split('/').slice(0, -1).join('/');
        const targetId = dirPath ? batchFolderIdMap[dirPath] : (targetParentId ?? null);
        if (dirPath && !targetId) {
          skippedCount += 1;
          return;
        }
        enqueueUpload(file, targetId, undefined, effectiveSharedDriveId, dirPath ? null : rootTagId);
      });

      const missingFolderCount = sortedDirPaths.filter((path) => !batchFolderIdMap[path]).length;
      if (missingFolderCount > 0) {
        const reason = folderError?.message || t('file.unknownError');
        toast.error(
          skippedCount > 0
            ? t('file.folderTree.failed', { count: skippedCount, reason })
            : t('file.createFolder.failed', { reason }),
          { duration: 10000 },
        );
      }

      // Cây thư mục sâu (folder con) chỉ hiện ra khi người dùng mở vào — lần đồng
      // bộ im lặng sau khi hàng đợi rỗng sẽ chỉnh lại mọi thứ cho khớp server.
      scheduleSilentSync();

      return {
        fileCount: entries.length - skippedCount,
        folderCount: sortedDirPaths.length - missingFolderCount,
        skippedCount,
      };
    },
    [belongsToCurrentView, upsertItems, staleListViewsForFolders, tagCreatedItems, enqueueUpload, scheduleSilentSync, t],
  );

  // Backward compatibility alias for UI calls
  const uploadFileMock = useCallback((fileName) => {
    const blob = new Blob(['File content test'], { type: 'text/plain' });
    const file = new File([blob], fileName || 'test_document.txt', { type: 'text/plain' });
    enqueueUpload(file);
  }, [enqueueUpload]);

  /**
   * `silent` cho tải hàng loạt: ném lại lỗi thay vì toast + trả null. Phía gọi
   * cần chính `err.message` để gộp thành một thông báo có nguyên nhân, còn trả
   * null suông thì nó chỉ biết "thất bại" mà không biết vì sao.
   */
  const getDownloadUrl = useCallback(async (id, { silent = false } = {}) => {
    try {
      const res = await storageApi.getDownloadUrl(id);
      return res.downloadUrl;
    } catch (err) {
      if (silent) throw err;
      toast.error(t('file.downloadUrl.failed', { reason: err.message }));
      return null;
    }
  }, [t]);

  /**
   * Trả về CẢ payload chứ không riêng chuỗi URL: từ khi backend kèm thêm
   * `playbackHint` (tệp này trình duyệt phát ngay được hay phải tải hết trước —
   * xem `backend/src/storage/mp4-container.ts`), khung xem trước cần đọc nó để
   * nói đúng chuyện gì đang xảy ra thay vì để người dùng ngồi trước vòng xoay.
   */
  const getPreviewUrl = useCallback(async (id, options) => {
    try {
      // `options.needsPlayback` quyết định đi đường lẻ hay đường gộp — xem
      // `storageApi.getPreviewUrl`. Phía gọi phải nói ra vì chỉ nó biết loại tệp.
      return await storageApi.getPreviewUrl(id, options);
    } catch (err) {
      toast.error(t('file.previewUrl.failed', { reason: err.message }));
      return null;
    }
  }, [t]);

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
      toast.error(t('file.shareUrl.failed', { reason: err.message }));
      return null;
    }
  }, [t]);

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
    isInForeignFolder,
    openFolder,
    activeTab,
    setActiveTab: handleSetActiveTab,
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    toggleSidebar,
    isLoading,
    isRefreshing,
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
    filterOwner: effectiveFilterOwner,
    setFilterOwner,
    ownerFilterApplies,
    resetFilters,
    clearFilters,
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
    updateColor,
    patchItemTags,
    registerAutoTagger,
    currentTagId,
    moveToTrash,
    moveToTrashBulk,
    restoreFromTrash,
    markNotSpam,
    deletePermanently,
    deletePermanentlyBulk,
    emptyTrash,
    createFolder,
    createFolderSilent,
    moveItem,
    moveItemsTo,
    openItemLocation,
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
    // Selection, clipboard, preview và info drawer KHÔNG nằm ở đây nữa — xem
    // useFileSelection() / useClipboard() / useFilePreview(). Chúng đổi theo mỗi
    // cú bấm chuột, để lại thì mỗi lần chọn một tệp là một lần render toàn app.
    getSelectedItems,
  }), [
    // ── State cơ bản ──
    items, folders, files, sortedFolders, sortedFiles,
    isLoading, isRefreshing, error, viewMode, isSidebarCollapsed,
    currentPage, pageSize, totalItems, totalPages, breadcrumb,
    // ── Điều hướng / tab ──
    activeTab, currentFolderId, currentSharedDriveId, currentTagId, isInForeignFolder,
    handleSetActiveTab, handleSetCurrentFolderId, handleSetCurrentSharedDriveId,
    openFolder, toggleSidebar, setViewMode,
    // ── Tìm kiếm / lọc / sắp xếp ──
    searchQuery, filterType, filterDate, effectiveFilterOwner, ownerFilterApplies,
    setSearchQuery, setFilterType, setFilterDate, setFilterOwner,
    sortField, sortDirection, setSortField, setSortDirection, resetFilters, clearFilters, uniqueOwners,
    // ── Lưu trữ ──
    storageInfo, fetchAnalytics,
    // ── Hành động trên file/folder ──
    fetchFiles, toggleStar, patchItemTags, registerAutoTagger, moveToTrash, moveToTrashBulk, restoreFromTrash, markNotSpam,
    deletePermanently, deletePermanentlyBulk,
    emptyTrash, createFolder, createFolderSilent, moveItem, moveItemsTo, openItemLocation, copyItem, renameItem,
    getDownloadUrl, getPreviewUrl, getFileTextContent, createShareLink,
    // ── Upload ──
    uploadFile, enqueueUpload, uploadEntries, retryUploadJob, uploadFileMock,
    cancelUploadJob, cancelAllUploads, pauseUploadJob, resumePausedJob,
    listResumableSessions, resumeUpload, discardResumableSession,
    // ── Chọn nhiều mục ──
    // Chỉ còn `getSelectedItems`: Header và MainLayout gọi nó để gom danh sách
    // đang chọn cho các thao tác hàng loạt, và nó chỉ đổi theo `selectedIds`.
    getSelectedItems,
  ]);

  /**
   * Ai đang được chọn. Đổi theo từng cú bấm chuột và Ctrl+A, nhưng chỉ có bốn
   * nơi quan tâm: hai khung danh sách, thanh công cụ hàng loạt trên Header, và
   * MainLayout (cho phím tắt).
   */
  const selectionValue = useMemo(() => ({
    selectedIds,
    selectedCount: selectedIds.size,
    lastSelectedId,
    toggleSelect,
    selectRange,
    selectAll,
    deselectAll,
    isSelected,
    getSelectedItems,
  }), [
    selectedIds, lastSelectedId, toggleSelect, selectRange,
    selectAll, deselectAll, isSelected, getSelectedItems,
  ]);

  /** Cắt / sao chép / dán. Chỉ hai khung danh sách, Trang chủ, My Drive và Header dùng. */
  const clipboardValue = useMemo(() => ({
    clipboard,
    isPasting,
    cutItems,
    copyItems,
    clearClipboard,
    pasteItems,
  }), [clipboard, isPasting, cutItems, copyItems, clearClipboard, pasteItems]);

  /**
   * Cửa sổ xem trước và ngăn thông tin bên phải.
   *
   * Đây là mảnh trả lời trực tiếp cho triệu chứng "mở modal là cả app tải lại":
   * `previewItem` nằm chung `contextValue` nghĩa là mỗi lần mở/đóng xem trước,
   * toàn bộ cây — Sidebar, Header, danh sách, hàng đợi upload — render lại.
   */
  const previewValue = useMemo(() => ({
    previewItem,
    previewList,
    previewPanel,
    openPreview,
    showPreviewItem,
    closePreview,
    infoDrawerItem,
    isInfoDrawerOpen,
    infoDrawerTab,
    openInfoDrawer,
    closeInfoDrawer,
  }), [
    previewItem, previewList, previewPanel, openPreview, showPreviewItem, closePreview,
    infoDrawerItem, isInfoDrawerOpen, infoDrawerTab, openInfoDrawer, closeInfoDrawer,
  ]);

  /**
   * Drive đang đứng và vai trò của mình trong đó. `currentSharedDriveId` chỉ có khi vào drive từ
   * thẻ (state trong RAM) — F5 giữa một thư mục drive thì đọc từ chính các mục đang hiện. Chưa biết
   * vai trò (đang nạp, thư mục rỗng sau F5) ⇒ `null` ⇒ giao diện giữ hành vi cũ, backend vẫn chặn.
   */
  const currentDriveId =
    activeTab === 'shared-drives'
      ? currentSharedDriveId || items.find((item) => item.sharedDriveId)?.sharedDriveId || null
      : null;
  const currentUserId = user?.id ?? null;
  const driveAccessValue = useMemo(() => {
    const driveRoleOf = (driveId) => (driveId ? driveRoles.get(driveId) ?? null : null);
    const driveNameOf = (driveId) => (driveId ? driveNames.get(driveId) ?? null : null);
    const currentDriveRole = driveRoleOf(currentDriveId);
    return {
      driveRoleOf,
      driveNameOf,
      currentDriveRole,
      // VIEWER chỉ xem: không tải lên, không tạo thư mục, không sửa/xoá gì trong drive.
      isDriveReadOnly: currentDriveRole === 'VIEWER',
      // Để menu biết mục nào là của mình (MEMBER chỉ chia sẻ được mục mình tải lên).
      currentUserId,
    };
  }, [driveRoles, driveNames, currentDriveId, currentUserId]);

  return (
    <FileContext.Provider value={contextValue}>
      <SelectionContext.Provider value={selectionValue}>
        <ClipboardContext.Provider value={clipboardValue}>
          <PreviewContext.Provider value={previewValue}>
            <DriveAccessContext.Provider value={driveAccessValue}>
              {children}
            </DriveAccessContext.Provider>
          </PreviewContext.Provider>
        </ClipboardContext.Provider>
      </SelectionContext.Provider>
    </FileContext.Provider>
  );
}

/**
 * Vai trò trong Bộ nhớ chung: `driveRoleOf(driveId)`, `currentDriveRole`, `isDriveReadOnly`; tên drive:
 * `driveNameOf(driveId)`.
 * Ngoài `FileProvider` (harness, trang công khai) trả bản "không biết gì" — mọi lệnh hiện như cũ.
 */
const NO_DRIVE_ACCESS = {
  driveRoleOf: () => null,
  driveNameOf: () => null,
  currentDriveRole: null,
  isDriveReadOnly: false,
  currentUserId: null,
};
export const useDriveAccess = () => useContext(DriveAccessContext) ?? NO_DRIVE_ACCESS;

export const useFiles = () => useContext(FileContext);

/** Trạng thái chọn nhiều mục. Tách khỏi useFiles() — xem chú thích ở đầu file. */
export const useFileSelection = () => useContext(SelectionContext);

/** Bảng tạm cắt / sao chép / dán. Tách khỏi useFiles() — xem chú thích ở đầu file. */
export const useClipboard = () => useContext(ClipboardContext);

/** Cửa sổ xem trước + ngăn thông tin. Tách khỏi useFiles() — xem chú thích ở đầu file. */
export const useFilePreview = () => useContext(PreviewContext);