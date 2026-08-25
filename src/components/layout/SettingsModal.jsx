import { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Keyboard,
  Sun,
  Moon,
  Laptop,
  MessageSquare,
} from 'lucide-react';
import { SHORTCUT_HINTS, PLATFORM_LABEL } from '../../hooks/useGlobalShortcuts';
import useTheme from '../../hooks/useTheme';
import { useLanguage } from '../../context/LanguageContext';
import { STARTUP_PAGE_KEY, readStartupPage } from '../../constants/routes';

// ── Khoá localStorage cho tab "Cài đặt chung" (lưu phía client, KHÔNG lưu DB) ──
const LS_SHORTCUTS = 'driveR_settings_shortcuts_enabled';
// Ngôn ngữ không còn khoá riêng ở đây — LanguageContext.jsx giữ state + localStorage
// Theme cũng vậy: toàn bộ khoá 'driveR_settings_theme', quy đổi 'system' và việc
// ghi class `dark` lên <html> nằm ở src/hooks/useTheme.js — modal này chỉ đọc/ghi
// qua hook đó nên không còn xung đột với nút toggle ở RightSideBar.jsx

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');

  // Ngôn ngữ dùng chung toàn app — state nằm ở LanguageContext để mọi component
  // khác cũng đổi text theo, không chỉ riêng modal này
  const { language, changeLanguage, t } = useLanguage();

  // General Settings State
  // Theme dùng chung toàn app — state nằm ở useTheme() nên nút toggle bên
  // RightSideBar.jsx và 3 nút dưới đây luôn hiển thị cùng một lựa chọn
  const { mode: theme, setMode: handleChangeTheme } = useTheme(); // 'light' | 'dark' | 'system'
  // Trang khởi động: đọc lại lựa chọn đã lưu (khoá + fallback nằm ở constants/routes.js
  // để AppRouter.jsx đọc đúng cùng một khoá)
  const [defaultStartupPage, setDefaultStartupPage] = useState(readStartupPage); // 'home' | 'my-drive' | 'recent'

  // Security & Privacy State
  const [discoverableByEmail, setDiscoverableByEmail] = useState(true);
  const [defaultShareRole, setDefaultShareRole] = useState('VIEWER'); // 'VIEWER' | 'EDITOR'

  // Keyboard Shortcuts State — mặc định bật nếu chưa từng lưu
  const [shortcutsEnabled, setShortcutsEnabled] = useState(
    () => localStorage.getItem(LS_SHORTCUTS) !== 'false'
  );

  // ── Handler: vừa cập nhật state, vừa ghi localStorage để không mất khi F5 ──
  // (handleChangeTheme đến từ useTheme() — đã tự lưu + tự áp dụng lên <html>)
  const handleChangeStartupPage = (page) => {
    setDefaultStartupPage(page);
    localStorage.setItem(STARTUP_PAGE_KEY, page);
  };

  const handleToggleShortcuts = (enabled) => {
    setShortcutsEnabled(enabled);
    localStorage.setItem(LS_SHORTCUTS, String(enabled));
  };

  // Feedback Dialog State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Không cần useEffect áp dụng theme lúc mount nữa: src/hooks/useTheme.js áp
  // dụng ngay khi module được import (trước lần render đầu), nên F5 không nháy
  // sáng và cũng không phụ thuộc vào việc modal này có được mount hay không.

  // Bảng phím tắt lấy thẳng từ hook — đã format sẵn theo hệ điều hành đang chạy,
  // nên phần hiển thị không bao giờ lệch với phím thật sự đang được lắng nghe.
  const shortcutsList = SHORTCUT_HINTS;

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

  const handleSendFeedback = () => {
    if (!feedbackText.trim()) return;
    alert('🎉 Cảm ơn bạn đã gửi phản hồi! Đội ngũ phát triển driveR sẽ phản hồi qua Email.');
    setFeedbackText('');
    setShowFeedbackModal(false);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-[614px] overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200 border border-gray-100 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
              <Settings className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('settings.title')}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 rounded-full transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Left Tabs */}
          <div className="w-44 bg-gray-50/70 border-r border-gray-200 p-2.5 flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
                activeTab === 'general'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-700 hover:bg-gray-200/70'
              }`}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('settings.tab.general')}</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
                activeTab === 'shortcuts'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-700 hover:bg-gray-200/70'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('settings.tab.shortcuts')}</span>
            </button>
          </div>

          {/* Right Main Content */}
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto">
            {/* CÀI ĐẶT CHUNG */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* 1. Theme */}
                <div>
                  <h3 className="text-[11px] font-bold text-gray-800 uppercase tracking-wider mb-2">
                    {t('settings.theme.heading')}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleChangeTheme('light')}
                      title={t('settings.theme.light')}
                      className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl border gap-1 transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'border-blue-600 bg-blue-50/60 text-blue-600 font-semibold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Sun className="w-4.5 h-4.5 text-amber-500" />
                      <span className="text-[11px] leading-none">
                        {language === 'vi' ? 'Sáng' : 'Light'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeTheme('dark')}
                      title={t('settings.theme.dark')}
                      className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl border gap-1 transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'border-blue-600 bg-blue-50/60 text-blue-600 font-semibold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Moon className="w-4.5 h-4.5 text-indigo-500" />
                      <span className="text-[11px] leading-none">
                        {language === 'vi' ? 'Tối' : 'Dark'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeTheme('system')}
                      title={t('settings.theme.system')}
                      className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl border gap-1 transition-all cursor-pointer ${
                        theme === 'system'
                          ? 'border-blue-600 bg-blue-50/60 text-blue-600 font-semibold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Laptop className="w-4.5 h-4.5 text-slate-500" />
                      <span className="text-[11px] leading-none">
                        {language === 'vi' ? 'Hệ thống' : 'System'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Ngôn ngữ */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-800 mb-1.5">{t('settings.language.label')}</label>
                  <select
                    value={language}
                    onChange={(e) => changeLanguage(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white text-gray-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
                  >
                    <option value="vi">{t('settings.language.vi')}</option>
                    <option value="en">{t('settings.language.en')}</option>
                  </select>
                </div>

                {/* 3. Trang khởi động */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-800 mb-1.5">{t('settings.startup.label')}</label>
                  <select
                    value={defaultStartupPage}
                    onChange={(e) => handleChangeStartupPage(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white text-gray-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
                  >
                    <option value="my-drive">{t('settings.startup.myDrive')}</option>
                    <option value="home">{t('settings.startup.home')}</option>
                    <option value="recent">{t('settings.startup.recent')}</option>
                  </select>
                </div>

                {/* 4. Quyền riêng tư & Bảo mật */}
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <h3 className="text-[11px] font-bold text-gray-800 uppercase tracking-wider">
                    {t('settings.privacy.heading')}
                  </h3>

                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50/50">
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-gray-900">{t('settings.privacy.discoverable.title')}</div>
                      <div className="text-[11px] text-gray-500 leading-tight">
                        {t('settings.privacy.discoverable.desc')}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={discoverableByEmail}
                      onChange={(e) => setDiscoverableByEmail(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1.5">
                      {t('settings.privacy.shareRole.label')}
                    </label>
                    <select
                      value={defaultShareRole}
                      onChange={(e) => setDefaultShareRole(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white text-gray-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-colors"
                    >
                      <option value="VIEWER">{t('settings.privacy.shareRole.viewer')}</option>
                      <option value="EDITOR">{t('settings.privacy.shareRole.editor')}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PHÍM TẮT */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50/60">
                  <div className="pr-3">
                    <div className="text-xs font-semibold text-gray-900">Sử dụng phím tắt nhanh</div>
                    <div className="text-[11px] text-gray-500 leading-tight">Cho phép dùng bàn phím để thao tác nhanh trên driveR</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shortcutsEnabled}
                    onChange={(e) => handleToggleShortcuts(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                  />
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {shortcutsList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white hover:bg-gray-50/50 transition-colors">
                      <span className="text-gray-700 font-medium text-xs truncate">{item.label}</span>
                      {/* Mỗi tổ hợp là một chip riêng — dòng dài tự xuống hàng thay vì tràn */}
                      <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[55%]">
                        {item.keys.map((combo, i) => (
                          <kbd
                            key={i}
                            className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded-md font-mono text-[11px] font-semibold text-gray-800 shadow-2xs whitespace-nowrap"
                          >
                            {combo}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vì sao bảng phím trên máy bạn có thể khác máy đồng nghiệp */}
                <p className="text-[11px] text-gray-400 leading-relaxed px-0.5">
                  Phím tắt theo hệ điều hành:{' '}
                  <span className="font-semibold text-gray-600">{PLATFORM_LABEL}</span>. Khi nhiều tổ
                  hợp cùng dòng, bạn dùng tổ hợp nào cũng được.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs"
          >
            {t('settings.saveAndClose')}
          </button>
        </div>
      </div>

      {/* Feedback Modal Overlay */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3.5 border border-gray-200 shadow-2xl text-left">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4.5 h-4.5 text-blue-600" /> Gửi phản hồi / Báo lỗi
            </h3>
            <textarea
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Nhập chi tiết ý kiến đóng góp hoặc lỗi bạn gặp phải..."
              className="w-full border border-gray-300 rounded-xl p-2.5 text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSendFeedback}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                Gửi phản hồi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
