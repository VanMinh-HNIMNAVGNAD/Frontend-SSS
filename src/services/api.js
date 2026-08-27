import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT Bearer Token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Handle 401 Unauthorized token expiration
api.interceptors.response.use(
  (response) => {
    // Standardize backend wrapped response ({ statusCode, data, message })
    if (response.data && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('accessToken');
      const path = window.location.pathname;
      // Khách vãng lai trên trang chia sẻ KHÔNG bao giờ bị redirect về /login
      const isPublicSharePage = path.startsWith('/share');
      if (!isPublicSharePage && path !== '/login' && path !== '/register' && path !== '/') {
        window.location.href = '/login';
      }
    }

    // Với `responseType: 'blob'` (vd. filesApi.downloadZip) axios trả body lỗi
    // dưới dạng Blob, nên `data.message` luôn undefined và toast rơi về đúng câu
    // "Request failed with status code 500". Đọc blob ra JSON để lấy lại message.
    let data = error.response?.data;
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = undefined;
      }
    }

    // Backend (AllExceptionsFilter) luôn trả `message` là câu tiếng Việt;
    // `details` có thể là mảng lỗi validate nên dùng làm phương án dự phòng.
    const raw =
      data?.message ||
      (Array.isArray(data?.details) ? data.details : null) ||
      error.message ||
      'Đã có lỗi xảy ra';
    const message = Array.isArray(raw)
      ? raw
          .map((item) => (typeof item === 'string' ? item : (item?.errors || []).join(' ')))
          .filter(Boolean)
          .join(' ')
      : String(raw);

    console.error('[API Error]', error.response?.status, error.config?.url, message);

    // Giữ lại metadata của backend cho caller cần phân biệt loại lỗi
    const normalizedError = new Error(message);
    normalizedError.status = error.response?.status;
    normalizedError.errorCode = data?.errorCode;
    normalizedError.details = data?.details;
    return Promise.reject(normalizedError);
  },
);

// Auth APIs
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/users/me', data),
  updatePassword: (data) => api.patch('/users/me/password', data),
};

// User Profile APIs
export const userApi = {
  getMe: () => api.get('/users/me'),
  updateMe: (data) => api.patch('/users/me', data),
  updateAvatar: (formData) => api.post('/users/me/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  recalculateQuota: () => api.patch('/users/me/recalculate-quota'),
  getMySessions: () => api.get('/users/me/sessions'),
  revokeSession: (sessionId) => api.delete(`/users/me/sessions/${sessionId}`),
  revokeAllOtherSessions: () => api.delete('/users/me/sessions'),
  deleteMyAccount: (password) => api.delete('/users/me', { data: { password } }),
};

// Files & Folders Hierarchy APIs
export const filesApi = {
  getFilesAndFolders: (params = {}) => api.get('/files', { params }),
  createFolder: (data) => api.post('/folders', data),
  createFoldersBatch: (paths, parentId, sharedDriveId) => api.post('/files/folders/batch', { paths, parentId, sharedDriveId }),
  renameItem: (id, data) => api.patch(`/files/${id}/rename`, data),
  moveItem: (id, data) => api.patch(`/files/${id}/move`, data),
  copyItem: (id, data) => api.post(`/files/${id}/copy`, data),
  toggleStar: (id) => api.patch(`/files/${id}/star`),
  moveToTrash: (id) => api.patch(`/files/${id}/trash`),
  restoreFromTrash: (id) => api.patch(`/files/${id}/restore`),
  emptyTrash: () => api.delete('/files/trash/empty'),
  deletePermanently: (id) => api.delete(`/files/${id}/permanent`),
  getStorageAnalytics: () => api.get('/files/analytics'),
  getLargestFiles: (limit = 3) => api.get('/files/largest', { params: { limit } }),
  downloadZip: (fileIds) => api.post('/files/download-zip', { fileIds }, { responseType: 'blob' }),
  getFileVersions: (id) => api.get(`/files/${id}/versions`),
  getActivityLogs: (fileId) => {
    const url = fileId ? `/files/${fileId}/activity-logs` : '/files/activity-logs';
    return api.get(url);
  },
};

// Multi-Cloud Storage APIs
export const storageApi = {
  getUploadUrl: (data) => api.post('/files/upload-url', data),
  confirmUpload: (data) => api.post('/files/confirm-upload', data),
  getDownloadUrl: (id) => api.get(`/files/${id}/download-url`),
  getPreviewUrl: (id) => api.get(`/files/${id}/preview-url`),
  getFileTextContent: (id) => api.get(`/files/${id}/content`),

  /**
   * Huỷ một phiên tải lên đang dở và dọn rác trên cloud.
   * `resumableUrl` chỉ có với luồng chunked; backend tự kiểm tra nó có đúng là
   * session URI của GCS hay không.
   */
  abortUpload: (data) => api.post('/files/upload/abort', data),

  // Direct PUT Upload to Presigned URL (Cloudflare R2 / Backblaze B2 / GCS)
  // `signal` là AbortSignal của job — nút "Huỷ" cắt đúng request đang chạy.
  uploadDirectToCloud: async (presignedUrl, file, onUploadProgress, signal) => {
    return axios.put(presignedUrl, file, {
      signal,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
  },
  uploadProxy: async (file, parentId, targetProvider, onUploadProgress, sharedDriveId, signal) => {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId) formData.append('parentId', parentId);
    if (sharedDriveId) formData.append('sharedDriveId', sharedDriveId);
    if (targetProvider) formData.append('targetProvider', targetProvider);

    return api.post('/files/upload-proxy', formData, {
      signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
  },
};

// Chunked / Resumable Upload API (GCS native resumable upload)
// Luồng: init → uploadChunkDirect (PUT lên GCS, lặp N lần) → complete
export const chunkedApi = {
  /**
   * Khởi tạo GCS resumable session.
   * Response: { uploadId, resumableUrl, storageKey, chunkSize, totalChunks, totalSizeBytes }
   */
  init: (data) =>
    api.post('/files/upload-chunk/init', data),

  /**
   * PUT 1 chunk trực tiếp lên GCS resumable URL.
   * GCS xác định vị trí chunk qua Content-Range header.
   * Không qua backend — gọi GCS endpoint trực tiếp.
   */
  uploadChunkDirect: async (resumableUrl, chunk, start, totalSize, onProgress, signal) => {
    const end = start + chunk.size - 1;
    return axios.put(resumableUrl, chunk, {
      signal,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      validateStatus: (status) => status === 200 || status === 201 || status === 308, // 308 = chunk nhận OK, chờ thêm
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const chunkPercent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(chunkPercent);
        }
      },
    });
  },

  /**
   * Hoàn tất: backend verify userId qua GCS metadata → tạo FileItem DB record.
   */
  complete: (data) =>
    api.post('/files/upload-chunk/complete', data),

  /**
   * Hỏi GCS đã nhận tới byte nào của phiên này.
   *
   * Đi vòng qua backend là CỐ Ý: câu trả lời nằm ở header `Range`, mà trình
   * duyệt chỉ đọc được header đó nếu bucket khai báo nó trong CORS. Backend
   * không bị ràng buộc ấy.
   *
   * Response: { expired, completed, receivedBytes }
   */
  status: (data) => api.post('/files/upload-chunk/status', data),
};

// Sharing APIs — Public share link & access management
export const sharingApi = {
  /** Lấy thông tin tệp qua token chia sẻ (không cần đăng nhập) */
  getSharedItem: (token) => api.get(`/shares/${token}`),
  /** Xác thực mật khẩu cho link chia sẻ công khai */
  verifySharePassword: (token, password) => api.post(`/shares/${token}/verify-password`, { password }),
  /** Sinh presigned preview URL (inline) qua token chia sẻ */
  getSharedPreviewUrl: (token, fileId, authToken) =>
    api.get(`/shares/${token}/preview-url`, {
      params: fileId ? { fileId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Sinh presigned download URL qua token chia sẻ */
  getSharedDownloadUrl: (token, fileId, authToken) =>
    api.get(`/shares/${token}/download-url`, {
      params: fileId ? { fileId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Lấy danh sách file/folder con trong thư mục được chia sẻ (không cần đăng nhập) */
  getSharedChildren: (token, folderId, authToken) =>
    api.get(`/shares/${token}/children`, {
      params: folderId ? { folderId } : {},
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    }),
  /** Tạo link chia sẻ công khai cho một tệp (yêu cầu đăng nhập) */
  createShareLink: (id, data) => api.post(`/files/${id}/share`, data),
  /** Lấy danh sách người được chia sẻ trực tiếp (yêu cầu đăng nhập) */
  getShareAccess: (id) => api.get(`/files/${id}/share-access`),
  /** Thêm quyền truy cập cho người dùng cụ thể (yêu cầu đăng nhập) */
  addShareAccess: (id, data) => api.post(`/files/${id}/share-access`, data),
  /** Thu hồi quyền truy cập của một người dùng (yêu cầu đăng nhập) */
  removeShareAccess: (id, userId) => api.delete(`/files/${id}/share-access/${userId}`),
};

// Admin APIs (SUPER_ADMIN only)
export const adminApi = {
  getUsers: (params = {}) => api.get('/admin/users', { params }),
  updateUserQuota: (id, storageLimitBytes) => api.patch(`/admin/users/${id}/quota`, { storageLimitBytes }),
  updateUserStatus: (id, isActive) => api.patch(`/admin/users/${id}/status`, { isActive }),
  getSystemAnalytics: () => api.get('/admin/analytics'),
};

// Shared Drives APIs
export const sharedDrivesApi = {
  create: (data) => api.post('/shared-drives', data),
  getAll: () => api.get('/shared-drives'),
  getOne: (id) => api.get(`/shared-drives/${id}`),
  // Đổi tên / sửa mô tả — chỉ ADMIN của drive. data: { name?, description? }
  update: (id, data) => api.patch(`/shared-drives/${id}`, data),
  // ⚠️ Xóa cả drive, kéo theo MỌI tệp/thư mục bên trong (FK ON DELETE CASCADE).
  // Chỉ người tạo drive gọi được. Trả về { deletedItems }.
  remove: (id) => api.delete(`/shared-drives/${id}`),
  // Dấu sao RIÊNG của từng người (lưu ở hàng shared_drive_members của người gọi, migration
  // 011): bật/tắt chỉ ảnh hưởng chính mình. Mọi role đều gọi được. Trả về { id, isStarred }
  // với `id` là id của DRIVE.
  toggleStar: (id) => api.patch(`/shared-drives/${id}/star`),
  // data: { email, role } — hoặc { userId, role } cho caller cũ
  addMember: (id, data) => api.post(`/shared-drives/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/shared-drives/${id}/members/${userId}`),
};

export default api;

