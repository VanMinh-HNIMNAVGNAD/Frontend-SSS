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

