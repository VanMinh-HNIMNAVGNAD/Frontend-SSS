/**
 * Tự cứu khi một chunk JS của bản build CŨ không còn trên server.
 *
 * Mỗi lần Vercel deploy, tên các chunk đổi theo hash. Tab mở từ trước đó vẫn chạy
 * `index-<hash cũ>.js` và đòi `TrashPage-<hash cũ>.js` khi người dùng bấm sang màn
 * lazy — tệp ấy không còn nữa. Đo 02/10/2026: không có cơ chế này thì `#root` rỗng,
 * người dùng nhìn một trang trắng và không có nút nào để bấm (ledger ##64).
 *
 * Cách chữa duy nhất đúng là TẢI LẠI TRANG để lấy `index.html` của bản mới. Chỉ tải
 * lại MỘT lần trong một khoảng ngắn: nếu chunk vẫn hỏng sau khi tải lại (CDN chập,
 * mất mạng) thì lặp vô hạn còn tệ hơn trang lỗi có nút "Tải lại".
 */

const RELOAD_KEY = 'cloudsss.chunkReloadAt';
/** Hai lần tải lại cách nhau ít hơn mức này = lần trước đã không cứu được. */
const RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Expected a JavaScript.*module script/i, // server trả HTML thay cho JS
  /Unable to preload CSS/i, // Vite: CSS của chunk lazy
  /ChunkLoadError/i,
];

/** Lỗi này có phải "không tải được chunk" không (khác với lỗi render thật). */
export function isChunkLoadError(error) {
  if (!error) return false;
  const text = `${error.name ?? ''} ${error.message ?? String(error)}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function readLastReload() {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return null; // storage bị chặn: không đánh dấu được thì không tự tải lại
  }
}

/**
 * Tải lại trang nếu chưa vừa tải lại vì cùng lý do. Trả `true` khi đã ra lệnh tải lại
 * (nơi gọi đừng hiện lỗi nữa), `false` khi phải để người dùng tự quyết.
 */
export function reloadOnceForNewVersion() {
  const last = readLastReload();
  if (last === null || Date.now() - last < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Vite phát `vite:preloadError` khi nạp trước chunk (JS/CSS) của một `import()` hỏng.
 * Gọi `preventDefault()` thì lỗi không bị ném tiếp — chỉ làm vậy khi đã tải lại trang.
 */
export function installChunkErrorRecovery() {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewVersion()) event.preventDefault();
  });
}
