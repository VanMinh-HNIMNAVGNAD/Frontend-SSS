/**
 * Tra từ điển dịch — dùng chung cho CẢ hai phía:
 *
 *  • `context/LanguageContext.jsx` cho mọi component React (`t()` quen thuộc).
 *  • `tOutsideReact()` cho mã chạy NGOÀI cây React — `services/api.js` là chỗ
 *    duy nhất cần tới: nó dựng câu lỗi mặc định rồi ném lên cho component toast
 *    ra, nhưng bản thân nó không gọi hook được.
 *
 * Vì sao phải tách ra file riêng: trước đây những câu dự phòng đó nằm ngay trong
 * `api.js` dưới dạng chuỗi tiếng Việt ghi cứng ('Đã có lỗi xảy ra'). Người dùng
 * chọn English vẫn thấy chúng — cùng một lỗi #6, chỉ nằm ở tầng không có hook.
 *
 * `tOutsideReact()` đọc ngôn ngữ từ localStorage tại thời điểm GỌI chứ không giữ
 * một bản sao: `changeLanguage()` ghi localStorage ngay khi người dùng đổi, nên
 * câu lỗi luôn theo đúng ngôn ngữ đang hiển thị, kể cả khi chưa tải lại trang.
 */
import en from '../locales/en';
import vi from '../locales/vi';

/** Khoá localStorage — SettingsModal.jsx đã ghi khoá này từ trước khi có Context. */
export const LS_LANGUAGE = 'driveR_settings_language';

export const SUPPORTED_LANGUAGES = ['vi', 'en'];
export const DEFAULT_LANGUAGE = 'vi';

/**
 * Từ điển: mỗi ngôn ngữ một file trong `src/locales/`. Thêm ngôn ngữ mới = thêm
 * một file, một dòng ở đây và một mục ở `SUPPORTED_LANGUAGES`.
 */
const DICTIONARIES = { vi, en };

/** Đọc ngôn ngữ đã lưu; giá trị lạ hoặc chưa từng lưu thì trả về mặc định. */
export function readSavedLanguage() {
  try {
    const saved = localStorage.getItem(LS_LANGUAGE);
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    // Trình duyệt chặn storage (ẩn danh, iframe...) — vẫn chạy được với mặc định
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Tra bản dịch theo khoá, rồi điền các chỗ trống `{tên}`.
 *
 * Thiếu khoá ở ngôn ngữ đang chọn → lùi về tiếng Việt → cuối cùng trả về CHÍNH
 * khoá, để UI không bao giờ hiện ô trống và lỗi thì nhìn thấy được.
 * Thiếu tham số thì GIỮ NGUYÊN `{tên}` thay vì in ra 'undefined' — cùng tinh thần.
 */
export function translate(language, key, params) {
  const template =
    DICTIONARIES[language]?.[key] ?? DICTIONARIES[DEFAULT_LANGUAGE]?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Bản dịch cho mã ngoài React — tự đọc ngôn ngữ đang lưu. */
export function tOutsideReact(key, params) {
  return translate(readSavedLanguage(), key, params);
}
