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
    'settings.tab.privacy': 'Quyền riêng tư & Bảo mật',
    'settings.saveAndClose': 'Lưu & Đóng',

    // 1. Chủ đề giao diện
    'settings.theme.heading': 'Chủ đề giao diện (Theme)',
    'settings.theme.light': 'Chế độ sáng (Light)',
    'settings.theme.dark': 'Chế độ tối (Dark)',
    'settings.theme.system': 'Theo hệ thống (System)',

    // 2. Ngôn ngữ
    'settings.language.label': 'Ngôn ngữ giao diện',
    'settings.language.vi': 'Tiếng Việt',
    'settings.language.en': 'English (US)',

    // 3. Trang khởi động
    'settings.startup.label': 'Trang khởi động mặc định',
    'settings.startup.myDrive': 'Driver riêng của tôi (My Drive)',
    'settings.startup.home': 'Trang chủ (Dashboard tổng quan)',
    'settings.startup.recent': 'Đã mở gần đây (Recent files)',

    // 4. Quyền riêng tư & Bảo mật
    'settings.privacy.heading': 'Quyền riêng tư & Bảo mật',
    'settings.privacy.discoverable.title': 'Hiển thị thông tin cá nhân',
    'settings.privacy.discoverable.desc':
      'Cho phép người dùng khác tìm thấy bạn qua Email khi chia sẻ tệp',
    'settings.privacy.shareRole.label': 'Quyền chia sẻ mặc định khi tạo Link',
    'settings.privacy.shareRole.viewer': 'Chỉ xem (Viewer)',
    'settings.privacy.shareRole.editor': 'Được chỉnh sửa (Editor)',
    'settings.privacy.shareRole.hint':
      'Áp dụng cho lần chia sẻ tiếp theo; các link đã tạo trước đó giữ nguyên quyền cũ.',
    // Chỉ còn nói về ô "Quyền chia sẻ mặc định": công tắc "Hiển thị thông tin cá
    // nhân" đã lưu ở máy chủ (cột users.is_discoverable_by_email) nên nó đồng bộ
    // giữa các thiết bị. Khoá 'settings.privacy.discoverable.notEnforced' cũ đã bị
    // xoá cùng lượt — máy chủ giờ thực thi thật ở FilesService.addShareAccess.
    'settings.privacy.localOnly':
      'Quyền chia sẻ mặc định hiện chỉ lưu trên trình duyệt của bạn, chưa đồng bộ giữa các thiết bị.',

    // Lỗi khi PATCH /users/me thất bại lúc bật/tắt công tắc. Câu này luôn hiện,
    // còn `err.message` của backend (nếu có) được ghép thêm phía sau như phần lý do.
    'settings.privacy.discoverable.saveError':
      'Không lưu được tuỳ chọn này lên máy chủ. Công tắc đã được trả về trạng thái trước đó, vui lòng thử lại.',

    // 5. Nhãn NGẮN trên 3 nút chọn theme — các khoá 'settings.theme.light|dark|
    //    system' ở trên là câu dài, chỉ vừa cho tooltip
    'settings.theme.lightShort': 'Sáng',
    'settings.theme.darkShort': 'Tối',
    'settings.theme.systemShort': 'Hệ thống',

    // 6. Tab Phím tắt
    'settings.shortcut.title': 'Danh sách phím tắt',
    'settings.shortcuts.enable.title': 'Sử dụng phím tắt nhanh',
    'settings.shortcuts.enable.desc': 'Cho phép dùng bàn phím để thao tác nhanh trên driveR',
    'settings.shortcuts.platform.label': 'Phím tắt theo hệ điều hành:',
    'settings.shortcuts.platform.hint': 'Khi nhiều tổ hợp cùng dòng, bạn dùng tổ hợp nào cũng được.',

    // 7. Hộp phản hồi — CHƯA có giao diện nào dùng (khối JSX đã gỡ khỏi
    //    SettingsModal.jsx). Giữ sẵn cho lúc làm thật tính năng này.
    'settings.feedback.title': 'Gửi phản hồi',
    'settings.feedback.desc': 'Chúng tôi luôn lắng nghe ý kiến của bạn.',

    // ── 8. Menu điều hướng bên trái (SideBar.jsx) ───────────────────────────
    // Cố ý KHÔNG dùng lại 'settings.startup.*': những khoá đó có phần chú thích
    // trong ngoặc ("Driver riêng của tôi (My Drive)") cho ô chọn trong Cài đặt,
    // dài quá cho một mục menu.
    'nav.home': 'Trang chủ',
    'nav.myDrive': 'Driver riêng của tôi',
    'nav.sharedDrives': 'Bộ nhớ dùng chung',
    'nav.sharedWithMe': 'Driver được chia sẻ với tôi',
    'nav.recent': 'Đã mở gần đây',
    'nav.starred': 'Mục được đánh dấu',
    'nav.spam': 'Nội dung rác',
    'nav.trash': 'Thùng rác',
    'nav.billing': 'Billing & Mua bộ nhớ',

    // ── 9. Khối bộ nhớ ở đáy SideBar ────────────────────────────────────────
    'sidebar.storage.title': 'Bộ nhớ lưu trữ',
    'sidebar.storage.tooltip': 'Bộ nhớ: {used} GB / {total} GB ({percent}%)',
    'sidebar.storage.almostFull': 'Gần đầy!',
    'sidebar.storage.warning': 'Cảnh báo',
    // Tách 2 khoá vì con số ở giữa được in đậm bằng <span> riêng
    'sidebar.storage.usedLabel': 'Đã dùng',
    'sidebar.storage.ofTotal': '/ {total} GB',
    'sidebar.storage.buy': 'Mua bộ nhớ',
    'sidebar.storage.cleanup': 'Dọn dẹp',
    'sidebar.storage.cleanupTitle': 'Dọn dẹp bộ nhớ ngay',

    // ── 10. Động từ dùng chung — nhiều màn hình khác cũng sẽ dùng lại ───────
    'common.close': 'Đóng',
    'common.delete': 'Xóa',
    'common.deleteForever': 'Xóa vĩnh viễn',
    'common.restore': 'Khôi phục',
    'common.cut': 'Cắt',
    'common.copy': 'Sao chép',
    'common.download': 'Tải xuống',
    'common.selectAll': 'Chọn tất cả',
    'common.deselectAll': 'Bỏ chọn tất cả',
    'common.login': 'Đăng nhập',
    'common.unknownError': 'lỗi không xác định',

    // ── 11. Thanh Header ────────────────────────────────────────────────────
    'header.selected': '{count} đã chọn',
    'header.sidebar.expand': 'Mở rộng sidebar',
    'header.sidebar.collapse': 'Thu gọn sidebar',
    'header.logo.title': 'Về trang Driver riêng của tôi',
    'header.search.placeholder': 'Tìm kiếm tệp, thư mục, driver trong driveR...',
    'header.search.filter': 'Bộ lọc tìm kiếm nâng cao',
    'header.activityLog': 'Lịch sử hoạt động',
    'header.settings': 'Cài đặt driveR',
    'header.account': 'Thông tin tài khoản',
    // Nhãn nút có kèm phím tắt — để nguyên trong bản dịch, không ghép ngoài JSX
    'header.action.cut': 'Cắt (Ctrl+X)',
    'header.action.copy': 'Sao chép (Ctrl+C)',
    // Hộp thoại xác nhận / nhập liệu
    'header.confirm.trash': 'Chuyển {count} mục vào thùng rác?',
    'header.confirm.restore': 'Khôi phục {count} mục?',
    'header.confirm.deleteForever':
      'Xóa vĩnh viễn {count} mục? Hành động này không thể hoàn tác!',
    'header.prompt.moveTarget': 'Nhập ID thư mục đích (để trống = gốc):',
    'header.prompt.copyTarget': 'Nhập ID thư mục đích cho sao chép (để trống = gốc):',
    // Thông báo thành công — gộp cho cả thao tác nhiều mục, nên luôn nêu {count}
    'header.success.delete': 'Đã chuyển {count} mục vào thùng rác',
    'header.success.restore': 'Đã khôi phục {count} mục',
    'header.success.deleteForever': 'Đã xóa vĩnh viễn {count} mục',
    'header.success.move': 'Đã di chuyển {count} mục',
    'header.success.copy': 'Đã sao chép {count} mục',
    'header.success.download': 'Đã tải {count} tệp',
    'header.zip.creating': 'Đang tạo tệp ZIP...',
    'header.success.zip': 'Đã tạo tệp ZIP, đang tải xuống',
    // Thông báo lỗi — hai bản cho mỗi thao tác: đúng một mục thất bại thì nêu
    // luôn nguyên nhân, nhiều mục thì nêu số lượng + một mục làm ví dụ (danh
    // sách đầy đủ đẩy ra console, toast góc phải không phải chỗ liệt kê)
    'header.error.delete': 'Không chuyển được "{name}" vào thùng rác: {reason}',
    'header.error.deletePartial':
      'Có {failed}/{total} mục không chuyển được vào thùng rác (vd. "{name}")',
    'header.error.restore': 'Không khôi phục được "{name}": {reason}',
    'header.error.restorePartial': 'Có {failed}/{total} mục không khôi phục được (vd. "{name}")',
    'header.error.deleteForever': 'Không xóa vĩnh viễn được "{name}": {reason}',
    'header.error.deleteForeverPartial':
      'Có {failed}/{total} mục không xóa vĩnh viễn được (vd. "{name}")',
    'header.error.move': 'Không di chuyển được "{name}": {reason}',
    'header.error.movePartial': 'Có {failed}/{total} mục không di chuyển được (vd. "{name}")',
    'header.error.copy': 'Không sao chép được "{name}": {reason}',
    'header.error.copyPartial': 'Có {failed}/{total} mục không sao chép được (vd. "{name}")',
    'header.error.download': 'Không tải được "{name}": {reason}',
    'header.error.downloadPartial': 'Có {failed}/{total} tệp không tải được (vd. "{name}")',
    'header.error.noDownloadUrl': 'không nhận được link tải',
    'header.error.zip': 'Tải xuống ZIP thất bại, vui lòng thử lại.',
  },

  en: {
    // Settings modal shell
    'settings.title': 'Settings',
    'settings.tab.general': 'General',
    'settings.tab.shortcuts': 'Keyboard shortcuts',
    'settings.tab.privacy': 'Privacy & Security',
    'settings.saveAndClose': 'Save & Close',

    // 1. Theme
    'settings.theme.heading': 'Appearance (Theme)',
    'settings.theme.light': 'Light mode',
    'settings.theme.dark': 'Dark mode',
    'settings.theme.system': 'Follow system',

    // 2. Language
    'settings.language.label': 'Interface language',
    'settings.language.vi': 'Tiếng Việt',
    'settings.language.en': 'English (US)',

    // 3. Startup page
    'settings.startup.label': 'Default startup page',
    'settings.startup.myDrive': 'My Drive',
    'settings.startup.home': 'Home (overview dashboard)',
    'settings.startup.recent': 'Recent files',

    // 4. Privacy & Security
    'settings.privacy.heading': 'Privacy & Security',
    'settings.privacy.discoverable.title': 'Show my personal information',
    'settings.privacy.discoverable.desc':
      'Let other people find you by email when they share files',
    'settings.privacy.shareRole.label': 'Default link sharing permission',
    'settings.privacy.shareRole.viewer': 'Viewer only',
    'settings.privacy.shareRole.editor': 'Editor',
    'settings.privacy.shareRole.hint':
      'Applies to your next share; links you already created keep their current permission.',
    // Now about the default-share-permission select only: the "Show my personal
    // information" switch is stored server-side (users.is_discoverable_by_email),
    // so it does sync across devices. The old
    // 'settings.privacy.discoverable.notEnforced' key was dropped in the same
    // change — the server now enforces the switch in FilesService.addShareAccess.
    'settings.privacy.localOnly':
      'The default sharing permission is stored in this browser only — it does not sync across devices yet.',

    // Shown when PATCH /users/me fails while toggling the switch. Always shown;
    // the backend's `err.message`, if any, is appended after it as the reason.
    'settings.privacy.discoverable.saveError':
      'Could not save this setting to the server. The switch has been reverted — please try again.',

    // 5. Short labels for the 3 theme buttons — the 'settings.theme.light|dark|
    //    system' keys above are full sentences, tooltip-sized only
    'settings.theme.lightShort': 'Light',
    'settings.theme.darkShort': 'Dark',
    'settings.theme.systemShort': 'System',

    // 6. Shortcuts tab
    'settings.shortcut.title': 'Keyboard Shortcuts',
    'settings.shortcuts.enable.title': 'Enable keyboard shortcuts',
    'settings.shortcuts.enable.desc': 'Let you drive driveR from the keyboard instead of the mouse',
    'settings.shortcuts.platform.label': 'Shortcuts shown for your OS:',
    'settings.shortcuts.platform.hint': 'When a row lists several combos, any one of them works.',

    // 7. Feedback box — no UI uses these yet (the JSX block was removed from
    //    SettingsModal.jsx). Kept ready for when the feature is built.
    'settings.feedback.title': 'Send Feedback',
    'settings.feedback.desc': 'We always listen to your feedback.',

    // ── 8. Left navigation menu (SideBar.jsx) ───────────────────────────────
    // Deliberately NOT reusing 'settings.startup.*': those carry a parenthetical
    // gloss for the Settings dropdown and are too long for a menu row.
    'nav.home': 'Home',
    'nav.myDrive': 'My Drive',
    'nav.sharedDrives': 'Shared drives',
    'nav.sharedWithMe': 'Shared with me',
    'nav.recent': 'Recent',
    'nav.starred': 'Starred',
    'nav.spam': 'Spam',
    'nav.trash': 'Trash',
    'nav.billing': 'Billing & storage',

    // ── 9. Storage block at the bottom of the SideBar ───────────────────────
    'sidebar.storage.title': 'Storage',
    'sidebar.storage.tooltip': 'Storage: {used} GB / {total} GB ({percent}%)',
    'sidebar.storage.almostFull': 'Almost full!',
    'sidebar.storage.warning': 'Warning',
    // Two keys because the number in between is bolded by its own <span>
    'sidebar.storage.usedLabel': 'Used',
    'sidebar.storage.ofTotal': 'of {total} GB',
    'sidebar.storage.buy': 'Get storage',
    'sidebar.storage.cleanup': 'Clean up',
    'sidebar.storage.cleanupTitle': 'Free up space now',

    // ── 10. Shared verbs — other screens will reuse these ───────────────────
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.deleteForever': 'Delete permanently',
    'common.restore': 'Restore',
    'common.cut': 'Cut',
    'common.copy': 'Copy',
    'common.download': 'Download',
    'common.selectAll': 'Select all',
    'common.deselectAll': 'Deselect all',
    'common.login': 'Sign in',
    'common.unknownError': 'unknown error',

    // ── 11. Header bar ──────────────────────────────────────────────────────
    'header.selected': '{count} selected',
    'header.sidebar.expand': 'Expand sidebar',
    'header.sidebar.collapse': 'Collapse sidebar',
    'header.logo.title': 'Back to My Drive',
    'header.search.placeholder': 'Search files, folders and drives in driveR...',
    'header.search.filter': 'Advanced search filters',
    'header.activityLog': 'Activity history',
    'header.settings': 'driveR settings',
    'header.account': 'Account details',
    // Button labels that carry a shortcut — kept inside the translation, not
    // concatenated in JSX
    'header.action.cut': 'Cut (Ctrl+X)',
    'header.action.copy': 'Copy (Ctrl+C)',
    // Confirm / prompt dialogs
    'header.confirm.trash': 'Move {count} item(s) to trash?',
    'header.confirm.restore': 'Restore {count} item(s)?',
    'header.confirm.deleteForever':
      'Permanently delete {count} item(s)? This cannot be undone!',
    'header.prompt.moveTarget': 'Enter the destination folder ID (leave empty for root):',
    'header.prompt.copyTarget':
      'Enter the destination folder ID for the copy (leave empty for root):',
    // Success messages — also used for batch actions, hence the {count}
    'header.success.delete': 'Moved {count} item(s) to trash',
    'header.success.restore': 'Restored {count} item(s)',
    'header.success.deleteForever': 'Permanently deleted {count} item(s)',
    'header.success.move': 'Moved {count} item(s)',
    'header.success.copy': 'Copied {count} item(s)',
    'header.success.download': 'Downloaded {count} file(s)',
    'header.zip.creating': 'Creating ZIP file...',
    'header.success.zip': 'ZIP file ready, downloading',
    // Error messages — two variants per action: a single failure names the
    // reason, several failures name the count plus one example (the full list
    // goes to the console; a corner toast is no place for it)
    'header.error.delete': 'Could not move "{name}" to trash: {reason}',
    'header.error.deletePartial': 'Could not move {failed}/{total} item(s) to trash (e.g. "{name}")',
    'header.error.restore': 'Could not restore "{name}": {reason}',
    'header.error.restorePartial': 'Could not restore {failed}/{total} item(s) (e.g. "{name}")',
    'header.error.deleteForever': 'Could not permanently delete "{name}": {reason}',
    'header.error.deleteForeverPartial':
      'Could not permanently delete {failed}/{total} item(s) (e.g. "{name}")',
    'header.error.move': 'Could not move "{name}": {reason}',
    'header.error.movePartial': 'Could not move {failed}/{total} item(s) (e.g. "{name}")',
    'header.error.copy': 'Could not copy "{name}": {reason}',
    'header.error.copyPartial': 'Could not copy {failed}/{total} item(s) (e.g. "{name}")',
    'header.error.download': 'Could not download "{name}": {reason}',
    'header.error.downloadPartial': 'Could not download {failed}/{total} file(s) (e.g. "{name}")',
    'header.error.noDownloadUrl': 'no download link returned',
    'header.error.zip': 'ZIP download failed, please try again.',
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
