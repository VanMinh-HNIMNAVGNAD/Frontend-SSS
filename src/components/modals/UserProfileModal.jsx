import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  User as UserIcon,
  Lock,
  Save,
  Loader2,
  Mail,
  ShieldCheck,
  Camera,
  Laptop,
  Smartphone,
  Monitor,
  LogOut,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  HardDrive,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { userApi } from '../../services/api';

/**
 * Helper phân tích User-Agent để hiển thị icon và tên thiết bị thân thiện
 */
function parseUserAgent(uaString = '') {
  const ua = uaString.toLowerCase();
  let deviceName = 'Thiết bị không xác định';
  let browserName = 'Trình duyệt Web';
  let Icon = Monitor;

  if (ua.includes('windows')) {
    deviceName = 'Windows PC';
    Icon = Laptop;
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    deviceName = 'MacBook / macOS';
    Icon = Laptop;
  } else if (ua.includes('iphone')) {
    deviceName = 'iPhone';
    Icon = Smartphone;
  } else if (ua.includes('ipad')) {
    deviceName = 'iPad';
    Icon = Smartphone;
  } else if (ua.includes('android')) {
    deviceName = 'Android Device';
    Icon = Smartphone;
  } else if (ua.includes('linux')) {
    deviceName = 'Linux Workstation';
    Icon = Laptop;
  }

  if (ua.includes('edg/')) {
    browserName = 'Microsoft Edge';
  } else if (ua.includes('chrome') && !ua.includes('edg/')) {
    browserName = 'Google Chrome';
  } else if (ua.includes('firefox')) {
    browserName = 'Mozilla Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browserName = 'Apple Safari';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browserName = 'Opera Browser';
  }

  return {
    deviceString: `${deviceName} • ${browserName}`,
    Icon,
  };
}

/**
 * Helper định dạng thời gian thân thiện
 */
function formatSessionDate(dateString) {
  if (!dateString) return 'Gần đây';
  try {
    const d = new Date(dateString);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export default function UserProfileModal({ isOpen, onClose }) {
  const { user, refreshUser, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Modal Tabs State
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password' | 'sessions'

  // Tab 1: Profile State
  const [fullName, setFullName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Tab 2: Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Tab 3: Sessions State
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  // Danger Zone: Delete Account Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmedCheckbox, setDeleteConfirmedCheckbox] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Fetch initial profile & reset states on open
  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.fullName || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('profile');
      setShowDeleteModal(false);
      setDeletePassword('');
      setDeleteConfirmedCheckbox(false);
      setDeleteConfirmText('');

      // Đồng bộ thông tin mới nhất từ API
      userApi
        .getMe()
        .then((profileData) => {
          if (profileData?.fullName) {
            setFullName(profileData.fullName);
          }
        })
        .catch((err) => {
          console.error('[UserProfileModal] Failed to get latest user profile:', err);
        });
    }
  }, [isOpen, user]);

  // Fetch sessions when switching to sessions tab
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const data = await userApi.getMySessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Không thể tải danh sách thiết bị đang đăng nhập');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'sessions') {
      fetchSessions();
    }
  }, [isOpen, activeTab]);

  if (!isOpen || !user) return null;

  // 1. Xử lý Upload Avatar
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ chấp nhận tệp hình ảnh (PNG, JPG, WEBP, ...)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh đại diện không được vượt quá 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await userApi.updateAvatar(formData);
      await refreshUser();
      toast.success('Đã cập nhật ảnh đại diện thành công!');
    } catch (err) {
      toast.error(err.message || 'Lỗi khi tải ảnh đại diện');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 2. Xử lý Cập nhật Tên hiển thị
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error('Tên hiển thị phải có ít nhất 2 ký tự');
      return;
    }

    setIsSavingProfile(true);
    try {
      await userApi.updateMe({ fullName: fullName.trim() });
      await refreshUser();
      toast.success('Cập nhật thông tin thành công!');
    } catch (err) {
      toast.error(err.message || 'Lỗi khi cập nhật thông tin');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // 3. Xử lý Đổi Mật khẩu
  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp với mật khẩu mới');
      return;
    }

    setIsChangingPassword(true);
    try {
      await userApi.updatePassword({ currentPassword, newPassword });
      toast.success('Đã thay đổi mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Lỗi khi thay đổi mật khẩu');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 4. Xử lý Thu hồi 1 Session
  const handleRevokeSession = async (sessionId) => {
    setRevokingSessionId(sessionId);
    try {
      await userApi.revokeSession(sessionId);
      toast.success('Đã thu hồi phiên đăng nhập thành công!');
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || 'Lỗi khi thu hồi phiên đăng nhập');
    } finally {
      setRevokingSessionId(null);
    }
  };

  // 5. Xử lý Đăng xuất tất cả thiết bị khác
  const handleRevokeAllOtherSessions = async () => {
    setIsRevokingAll(true);
    try {
      await userApi.revokeAllOtherSessions();
      toast.success('Đã đăng xuất khỏi tất cả các thiết bị khác thành công!');
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || 'Lỗi khi đăng xuất các thiết bị khác');
    } finally {
      setIsRevokingAll(false);
    }
  };

  // 6. Xử lý Xoá tài khoản vĩnh viễn
  const handleDeleteAccount = async () => {
    const isLocal = user.provider === 'local';
    if (isLocal && !deletePassword) {
      toast.error('Vui lòng nhập mật khẩu để xác nhận xoá tài khoản');
      return;
    }

    if (!isLocal && !deleteConfirmedCheckbox) {
      toast.error('Vui lòng đánh dấu xác nhận đồng ý xoá dữ liệu');
      return;
    }

    if (deleteConfirmText.trim() !== 'DELETE') {
      toast.error('Vui lòng nhập chính xác từ "DELETE" để xác nhận');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteAccount(isLocal ? deletePassword : null);
      toast.success('Tài khoản của bạn và toàn bộ dữ liệu đã được xoá vĩnh viễn');
      setShowDeleteModal(false);
      onClose();
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Lỗi khi xoá tài khoản');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Tính toán dung lượng lưu trữ
  const storageUsedGB = user?.storageInfo?.usedGB || (Number(user?.storageUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(2);
  const storageLimitGB = user?.storageInfo?.limitGB || (Number(user?.storageLimitBytes || 2147483648) / (1024 * 1024 * 1024)).toFixed(2);
  const storagePercentage = user?.storageInfo?.percentage ?? Math.min(100, Math.round((Number(user?.storageUsedBytes || 0) / Number(user?.storageLimitBytes || 2147483648)) * 100));

  const initialLetter = (user?.fullName || user?.email || 'U').charAt(0).toUpperCase();

  // Kiểm tra điều kiện enable nút Xoá tài khoản
  const isDeleteButtonEnabled =
    deleteConfirmText.trim() === 'DELETE' &&
    (user.provider === 'local' ? deletePassword.length >= 1 : deleteConfirmedCheckbox);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Main Modal */}
      <div
        className="relative bg-white dark:bg-[#282a2c] rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">Tài khoản cá nhân</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Quản lý thông tin, bảo mật và các phiên đăng nhập</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200/60 dark:hover:bg-white/10 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-[#282a2c] px-6 gap-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Thông tin
          </button>

          {user.provider === 'local' && (
            <button
              onClick={() => setActiveTab('password')}
              className={`py-3.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 'password'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Mật khẩu
            </button>
          )}

          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-3.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'sessions'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
            }`}
          >
            <Laptop className="w-4 h-4" />
            Phiên đăng nhập
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: THÔNG TIN CÁ NHÂN */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Card & Avatar */}
              <div className="flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-r from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-100/80 dark:border-blue-900/40">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
                <div
                  className="relative group cursor-pointer shrink-0"
                  onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}
                  title="Nhấn để đổi ảnh đại diện"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-3xl shadow-md border-2 border-white overflow-hidden relative">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      initialLetter
                    )}
                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isUploadingAvatar}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="absolute -bottom-1 -right-1 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md border-2 border-white transition-all group-hover:scale-110 disabled:opacity-50"
                    title="Tải ảnh lên"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                      {user.fullName || 'Người dùng driveR'}
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-bold">
                      <ShieldCheck className="w-3 h-3" />
                      {user.provider === 'local' ? 'driveR' : user.provider}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.email}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Nhấp vào biểu tượng máy ảnh để thay đổi hình đại diện của bạn.
                  </p>
                </div>
              </div>

              {/* Form Sửa Tên & Email */}
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    Tên hiển thị
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-200"
                      placeholder="Nhập tên hiển thị của bạn"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    Địa chỉ Email (Không thể thay đổi)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      disabled
                      value={user.email}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 cursor-not-allowed font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Lưu thông tin
                  </button>
                </div>
              </form>

              {/* Thanh Dung lượng Lưu trữ */}
              <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-gray-700 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                    <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Dung lượng lưu trữ Cloud
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {storageUsedGB} GB / {storageLimitGB} GB ({storagePercentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      storagePercentage > 90
                        ? 'bg-rose-600'
                        : storagePercentage > 70
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, storagePercentage))}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Gói cước: Miễn phí (Mặc định)</span>
                  <span>{100 - storagePercentage}% còn trống</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ĐỔI MẬT KHẨU (Chỉ hiển thị cho local user) */}
          {activeTab === 'password' && user.provider === 'local' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-500/15 rounded-xl border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  Để bảo vệ tài khoản, hãy sử dụng mật khẩu mạnh có tối thiểu 6 ký tự và tránh sử dụng lại mật khẩu ở nơi khác.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder="Tối thiểu 6 ký tự"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Xác nhận mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder="Nhập lại mật khẩu mới"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isChangingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Đổi mật khẩu
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PHIÊN ĐĂNG NHẬP (SESSIONS) */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                    Thiết bị đang đăng nhập ({sessions.length})
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Danh sách các trình duyệt và thiết bị có quyền truy cập vào tài khoản của bạn.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl text-gray-600 dark:text-gray-300 transition-colors"
                    title="Làm mới danh sách"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                  </button>

                  {sessions.filter((s) => !s.isCurrent && !s.isRevoked).length > 0 && (
                    <button
                      onClick={handleRevokeAllOtherSessions}
                      disabled={isRevokingAll}
                      className="px-3 py-1.5 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isRevokingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      Đăng xuất thiết bị khác
                    </button>
                  )}
                </div>
              </div>

              {isLoadingSessions ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600 dark:text-blue-400" />
                  <p className="text-xs">Đang tải danh sách phiên đăng nhập...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-10 text-center text-gray-500 dark:text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                  Chưa có thông tin phiên đăng nhập.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sessions.map((sess) => {
                    const { deviceString, Icon } = parseUserAgent(sess.userAgent);
                    return (
                      <div
                        key={sess.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          sess.isCurrent
                            ? 'bg-blue-50/40 dark:bg-blue-500/15 border-blue-200 dark:border-blue-800/60 shadow-xs'
                            : sess.isRevoked
                            ? 'bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-gray-700 opacity-60'
                            : 'bg-white dark:bg-[#282a2c] border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              sess.isCurrent
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                {deviceString}
                              </span>
                              {sess.isCurrent && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px] font-bold">
                                  <CheckCircle2 className="w-3 h-3" /> Thiết bị này
                                </span>
                              )}
                              {sess.isRevoked && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-[10px] font-medium">
                                  Đã thu hồi
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              <span>IP: {sess.ipAddress}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                {formatSessionDate(sess.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Revoke Button */}
                        {!sess.isCurrent && !sess.isRevoked && (
                          <button
                            onClick={() => handleRevokeSession(sess.id)}
                            disabled={revokingSessionId === sess.id}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-xl transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1"
                          >
                            {revokingSessionId === sess.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Thu hồi'
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DANGER ZONE (VÙNG NGUY HIỂM) */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h5 className="text-xs font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                    Vùng nguy hiểm (Danger Zone)
                  </h5>
                  <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">
                    Xoá vĩnh viễn tài khoản và toàn bộ tệp tin, dữ liệu lưu trữ trên Cloud Storage. Hành động này không thể hoàn tác.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xoá tài khoản
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL: XOÁ TÀI KHOẢN AN TOÀN */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
          />
          <div
            className="relative bg-white dark:bg-[#282a2c] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-150 border border-rose-100 dark:border-rose-900/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Warning */}
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Xác nhận xoá tài khoản</h4>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Hành động này mang tính vĩnh viễn</p>
              </div>
            </div>

            {/* Warning Description */}
            <div className="p-3.5 bg-rose-50 dark:bg-rose-500/15 rounded-2xl border border-rose-200/80 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 text-xs space-y-1.5 leading-relaxed">
              <p className="font-bold">⚠️ Cảnh báo quan trọng:</p>
              <ul className="list-disc list-inside space-y-1 text-rose-800 dark:text-rose-300 text-[11px]">
                <li>Toàn bộ tệp tin & thư mục cá nhân sẽ bị xoá vĩnh viễn khỏi Cloud.</li>
                <li>Tất cả liên kết chia sẻ công khai sẽ ngay lập tức bị vô hiệu.</li>
                <li>Bạn sẽ không thể khôi phục lại tài khoản sau khi hoàn tất.</li>
              </ul>
            </div>

            {/* Inputs Confirmation */}
            <div className="space-y-4">
              {user.provider === 'local' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    1. Nhập mật khẩu hiện tại của bạn
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Nhập mật khẩu tài khoản"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  />
                </div>
              ) : (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={deleteConfirmedCheckbox}
                    onChange={(e) => setDeleteConfirmedCheckbox(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-rose-600 rounded-sm"
                  />
                  <span>
                    Tôi xác nhận rằng tôi đã sao lưu toàn bộ dữ liệu quan trọng và đồng ý xoá vĩnh viễn tài khoản {user.provider}.
                  </span>
                </label>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  {user.provider === 'local' ? '2. ' : ''}Gõ chữ <span className="text-rose-600 dark:text-rose-400 font-mono font-black">DELETE</span> để xác nhận
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Nhập chữ DELETE"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#282a2c] border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={!isDeleteButtonEnabled || isDeletingAccount}
                onClick={handleDeleteAccount}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isDeletingAccount ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Xoá vĩnh viễn tài khoản
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

