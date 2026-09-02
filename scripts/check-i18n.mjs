/**
 * Canh hai từ điển `src/locales/vi.js` và `src/locales/en.js` có ĐÚNG cùng bộ khoá,
 * và không khoá nào bị bỏ trống.
 *
 * Vì sao cần: `LanguageContext.t()` fallback về tiếng Việt khi thiếu khoá ở ngôn ngữ
 * đang chọn. Fallback đó tốt cho người dùng (không bao giờ thấy ô trống) nhưng nó
 * cũng che lỗi hoàn toàn — thiếu 50 khoá tiếng Anh thì build vẫn xanh, lint vẫn sạch,
 * chỉ người chọn English mới thấy giao diện lẫn hai thứ tiếng. Đó chính là lỗi #6.
 *
 * Chạy: pnpm i18n:check   (nên gọi trong CI trước `vite build`)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import en from '../src/locales/en.js';
import vi from '../src/locales/vi.js';

const viKeys = new Set(Object.keys(vi));
const enKeys = new Set(Object.keys(en));

const missingInEn = [...viKeys].filter((k) => !enKeys.has(k)).sort();
const missingInVi = [...enKeys].filter((k) => !viKeys.has(k)).sort();

// Khoá có nhưng giá trị rỗng render ra ô trống — tệ hơn cả thiếu khoá, vì fallback
// không kích hoạt (khoá vẫn "tồn tại").
const empty = [];
for (const [lang, dict] of [['vi', vi], ['en', en]]) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string' || value.trim() === '') empty.push(`${lang}: ${key}`);
  }
}

// Placeholder {tên} phải trùng nhau giữa hai bản dịch: dịch mà đánh rơi {count}
// thì câu vẫn hiện, chỉ mất mất con số — lỗi rất khó thấy khi review.
const placeholderMismatch = [];
const placeholdersOf = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const key of viKeys) {
  if (!enKeys.has(key)) continue;
  const a = placeholdersOf(vi[key]);
  const b = placeholdersOf(en[key]);
  if (a !== b) placeholderMismatch.push(`${key}  vi{${a}} != en{${b}}`);
}

const report = (title, list) => {
  if (!list.length) return 0;
  console.error(`\n✗ ${title} (${list.length}):`);
  list.forEach((item) => console.error(`    ${item}`));
  return list.length;
};

let problems = 0;
problems += report('Thiếu ở en.js', missingInEn);
problems += report('Thiếu ở vi.js', missingInVi);
problems += report('Giá trị rỗng', empty);
problems += report('Placeholder lệch nhau', placeholderMismatch);

if (problems) {
  console.error(`\n${problems} vấn đề i18n. vi=${viKeys.size} khoá, en=${enKeys.size} khoá.\n`);
  process.exit(1);
}

// ── Khoá được gọi trong mã nguồn có thật sự tồn tại trong từ điển? ──
//
// `t()` trả về CHÍNH KHOÁ khi không tìm thấy, nên gõ sai một chữ ("menu.rename"
// thành "menu.renam") không sập, không cảnh báo — nó chỉ in ra chuỗi lem nhem
// giữa giao diện. Đây là cách duy nhất bắt được nhóm lỗi đó tự động.
const SRC_DIR = path.join(import.meta.dirname, '..', 'src');

/** Mọi tệp .js/.jsx dưới src/, trừ chính hai file từ điển. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.jsx?$/.test(entry.name)) return [];
    if (full.includes(path.join('src', 'locales'))) return [];
    return [full];
  });
}

const unknown = new Map();
for (const file of walk(SRC_DIR)) {
  // Bỏ chú thích trước khi dò: các khối JSDoc ở LanguageContext/tRich có ví dụ
  // `t('a')` chỉ để giải thích, không phải khoá thật.
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const match of code.matchAll(/\bt\(\s*'([\w.]+)'/g)) {
    const key = match[1];
    if (viKeys.has(key)) continue;
    if (!unknown.has(key)) unknown.set(key, new Set());
    unknown.get(key).add(path.relative(SRC_DIR, file));
  }
}

if (unknown.size) {
  console.error(`\n✗ Khoá được gọi nhưng KHÔNG có trong từ điển (${unknown.size}):`);
  for (const [key, files] of [...unknown].sort()) {
    console.error(`    ${key}  ←  ${[...files].join(', ')}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`✓ i18n OK — ${viKeys.size} khoá, hai ngôn ngữ khớp nhau.`);
