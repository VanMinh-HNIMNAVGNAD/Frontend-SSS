import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

import {
  DEFAULT_LANGUAGE,
  LS_LANGUAGE,
  SUPPORTED_LANGUAGES,
  readSavedLanguage,
  translate,
} from '../utils/translate';

// ── Từ điển, danh sách ngôn ngữ và hàm tra khoá nằm ở `utils/translate.js` ──
// Tách ra vì `services/api.js` cũng cần dịch mà không gọi hook được: nó chạy
// ngoài cây React. Provider này chỉ còn lo phần trạng thái + đồng bộ <html lang>.

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readSavedLanguage);

  const changeLanguage = useCallback((next) => {
    // Chốt cửa ở đây: giá trị không hỗ trợ sẽ bị bỏ qua thay vì làm rỗng toàn bộ UI
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    setLanguage(next);
    try {
      localStorage.setItem(LS_LANGUAGE, next);
    } catch {
      // Không ghi được thì vẫn đổi trong phiên hiện tại, chỉ là F5 sẽ mất
    }
  }, []);

  // Đồng bộ <html lang> — trình đọc màn hình và tính năng dịch của trình duyệt
  // dựa vào thuộc tính này để hiểu trang đang ở ngôn ngữ nào
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  /**
   * Tra bản dịch theo khoá.
   * Thiếu khoá ở ngôn ngữ đang chọn → fallback sang tiếng Việt → cuối cùng trả
   * về chính khoá, để UI không bao giờ hiện ô trống và lỗi dễ nhìn thấy.
   *
   * Tham số thứ hai (tuỳ chọn) điền vào các chỗ trống dạng {tên} trong câu:
   *
   *   t('header.confirm.trash', { count: 3 })
   *   vi → 'Chuyển 3 mục vào thùng rác?'
   *   en → 'Move 3 item(s) to trash?'
   *
   * Phải chèn ở ĐÂY chứ không ghép chuỗi ngoài component: trật tự từ giữa hai
   * ngôn ngữ khác nhau, ghép tay kiểu `t('a') + n + t('b')` là khoá cứng trật
   * tự tiếng Việt vào mọi ngôn ngữ sau này.
   *
   * Gọi t(key) không kèm tham số vẫn chạy y như trước.
   */
  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const value = useMemo(
    () => ({ language, changeLanguage, t }),
    [language, changeLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES };
