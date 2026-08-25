import { useSyncExternalStore } from 'react';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * useTheme — NGUỒN SỰ THẬT DUY NHẤT cho giao diện Sáng / Tối / Hệ thống
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Trước đây logic theme bị nhân bản ở 2 nơi: SettingsModal.jsx (3 lựa chọn
 * light/dark/system, khoá `driveR_settings_theme`) và RightSideBar.jsx (toggle
 * 2 trạng thái, khoá `theme`). Hai state React riêng biệt cùng ghi vào
 * <html class="dark"> nên bấm nút ở Sidebar rồi mở Cài đặt là thấy lệch nhau.
 *
 * File này gom cả hai luồng về một store nhỏ ở cấp module:
 *
 *   • MỘT state duy nhất  → `mode` ('light' | 'dark' | 'system')
 *   • MỘT khoá duy nhất   → THEME_KEY = 'driveR_settings_theme'
 *   • MỘT chỗ áp dụng     → applyTheme() ghi class `dark` lên <html>
 *
 * Mọi component subscribe qua useSyncExternalStore, nên đổi theme ở bất kỳ đâu
 * là TẤT CẢ nơi khác re-render ngay trong cùng một tick — không cần Provider,
 * không cần bọc thêm gì trong App.jsx.
 *
 * Cách dùng:
 *   const { mode, resolved, setMode, toggle } = useTheme();
 *
 * Lưu ý: class `dark` chỉ có tác dụng nhờ `@custom-variant dark` đã khai báo
 * trong src/index.css (Tailwind v4 mặc định chỉ theo prefers-color-scheme).
 */

// ── 1. Khoá localStorage ────────────────────────────────────────────────────

/** Khoá chuẩn: lưu LỰA CHỌN của người dùng, kể cả 'system' */
export const THEME_KEY = 'driveR_settings_theme';

/**
 * Khoá cũ của RightSideBar.jsx: chỉ lưu KẾT QUẢ đã quy đổi ('light' | 'dark').
 * Vẫn ghi tiếp để (a) migrate được lựa chọn cũ của người dùng đang có sẵn trên
 * máy, (b) script/đoạn CSS nào còn đọc khoá này không bị hỏng. Không đọc nó
 * làm nguồn chính nữa.
 */
const LEGACY_THEME_KEY = 'theme';

/** Các giá trị hợp lệ — trùng đúng với 3 nút trong SettingsModal.jsx */
export const THEME_MODES = ['light', 'dark', 'system'];

// ── 2. Truy cập localStorage an toàn ────────────────────────────────────────
// Chế độ ẩn danh / iframe bị chặn storage vẫn phải chạy được, chỉ là không nhớ.

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua: không lưu được thì phiên này vẫn dùng bình thường */
  }
}

// ── 3. Đọc / quy đổi / áp dụng ──────────────────────────────────────────────

/**
 * Media query của hệ điều hành — tạo MỘT lần ở cấp module.
 * Tạo mới mỗi lần gọi matchMedia() là nguyên nhân kinh điển làm listener
 * "theo hệ thống" không bao giờ chạy (đối tượng bị GC mất).
 */
const systemDarkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Đọc lựa chọn đã lưu; chưa có thì kế thừa khoá cũ, cuối cùng mới về 'system' */
export function readThemeMode() {
  const saved = safeGet(THEME_KEY);
  if (THEME_MODES.includes(saved)) return saved;

  // Người dùng từng bấm nút toggle ở RightSideBar trước khi có file này
  const legacy = safeGet(LEGACY_THEME_KEY);
  if (legacy === 'dark' || legacy === 'light') return legacy;

  return 'system';
}

/** Quy đổi lựa chọn của người dùng ra giao diện THỰC TẾ đang hiển thị */
export function resolveTheme(mode) {
  if (mode === 'system') return systemDarkQuery?.matches ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

/**
 * Điểm DUY NHẤT được phép chạm vào <html>. Ngoài class `dark` cho Tailwind,
 * còn set `color-scheme` để scrollbar và các control mặc định của trình duyệt
 * (checkbox, select trong SettingsModal) đổi màu theo, không bị trắng lốp.
 *
 * @returns {'light'|'dark'} giao diện vừa được áp dụng
 */
export function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;

  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  // Đồng bộ khoá cũ để không còn 2 nguồn dữ liệu lệch nhau
  safeSet(LEGACY_THEME_KEY, resolved);

  return resolved;
}

// ── 4. Store cấp module + đăng ký lắng nghe ─────────────────────────────────

let currentMode = readThemeMode();
let currentResolved = applyTheme(currentMode); // áp dụng ngay khi import, tránh nháy sáng
safeSet(THEME_KEY, currentMode); // chốt lại lựa chọn đã migrate từ khoá cũ

const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lấy lựa chọn của người dùng ('light' | 'dark' | 'system') */
export function getThemeMode() {
  return currentMode;
}

/** Lấy giao diện đang hiển thị thực tế ('light' | 'dark') */
export function getResolvedTheme() {
  return currentResolved;
}

/**
 * Đổi theme. Gọi từ bất cứ đâu (SettingsModal, RightSideBar, phím tắt…) —
 * state, localStorage và <html> luôn được cập nhật cùng nhau.
 */
export function setThemeMode(mode) {
  const next = THEME_MODES.includes(mode) ? mode : 'system';
  const nextResolved = applyTheme(next);

  // Không đổi gì thì đừng emit — tránh re-render vô ích
  if (next === currentMode && nextResolved === currentResolved) return;

  currentMode = next;
  currentResolved = nextResolved;
  safeSet(THEME_KEY, next);
  emit();
}

/**
 * Lật nhanh Sáng ⇄ Tối cho nút toggle ở RightSideBar.
 * Đang ở 'system' thì lật theo GIAO DIỆN ĐANG THẤY và chuyển sang lựa chọn
 * tường minh — đúng kỳ vọng của người dùng: bấm là đổi, không phải bấm 2 lần.
 */
export function toggleTheme() {
  setThemeMode(currentResolved === 'dark' ? 'light' : 'dark');
}

// OS đổi Sáng/Tối: chỉ ảnh hưởng khi người dùng đang chọn "Hệ thống".
// Listener gắn một lần, sống suốt vòng đời app nên không cần dọn.
if (systemDarkQuery) {
  const onSystemChange = () => {
    if (currentMode !== 'system') return;
    const nextResolved = applyTheme('system');
    if (nextResolved === currentResolved) return;
    currentResolved = nextResolved;
    emit();
  };

  if (typeof systemDarkQuery.addEventListener === 'function') {
    systemDarkQuery.addEventListener('change', onSystemChange);
  } else if (typeof systemDarkQuery.addListener === 'function') {
    systemDarkQuery.addListener(onSystemChange); // Safari < 14
  }
}

// Đổi theme ở tab khác của cùng trình duyệt → tab này đi theo.
// (Sự kiện `storage` chỉ bắn cho tab KHÁC, nên không sợ vòng lặp với setThemeMode.)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY) return;
    setThemeMode(THEME_MODES.includes(e.newValue) ? e.newValue : 'system');
  });
}

// ── 5. Hook cho component ───────────────────────────────────────────────────

/**
 * @returns {{
 *   mode: 'light'|'dark'|'system',
 *   resolved: 'light'|'dark',
 *   isDark: boolean,
 *   setMode: (mode: 'light'|'dark'|'system') => void,
 *   toggle: () => void,
 * }}
 */
export default function useTheme() {
  // Hai snapshot tách riêng và đều là chuỗi nguyên thủy — trả về object mới ở
  // getSnapshot sẽ làm useSyncExternalStore lặp vô hạn.
  const mode = useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
  const resolved = useSyncExternalStore(subscribe, getResolvedTheme, getResolvedTheme);

  return {
    mode,
    resolved,
    isDark: resolved === 'dark',
    setMode: setThemeMode,
    toggle: toggleTheme,
  };
}
