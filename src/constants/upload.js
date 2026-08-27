/**
 * Hằng số dùng chung của luồng tải lên.
 *
 * Ngưỡng này quyết định tệp đi đường nào, và cả hai bên đều cần biết:
 *  - FileContext dùng nó để chọn giữa "PUT một phát" và "chunked resumable";
 *  - bảng tiến trình dùng nó để biết tệp này có tạm dừng / tải tiếp được không.
 *
 * Chỉ tệp lớn hơn ngưỡng mới có phiên trên GCS để quay lại, nên chỉ chúng mới
 * được mời "Tạm dừng" — mời với tệp nhỏ là hứa một thứ không làm được.
 */
export const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10MB

/** Tệp này có tạm dừng / tải tiếp được không */
export const isResumableSize = (sizeBytes) => Number(sizeBytes || 0) > CHUNK_THRESHOLD;
