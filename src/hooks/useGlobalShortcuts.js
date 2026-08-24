import { useEffect, useRef } from 'react';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * useGlobalShortcuts — Hệ thống phím tắt toàn cục cho driveR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hook lắng nghe `keydown` ở cấp `window` và ánh xạ tổ hợp phím sang các
 * callback do nơi gọi truyền vào. Bản thân hook KHÔNG biết gì về FileContext —
 * mọi nghiệp vụ (tạo thư mục, upload, xoá…) đều nằm ở layout gọi nó, nên hook
 * có thể tái sử dụng ở bất kỳ màn hình nào.
 *
 * ── ĐA NỀN TẢNG: WINDOWS / LINUX / MACOS ───────────────────────────────────
 * Tổ hợp chính theo yêu cầu nghiệp vụ là Ctrl + Meta (Meta = Win / Super / ⌘).
 * Nhưng mỗi hệ điều hành "ăn" phím theo cách riêng, nên mỗi hành động còn có
 * tổ hợp dự phòng để người dùng không bị kẹt:
 *
 *   Windows  Shell giữ Win+N/S/U/K/R cho hệ thống. Thêm Ctrl thì RegisterHotKey
 *            không khớp nữa nên Ctrl+Win+<phím> vẫn tới được trình duyệt —
 *            RIÊNG Ctrl+Win+D/F4/←/→ đã bị Virtual Desktop chiếm, ta không dùng.
 *            Dự phòng: Ctrl + Alt + <phím>, và F2 để đổi tên (chuẩn Explorer).
 *   Linux    Trình quản lý cửa sổ (GNOME/KDE) hay bắt phím Super. Ctrl+Super
 *            thường còn trống, nhưng vẫn nên có Ctrl+Alt + F2 dự phòng.
 *            TUYỆT ĐỐI không dùng Ctrl+Alt+Backspace (X11: kill server) và
 *            Ctrl+Alt+Delete (đăng xuất / SAS trên Windows).
 *   macOS    Không có phím Delete-tiến trên đa số bàn phím: phím ⌫ trả về
 *            `key === 'Backspace'`. Vì vậy dùng ⌘ + ⌫ theo đúng thói quen
 *            Finder. Không đăng ký Ctrl + ⌥ trên macOS vì đó là tổ hợp
 *            điều khiển của VoiceOver (VO key) — tránh giẫm chân trợ năng.
 *
 * @param {Object} handlers
 * @param {() => void} [handlers.onNewFolder]
 * @param {() => void} [handlers.onUploadFile]
 * @param {() => void} [handlers.onFocusSearch]
 * @param {() => void} [handlers.onRename]
 * @param {() => void} [handlers.onToggleStar]
 * @param {() => void} [handlers.onMoveToTrash]
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] Tạm tắt phím tắt (vd: đang mở modal)
 */

// Khoá localStorage do SettingsModal.jsx ghi — giữ đúng tên để 2 nơi không lệch
export const SHORTCUTS_ENABLED_KEY = 'driveR_settings_shortcuts_enabled';

// ── 1. Nhận diện hệ điều hành ───────────────────────────────────────────────

/** @returns {'mac'|'windows'|'linux'|'unknown'} */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  // userAgentData là nguồn chuẩn xác nhất (Chromium), navigator.platform đã
  // bị deprecate nhưng vẫn là fallback duy nhất trên Firefox/Safari cũ.
  const haystack = [
    navigator.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Kiểm tra macOS trước: UA của macOS không chứa "win" nên không sợ nhầm
  if (/mac|iphone|ipad|ipod/.test(haystack)) return 'mac';
  if (/win/.test(haystack)) return 'windows';
  if (/linux|x11|cros|android/.test(haystack)) return 'linux';
  return 'unknown';
}

export const PLATFORM = detectPlatform();
export const IS_MAC = PLATFORM === 'mac';

/** Tên hệ điều hành để hiển thị trong màn hình Cài đặt */
export const PLATFORM_LABEL = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  unknown: 'Không rõ',
}[PLATFORM];

// Nhãn phím bổ trợ đúng theo cách gọi của từng hệ điều hành
const MOD_LABELS = {
  mac: { ctrl: 'Ctrl', meta: '⌘', alt: '⌥' },
  windows: { ctrl: 'Ctrl', meta: 'Win', alt: 'Alt' },
  linux: { ctrl: 'Ctrl', meta: 'Super', alt: 'Alt' },
  unknown: { ctrl: 'Ctrl', meta: 'Meta', alt: 'Alt' },
}[PLATFORM];

/** Phím "lệnh" quen thuộc của nền tảng: ⌘ trên macOS, Ctrl ở nơi khác */
export const PRIMARY_MOD_LABEL = IS_MAC ? MOD_LABELS.meta : MOD_LABELS.ctrl;

// ── 2. Điều kiện bật/tắt & ngữ cảnh gõ phím ─────────────────────────────────

/** Người dùng có bật phím tắt trong Cài đặt không? Chưa từng lưu = bật. */
export function areShortcutsEnabled() {
  try {
    return localStorage.getItem(SHORTCUTS_ENABLED_KEY) !== 'false';
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh / iframe) → mặc định bật
    return true;
  }
}

/** Con trỏ đang nằm trong ô nhập liệu? Nếu có thì nhường phím cho người dùng gõ. */
function isTypingContext(event) {
  const nodes = [event.target, document.activeElement];
  return nodes.some((node) => {
    if (!node || typeof node.tagName !== 'string') return false;
    const tag = node.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    // Bắt cả contenteditable lồng nhau (vd: trình soạn thảo rich text)
    return Boolean(node.isContentEditable) || Boolean(node.closest?.('[contenteditable="true"]'));
  });
}

// ── 3. So khớp tổ hợp phím ──────────────────────────────────────────────────

/**
 * So khớp phím theo cả `code` (vị trí phím vật lý — không phụ thuộc layout bàn
 * phím) lẫn `key` (ký tự thực tế). Khi giữ Meta, một số trình duyệt trả về
 * `key` bất thường nên `code` là chốt chặn đáng tin hơn.
 * Với phím ký hiệu (vd: `/`) thì bỏ `code` vì trên AZERTY/QWERTZ cùng một
 * `code` lại sinh ra ký tự khác.
 */
function matchKey(event, key, code) {
  if (code && event.code === code) return true;
  return typeof event.key === 'string' && event.key.toLowerCase() === key.toLowerCase();
}

const MOD_TESTS = {
  // Ctrl + Meta (Win / Super / ⌘) — tổ hợp chính theo yêu cầu
  'ctrl+meta': (e) => e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey,
  // Dự phòng cho Windows/Linux khi WM nuốt phím Meta
  'ctrl+alt': (e) => e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey,
  // Ctrl trên Windows/Linux, ⌘ trên macOS (chấp nhận cả hai cùng lúc)
  'ctrl-or-meta': (e) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey,
  // Chỉ Meta — dùng cho ⌘ + ⌫ kiểu Finder
  meta: (e) => e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey,
  // Không giữ modifier "lệnh" nào; vẫn cho phép Shift vì trên vài layout
  // ký tự `/` phải bấm kèm Shift
  none: (e) => !e.ctrlKey && !e.metaKey && !e.altKey,
  // Phím trần tuyệt đối — dùng cho Delete để Shift+Delete không kích hoạt
  bare: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey,
};

/**
 * Bảng phím tắt khai báo. Mỗi combo có thể giới hạn nền tảng bằng `only`/`not`.
 * `name: null` = hành động do nơi khác xử lý, ở đây chỉ để hiển thị trong
 * bảng Cài đặt cho đủ (tránh việc bảng và thực tế lệch nhau).
 */
const SHORTCUT_DEFINITIONS = [
  {
    name: 'onNewFolder',
    label: 'Tạo thư mục mới',
    combos: [
      { mods: 'ctrl+meta', key: 'n', code: 'KeyN' },
      { mods: 'ctrl+alt', key: 'n', code: 'KeyN', not: ['mac'] },
    ],
  },
  {
    name: 'onUploadFile',
    label: 'Tải tệp lên Cloud',
    combos: [
      { mods: 'ctrl+meta', key: 'u', code: 'KeyU' },
      { mods: 'ctrl+alt', key: 'u', code: 'KeyU', not: ['mac'] },
    ],
  },
  {
    name: 'onFocusSearch',
    label: 'Nhảy nhanh tới thanh Tìm kiếm',
    combos: [
      { mods: 'ctrl+meta', key: 'k', code: 'KeyK' },
      // Ctrl + K (Windows/Linux) và ⌘ + K (macOS)
      { mods: 'ctrl-or-meta', key: 'k', code: 'KeyK' },
      // Phím `/` — lối thoát khi Firefox giữ Ctrl+K cho ô tìm kiếm của nó
      { mods: 'none', key: '/' },
    ],
  },
  {
    name: 'onRename',
    label: 'Đổi tên tệp (Rename)',
    combos: [
      { mods: 'ctrl+meta', key: 'r', code: 'KeyR' },
      { mods: 'ctrl+alt', key: 'r', code: 'KeyR', not: ['mac'] },
      // F2 là chuẩn đổi tên của Windows Explorer / Nautilus / Dolphin
      { mods: 'none', key: 'f2', code: 'F2', not: ['mac'] },
    ],
  },
  {
    name: 'onToggleStar',
    label: 'Bật / Tắt đánh dấu sao (Star)',
    combos: [
      { mods: 'ctrl+meta', key: 's', code: 'KeyS' },
      { mods: 'ctrl+alt', key: 's', code: 'KeyS', not: ['mac'] },
    ],
  },
  {
    name: 'onMoveToTrash',
    label: 'Chuyển tệp/thư mục được chọn vào Thùng rác',
    combos: [
      { mods: 'ctrl+meta', key: 'backspace', code: 'Backspace' },
      // macOS: ⌘ + ⌫ đúng thói quen Finder (Mac không có phím Delete-tiến)
      { mods: 'meta', key: 'backspace', code: 'Backspace', only: ['mac'] },
      { mods: 'bare', key: 'delete', code: 'Delete', not: ['mac'] },
      // KHÔNG thêm Ctrl+Alt+Backspace (X11 kill server) hay Ctrl+Alt+Delete
      // (Secure Attention Sequence của Windows) — hệ điều hành chiếm trước.
    ],
  },
  {
    // Do FileContext.jsx xử lý sẵn, liệt kê ở đây để bảng Cài đặt đầy đủ
    name: null,
    label: 'Sao chép / Cắt / Dán mục đã chọn',
    staticHint: `${PRIMARY_MOD_LABEL} + C / X / V`,
  },
];

/** Combo này có áp dụng cho hệ điều hành đang chạy không? */
function isComboForThisPlatform(combo) {
  if (combo.only && !combo.only.includes(PLATFORM)) return false;
  if (combo.not && combo.not.includes(PLATFORM)) return false;
  return true;
}

// Danh sách phẳng dùng để so khớp — chỉ gồm combo hợp lệ trên nền tảng hiện tại
const ACTIVE_SHORTCUTS = SHORTCUT_DEFINITIONS.filter((def) => def.name && def.combos).flatMap((def) =>
  def.combos.filter(isComboForThisPlatform).map((combo) => ({
    name: def.name,
    test: (e) => MOD_TESTS[combo.mods](e) && matchKey(e, combo.key, combo.code),
  })),
);

/**
 * Tra xem một sự kiện bàn phím ứng với hành động nào trên nền tảng hiện tại.
 * Tách riêng khỏi hook để có thể kiểm thử độc lập, không cần render React.
 * @returns {string|null} tên handler (vd 'onNewFolder') hoặc null nếu không khớp
 */
export function resolveShortcut(event) {
  return ACTIVE_SHORTCUTS.find((shortcut) => shortcut.test(event))?.name || null;
}

// ── 4. Nhãn hiển thị cho màn hình Cài đặt ───────────────────────────────────

const KEY_LABELS = {
  backspace: IS_MAC ? '⌫' : 'Backspace',
  delete: 'Delete',
  f2: 'F2',
};

function formatKeyLabel(key) {
  return KEY_LABELS[key] || (key.length === 1 ? key.toUpperCase() : key);
}

function formatCombo(combo) {
  const parts = [];
  if (combo.mods === 'ctrl+meta') parts.push(MOD_LABELS.ctrl, MOD_LABELS.meta);
  else if (combo.mods === 'ctrl+alt') parts.push(MOD_LABELS.ctrl, MOD_LABELS.alt);
  else if (combo.mods === 'ctrl-or-meta') parts.push(PRIMARY_MOD_LABEL);
  else if (combo.mods === 'meta') parts.push(MOD_LABELS.meta);
  parts.push(formatKeyLabel(combo.key));
  return parts.join(' + ');
}

/**
 * Bảng phím tắt đã format sẵn theo hệ điều hành hiện tại.
 * SettingsModal.jsx dùng trực tiếp mảng này để hiển thị — không hardcode nữa,
 * nên bảng trong Cài đặt luôn khớp với phím thật sự đang lắng nghe.
 */
export const SHORTCUT_HINTS = SHORTCUT_DEFINITIONS.map((def) => {
  // `keys`: từng tổ hợp là một chip <kbd> riêng để dòng dài tự xuống hàng
  const keys = def.staticHint
    ? [def.staticHint]
    : def.combos.filter(isComboForThisPlatform).map(formatCombo);
  return {
    label: def.label,
    keys,
    key: keys.join('  hoặc  '), // chuỗi gộp, giữ cho nơi nào chỉ cần 1 dòng
  };
});

// ── 5. Hook ─────────────────────────────────────────────────────────────────

export default function useGlobalShortcuts(handlers = {}, options = {}) {
  const { enabled = true } = options;

  // Giữ handler trong ref để listener chỉ đăng ký MỘT lần, không gỡ/gắn lại
  // mỗi lần component cha re-render (handler thường là arrow function mới).
  // Đồng bộ trong useEffect — không ghi ref lúc render (quy tắc react-hooks/refs).
  const handlersRef = useRef(handlers);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    handlersRef.current = handlers;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 1. Nơi gọi tạm tắt (vd: đang mở modal chặn thao tác)
      if (!enabledRef.current) return;

      // 2. Bỏ qua auto-repeat khi giữ phím và sự kiện IME đang gõ tiếng Việt
      if (event.repeat || event.isComposing || event.keyCode === 229) return;

      // 3. Đang gõ trong input/textarea/contenteditable → không cướp phím
      if (isTypingContext(event)) return;

      // 4. Component con đã xử lý phím này rồi (vd: FileListView xử lý Delete
      //    trên hàng đang focus) → không làm lần hai, tránh thao tác nhân đôi
      if (event.defaultPrevented) return;

      // 5. Người dùng đã tắt phím tắt trong Cài đặt
      if (!areShortcutsEnabled()) return;

      const action = resolveShortcut(event);
      if (!action) return;

      const handler = handlersRef.current?.[action];
      if (typeof handler !== 'function') return;

      // Chặn hành vi mặc định của trình duyệt (Ctrl+S lưu trang, Ctrl+R tải lại…)
      event.preventDefault();
      event.stopPropagation();

      try {
        handler(event);
      } catch (err) {
        console.error(`Lỗi khi chạy phím tắt "${action}":`, err);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // listener ổn định — dữ liệu mới đọc qua ref
}
