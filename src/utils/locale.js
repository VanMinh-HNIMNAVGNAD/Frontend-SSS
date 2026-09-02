/**
 * Ánh xạ mã ngôn ngữ của app (`vi` | `en`) sang thẻ BCP-47 mà `Intl` / `toLocaleString`
 * cần.
 *
 * Vì sao cần một chỗ riêng: trước đây 17 chỗ trong frontend gọi thẳng
 * `toLocaleString('vi-VN')`. Ngày tháng vì thế luôn ra định dạng Việt Nam
 * (31/12/2026) kể cả khi người dùng đã chuyển giao diện sang English — đúng loại
 * "còn set cứng" của lỗi #6, chỉ khó thấy hơn vì nó không phải chữ.
 *
 * Thêm ngôn ngữ mới thì thêm một dòng ở đây và ở `SUPPORTED` trong LanguageContext.
 */
const LOCALE_TAGS = {
  vi: 'vi-VN',
  en: 'en-US',
};

const DEFAULT_TAG = LOCALE_TAGS.vi;

/**
 * @param {string} language Mã ngôn ngữ của app
 * @returns {string} Thẻ BCP-47 tương ứng, mặc định 'vi-VN'
 */
export function localeTagOf(language) {
  return LOCALE_TAGS[language] || DEFAULT_TAG;
}

export default LOCALE_TAGS;
