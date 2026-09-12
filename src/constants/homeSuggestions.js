// ─────────────────────────────────────────────────────────────────────────────
// "Không phải mục đề xuất hữu ích" — danh sách mục đã ẩn khỏi Trang chủ
// ─────────────────────────────────────────────────────────────────────────────
//
// Dòng lệnh này đã tồn tại trong `ContextMenu.jsx` từ lâu (nhánh
// `activeTab === 'home'`) nhưng gọi vào `onDismissSuggestion?.(item)` — một prop
// KHÔNG trang nào truyền vào. Optional chaining nuốt luôn cú gọi, nên bấm thì
// menu đóng lại và không có gì xảy ra, cũng không có lỗi nào trong console để
// lần ra. Module này là nửa còn thiếu.
//
// LƯU THUẦN CLIENT, và đó là chủ ý chứ không phải nợ kỹ thuật: "tôi không thấy
// mục này hữu ích ở trang chủ" là một sở thích hiển thị của MỘT người trên MỘT
// trình duyệt, không phải dữ liệu của tệp. Bảng `files` không có cột nào cho nó
// (và thêm cột thì phải kèm migration — xem ##8 trong .ai/task-ledger.md), còn
// mất danh sách này khi đổi máy thì hậu quả đúng bằng việc thấy lại vài mục cũ
// trên trang chủ.
//
// KHOÁ THEO TỪNG NGƯỜI DÙNG. localStorage dùng chung cho mọi tài khoản từng đăng
// nhập trên cùng origin; một khoá duy nhất nghĩa là A ẩn một tệp thì B đăng nhập
// vào cũng mất một mục ở trang chủ — mà tệp đó B còn chẳng nhìn thấy bao giờ.
//
// Cùng quy ước đặt tên với PRIVACY_* (constants/privacy.js) và STARTUP_PAGE_KEY
// (constants/routes.js): hằng số ở một chỗ, không gõ chuỗi thẳng trong component.

const PREFIX = 'driveR_home_dismissed_';

// Trần số mục nhớ. Danh sách chỉ được thêm vào, không có gì dọn nó: mỗi mục ẩn
// đi là một chuỗi uuid 36 ký tự nằm lại vĩnh viễn trong localStorage (giới hạn
// ~5 MB cho cả origin, dùng chung với cache thumbnail và trạng thái upload dở).
// Quá trần thì bỏ mục ẩn LÂU NHẤT — mục cũ nhất cũng là mục ít khả năng còn tồn
// tại nhất, và hậu quả tệ nhất của việc bỏ nhầm chỉ là nó hiện lại ở trang chủ.
const MAX_DISMISSED = 300;

/** Người chưa đăng nhập không có gì để nhớ — trả null để mọi hàm dưới thành no-op. */
const keyFor = (userId) => (userId ? `${PREFIX}${userId}` : null);

/**
 * Các id đang bị ẩn khỏi Trang chủ, dạng Set để lọc trong vòng lặp render.
 * Mọi đường hỏng (trình duyệt chặn storage, JSON rác do sửa tay) đều về Set rỗng:
 * đọc hỏng thì hiện thừa vài mục, còn ném lỗi thì mất cả trang chủ.
 */
export function readDismissedSuggestions(userId) {
  const key = keyFor(userId);
  if (!key) return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Ghi đè cả danh sách. Trả về chính Set đã ghi để chỗ gọi đưa thẳng vào setState. */
function writeDismissedSuggestions(userId, ids) {
  const key = keyFor(userId);
  if (!key) return ids;
  try {
    // `slice(-MAX)` chứ không `slice(0, MAX)`: thứ tự trong mảng là thứ tự ẩn,
    // nên phần đuôi mới là phần mới nhất — cắt đầu mảng là bỏ mục cũ nhất.
    localStorage.setItem(key, JSON.stringify([...ids].slice(-MAX_DISMISSED)));
  } catch {
    // Hết chỗ hoặc storage bị chặn: lựa chọn chỉ sống trong phiên này. Không có
    // gì để nói với người dùng — thứ họ vừa bấm vẫn biến mất đúng như mong đợi.
  }
  return ids;
}

/** Ẩn một mục. Trả về Set MỚI (không sửa tại chỗ) để React nhận ra thay đổi. */
export function dismissSuggestion(userId, itemId, current) {
  const next = new Set(current);
  next.add(itemId);
  return writeDismissedSuggestions(userId, next);
}

/** Bỏ ẩn toàn bộ — lối ra cho người lỡ tay, và cho người đổi ý sau vài tháng. */
export function clearDismissedSuggestions(userId) {
  const key = keyFor(userId);
  if (key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Xoá không được thì lần F5 sau danh sách cũ quay lại. Không đáng chặn UI.
    }
  }
  return new Set();
}
