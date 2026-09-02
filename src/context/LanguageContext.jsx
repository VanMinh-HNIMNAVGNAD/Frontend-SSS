import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

import en from '../locales/en';
import vi from '../locales/vi';

// ── Khoá localStorage — dùng ĐÚNG khoá mà SettingsModal.jsx đang ghi từ trước,
// để lựa chọn ngôn ngữ cũ của người dùng không bị mất khi chuyển sang Context ──
const LS_LANGUAGE = 'driveR_settings_language';

const SUPPORTED = ['vi', 'en'];
const DEFAULT_LANGUAGE = 'vi';

/** Đọc ngôn ngữ đã lưu; giá trị lạ hoặc chưa từng lưu thì trả về 'vi' */
function readSavedLanguage() {
  try {
    const saved = localStorage.getItem(LS_LANGUAGE);
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    // Trình duyệt chặn storage (chế độ ẩn danh, iframe...) — vẫn chạy được với mặc định
    return DEFAULT_LANGUAGE;
  }
}

// ── Từ điển dịch: mỗi ngôn ngữ một file trong `src/locales/` ──
// Thêm ngôn ngữ mới = thêm 1 file + 1 dòng ở đây và trong SUPPORTED, không cần
// sửa provider. Khoá phẳng dạng "namespace.key" cho dễ tra và dễ grep.
const translations = { vi, en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readSavedLanguage);

  const changeLanguage = useCallback((next) => {
    // Chốt cửa ở đây: giá trị không hỗ trợ sẽ bị bỏ qua thay vì làm rỗng toàn bộ UI
    if (!SUPPORTED.includes(next)) return;
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
  const t = useCallback(
    (key, params) => {
      const template =
        translations[language]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;
      if (!params) return template;
      // Thiếu tham số thì GIỮ NGUYÊN {tên} để lỗi nhìn thấy được, thay vì in ra
      // 'undefined' — cùng tinh thần với việc trả về chính khoá khi thiếu bản dịch
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      );
    },
    [language]
  );

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
