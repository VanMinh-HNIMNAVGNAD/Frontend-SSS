/**
 * fileColors.js — Bảng màu trung tâm cho file/folder.
 *
 * Quy tắc ưu tiên:
 *   1. item.customColor (người dùng tự chọn, lưu DB)  → dùng ngay
 *   2. Không có customColor → tính màu mặc định theo extension/loại
 *
 * Hàm getDefaultColor() trả về màu HEX (không phải Tailwind class) để
 * dùng được cả ở chỗ cần inline style lẫn chỗ muốn so sánh với picker.
 *
 * Màu tham chiếu ngôn ngữ lập trình:
 *   Java      — đỏ (#EF4444)         (logo Oracle/Java màu đỏ cam)
 *   Python    — vàng (#EAB308)        (logo Python vàng + xanh → dùng vàng làm chủ đạo)
 *   JS/JSX    — vàng nhạt (#FACC15)   (logo JS nền vàng)
 *   TS/TSX    — xanh biển (#3B82F6)   (logo TypeScript)
 *   Go        — xanh cyan (#06B6D4)   (logo Go)
 *   Rust      — cam (#F97316)         (logo Rust màu cam)
 *   C/C++     — xanh đậm (#1D4ED8)   (icon C++)
 *   C#        — tím (#8B5CF6)         (logo C# .NET)
 *   Ruby      — đỏ (#DC2626)          (logo Ruby)
 *   PHP       — indigo (#6366F1)      (logo PHP)
 *   Kotlin    — tím violet (#7C3AED)  (logo Kotlin gradient)
 *   Swift     — cam (#EA580C)         (logo Swift)
 *   Dart      — xanh trời (#0284C7)   (logo Dart/Flutter)
 *   Shell     — xanh lá (#16A34A)     (terminal xanh)
 *   Lua       — xanh biển nhạt (#60A5FA)
 *   SQL/DB    — emerald (#059669)     (database)
 *   JSON/YAML — amber (#D97706)       (config file)
 *   HTML      — cam (#F97316)         (logo HTML5)
 *   CSS/SCSS  — hồng (#EC4899)        (style = pink)
 *   MD        — indigo (#4F46E5)      (markdown)
 */

// ─── Màu mặc định ────────────────────────────────────────────
export const DEFAULT_FOLDER_COLOR = '#6B7280'; // gray-500 — xám trung tính
export const DEFAULT_FILE_COLOR   = '#0EA5E9'; // sky-500  — xanh da trời nhạt

/**
 * Đơn sắc (26/10/2026): tệp/thư mục CHƯA tự chọn màu là kính xám trung tính — nền, viền, tên, nhãn
 * đuôi đều theo màu này. Màu theo loại tệp (bảng bên dưới) chỉ còn ở ICON, và đã bị rút bớt độ bão
 * hoà (`TYPE_TINT_SATURATION`): một lưới 30 tệp trước đây là 30 mảng đỏ/tím/vàng/xanh, nay chỉ còn
 * những chấm màu dịu đủ để nhận ra PDF hay ảnh. Màu người dùng TỰ CHỌN (customColor) vẫn tô cả thẻ
 * như cũ — đó là lựa chọn có chủ ý của họ.
 */
const NEUTRAL_CARD_COLOR = '#71717A'; // zinc-500 — cùng thang xám của app (index.css)
const TYPE_TINT_SATURATION = 0.38;

// ─── Map extension → màu HEX ─────────────────────────────────
const EXTENSION_COLOR_MAP = {
  // Java
  java:  '#EF4444',
  class: '#EF4444',
  jar:   '#EF4444',
  // Python
  py:    '#EAB308',
  pyw:   '#EAB308',
  pyi:   '#EAB308',
  // JavaScript
  js:    '#FACC15',
  jsx:   '#FACC15',
  mjs:   '#FACC15',
  cjs:   '#FACC15',
  // TypeScript
  ts:    '#3B82F6',
  tsx:   '#3B82F6',
  // Go
  go:    '#06B6D4',
  // Rust
  rs:    '#F97316',
  // C/C++
  c:     '#1D4ED8',
  cpp:   '#1D4ED8',
  cc:    '#1D4ED8',
  cxx:   '#1D4ED8',
  h:     '#1D4ED8',
  hpp:   '#1D4ED8',
  // C#
  cs:    '#8B5CF6',
  // Ruby
  rb:    '#DC2626',
  erb:   '#DC2626',
  // PHP
  php:   '#6366F1',
  // Kotlin
  kt:    '#7C3AED',
  kts:   '#7C3AED',
  // Swift
  swift: '#EA580C',
  // Dart / Flutter
  dart:  '#0284C7',
  // Shell
  sh:    '#16A34A',
  bash:  '#16A34A',
  zsh:   '#16A34A',
  fish:  '#16A34A',
  // Lua
  lua:   '#60A5FA',
  // Database
  sql:   '#059669',
  db:    '#059669',
  sqlite:'#059669',
  // Config / data
  json:  '#D97706',
  yaml:  '#D97706',
  yml:   '#D97706',
  toml:  '#D97706',
  ini:   '#D97706',
  conf:  '#D97706',
  env:   '#D97706',
  // Web
  html:  '#F97316',
  htm:   '#F97316',
  css:   '#EC4899',
  scss:  '#EC4899',
  sass:  '#EC4899',
  less:  '#EC4899',
  // Markup / docs
  md:    '#4F46E5',
  markdown: '#4F46E5',
  // Vue / Svelte / other frameworks
  vue:   '#10B981',
  svelte:'#F97316',
  // GraphQL
  graphql: '#E10098',
  gql:   '#E10098',
  // Prisma
  prisma:'#0F172A',
  // Office docs
  pdf:   '#EF4444',
  docx:  '#2563EB',
  doc:   '#2563EB',
  pptx:  '#F97316',
  ppt:   '#F97316',
  xlsx:  '#16A34A',
  xls:   '#16A34A',
  csv:   '#16A34A',
  // Media
  png:   '#8B5CF6',
  jpg:   '#8B5CF6',
  jpeg:  '#8B5CF6',
  gif:   '#8B5CF6',
  webp:  '#8B5CF6',
  svg:   '#EC4899',
  bmp:   '#8B5CF6',
  ico:   '#8B5CF6',
  mp4:   '#7C3AED',
  mkv:   '#7C3AED',
  mov:   '#7C3AED',
  webm:  '#7C3AED',
  mp3:   '#EC4899',
  wav:   '#EC4899',
  flac:  '#EC4899',
  ogg:   '#EC4899',
  m4a:   '#EC4899',
  // Archive
  zip:   '#D97706',
  rar:   '#D97706',
  '7z':  '#D97706',
  tar:   '#D97706',
  gz:    '#D97706',
  // Figma
  fig:   '#8B5CF6',
};

/**
 * Lấy màu mặc định theo extension/type của item.
 * @param {object} item  - { type: 'file'|'folder', name: string }
 * @returns {string}       mã hex, ví dụ '#EF4444'
 */
export function getDefaultColor(item) {
  if (!item) return DEFAULT_FILE_COLOR;
  if (item.type === 'folder') return DEFAULT_FOLDER_COLOR;

  const name = (item.name || '').toLowerCase();
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx === -1) return DEFAULT_FILE_COLOR;

  const ext = name.slice(dotIdx + 1);
  return EXTENSION_COLOR_MAP[ext] ?? DEFAULT_FILE_COLOR;
}

/**
 * Màu hiệu lực: customColor (từ DB) nếu có, ngược lại dùng màu mặc định.
 * @param {object} item
 * @returns {string} mã hex
 */
export function getEffectiveColor(item) {
  if (item?.customColor) return item.customColor;
  return getDefaultColor(item);
}


// ─────────────────────────────────────────────────────────────
// PALETTE CHO THẺ (card) — tô màu TOÀN BỘ thẻ, không chỉ viền
// ─────────────────────────────────────────────────────────────
//
// Vấn đề của bản cũ: customColor chỉ được gán vào borderColor, còn nền / chữ /
// badge vẫn lấy từ bảng CAT_*_CLASS cứng theo category, nên đổi màu một tệp
// gần như không thấy gì.
//
// Bản này suy ra cả bộ màu từ MỘT mã hex, và ràng buộc tương phản bằng công
// thức WCAG chứ không đoán bằng mắt: nền là màu pha loãng trên nền trang, còn
// chữ / icon được kéo sáng-tối cho tới khi đạt ngưỡng tương phản so với chính
// nền vừa tính. Nhờ vậy màu vàng nhạt (#FDE68A) hay xanh navy tối (#1E293B)
// đều đọc được, chủ thể không bị chìm vào nền ở chế độ lưới.

/**
 * Màu MẮT THẤY phía sau thẻ: tấm kính vùng nội dung (`glass` ở index.css) đè lên nền ambient.
 * Thẻ giờ là kính ánh màu (rgba, xem `buildScheme`), nên tương phản của chữ phải tính trên màu
 * đã trộn với nền này chứ không trên chính mã rgba.
 */
const BASE_LIGHT = '#F6F7F8';
const BASE_DARK  = '#252527';
const WHITE = { r: 255, g: 255, b: 255 };

function hexToRgb(hex) {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

const toHex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const rgbToHex = ({ r, g, b }) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();
const rgba = ({ r, g, b }, a) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/** Trộn `fg` lên trên `bg` với độ mờ `a` (0–1) — mô phỏng đúng phép alpha blend. */
function blend(fg, bg, a) {
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/** Độ chói tương đối theo WCAG 2.1 */
function luminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Tỉ lệ tương phản 1–21 giữa hai màu RGB */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor((h % 360) / 60) % 6];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Kéo độ sáng của `hsl` về phía `toward` (0 = đen, 1 = trắng) cho tới khi đạt
 * tương phản `target` so với nền `bgRgb`. Giữ nguyên hue nên chữ vẫn "cùng màu"
 * với thẻ, chỉ đủ đậm/nhạt để đọc được.
 *
 * Bão hoà được nâng nhẹ khi phải đi xa: màu càng gần đen/trắng càng bạc màu,
 * bù lại chút saturation thì vẫn nhận ra là màu người dùng đã chọn.
 */
function readable(hsl, bgRgb, target, toward) {
  // Màu vốn đã xám (xám mặc định của thư mục, đen, trắng) thì giữ nguyên độ bão
  // hoà — nâng lên sẽ biến nó thành một màu khác hẳn.
  const s = hsl.s < 0.25 ? hsl.s : Math.min(1, Math.max(hsl.s, 0.45));
  for (let step = 0; step <= 24; step++) {
    const l = hsl.l + (toward - hsl.l) * (step / 24);
    const rgb = hslToRgb({ ...hsl, s, l });
    if (contrast(rgb, bgRgb) >= target) return rgb;
  }
  // Không đạt nổi thì dùng luôn hai đầu mút — chắc chắn tương phản cao nhất
  return toward > 0.5 ? { r: 255, g: 255, b: 255 } : { r: 17, g: 17, b: 17 };
}

/**
 * Một chế độ (sáng hoặc tối) của bảng màu thẻ.
 *
 * Liquid glass (22/10/2026): nền / viền thẻ là KÍNH ÁNH MÀU (rgba) chứ không còn là mã hex đặc
 * — thẻ để lộ tấm kính vùng nội dung phía sau, đổi theme hay đặt thẻ lên modal/ngăn kéo đều
 * tự hoà vào nền. Bản Sáng là kính trắng pha chút màu (trắng là thứ làm nó đọc ra là kính);
 * bản Tối là một lớp màu mỏng trên graphite. Chữ / icon vẫn là hex đặc, tính tương phản trên
 * màu MẮT THẤY (`seen`: lớp rgba trộn lên `baseHex`).
 */
function buildScheme(rgb, baseHex, isDark) {
  const base = hexToRgb(baseHex);
  const hsl = rgbToHsl(rgb);

  // [màu phủ, độ đục] của từng lớp. Sáng: trộn màu vào trắng rồi phủ bán trong suốt.
  const layer = (tint, alpha) => (isDark
    ? { color: rgb, alpha: tint }
    : { color: blend(rgb, WHITE, tint), alpha });
  // Bản Tối: nền gần như trung tính, màu nằm ở viền / icon / chữ — xanh của .docx pha 10–15% trên
  // graphite đã ngả hẳn sang navy (đúng thứ bản kính này bỏ đi).
  const surfaceL = layer(isDark ? 0.055 : 0.16, 0.62);
  const hoverL   = layer(isDark ? 0.1 : 0.27, 0.74);
  // Khung xem trước giữ gần như trung tính để ảnh / bảng tính không bị ám màu
  const panelL   = layer(isDark ? 0.02 : 0.05, 0.66);
  const seen = (l) => blend(l.color, base, l.alpha);
  const surface = seen(surfaceL);

  // Ngưỡng: 5.5 cho tên tệp (chữ nhỏ, đậm), 4.0 cho chữ phụ (4.6 ở bản Sáng: đuôi tệp / dung lượng
  // trên thẻ lưới chỉ 8–10px, đo trên trang thật mới ~3,7–4,4:1), 3.0 cho icon/đồ hoạ
  const toward = isDark ? 1 : 0;
  const ink   = readable(hsl, surface, 5.5, toward);
  const muted = readable(hsl, surface, isDark ? 4.0 : 4.6, toward);
  const icon  = readable(hsl, surface, 3.0, toward);

  // Badge đuôi tệp: nền màu đặc hơn hẳn nền thẻ để nổi lên như một con tem
  const badgeBg = blend(rgb, base, isDark ? 0.55 : 0.85);
  const badgeFg = contrast(badgeBg, WHITE) >= 4.5 ? WHITE : { r: 17, g: 17, b: 17 };

  return {
    surface:      rgba(surfaceL.color, surfaceL.alpha),
    surfaceHover: rgba(hoverL.color, hoverL.alpha),
    panel:        rgba(panelL.color, panelL.alpha),
    border:       rgba(rgb, isDark ? 0.38 : 0.28),
    ink:          rgbToHex(ink),
    muted:        rgbToHex(muted),
    icon:         rgbToHex(icon),
    badgeBg:      rgbToHex(badgeBg),
    badgeFg:      rgbToHex(badgeFg),
  };
}

// Bảng màu chỉ phụ thuộc mã hex nên nhớ lại được; lưới có thể có hàng trăm thẻ
// cùng vài mã màu, tính lại mỗi lần render là phí.
const paletteCache = new Map();

/**
 * Bảng màu đầy đủ (cả chế độ sáng lẫn tối) suy ra từ một mã hex.
 * @param {string} hex
 * @returns {{light: object, dark: object}}
 */
export function getCardPalette(hex) {
  const key = String(hex).toUpperCase();
  const cached = paletteCache.get(key);
  if (cached) return cached;

  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_FILE_COLOR);
  const palette = {
    light: buildScheme(rgb, BASE_LIGHT, false),
    dark:  buildScheme(rgb, BASE_DARK, true),
  };
  paletteCache.set(key, palette);
  return palette;
}

/**
 * Biến CSS để gắn thẳng vào `style` của thẻ. Mỗi biến có hai bản `-l` / `-d`;
 * class Tailwind chọn bản nào bằng biến thể `dark:` (class `dark` trên <html>,
 * xem useTheme.js) — nhờ vậy thẻ không phải subscribe theme, và đổi Sáng/Tối
 * không cần render lại toàn bộ lưới.
 *
 * @param {object} item - file/folder
 */
export function getCardColorVars(item) {
  const hasCustom = Boolean(item?.customColor);
  const { light, dark } = getCardPalette(hasCustom ? item.customColor : NEUTRAL_CARD_COLOR);
  const icon = getIconColors(item);
  return {
    '--fc-surface-l': light.surface,
    '--fc-hover-l':   light.surfaceHover,
    '--fc-panel-l':   light.panel,
    '--fc-border-l':  light.border,
    '--fc-ink-l':     light.ink,
    '--fc-muted-l':   light.muted,
    '--fc-icon-l':    icon.light,
    '--fc-badge-l':   light.badgeBg,
    '--fc-badge-fg-l': light.badgeFg,
    '--fc-surface-d': dark.surface,
    '--fc-hover-d':   dark.surfaceHover,
    '--fc-panel-d':   dark.panel,
    '--fc-border-d':  dark.border,
    '--fc-ink-d':     dark.ink,
    '--fc-muted-d':   dark.muted,
    '--fc-icon-d':    icon.dark,
    '--fc-badge-d':   dark.badgeBg,
    '--fc-badge-fg-d': dark.badgeFg,
  };
}

/**
 * Icon theo loại tệp, đã dịu: rút độ bão hoà (`TYPE_TINT_SATURATION`) rồi chỉ kéo ĐỘ SÁNG cho tới khi
 * đủ tương phản 3:1 trên nền thẻ. Không đi qua `readable()`: hàm đó cố ý nâng bão hoà lên tối thiểu
 * 0.45 cho màu người dùng chọn, tức là trả lại đúng sắc chói vừa rút đi.
 */
function mutedTypeIcon(hex, isDark) {
  const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_FILE_COLOR);
  const base = hexToRgb(isDark ? BASE_DARK : BASE_LIGHT);
  const hsl = rgbToHsl(rgb);
  const muted = { ...hsl, s: hsl.s * TYPE_TINT_SATURATION };
  const toward = isDark ? 1 : 0;
  for (let step = 0; step <= 24; step++) {
    const candidate = hslToRgb({ ...muted, l: muted.l + (toward - muted.l) * (step / 24) });
    if (contrast(candidate, base) >= 3.2) return rgbToHex(candidate);
  }
  return isDark ? '#D4D4D8' : '#52525B';
}

/**
 * Màu ICON của một mục ở hai chế độ { light, dark } (mã hex, đã đủ tương phản trên nền thẻ):
 *   • có customColor   → đúng màu người dùng chọn;
 *   • thư mục mặc định → xám trung tính;
 *   • tệp mặc định     → màu theo loại tệp, đã dịu bớt.
 * Dùng chung cho thẻ lưới (`getCardColorVars`) và icon ở bảng danh sách / Trang chủ (getFileIcon).
 *
 * @param {object} item
 * @returns {{light: string, dark: string}}
 */
export function getIconColors(item) {
  if (item && !item.customColor && item.type !== 'folder') {
    const key = `muted:${getDefaultColor(item)}`;
    let cached = paletteCache.get(key);
    if (!cached) {
      const hex = getDefaultColor(item);
      cached = { light: mutedTypeIcon(hex, false), dark: mutedTypeIcon(hex, true) };
      paletteCache.set(key, cached);
    }
    return cached;
  }
  const { light, dark } = getCardPalette(item?.customColor || NEUTRAL_CARD_COLOR);
  return { light: light.icon, dark: dark.icon };
}
