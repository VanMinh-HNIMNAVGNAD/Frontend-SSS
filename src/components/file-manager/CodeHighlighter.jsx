import { useEffect, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async-light';
import languageLoaders from 'react-syntax-highlighter/dist/esm/async-languages/prism';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';

/**
 * Tô màu mã nguồn cho khung xem trước + trang chia sẻ — bản NẠP DẦN (##85).
 *
 * Trước đây hai nơi đó `import { Prism } from 'react-syntax-highlighter'`: bản ĐỦ, đăng ký
 * sẵn ~300 ngôn ngữ (refractor 577KB, ~236KB nén). Vì là import tĩnh, MỌI lần mở xem trước
 * đầu tiên trong phiên — kể cả mở một tấm ảnh — đều phải tải + biên dịch khối đó trước khi
 * cửa sổ vẽ được gì.
 *
 * Nay: component này tự là một chunk lười (nơi dùng bọc `lazy()`), và bên trong dùng bản
 * `prism-async-light` — lõi refractor và TỪNG ngôn ngữ chỉ được tải khi thật sự cần tô
 * (`javascript` thì chỉ tải `javascript` + `clike`). Trong lúc chờ nó hiện chữ thô, xong
 * thì tự vẽ lại có màu.
 *
 * Bản async chỉ biết TÊN GỐC của ngôn ngữ, không biết bí danh: `html`/`xml`/`svg` là bí
 * danh của `markup` trong Prism — bản đủ hiểu được vì nó đăng ký sẵn mọi bí danh, bản
 * async thì coi là "không hỗ trợ" và hiện chữ thô. Đổi về tên gốc ở đây.
 */
const ALIASES = { html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', mathml: 'markup' };

/**
 * Các "phần mở rộng" SỬA ngữ pháp của ngôn ngữ khác (`js-extras` tách `export`/`return` thành
 * từ khoá module/điều khiển — màu tím trong vscDarkPlus, `console`/`length`…; `jsdoc` tô thẻ
 * trong chú thích; `css-extras` tô bộ chọn/đơn vị). Bản đủ đăng ký sẵn chúng nên mã JS/TS/CSS
 * có thêm màu; bản async chỉ nạp đúng ngôn ngữ được hỏi, thiếu chúng là màu khác bản cũ.
 *
 * THỨ TỰ là một phần của kết quả: `typescript`/`jsx` chụp lại ngữ pháp `javascript` NGAY lúc
 * đăng ký (`extend`), nên phần mở rộng nào đăng ký trước/sau chúng sẽ có/không có mặt bên
 * trong. Chuỗi dưới đây là đúng thứ tự tương đối trong `refractor/lib/all.js` (5.0.0) — giữ
 * nguyên thì kết quả tô màu trùng bản đủ (đã so từng token trên harness ##85). Tên viết theo
 * KHOÁ của bộ nạp async (`jsExtras` = `js-extras`).
 */
const COMPANIONS = {
  javascript: ['javascript', 'jsTemplates', 'jsdoc', 'jsExtras'],
  jsx: ['javascript', 'jsTemplates', 'jsdoc', 'jsExtras', 'jsx'],
  typescript: ['javascript', 'jsTemplates', 'typescript', 'jsdoc', 'jsExtras'],
  tsx: ['javascript', 'jsTemplates', 'typescript', 'jsdoc', 'jsExtras', 'jsx', 'tsx'],
  css: ['css', 'cssExtras'],
};

/** Ngôn ngữ đã chuẩn bị xong trong phiên này (refractor là một thể hiện dùng chung). */
const prepared = new Set();

/** Tải SONG SONG mọi mảnh của chuỗi, rồi đăng ký TUẦN TỰ đúng thứ tự — xem `COMPANIONS`. */
async function prepare(language) {
  const chain = COMPANIONS[language];
  const modules = await Promise.all(
    chain.map(
      (name) =>
        new Promise((resolve, reject) => {
          // Bộ nạp của thư viện tự `import()` rồi gọi lại hàm đăng ký với module — ở đây chỉ
          // nhận module về, việc đăng ký làm sau cho đúng thứ tự.
          languageLoaders[name]((_, mod) => resolve(mod)).catch(reject);
        }),
    ),
  );
  await (SyntaxHighlighter.astGeneratorPromise ?? SyntaxHighlighter.preload());
  chain.forEach((name, i) => SyntaxHighlighter.registerLanguage(name, modules[i]));
}

export default function CodeHighlighter({ language, ...props }) {
  const lang = ALIASES[language] ?? language;
  const needsPrepare = Boolean(COMPANIONS[lang]) && !prepared.has(lang);
  const [readyLang, setReadyLang] = useState(needsPrepare ? null : lang);

  useEffect(() => {
    if (!needsPrepare) return undefined;
    let alive = true;
    prepare(lang)
      // Hỏng (mạng chập) thì vẫn tô bằng ngôn ngữ gốc — bản async tự nạp nó như thường.
      .catch(() => undefined)
      .finally(() => {
        prepared.add(lang);
        if (alive) setReadyLang(lang);
      });
    return () => {
      alive = false;
    };
  }, [lang, needsPrepare]);

  // Lúc chuẩn bị: vẽ chữ thô bằng CHÍNH bộ tô này ('text' không tải gì) — cùng khung, cùng số
  // dòng, nên lúc màu đổ vào không có cú nhảy bố cục nào.
  const shown = needsPrepare && readyLang !== lang ? 'text' : lang;
  return <SyntaxHighlighter language={shown} style={vscDarkPlus} {...props} />;
}
