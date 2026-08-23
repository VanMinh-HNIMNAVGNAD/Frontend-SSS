import { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  Keyboard,
  Sun,
  Moon,
  Laptop,
  Lock,
  MessageSquare,
  Key,
} from 'lucide-react';

// ── Khoá localStorage cho tab "Cài đặt chung" (lưu phía client, KHÔNG lưu DB) ──
const LS_THEME = 'driveR_settings_theme';
const LS_LANGUAGE = 'driveR_settings_language';
const LS_SHORTCUTS = 'driveR_settings_shortcuts_enabled';

// Khoá dark mode cũ mà RightSideBar.jsx đang dùng — giữ nguyên tên để 2 nơi
// không sinh ra 2 cơ chế theme xung đột nhau
const LEGACY_THEME_KEY = 'theme';

/** Đọc lựa chọn theme đã lưu; chưa có thì trả về 'system' */
function readSavedTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  // Chưa từng lưu: kế thừa lựa chọn dark mode cũ của RightSideBar.jsx nếu có
  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  return legacy === 'dark' || legacy === 'light' ? legacy : 'system';
}

/** Quy đổi lựa chọn của người dùng ra giao diện thực tế sẽ hiển thị */
function resolveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

/** Áp dụng class dark lên <html> và đồng bộ khoá cũ cho RightSideBar.jsx */
function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  localStorage.setItem(LEGACY_THEME_KEY, resolved);
}

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');

  // General Settings State — đọc từ localStorage ngay lần render đầu (lazy init)
  const [theme, setTheme] = useState(readSavedTheme); // 'light' | 'dark' | 'system'
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem(LS_LANGUAGE); // 'vi' | 'en'
    return saved === 'vi' || saved === 'en' ? saved : 'vi';
  });
  const [defaultStartupPage, setDefaultStartupPage] = useState('my-drive'); // 'home' | 'my-drive' | 'recent'
  const [previewBehavior, setPreviewBehavior] = useState('double-click'); // 'auto-play' | 'double-click'

  // Security & Privacy State
  const [discoverableByEmail, setDiscoverableByEmail] = useState(true);
  const [defaultShareRole, setDefaultShareRole] = useState('VIEWER'); // 'VIEWER' | 'EDITOR'
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);

  // Keyboard Shortcuts State — mặc định bật nếu chưa từng lưu
  const [shortcutsEnabled, setShortcutsEnabled] = useState(
    () => localStorage.getItem(LS_SHORTCUTS) !== 'false'
  );

  // ── Handler: vừa cập nhật state, vừa ghi localStorage để không mất khi F5 ──
  const handleChangeTheme = (mode) => {
    setTheme(mode);
    localStorage.setItem(LS_THEME, mode);
    applyTheme(mode);
  };

  const handleChangeLanguage = (value) => {
    setLanguage(value);
    localStorage.setItem(LS_LANGUAGE, value);
  };

  const handleToggleShortcuts = (enabled) => {
    setShortcutsEnabled(enabled);
    localStorage.setItem(LS_SHORTCUTS, String(enabled));
  };

  // Feedback Dialog State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Áp dụng lại theme đã lưu ngay khi app khởi động — component này mount cùng
  // Header kể cả lúc modal đang đóng, nên F5 xong giao diện không bị mất lựa chọn
  useEffect(() => {
    applyTheme(readSavedTheme());
  }, []);

  const shortcutsList = [
    { key: 'N', label: 'Tạo thư mục mới' },
    { key: 'U / C', label: 'Tải tệp lên Cloud' },
    { key: '/ hoặc Ctrl + K', label: 'Nhảy nhanh tới thanh Tìm kiếm' },
    { key: 'Delete / Backspace', label: 'Chuyển tệp/thư mục được chọn vào Thùng rác' },
    { key: 'R', label: 'Đổi tên tệp (Rename)' },
    { key: 'S', label: 'Bật / Tắt đánh dấu sao (Star)' },
    { key: 'Enter', label: 'Mở thư mục hoặc xem trước tệp' },
  ];

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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cài đặt driveR</h2>
              <p className="text-xs text-gray-500">Tùy chỉnh giao diện, quyền riêng tư và phím tắt cá nhân</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Left Tabs */}
          <div className="w-56 bg-gray-50/70 border-r border-gray-200 p-3 flex flex-col gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-left transition-all ${
                activeTab === 'general'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-200/70'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>A. Cài đặt chung</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-left transition-all ${
                activeTab === 'security'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-200/70'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>B. Quyền riêng tư & Bảo mật</span>
            </button>

            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-left transition-all ${
                activeTab === 'shortcuts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-200/70'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>C. Phím tắt</span>
            </button>


          </div>

          {/* Right Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* A. CÀI ĐẶT CHUNG */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* 1. Theme */}
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
                    Chủ đề giao diện (Theme)
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleChangeTheme('light')}
                      title="Chế độ sáng (Light)"
                      className={`flex items-center justify-center py-3 rounded-2xl border transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-600 shadow-xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Sun className="w-5 h-5 text-amber-500" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeTheme('dark')}
                      title="Chế độ tối (Dark)"
                      className={`flex items-center justify-center py-3 rounded-2xl border transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-600 shadow-xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Moon className="w-5 h-5 text-indigo-500" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeTheme('system')}
                      title="Theo hệ thống (System)"
                      className={`flex items-center justify-center py-3 rounded-2xl border transition-all cursor-pointer ${
                        theme === 'system'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-600 shadow-xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <Laptop className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* 2. Ngôn ngữ */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-900 mb-2">Ngôn ngữ giao diện</label>
                  <select
                    value={language}
                    onChange={(e) => handleChangeLanguage(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:border-blue-600 outline-none"
                  >
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 English (US)</option>
                  </select>
                </div>

                {/* 3. Trang khởi động */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-900 mb-2">Trang khởi động mặc định</label>
                  <select
                    value={defaultStartupPage}
                    onChange={(e) => setDefaultStartupPage(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:border-blue-600 outline-none"
                  >
                    <option value="my-drive">📁 Driver riêng của tôi (My Drive)</option>
                    <option value="home">🏠 Trang chủ (Dashboard tổng quan)</option>
                    <option value="recent">🕒 Đã mở gần đây (Recent files)</option>
                  </select>
                </div>

                {/* 4. Xem trước file */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-900 mb-2">Xem trước tệp (File Preview)</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 text-xs text-gray-800 font-medium">
                      <input
                        type="radio"
                        name="preview"
                        value="double-click"
                        checked={previewBehavior === 'double-click'}
                        onChange={() => setPreviewBehavior('double-click')}
                        className="text-blue-600"
                      />
                      <span>Chỉ mở xem trước khi nhấp đúp chuột (Double-click)</span>
                    </label>

                    <label className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 text-xs text-gray-800 font-medium">
                      <input
                        type="radio"
                        name="preview"
                        value="auto-play"
                        checked={previewBehavior === 'auto-play'}
                        onChange={() => setPreviewBehavior('auto-play')}
                        className="text-blue-600"
                      />
                      <span>Tự động mở xem trước / phát Video & Audio khi bấm chọn</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* B. QUYỀN RIÊNG TƯ & BẢO MẬT */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Hiển thị thông tin cá nhân & Quyền chia sẻ */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-2xl bg-gray-50/50">
                    <div>
                      <div className="text-xs font-bold text-gray-900">Hiển thị thông tin cá nhân</div>
                      <div className="text-[11px] text-gray-500">
                        Cho phép người dùng khác tìm thấy bạn qua Email khi chia sẻ tệp
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={discoverableByEmail}
                      onChange={(e) => setDiscoverableByEmail(e.target.checked)}
                      className="w-5 h-5 text-blue-600 rounded-md cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-2">
                      Quyền chia sẻ mặc định khi tạo Link
                    </label>
                    <select
                      value={defaultShareRole}
                      onChange={(e) => setDefaultShareRole(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white focus:border-blue-600 outline-none"
                    >
                      <option value="VIEWER">👀 Chỉ xem (Viewer)</option>
                      <option value="EDITOR">✏️ Được chỉnh sửa (Editor)</option>
                    </select>
                  </div>
                </div>

                {/* Bảo mật tài khoản */}
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Bảo mật tài khoản</h3>

                  <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-amber-500 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-gray-900">Đổi mật khẩu</div>
                        <div className="text-[11px] text-gray-500">Nên thay đổi mật khẩu định kỳ 6 tháng một lần</div>
                      </div>
                    </div>
                    <button
                      onClick={() => alert('🔒 Tính năng Đổi mật khẩu: Đã gửi mã xác nhận về Email của bạn.')}
                      className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-colors"
                    >
                      Đổi mật khẩu
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-purple-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-gray-900">Xác thực 2 bước (2FA)</div>
                        <div className="text-[11px] text-gray-500">Bảo vệ tài khoản bằng mã OTP Google Authenticator</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTwoFactorAuth(!twoFactorAuth);
                        alert(twoFactorAuth ? '❌ Đã tắt 2FA' : '✅ Đã kích hoạt 2FA!');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                        twoFactorAuth ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {twoFactorAuth ? 'Đã bật 2FA' : 'Kích hoạt 2FA'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* C. PHÍM TẮT */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 border border-gray-200 rounded-2xl bg-gray-50">
                  <div>
                    <div className="text-xs font-bold text-gray-900">Sử dụng phím tắt nhanh</div>
                    <div className="text-[11px] text-gray-500">Cho phép dùng bàn phím để thao tác nhanh trên driveR</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shortcutsEnabled}
                    onChange={(e) => handleToggleShortcuts(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded-md cursor-pointer"
                  />
                </div>

                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
                  {shortcutsList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 text-xs bg-white">
                      <span className="text-gray-700 font-medium">{item.label}</span>
                      <kbd className="px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-lg font-mono font-bold text-gray-900 shadow-2xs">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3.5 border-t border-gray-200 bg-gray-50/80">
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors shadow-sm"
          >
            Lưu & Đóng
          </button>
        </div>
      </div>

      {/* Feedback Modal Overlay */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 border border-gray-200 shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" /> Gửi phản hồi / Báo lỗi
            </h3>
            <textarea
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Nhập chi tiết ý kiến đóng góp hoặc lỗi bạn gặp phải..."
              className="w-full border border-gray-300 rounded-xl p-3 text-xs outline-none focus:border-blue-600"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={handleSendFeedback}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
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
