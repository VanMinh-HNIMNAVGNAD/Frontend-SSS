import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import legalVi from '../locales/legal.vi';
import legalEn from '../locales/legal.en';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_PATHS,
  LEGAL_VERSION,
  SERVICE_NAME,
  SERVICE_URL,
} from '../constants/legal';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LegalPage — một khung, ba tài liệu
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Dùng cho /terms, /privacy và /data-deletion. Nội dung nằm ở
 * `locales/legal.vi.js` + `locales/legal.en.js`; ở đây chỉ có cách vẽ.
 *
 * BA TRANG NÀY LÀ ROUTE CÔNG KHAI THẬT SỰ — không bọc trong MainLayout, không
 * đòi đăng nhập, và mở được trong tab mới từ trang đăng ký (người đang điền form
 * bấm vào link mà bị mất những gì vừa gõ là lý do khiến họ bỏ luôn việc đăng ký).
 *
 * VÌ SAO CÓ NÚT ĐỔI NGÔN NGỮ NGAY TRÊN TRANG: đây là những URL mình dán vào
 * bảng điều khiển của Meta, và người mở nó có thể là một người kiểm duyệt không
 * đọc được tiếng Việt — trong khi mặc định của app là 'vi' và họ thì chưa có
 * localStorage nào cả. Không có nút này, cánh cửa duy nhất để họ sang bản tiếng
 * Anh là vào app rồi tìm trong Cài đặt.
 *
 * @param {{ docId: 'terms'|'privacy'|'dataDeletion' }} props `docId` do
 *   AppRouter truyền cứng theo từng route, xem LEGAL_DOCS trong constants/legal.js
 */
export default function LegalPage({ docId }) {
  const { language, changeLanguage, t } = useLanguage();

  // Từ điển pháp lý tách khỏi vi.js/en.js (xem chú thích đầu locales/legal.vi.js),
  // nên phải tự chọn bản theo `language` chứ không đi qua t().
  const dict = language === 'en' ? legalEn : legalVi;
  const doc = dict[docId] ?? legalVi[docId];

  // Tiêu đề tab: người dùng thường mở cả ba trang này trong ba tab (từ ô đồng ý
  // ở trang đăng ký), mà tab nào cũng tên "driveR" thì không phân biệt được.
  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · ${SERVICE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  const tokens = useMemo(
    () => ({
      service: SERVICE_NAME,
      site: SERVICE_URL.replace(/^https?:\/\//, ''),
      email: LEGAL_CONTACT_EMAIL,
      effective: LEGAL_EFFECTIVE_DATE,
      version: LEGAL_VERSION,
    }),
    [],
  );

  /**
   * Điền các chỗ trống {tên} trong văn bản, và dựng riêng {email} thành liên kết
   * mailto.
   *
   * Trả về MẢNG phần tử React chứ không phải chuỗi: địa chỉ liên hệ là thứ người
   * dùng cần bấm được (và người kiểm duyệt cần thấy là bấm được), nên nó phải là
   * <a> thật. Ghép chuỗi rồi nhét vào dangerouslySetInnerHTML là cách còn lại —
   * không đáng, vì văn bản này rồi sẽ có người ngoài nhóm sửa.
   *
   * Chỗ trống không có trong `tokens` được GIỮ NGUYÊN dạng {tên} thay vì in ra
   * 'undefined' — cùng quy ước với t() trong LanguageContext, để lỗi nhìn thấy
   * được ngay trên trang.
   */
  const fill = (text) =>
    text.split(/(\{\w+\})/g).map((part, index) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!name || !(name in tokens)) return part;
      if (name === 'email') {
        return (
          <a
            key={index}
            href={`mailto:${tokens.email}`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-400/40 underline-offset-2 break-all"
          >
            {tokens.email}
          </a>
        );
      }
      return <span key={index}>{tokens[name]}</span>;
    });

  const renderBlock = (block, index) => {
    switch (block.type) {
      case 'ul':
        return (
          <ul key={index} className="space-y-2 list-disc pl-5 marker:text-blue-400/70">
            {block.items.map((item, i) => (
              <li key={i}>{fill(item)}</li>
            ))}
          </ul>
        );

      case 'ol':
        return (
          <ol key={index} className="space-y-2 list-decimal pl-5 marker:text-blue-400/70 marker:font-bold">
            {block.items.map((item, i) => (
              <li key={i}>{fill(item)}</li>
            ))}
          </ol>
        );

      case 'table':
        // overflow-x riêng cho từng bảng: bảng bên thứ ba có ba cột chữ dài, mà
        // cả TRANG được phép cuộn ngang là lỗi hiển thị trên điện thoại.
        return (
          <div
            key={index}
            className="overflow-x-auto -mx-1 rounded-xl border border-glass-divider bg-white/40 dark:bg-white/[0.03]"
          >
            <table className="w-full min-w-[520px] text-sm border-collapse">
              <thead>
                <tr className="bg-black/[0.03] dark:bg-white/[0.04]">
                  {block.head.map((cell, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="text-left font-bold text-gray-800 dark:text-gray-200 px-4 py-3 border-b border-glass-divider"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i} className="border-b border-glass-divider last:border-0 align-top">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {fill(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'note':
        return (
          <p
            key={index}
            className="border-l-2 border-amber-400/60 bg-amber-400/[0.06] rounded-r-lg px-4 py-3 text-gray-800 dark:text-gray-200"
          >
            {fill(block.text)}
          </p>
        );

      default:
        return <p key={index}>{fill(block.text)}</p>;
    }
  };

  /** Hai tài liệu còn lại — luôn đi thành bộ ba, đọc một cái thường cần cái kia. */
  const siblings = Object.values(LEGAL_DOCS)
    .filter((id) => id !== docId)
    .map((id) => ({ id, path: LEGAL_PATHS[id], title: dict[id].title }));

  return (
    <div className="min-h-screen text-gray-700 dark:text-gray-300">
      {/* Thanh trên: đường ra khỏi trang + nút đổi ngôn ngữ. `sticky` vì tài liệu
          dài, mà người đọc giữa mục 9 vẫn cần một đường quay lại. */}
      <header className="sticky top-2 z-20 mx-2 sm:mx-auto sm:max-w-3xl mt-2 glass-strong rounded-full">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('legal.back')}</span>
          </Link>

          <div
            className="flex items-center rounded-full glass-soft p-0.5 text-xs font-bold"
            role="group"
            aria-label={t('legal.language')}
          >
            {['vi', 'en'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => changeLanguage(code)}
                aria-pressed={language === code}
                className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                  language === code
                    ? 'btn-accent'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl my-4 sm:my-6 mx-2 sm:mx-auto px-5 sm:px-8 py-8 sm:py-10 glass rounded-[28px]">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{doc.title}</h1>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('legal.effective', { date: LEGAL_EFFECTIVE_DATE })} · {SERVICE_NAME} ({tokens.site})
        </p>

        <p className="mt-6 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{fill(doc.intro)}</p>

        {/* Mục lục — mười ba mục thì cuộn tay không còn là cách đọc hợp lý.
            Dùng neo #id thay vì router: cùng một trang, không đổi route. */}
        <nav className="mt-8 rounded-xl border border-glass-divider bg-white/40 dark:bg-white/[0.03] p-4" aria-label={t('legal.toc')}>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            {t('legal.toc')}
          </p>
          <ol className="space-y-1.5 text-sm">
            {doc.sections.map((section, index) => (
              <li key={index}>
                <a
                  href={`#muc-${index + 1}`}
                  className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {doc.sections.map((section, index) => (
            <section key={index} id={`muc-${index + 1}`} className="scroll-mt-20">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{section.heading}</h2>
              <div className="space-y-4 text-[15px] leading-relaxed">
                {section.blocks.map(renderBlock)}
              </div>
            </section>
          ))}
        </div>

        {/* Chân trang: hộp thư liên hệ và hai tài liệu còn lại. Đặt ở đây vì
            người đọc hết một tài liệu pháp lý thường cần đúng hai thứ đó. */}
        <footer className="mt-14 pt-8 border-t border-glass-divider space-y-4">
          <p className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
            <span className="text-gray-600 dark:text-gray-400">{t('legal.contact')}</span>
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold underline decoration-blue-400/40 underline-offset-2 break-all"
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            {siblings.map((sibling) => (
              <Link
                key={sibling.id}
                to={sibling.path}
                className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {sibling.title}
              </Link>
            ))}
            <Link to="/register" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('legal.toRegister')}
            </Link>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            {t('legal.version', { version: LEGAL_VERSION })}
          </p>
        </footer>
      </main>
    </div>
  );
}
