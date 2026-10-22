import { useState, useEffect } from 'react';
import { X, Settings, Keyboard, Sun, Moon, Laptop, ShieldCheck } from 'lucide-react';
import {
  SHORTCUT_HINTS,
  PLATFORM_LABEL,
  PLATFORM_LABEL_KEY,
  SHORTCUTS_ENABLED_KEY,
  areShortcutsEnabled,
} from '../../hooks/useGlobalShortcuts';
import useTheme from '../../hooks/useTheme';
import { useLanguage } from '../../context/LanguageContext';
import { userApi } from '../../services/api';
import { STARTUP_PAGE_KEY, STARTUP_PAGES, readStartupPage } from '../../constants/routes';
import {
  PRIVACY_DISCOVERABLE_KEY,
  SHARE_ROLES,
  readDiscoverableByEmail,
  readDefaultShareRole,
  writeDefaultShareRole,
} from '../../constants/privacy';

// ─────────────────────────────────────────────────────────────────────────────
// Trừ MỘT ngoại lệ, cài đặt trong modal này là cấu hình THUẦN UI: lưu ở
// localStorage của trình duyệt, KHÔNG gọi API và KHÔNG lưu DB. Mỗi khoá được
// khai báo ở đúng file mà bên ĐỌC nó cũng import — modal chỉ là bên GHI:
//
//   • STARTUP_PAGE_KEY      → constants/routes.js  (AppRouter.jsx đọc)
//   • SHORTCUTS_ENABLED_KEY → hooks/useGlobalShortcuts.js (listener phím đọc)
//   • PRIVACY_SHARE_ROLE_KEY → constants/privacy.js (ShareModal.jsx đọc)
//   • driveR_settings_theme → hooks/useTheme.js (modal không tự chạm vào)
//   • driveR_settings_language → context/LanguageContext.jsx (nt)
//
// NGOẠI LỆ — PRIVACY_DISCOVERABLE_KEY: nguồn sự thật là cột
// `users.is_discoverable_by_email` ở DB, vì bên ĐỌC nó là BACKEND
// (FilesService.addShareAccess, lúc tra email người được chia sẻ) chứ không phải
// một màn hình nào của app này. localStorage chỉ còn là cache đọc-trước —
// handleToggleDiscoverable() ghi cache rồi PATCH /users/me.
//
// Không khai báo lại tên khoá dưới dạng chuỗi ở đây: lệch một ký tự là cài đặt
// ghi một nơi, đọc một nẻo mà không ai báo lỗi.
// ─────────────────────────────────────────────────────────────────────────────

/** Ghi localStorage không làm sập UI khi trình duyệt chặn storage (ẩn danh, iframe) */
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* không lưu được thì phiên này vẫn đổi bình thường, chỉ là F5 sẽ mất */
  }
}

/**
 * 3 lựa chọn theme — khai báo một chỗ thay vì lặp 3 khối JSX giống hệt nhau.
 * `value` được truyền thẳng cho `setMode()` của useTheme, nên bảng này không
 * được chứa giá trị nào ngoài 'light' | 'dark' | 'system'.
 */
const THEME_OPTIONS = [
  { value: 'light', Icon: Sun, iconClass: 'text-amber-500', titleKey: 'settings.theme.light', labelKey: 'settings.theme.lightShort' },
  { value: 'dark', Icon: Moon, iconClass: 'text-indigo-500', titleKey: 'settings.theme.dark', labelKey: 'settings.theme.darkShort' },
  { value: 'system', Icon: Laptop, iconClass: 'text-slate-500', titleKey: 'settings.theme.system', labelKey: 'settings.theme.systemShort' },
];

/**
 * Các tab bên trái. Khai báo thành bảng vì 3 nút chỉ khác nhau đúng id/icon/
 * nhãn — thêm tab sau này là thêm một dòng, không phải chép lại cả khối JSX
 * kèm chuỗi class dài (chép tay là lúc chuỗi class bắt đầu lệch nhau).
 */
const TABS = [
  { id: 'general', Icon: Settings, labelKey: 'settings.tab.general' },
  { id: 'privacy', Icon: ShieldCheck, labelKey: 'settings.tab.privacy' },
  { id: 'shortcuts', Icon: Keyboard, labelKey: 'settings.tab.shortcuts' },
];

/**
 * Nhãn hiển thị cho từng slug trong STARTUP_PAGES.
 * Danh sách <option> render TỪ chính mảng STARTUP_PAGES (không gõ tay lại
 * value), nên thêm/bớt trang khởi động chỉ cần sửa constants/routes.js rồi
 * thêm một dòng ở đây; quên dòng đó thì `t()` trả về tên khoá và nhìn thấy ngay.
 */
const STARTUP_PAGE_LABEL_KEYS = {
  'my-drive': 'settings.startup.myDrive',
  home: 'settings.startup.home',
  recent: 'settings.startup.recent',
};

/** Nhãn cho từng quyền trong SHARE_ROLES — cùng quy ước với bảng ngay trên */
const SHARE_ROLE_LABEL_KEYS = {
  VIEWER: 'settings.privacy.shareRole.viewer',
  EDITOR: 'settings.privacy.shareRole.editor',
};

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');

  // Ngôn ngữ dùng chung toàn app — state nằm ở LanguageContext để mọi component
  // khác cũng đổi text theo, không chỉ riêng modal này
  const { language, changeLanguage, t } = useLanguage();

  // General Settings State
  // Theme dùng chung toàn app — state nằm ở useTheme() nên nút toggle bên
  // RightSideBar.jsx và 3 nút dưới đây luôn hiển thị cùng một lựa chọn
  const { mode: theme, setMode: handleChangeTheme } = useTheme(); // 'light' | 'dark' | 'system'

  // Trang khởi động — readStartupPage() đã bọc try/catch và tự lọc giá trị lạ
  // về 'my-drive', nên state không bao giờ nhận slug không có trong STARTUP_PAGES
  const [defaultStartupPage, setDefaultStartupPage] = useState(readStartupPage);

  // Phím tắt — areShortcutsEnabled() cũng đã bọc try/catch; chưa từng lưu = bật
  const [shortcutsEnabled, setShortcutsEnabled] = useState(areShortcutsEnabled);

  // Security & Privacy State
  // `discoverableByEmail` được LƯU DB (cột users.is_discoverable_by_email) —
  // localStorage chỉ là cache đọc-trước, xem handleToggleDiscoverable() bên dưới.
  // `defaultShareRole` thì vẫn thuần localStorage: bảng `users` chưa có cột cho nó
  // (xem ghi chú trong constants/privacy.js).
  const [discoverableByEmail, setDiscoverableByEmail] = useState(readDiscoverableByEmail);
  const [defaultShareRole, setDefaultShareRole] = useState(readDefaultShareRole); // 'VIEWER' | 'EDITOR'

  // ── Handler: vừa cập nhật state, vừa ghi localStorage để không mất khi F5 ──
  // (Theme và Ngôn ngữ KHÔNG có handler ở đây: setMode() và changeLanguage() tự
  //  lưu lấy. Tự ghi thêm một lần nữa là tạo lại đúng cảnh hai nguồn sự thật.)
  const handleChangeStartupPage = (page) => {
    setDefaultStartupPage(page);
    safeSetItem(STARTUP_PAGE_KEY, page);
  };

  const handleToggleShortcuts = (enabled) => {
    setShortcutsEnabled(enabled);
    // Ghi dạng CHUỖI 'true' / 'false' — areShortcutsEnabled() so sánh với chuỗi
    // 'false', truyền boolean vào sẽ bị ép kiểu ngầm và sai ở nhánh tắt
    safeSetItem(SHORTCUTS_ENABLED_KEY, enabled ? 'true' : 'false');
  };

  // Công tắc DUY NHẤT trong modal này có nguồn sự thật ở SERVER (cột
  // users.is_discoverable_by_email). localStorage chỉ còn là cache đọc-trước để
  // modal không nháy giá trị mặc định lúc vừa mở — nên ghi cache TRƯỚC, gọi API
  // sau, rồi hoàn nguyên CẢ HAI nếu API thất bại. Bỏ bước hoàn nguyên là để lại
  // đúng cái bẫy mà tính năng này vừa thoát khỏi: UI hiện "đã ẩn" trong khi máy
  // chủ vẫn cho người khác tìm thấy mình.
  const handleToggleDiscoverable = async (enabled) => {
    const previous = discoverableByEmail;

    setDiscoverableByEmail(enabled);
    // Cùng lý do ép kiểu như handleToggleShortcuts: readDiscoverableByEmail()
    // so sánh với chuỗi 'false'
    safeSetItem(PRIVACY_DISCOVERABLE_KEY, enabled ? 'true' : 'false');

    try {
      await userApi.updateMe({ isDiscoverableByEmail: enabled });
    } catch (err) {
      setDiscoverableByEmail(previous);
      safeSetItem(PRIVACY_DISCOVERABLE_KEY, previous ? 'true' : 'false');
      // Ghép CẢ HAI câu, không chỉ err.message: câu của backend giải thích LÝ DO
      // nhưng không nói rằng công tắc vừa bị trả về trạng thái cũ — mà đó mới là
      // điều người dùng phải biết để không tưởng mình đã tắt xong.
      alert(`${t('settings.privacy.discoverable.saveError')}${err.message ? `\n\n${err.message}` : ''}`);
    }
  };

  const handleChangeShareRole = (role) => {
    setDefaultShareRole(role);
    // Lưu theo tài khoản đang đăng nhập (##79) — xem `bindShareRoleOwner`.
    writeDefaultShareRole(role);
    // TODO(backend): nối PATCH /api/v1/users/me như handler ngay trên.
    //
    // Bên ĐỌC: ShareModal.jsx gọi readDefaultShareRole() để khởi tạo ô quyền của
    // form "Thêm người có quyền truy cập", và đọc lại mỗi lần modal MỞ nên đổi ở
    // đây có hiệu lực ngay ở lần mở kế tiếp, khỏi F5.
    //
    // KHÔNG áp cho link công khai: backend không đọc `role` của link (link luôn chỉ
    // xem/tải), nên trước ##79 lựa chọn "Được chỉnh sửa" cho link là lời hứa suông.
  };

  // Không cần useEffect áp dụng theme lúc mount: src/hooks/useTheme.js áp dụng
  // ngay khi module được import (trước lần render đầu), nên F5 không nháy sáng
  // và cũng không phụ thuộc vào việc modal này có được mount hay không.

  // Bảng phím tắt lấy thẳng từ hook — đã format sẵn theo hệ điều hành đang chạy,
  // nên phần hiển thị không bao giờ lệch với phím thật sự đang được lắng nghe.
  // (item.label vẫn là tiếng Việt cứng trong useGlobalShortcuts.js — đổi ngôn
  //  ngữ không ăn vào cột này; muốn dịch thì phải sửa file hook đó.)
  const shortcutsList = SHORTCUT_HINTS;

  // Modal KHÔNG unmount khi đóng (chỉ `return null` ở dưới), nên các useState ở
  // trên chỉ chạy đúng MỘT lần cho cả vòng đời app. Phải đọc lại localStorage
  // mỗi lần MỞ, nếu không UI sẽ hiện giá trị cũ khi cài đặt bị đổi ở nơi khác:
  // tab khác của trình duyệt, hoặc màn hình khác cũng ghi các khoá này.
  //
  // Đồng bộ ngay trong lúc render thay vì trong useEffect: đây là mẫu chính
  // thức của React cho "state cần chỉnh lại khi prop đổi". Làm trong useEffect
  // thì lần render đầu sau khi mở vẫn vẽ ra giá trị CŨ rồi mới vẽ lại lần hai —
  // người dùng thấy giá trị nhảy, và eslint (react-hooks/set-state-in-effect)
  // cũng chặn vì đó là render dây chuyền.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setDefaultStartupPage(readStartupPage());
      setShortcutsEnabled(areShortcutsEnabled());
      setDiscoverableByEmail(readDiscoverableByEmail());
      setDefaultShareRole(readDefaultShareRole());
    }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose && onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Dùng lại cho cả 3 <select> — cùng một kiểu ô nhập thì phải cùng một bộ màu
  const selectClass =
    'glass-input w-full border rounded-xl px-3 py-2 text-xs text-gray-800 dark:text-gray-100 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors';

  // Dùng lại cho 2 công tắc (phím tắt + hiển thị thông tin cá nhân)
  const switchClass = (on) =>
    `relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#2a2a2e] ${
      on ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
    }`;

  const switchKnobClass = (on) =>
    `inline-block h-3.5 w-3.5 rounded-full bg-white shadow-2xs transition-transform ${
      on ? 'translate-x-[19px]' : 'translate-x-[3px]'
    }`;

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4 duration-200 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-strong relative rounded-[28px] w-full max-w-[614px] overflow-hidden flex flex-col max-h-[88vh] border text-left animate-glass-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gray-50/80 dark:bg-white/5 border-glass-divider">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Left Tabs */}
          <div className="w-44 bg-gray-50/70 dark:bg-white/5 border-r p-2.5 flex flex-col gap-1 shrink-0 border-glass-divider">
            {TABS.map(({ id, Icon, labelKey }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-pressed={activeTab === id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
                  activeTab === id
                    ? 'glass-active text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Right Main Content */}
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto">
            {/* CÀI ĐẶT CHUNG */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* 1. Theme */}
                <div>
                  <h3 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-2">
                    {t('settings.theme.heading')}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_OPTIONS.map(({ value, Icon, iconClass, titleKey, labelKey }) => (
                      <button
                        key={value}
                        type="button"
                        // setMode() của useTheme lo hết: ghi khoá driveR_settings_theme,
                        // quy đổi 'system' và bật/tắt class `dark` trên <html>
                        onClick={() => handleChangeTheme(value)}
                        title={t(titleKey)}
                        aria-pressed={theme === value}
                        className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl border gap-1 transition-all cursor-pointer ${
                          theme === value
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 font-bold shadow-2xs'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-300 font-medium'
                        }`}
                      >
                        <Icon className={`w-4.5 h-4.5 ${iconClass}`} />
                        <span className="text-[11px] leading-none">{t(labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Ngôn ngữ */}
                <div className="pt-2 border-t border-glass-divider">
                  <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{t('settings.language.label')}</label>
                  <select
                    value={language}
                    // changeLanguage() của LanguageContext tự lưu localStorage và tự
                    // cập nhật <html lang> — không tự ghi khoá ngôn ngữ ở đây nữa
                    onChange={(e) => changeLanguage(e.target.value)}
                    className={selectClass}
                  >
                    <option value="vi">{t('settings.language.vi')}</option>
                    <option value="en">{t('settings.language.en')}</option>
                  </select>
                </div>

                {/* 3. Trang khởi động */}
                <div className="pt-2 border-t border-glass-divider">
                  <label
                    htmlFor="startup-page-select"
                    className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5"
                  >
                    {t('settings.startup.label')}
                  </label>
                  <select
                    id="startup-page-select"
                    value={defaultStartupPage}
                    onChange={(e) => handleChangeStartupPage(e.target.value)}
                    className={selectClass}
                  >
                    {/* Render từ chính STARTUP_PAGES: value luôn khớp danh sách mà
                        readStartupPage() dùng để lọc, không thể gõ sai slug */}
                    {STARTUP_PAGES.map((page) => (
                      <option key={page} value={page}>
                        {t(STARTUP_PAGE_LABEL_KEYS[page] ?? page)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* QUYỀN RIÊNG TƯ & BẢO MẬT */}
            {activeTab === 'privacy' && (
              <div className="space-y-3.5">
                <h3 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                  {t('settings.privacy.heading')}
                </h3>

                {/* 1. Hiển thị thông tin cá nhân */}
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50/60 dark:bg-white/5">
                  <div className="pr-3">
                    <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {t('settings.privacy.discoverable.title')}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                      {t('settings.privacy.discoverable.desc')}
                    </div>
                  </div>

                  {/* Cùng kiểu công tắc với tab Phím tắt: <button role="switch">
                      chứ không phải <input type="checkbox"> — bàn phím và trình
                      đọc màn hình vẫn hiểu đúng là công tắc bật/tắt. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={discoverableByEmail}
                    aria-label={t('settings.privacy.discoverable.title')}
                    onClick={() => handleToggleDiscoverable(!discoverableByEmail)}
                    className={switchClass(discoverableByEmail)}
                  >
                    <span className={switchKnobClass(discoverableByEmail)} />
                  </button>
                </div>

                {/* 2. Quyền chia sẻ mặc định khi tạo link */}
                <div className="pt-1">
                  <label
                    htmlFor="share-role-select"
                    className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5"
                  >
                    {t('settings.privacy.shareRole.label')}
                  </label>
                  <select
                    id="share-role-select"
                    value={defaultShareRole}
                    onChange={(e) => handleChangeShareRole(e.target.value)}
                    className={selectClass}
                  >
                    {/* Render từ chính SHARE_ROLES: value luôn khớp danh sách mà
                        readDefaultShareRole() dùng để lọc, không thể gõ sai */}
                    {SHARE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(SHARE_ROLE_LABEL_KEYS[role] ?? role)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed px-0.5">
                    {t('settings.privacy.shareRole.hint')}
                  </p>
                </div>

                {/* Nói thẳng giới hạn còn lại: ô "Quyền chia sẻ mặc định" ngay trên
                    chỉ nằm trên máy này. Không có dòng này thì đổi máy thấy giá trị
                    khác sẽ bị hiểu thành lỗi mất cài đặt. Công tắc ở đầu tab KHÔNG
                    còn thuộc diện này nữa — nó đã lưu DB, nên câu chữ của
                    'settings.privacy.localOnly' chỉ nói về ô chọn quyền. Gỡ đi khi
                    quyền mặc định cũng được đồng bộ (xem constants/privacy.js). */}
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed px-0.5 pt-1 border-t border-glass-divider">
                  {t('settings.privacy.localOnly')}
                </p>
              </div>
            )}

            {/* PHÍM TẮT */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50/60 dark:bg-white/5">
                  <div className="pr-3">
                    <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {t('settings.shortcuts.enable.title')}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                      {t('settings.shortcuts.enable.desc')}
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={shortcutsEnabled}
                    aria-label={t('settings.shortcuts.enable.title')}
                    onClick={() => handleToggleShortcuts(!shortcutsEnabled)}
                    className={switchClass(shortcutsEnabled)}
                  >
                    <span className={switchKnobClass(shortcutsEnabled)} />
                  </button>
                </div>

                <div>
                  <h3 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-2">
                    {t('settings.shortcut.title')}
                  </h3>

                  {/* Tắt phím tắt thì bảng mờ đi — nếu vẫn hiện y như cũ, người
                      dùng không có cách nào biết công tắc vừa rồi có tác dụng gì */}
                  <div
                    className={`border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-700 transition-opacity ${
                      shortcutsEnabled ? '' : 'opacity-50'
                    }`}
                  >
                    {shortcutsList.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white dark:bg-transparent hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors">
                        <span className="text-gray-900 dark:text-gray-200 font-semibold text-xs truncate">{t(item.labelKey)}</span>
                        {/* Mỗi tổ hợp là một chip riêng — dòng dài tự xuống hàng thay vì tràn */}
                        <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[55%]">
                          {item.keys.map((combo, i) => (
                            <kbd
                              key={i}
                              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-[11px] font-bold text-gray-900 dark:text-gray-100 shadow-2xs whitespace-nowrap"
                            >
                              {combo}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vì sao bảng phím trên máy bạn có thể khác máy đồng nghiệp */}
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed px-0.5">
                  {t('settings.shortcuts.platform.label')}{' '}
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{PLATFORM_LABEL ?? t(PLATFORM_LABEL_KEY)}</span>.{' '}
                  {t('settings.shortcuts.platform.hint')}
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Footer — mọi lựa chọn đã được lưu ngay lúc bấm, nút này chỉ để đóng */}
        <div className="flex justify-end px-5 py-3 border-t bg-gray-50/80 dark:bg-white/5 border-glass-divider">
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-semibold btn-accent hover:brightness-105 rounded-xl transition-all shadow-xs"
          >
            {t('settings.saveAndClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
