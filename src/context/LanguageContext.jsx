import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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

// ── Từ điển dịch: khoá phẳng dạng "namespace.key" cho dễ tra và dễ grep ──
// Thêm ngôn ngữ mới = thêm 1 nhánh ở đây, không cần sửa provider.
const translations = {
  vi: {
    // Khung modal Cài đặt
    'settings.title': 'Cài đặt',
    'settings.tab.general': 'Cài đặt chung',
    'settings.tab.shortcuts': 'Phím tắt',
    'settings.saveAndClose': 'Lưu & Đóng',

    // 1. Chủ đề giao diện
    'settings.theme.heading': 'Chủ đề giao diện (Theme)',
    'settings.theme.light': 'Chế độ sáng (Light)',
    'settings.theme.dark': 'Chế độ tối (Dark)',
    'settings.theme.system': 'Theo hệ thống (System)',

    // 2. Ngôn ngữ
    'settings.language.label': 'Ngôn ngữ giao diện',
    'settings.language.vi': '🇻🇳 Tiếng Việt',
    'settings.language.en': '🇺🇸 English (US)',

    // 3. Trang khởi động
    'settings.startup.label': 'Trang khởi động mặc định',
    'settings.startup.myDrive': '📁 Driver riêng của tôi (My Drive)',
    'settings.startup.home': '🏠 Trang chủ (Dashboard tổng quan)',
    'settings.startup.recent': '🕒 Đã mở gần đây (Recent files)',

    // 4. Quyền riêng tư & Bảo mật
    'settings.privacy.heading': 'Quyền riêng tư & Bảo mật',
    'settings.privacy.discoverable.title': 'Hiển thị thông tin cá nhân',
    'settings.privacy.discoverable.desc':
      'Cho phép người dùng khác tìm thấy bạn qua Email khi chia sẻ tệp',
    'settings.privacy.shareRole.label': 'Quyền chia sẻ mặc định khi tạo Link',
    'settings.privacy.shareRole.viewer': '👀 Chỉ xem (Viewer)',
    'settings.privacy.shareRole.editor': '✏️ Được chỉnh sửa (Editor)',
  },

  en: {
    // Settings modal shell
    'settings.title': 'Settings',
    'settings.tab.general': 'General',
    'settings.tab.shortcuts': 'Keyboard shortcuts',
    'settings.saveAndClose': 'Save & Close',

    // 1. Theme
    'settings.theme.heading': 'Appearance (Theme)',
    'settings.theme.light': 'Light mode',
    'settings.theme.dark': 'Dark mode',
    'settings.theme.system': 'Follow system',

    // 2. Language
    'settings.language.label': 'Interface language',
    'settings.language.vi': '🇻🇳 Tiếng Việt',
    'settings.language.en': '🇺🇸 English (US)',

    // 3. Startup page
    'settings.startup.label': 'Default startup page',
    'settings.startup.myDrive': '📁 My Drive',
    'settings.startup.home': '🏠 Home (overview dashboard)',
    'settings.startup.recent': '🕒 Recent files',

    // 4. Privacy & Security
    'settings.privacy.heading': 'Privacy & Security',
    'settings.privacy.discoverable.title': 'Show my personal information',
    'settings.privacy.discoverable.desc':
      'Let other people find you by email when they share files',
    'settings.privacy.shareRole.label': 'Default link sharing permission',
    'settings.privacy.shareRole.viewer': '👀 Viewer only',
    'settings.privacy.shareRole.editor': '✏️ Editor',
  },
};

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
   */
  const t = useCallback(
    (key) => translations[language]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key,
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
