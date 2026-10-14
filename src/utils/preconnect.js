import { safeLocalStorage } from './safeStorage';

/**
 * Mở SẴN kết nối (DNS + TCP + TLS) tới CDN thumbnail ngay lúc app khởi động (##85).
 *
 * Thumbnail chỉ được xin SAU khi `/auth/refresh` → `/files` trả về, tức 2–3 lượt đi-về sau
 * lúc trang chạy. Bắt tay với một origin mới tốn thêm 2–3 lượt đi-về nữa (đo từ VN: TCP ~25ms,
 * TLS ~45ms trên mạng tốt; 4G gấp vài lần) — làm sẵn từ đầu thì lúc danh sách về, đường tới CDN
 * đã mở và ô đầu tiên hiện ngay.
 *
 * Origin của CDN không biết được lúc build (nó nằm trong `thumbUrls` backend trả về), nên NHỚ
 * nó từ phiên trước. Máy lần đầu vào thì chưa có gì để mở trước — không sao, chỉ là như cũ.
 *
 * Backend thì mở sẵn ngay trong `index.html` (plugin trong `vite.config.js`) vì địa chỉ của
 * nó có sẵn lúc build và nó là request ĐẦU TIÊN của trang.
 */
const CDN_ORIGIN_KEY = 'cloudsss.cdnOrigin';

/** Chỉ nhận đúng dạng `https://host[:port]` — giá trị đọc từ storage không được tin mù. */
const ORIGIN_PATTERN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;

let rememberedOrigin = null;

function addPreconnect(origin) {
  if (typeof document === 'undefined' || !document.head) return;
  const exists = [...document.head.querySelectorAll('link[rel="preconnect"]')].some(
    (link) => link.href.replace(/\/$/, '') === origin,
  );
  if (exists) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  // KHÔNG đặt `crossorigin`: thumbnail nạp bằng `<img>`/`new Image()` không `crossOrigin`,
  // tức request có kèm thông tin xác thực — kết nối mở sẵn phải cùng loại đó, nếu không trình
  // duyệt mở một kết nối thứ hai và cái mở sẵn bị bỏ phí.
  link.href = origin;
  document.head.appendChild(link);
}

/** Ghi nhớ origin của một URL thumbnail trên CDN. Rẻ: mỗi phiên ghi storage tối đa một lần. */
export function rememberCdnOrigin(url) {
  if (!url) return;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (origin === rememberedOrigin || !ORIGIN_PATTERN.test(origin)) return;
  rememberedOrigin = origin;
  if (safeLocalStorage.getItem(CDN_ORIGIN_KEY) !== origin) {
    safeLocalStorage.setItem(CDN_ORIGIN_KEY, origin);
  }
}

/**
 * Gọi một lần lúc khởi động. Chỉ mở khi đang có phiên đăng nhập: khách ở trang đăng nhập hay
 * trang chia sẻ công khai không xem lưới thumbnail nào, mở kết nối cho họ là phí.
 */
export function preconnectRememberedCdn() {
  if (!safeLocalStorage.getItem('accessToken')) return;
  const origin = safeLocalStorage.getItem(CDN_ORIGIN_KEY);
  if (origin && ORIGIN_PATTERN.test(origin)) addPreconnect(origin);
}
