/**
 * uploadTree — thu thập danh sách tệp + cây thư mục từ hai nguồn khác nhau,
 * rồi trả về CÙNG một shape để FileContext.uploadEntries xử lý chung:
 *
 *   { entries: [{ file, relativePath }], dirPaths: string[] }
 *
 * Hai nguồn:
 *  1. `<input type="file" webkitdirectory>` — người dùng chọn MỘT thư mục
 *     (giới hạn của trình duyệt: hộp thoại của OS không cho quét chọn nhiều
 *     thư mục cùng lúc khi input có `webkitdirectory`).
 *  2. Kéo–thả (DataTransfer) — đường DUY NHẤT để nhận NHIỀU thư mục trong một
 *     thao tác. Phải đi qua `webkitGetAsEntry()` rồi đệ quy `createReader()`;
 *     `dataTransfer.files` bỏ trắng mọi thư mục nên trước đây thả folder vào
 *     app không có gì xảy ra.
 */

/** Chặn trường hợp thả cả ổ đĩa vào app — tránh treo tab vì đệ quy vô hạn */
export const MAX_UPLOAD_ENTRIES = 5000;

function readEntriesOnce(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/**
 * Đọc hết một thư mục: `readEntries()` chỉ trả tối đa ~100 mục mỗi lần gọi nên
 * phải gọi lặp đến khi trả về mảng rỗng.
 *
 * Dùng vòng lặp `await` chứ KHÔNG đệ quy trong callback: thư mục vài nghìn tệp
 * mà callback được gọi đồng bộ sẽ làm tràn ngăn xếp.
 */
async function readAllDirectoryEntries(reader) {
  const collected = [];
  for (;;) {
    const batch = await readEntriesOnce(reader);
    if (!batch || batch.length === 0) break;
    collected.push(...batch);
  }
  return collected;
}

function fileFromEntry(entry) {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

async function walkEntry(entry, parentPath, acc) {
  if (!entry || acc.entries.length >= MAX_UPLOAD_ENTRIES) return;

  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    if (file) acc.entries.push({ file, relativePath: path });
    return;
  }

  if (entry.isDirectory) {
    // Ghi lại cả thư mục rỗng — kéo–thả biết được điều mà input không biết
    acc.dirPaths.add(path);
    const children = await readAllDirectoryEntries(entry.createReader()).catch(() => []);
    for (const child of children) {
      await walkEntry(child, path, acc);
    }
  }
}

/**
 * Thu thập từ một sự kiện drop. Hỗ trợ thả LẪN LỘN nhiều thư mục và nhiều tệp.
 *
 * LƯU Ý: `webkitGetAsEntry()` phải được gọi ĐỒNG BỘ trong handler — sau `await`
 * đầu tiên thì `dataTransfer.items` đã bị trình duyệt thu hồi. Vì vậy hàm này
 * lấy toàn bộ entry ra mảng trước, rồi mới đi đệ quy.
 */
export async function collectDropEntries(dataTransfer) {
  const acc = { entries: [], dirPaths: new Set() };
  if (!dataTransfer) return { entries: [], dirPaths: [] };

  const items = Array.from(dataTransfer.items || []);
  const rootEntries = items
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (rootEntries.length === 0) {
    // Trình duyệt không hỗ trợ Entry API → chỉ nhận được tệp phẳng
    return {
      entries: Array.from(dataTransfer.files || []).map((file) => ({
        file,
        relativePath: file.name,
      })),
      dirPaths: [],
    };
  }

  for (const entry of rootEntries) {
    await walkEntry(entry, '', acc);
  }

  return { entries: acc.entries, dirPaths: Array.from(acc.dirPaths) };
}

/**
 * Thu thập từ `input.files`. Dùng cho cả input thường (`multiple`) và input
 * thư mục (`webkitdirectory` → mỗi File có `webkitRelativePath`).
 */
export function collectInputEntries(fileList) {
  const files = Array.from(fileList || []);
  const dirPaths = new Set();

  const entries = files.slice(0, MAX_UPLOAD_ENTRIES).map((file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      dirPaths.add(parts.slice(0, depth).join('/'));
    }
    return { file, relativePath };
  });

  return { entries, dirPaths: Array.from(dirPaths) };
}

/**
 * Danh sách thư mục cần tạo trên server, đã sắp xếp NÔNG → SÂU (cha trước con)
 * — thứ tự này là điều kiện để `batchCreateFolders` resolve được parentId.
 */
export function buildSortedDirPaths({ entries = [], dirPaths = [] }) {
  const all = new Set(dirPaths);

  entries.forEach(({ relativePath }) => {
    const parts = relativePath.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      all.add(parts.slice(0, depth).join('/'));
    }
  });

  return Array.from(all).sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });
}
