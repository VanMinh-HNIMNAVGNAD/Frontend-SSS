/**
 * Hộp thoại kính thay cho `window.alert` / `confirm` / `prompt` (26/10/2026).
 *
 * Hộp thoại gốc của trình duyệt là khung xám của hệ điều hành nằm giữa một giao diện kính mờ —
 * lệch hẳn tông, nút "OK"/"Cancel" theo ngôn ngữ của trình duyệt chứ không theo app, và chặn cả
 * luồng JS. Ở đây cùng ba hàm đó nhưng trả về Promise:
 *
 *   if (!(await confirmDialog({ message, danger: true }))) return;
 *   const name = await promptDialog({ message, defaultValue });   // null = bấm Huỷ
 *   await alertDialog(message);
 *
 * Gọi được từ bất cứ đâu (callback, hàm ngoài component) — giống `toast()`: kho nhỏ ở cấp module
 * này, một <DialogHost/> (components/ui/DialogHost.jsx) ở App.jsx vẽ hộp đang chờ. Nhiều hộp cùng
 * lúc thì xếp hàng, hiện lần lượt.
 *
 * `opts` là chuỗi (chỉ có lời nhắn) hoặc
 * { title, message, confirmLabel, cancelLabel, danger, defaultValue, placeholder }.
 */

let queue = [];
let seq = 0;
const listeners = new Set();

export function subscribeDialogs(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const getDialogQueue = () => queue;

function open(kind, opts) {
    const options = typeof opts === 'string' ? { message: opts } : { ...opts };
    return new Promise((resolve) => {
        queue = [...queue, { ...options, id: ++seq, kind, resolve }];
        listeners.forEach((listener) => listener());
    });
}

/** Đóng hộp `id` và trả `value` cho nơi đang `await` nó. */
export function settleDialog(id, value) {
    const dialog = queue.find((d) => d.id === id);
    queue = queue.filter((d) => d.id !== id);
    listeners.forEach((listener) => listener());
    dialog?.resolve(value);
}

/** @returns {Promise<boolean>} */
export const confirmDialog = (opts) => open('confirm', opts);
/** @returns {Promise<void>} */
export const alertDialog = (opts) => open('alert', opts);
/** @returns {Promise<string|null>} null khi người dùng huỷ */
export const promptDialog = (opts) => open('prompt', opts);
