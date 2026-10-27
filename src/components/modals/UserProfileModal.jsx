import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import useMySubscription from '../../hooks/useMySubscription';
import { PLAN_TERM_KEY, formatPlanDate, formatStorage, monthsTermKey } from '../../constants/billing';
import { formatBytes } from '../../utils/formatFileSize';
import { getStorageStatus } from '../../utils/storageStatus';
import { displayPlanName } from '../../utils/planName';
import { localeTagOf } from '../../utils/locale';
import tRich from '../../utils/tRich';
import {
  X,
  User as UserIcon,
  Lock,
  Save,
  Loader2,
  Mail,
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
  CreditCard,
  ChevronRight,
} from 'lucide-react';
import { userApi } from '../../services/api';
import LiquidGroup from '../ui/LiquidGroup';

/**
 * Helper phân tích User-Agent để hiển thị icon và tên thiết bị thân thiện
 */
function parseUserAgent(uaString = '', t) {
  const ua = uaString.toLowerCase();
  // Chỉ hai giá trị dự phòng cần dịch — tên hệ máy và tên trình duyệt là danh từ
  // riêng ('Windows PC', 'Google Chrome'), giữ nguyên ở mọi ngôn ngữ.
  let deviceName = t('profile.device.unknown');
  let browserName = t('profile.browser.unknown');
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
function formatSessionDate(dateString, t, locale) {
  if (!dateString) return t('profile.session.recent');
  try {
    const d = new Date(dateString);
    return d.toLocaleString(locale, {
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
  const { t, language } = useLanguage();
  const locale = localeTagOf(language);
  const fileInputRef = useRef(null);
  // Cờ theo dõi component còn mounted hay không, tránh setState sau khi unmount
  const isMountedRef = useRef(true);
  // `t` đổi theo ngôn ngữ và `onClose` thường là arrow inline ở component cha —
  // cho cả hai vào dependency của effect nạp hồ sơ nghĩa là mỗi lần cha render lại
  // là gọi lại GET /users/me. Giữ bản mới nhất trong ref: effect chỉ phụ thuộc
  // `isOpen`/`user` như cũ mà vẫn dùng đúng hàm hiện hành.
  const latestRef = useRef({ t, onClose });
  useEffect(() => {
    latestRef.current = { t, onClose };
  });

  // Modal Tabs State
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password' | 'sessions'

  // Tab 1: Profile State
  const [fullName, setFullName] = useState('');
  // Công tắc "Hiển thị thông tin cá nhân" — map 1:1 với
  // UpdateProfileDto.isDiscoverableByEmail (cột users.is_discoverable_by_email).
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Gói cước đang chạy + hạn mức AI, cho thẻ "Gói đang dùng" (##87). BA trạng thái của
  // `subscription` ('loading' | 'error' | null | {…}) — xem `useMySubscription`. Trước đây hồ sơ
  // chỉ có một dòng chữ 11px dưới thanh dung lượng, và trước nữa thì hard-code "Miễn phí" ngay
  // cạnh một thanh dung lượng 100 GB.
  const { subscription, aiQuota } = useMySubscription(Boolean(isOpen && user));
  // Nút "Quản lý gói" mở trang Gói dịch vụ — `setActiveTab` của app, không phải tab của modal.
  const { setActiveTab: openAppTab } = useFiles();

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
  // Tài khoản KHÔNG có mật khẩu (chỉ Google/GitHub) xác nhận xoá bằng mã gửi về email.
  const [deleteCode, setDeleteCode] = useState('');
  const [isSendingDeleteCode, setIsSendingDeleteCode] = useState(false);
  const [deleteCodeSent, setDeleteCodeSent] = useState(false);
  // Theo `hasPassword` của /users/me, không theo `provider`: tài khoản gộp từ trước có thể
  // mang provider google mà vẫn có mật khẩu. `null` = server cũ chưa trả cờ này.
  const [serverHasPassword, setServerHasPassword] = useState(null);

  // Theo dõi lifecycle để chặn mọi cập nhật state sau khi component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch initial profile & reset states on open
  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.fullName || '');
      // `!== false` chứ không phải truthy: backend cũ chưa trả field này thì giá
      // trị là undefined, và mặc định của cột là true (migration 012) — chỉ khi
      // server nói rõ `false` mới vẽ công tắc ở trạng thái TẮT.
      setIsDiscoverable(user.isDiscoverableByEmail !== false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('profile');
      setShowDeleteModal(false);
      setDeletePassword('');
      setDeleteConfirmedCheckbox(false);
      setDeleteConfirmText('');
      setDeleteCode('');
      setDeleteCodeSent(false);

      // Đồng bộ thông tin mới nhất từ API
      userApi
        .getMe()
        .then((profileData) => {
          // CHỐT CHẶN ĐỔI CHỦ: chỉ nhận hồ sơ của ĐÚNG người đang mở modal.
          // /users/me trả về hồ sơ của chủ nhân token trong localStorage, mà
          // localStorage dùng chung cho mọi tab cùng origin — tab khác đăng nhập
          // tài khoản khác là request này về hồ sơ người lạ, và trước đây nó được
          // đổ thẳng vào ô "Tên hiển thị". Bấm Lưu sau đó là ghi tên đó lên tài
          // khoản người lạ, còn refreshUser() thì kéo cả app sang tài khoản đó.
          if (profileData?.id && user?.id && profileData.id !== user.id) {
            console.error('[UserProfileModal] /users/me trả hồ sơ của tài khoản khác — bỏ qua.');
            toast.error(latestRef.current.t('profile.sessionMismatch'));
            latestRef.current.onClose?.();
            return;
          }

          if (profileData?.fullName) {
            setFullName(profileData.fullName);
          }
          if (typeof profileData?.hasPassword === 'boolean') {
            setServerHasPassword(profileData.hasPassword);
          }
          // typeof === 'boolean' để không đè giá trị đúng bằng undefined khi
          // response thiếu field (cùng lý do như trong AuthContext).
          if (typeof profileData?.isDiscoverableByEmail === 'boolean') {
            setIsDiscoverable(profileData.isDiscoverableByEmail);
          }
        })
        .catch((err) => {
          console.error('[UserProfileModal] Failed to get latest user profile:', err);
        });

      // Gói cước KHÔNG nằm trong /users/me (không có join sang storage_plans ở endpoint nóng
      // đó) — `useMySubscription` ở trên hỏi riêng mỗi lần modal mở.
    }
  }, [isOpen, user]);

  // Fetch sessions when switching to sessions tab.
  // useCallback vì hàm này giờ đọc `t` (câu lỗi phải theo ngôn ngữ), nên nó không
  // còn ổn định giữa các lần render — để trần thì useEffect bên dưới thiếu dependency.
  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const data = await userApi.getMySessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || t('profile.sessions.loadFailed'));
    } finally {
      setIsLoadingSessions(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen && activeTab === 'sessions') {
      fetchSessions();
    }
  }, [isOpen, activeTab, fetchSessions]);

  if (!isOpen || !user) return null;

  // Xác nhận xoá tài khoản bằng mật khẩu hay bằng mã email — xem `serverHasPassword`.
  const needsPassword =
    serverHasPassword ?? (typeof user.hasPassword === 'boolean' ? user.hasPassword : user.provider === 'local');

  // 1. Xử lý Upload Avatar
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.avatar.wrongType'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('profile.avatar.tooBig'));
      return;
    }

    setIsUploadingAvatar(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await userApi.updateAvatar(formData);
      await refreshUser();
      toast.success(t('profile.avatar.updated'));
    } catch (err) {
      toast.error(err.message || t('profile.avatar.failed'));
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 2. Xử lý Cập nhật Hồ sơ (tên hiển thị + công tắc hiển thị qua email)
  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    const trimmedName = fullName.trim();
    const nameChanged = trimmedName !== (user.fullName || '');
    const discoverableChanged = isDiscoverable !== user.isDiscoverableByEmail;

    // Ràng buộc độ dài CHỈ áp cho lần thật sự đổi tên. UpdateProfileDto đã cho
    // `fullName` là @IsOptional(), nên người dùng chỉ gạt công tắc thì payload
    // không cần mang tên đi kèm — chặn ở đây sẽ khoá luôn thao tác bật/tắt.
    if (nameChanged && trimmedName.length < 2) {
      toast.error(t('profile.name.tooShort'));
      return;
    }

    // Luôn gửi kèm công tắc: backend chặn body RỖNG bằng 400, mà "bấm Lưu khi
    // không đổi gì" vẫn phải là một lần lưu không lỗi.
    const payload = { isDiscoverableByEmail: isDiscoverable };
    if (nameChanged) {
      payload.fullName = trimmedName;
    }

    setIsSavingProfile(true);
    try {
      await userApi.updateMe(payload);
      await refreshUser();
      toast.success(
        discoverableChanged && !nameChanged
          ? isDiscoverable
            ? t('profile.discoverable.on')
            : t('profile.discoverable.off')
          : t('profile.updated'),
      );
    } catch (err) {
      toast.error(err.message || t('profile.updateFailed'));
      // Trả UI về giá trị gốc trong context để không kẹt lại thao tác vừa lỗi
      setFullName(user.fullName || '');
      setIsDiscoverable(user.isDiscoverableByEmail !== false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // 3. Xử lý Đổi Mật khẩu
  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error(t('profile.password.needCurrent'));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t('profile.password.tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('profile.password.mismatch'));
      return;
    }

    setIsChangingPassword(true);
    try {
      await userApi.updatePassword({ currentPassword, newPassword });
      toast.success(t('profile.password.changed'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || t('profile.password.failed'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 4. Xử lý Thu hồi 1 Session
  const handleRevokeSession = async (sessionId) => {
    setRevokingSessionId(sessionId);
    try {
      await userApi.revokeSession(sessionId);
      toast.success(t('profile.session.revoked'));
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || t('profile.session.revokeFailed'));
    } finally {
      setRevokingSessionId(null);
    }
  };

  // 5. Xử lý Đăng xuất tất cả thiết bị khác
  const handleRevokeAllOtherSessions = async () => {
    setIsRevokingAll(true);
    try {
      await userApi.revokeAllOtherSessions();
      toast.success(t('profile.sessions.allRevoked'));
      await fetchSessions();
    } catch (err) {
      toast.error(err.message || t('profile.sessions.allRevokeFailed'));
    } finally {
      setIsRevokingAll(false);
    }
  };

  // 6. Xử lý Xoá tài khoản vĩnh viễn
  const handleSendDeleteCode = async () => {
    setIsSendingDeleteCode(true);
    try {
      await userApi.requestDeleteCode();
      setDeleteCodeSent(true);
      toast.success(t('profile.delete.codeSent', { email: user.email }));
    } catch (err) {
      toast.error(err.message || t('profile.delete.codeSendFailed'));
    } finally {
      if (isMountedRef.current) setIsSendingDeleteCode(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (needsPassword && !deletePassword) {
      toast.error(t('profile.delete.needPassword'));
      return;
    }

    if (!needsPassword && !deleteConfirmedCheckbox) {
      toast.error(t('profile.delete.needCheckbox'));
      return;
    }

    if (!needsPassword && !/^\d{6}$/.test(deleteCode.trim())) {
      toast.error(t('profile.delete.needCode'));
      return;
    }

    if (deleteConfirmText.trim() !== 'DELETE') {
      toast.error(t('profile.delete.needKeyword'));
      return;
    }

    setIsDeletingAccount(true);
    let isAccountDeleted = false;
    try {
      // deleteAccount() xoá phiên rồi TẢI LẠI trang về /login (trang đó tự báo "đã xoá").
      await deleteAccount(needsPassword ? { password: deletePassword } : { code: deleteCode.trim() });
      isAccountDeleted = true;
    } catch (err) {
      toast.error(err.message || t('profile.delete.failed'));
    } finally {
      // Chỉ dọn dẹp state khi xoá THẤT BẠI và component vẫn còn mounted.
      // Xoá thành công => modal biến mất cùng component, mọi setState ở đây đều gây
      // warning "update on unmounted component".
      // Xoá thất bại: chỉ tắt loading, giữ modal xác nhận để người dùng thử lại.
      if (!isAccountDeleted && isMountedRef.current) {
        setIsDeletingAccount(false);
      }
    }
  };

  // Dung lượng tính từ BYTE (##87). `storageInfo.percentage` không dùng được: `/users/me` kẹp ở
  // 100 còn phản hồi đăng nhập/refresh thì không kẹp — cùng một người có lúc thấy "(100%)", có
  // lúc "(615%)" kèm "-515% còn trống", và không lúc nào thấy chữ "đầy".
  const storageUsedBytes = Number(user?.storageInfo?.usedBytes ?? user?.storageUsedBytes ?? 0) || 0;
  const storageLimitBytes = Number(user?.storageInfo?.limitBytes ?? user?.storageLimitBytes) || 2147483648;
  const storageStatus = getStorageStatus(storageUsedBytes, storageLimitBytes);

  const hasPlan = Boolean(subscription && typeof subscription === 'object' && subscription.planName);
  const planDisplayName = hasPlan ? displayPlanName(subscription.planName, language) : null;
  const planTermKey = hasPlan ? PLAN_TERM_KEY[subscription.billingCycle] : null;

  // Tên gói ở dòng tiêu đề của thẻ. Mỗi trạng thái của `subscription` một câu riêng — kể cả
  // "không hỏi được", chỗ dễ bị lười nhất: rơi về "Miễn phí" ở đó là dựng lại đúng lỗi cũ.
  const planHeadline = (() => {
    if (subscription === 'loading') return t('profile.plan.loadingShort');
    if (subscription === 'error') return t('profile.plan.unavailableShort');
    if (!hasPlan) return t('profile.plan.freeName');
    return planDisplayName;
  })();

  // Dòng hạn của gói. `remainingDays` chỉ nói thêm khi là số dương thật — 0 là gói đã qua hạn
  // mà cron chưa kịp đóng, nói "còn 0 ngày" thì vô nghĩa.
  const planTermLine = (() => {
    if (!hasPlan) return null;
    const date = formatPlanDate(subscription.endDate, locale);
    const ends = subscription.cancelAtPeriodEnd
      ? t('profile.plan.willEnd', { date })
      : t('profile.plan.endsOn', { date });
    return subscription.remainingDays > 0
      ? `${ends} · ${t('profile.plan.remaining', { days: subscription.remainingDays })}`
      : ends;
  })();

  // Hạn mức AI: gói trả phí là MỘT hạn mức cho trọn kỳ (`periodMonths`, ##87), Miễn phí là chu
  // kỳ 30 ngày. Backend cũ không có `periodMonths` ⇒ rơi về câu chu kỳ, vẫn đúng với nó.
  const aiLine = (() => {
    if (!aiQuota) return null;
    const percent =
      Number(aiQuota.limit) > 0
        ? Math.min(100, Math.round((Number(aiQuota.used) / Number(aiQuota.limit)) * 100))
        : 100;
    return aiQuota.periodMonths
      ? t('profile.plan.aiQuota', {
          term: t(monthsTermKey(aiQuota.periodMonths), { count: aiQuota.periodMonths }),
          percent,
        })
      : t('profile.plan.aiQuotaCycle', { percent, date: formatPlanDate(aiQuota.resetAt, locale) });
  })();

  const openBilling = () => {
    openAppTab?.('billing');
    onClose?.();
  };

  const initialLetter = (user?.fullName || user?.email || 'U').charAt(0).toUpperCase();

  // Kiểm tra điều kiện enable nút Xoá tài khoản
  const isDeleteButtonEnabled =
    deleteConfirmText.trim() === 'DELETE' &&
    (needsPassword
      ? deletePassword.length >= 1
      : deleteConfirmedCheckbox && /^\d{6}$/.test(deleteCode.trim()));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 glass-overlay transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Main Modal */}
      <div
        className="glass-strong relative rounded-[28px] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border text-left animate-glass-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50/80 dark:bg-white/5 border-glass-divider">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--chip-fill)] text-[var(--ink-muted)] flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">{t('profile.title')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs — khay phân đoạn kính như ngăn Thông tin (thay cho tab gạch chân): giọt
            kính "đang chọn" nhảy giữa các tab (LiquidGroup). Ba tab chia đều; điện thoại hẹp không
            đủ chỗ thì mỗi tab giữ đúng bề ngang chữ và khay cuộn ngang. */}
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <LiquidGroup
            activeKey={activeTab}
            className="flex gap-1 p-1 rounded-full glass-soft overflow-x-auto no-scrollbar"
          >
            {[
              { id: 'profile', Icon: UserIcon, labelKey: 'profile.tab.info' },
              ...(user.provider === 'local'
                ? [{ id: 'password', Icon: KeyRound, labelKey: 'profile.tab.password' }]
                : []),
              { id: 'sessions', Icon: Laptop, labelKey: 'profile.tab.sessions' },
            ].map(({ id, Icon, labelKey }) => (
              <button
                key={id}
                type="button"
                data-liquid-key={id}
                onClick={() => setActiveTab(id)}
                aria-pressed={activeTab === id}
                className={`flex-1 py-2.5 px-2.5 sm:px-3 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === id
                    ? 'text-[var(--ink)]'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                }`}
              >
                {/* Điện thoại: bỏ icon để ba tab vừa một khay (390px), khỏi phải cuộn. */}
                <Icon className="hidden sm:block w-4 h-4 shrink-0" />
                {t(labelKey)}
              </button>
            ))}
          </LiquidGroup>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: THÔNG TIN CÁ NHÂN */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Card & Avatar */}
              <div className="glass-soft flex items-center gap-5 p-4 rounded-2xl">
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
                  title={t('profile.avatar.clickToChange')}
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 dark:from-zinc-500 dark:to-zinc-700 text-white font-semibold flex items-center justify-center text-3xl shadow-md border-2 border-white dark:border-white/20 overflow-hidden relative">
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
                    className="absolute -bottom-1 -right-1 p-2 btn-accent hover:brightness-105 rounded-full shadow-md border-2 border-white transition-all group-hover:scale-110 disabled:opacity-50"
                    title={t('profile.avatar.upload')}
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                      {user.fullName || t('profile.defaultName')}
                    </h4>
                    <span className="chip px-2 py-0.5 text-[10px]">
                      {user.provider === 'local' ? 'cloudSSS' : user.provider}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user.email}</p>
                  {/* Gói đang dùng ngay dưới email — chỗ đầu tiên mắt nhìn khi mở hồ sơ. */}
                  {hasPlan && (
                    <span className="chip mt-1.5 max-w-full px-2 py-0.5 text-[11px]">
                      <CreditCard className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {planDisplayName}
                        {planTermKey ? ` · ${t(planTermKey)}` : ''}
                      </span>
                    </span>
                  )}
                  
                </div>
              </div>

              {/* Gói đang dùng + dung lượng + hạn mức AI (##87). Trước đây hồ sơ chỉ có một dòng
                  chữ 11px dưới thanh dung lượng nói tên gói — người dùng báo "chưa có hiển thị gói
                  đang dùng trong profile". Đặt ngay dưới thẻ tên để không phải cuộn mới thấy. */}
              <section className="p-4 rounded-2xl bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-gray-700 space-y-3">
                {/* Điện thoại: nút xuống dưới phần chữ — chung một hàng thì tên gói chỉ còn
                    "Gói Cá Nh…" và dòng hạn vỡ thành ba dòng (đã chụp ở 375px). */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-[var(--chip-fill)] text-[var(--ink-muted)] flex items-center justify-center">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('profile.plan.sectionTitle')}
                      </p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 break-words">
                        {planHeadline}
                        {planTermKey && (
                          <span className="ml-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                            · {t(planTermKey)}
                          </span>
                        )}
                      </p>
                      {planTermLine && (
                        <p
                          className={`text-xs mt-0.5 ${
                            subscription.cancelAtPeriodEnd
                              ? 'text-[var(--tone-warn)]'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {planTermLine}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openBilling}
                    className="glass-soft self-start shrink-0 ml-9 sm:ml-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    {/* "Nâng cấp" chỉ khi server ĐÃ trả lời là không có gói (`null`) — lúc đang tải hay
                        lỗi mà hiện "Nâng cấp" là mời người đang có gói Pro mua lại từ đầu. */}
                    {subscription === null ? t('profile.plan.upgrade') : t('profile.plan.manage')}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 pt-3 border-t border-glass-divider">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                      <HardDrive className="w-4 h-4 text-[var(--ink-muted)]" />
                      {t('profile.storage.title')}
                    </span>
                    <span
                      className={
                        storageStatus.isFull ? 'text-[var(--tone-danger)]' : 'text-gray-600 dark:text-gray-300'
                      }
                    >
                      {formatBytes(storageUsedBytes)} / {formatStorage(storageLimitBytes)} ({storageStatus.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        storageStatus.isFull
                          ? 'bg-[var(--tone-danger)]'
                          : storageStatus.level === 'almostFull'
                          ? 'bg-[var(--tone-danger)]'
                          : storageStatus.level === 'warning'
                          ? 'bg-[var(--tone-warn)]'
                          : 'bg-[var(--ink-muted)]'
                      }`}
                      style={{ width: `${Math.max(2, storageStatus.barPercent)}%` }}
                    />
                  </div>
                  {/* Đầy / vượt mức phải nói thẳng là KHÔNG tải lên được nữa — "0% còn trống" thì
                      không ai hiểu là đã bị chặn, còn "-515% còn trống" thì vô nghĩa. */}
                  <p
                    className={`text-[11px] ${
                      storageStatus.isFull
                        ? 'font-semibold text-[var(--tone-danger)]'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {storageStatus.level === 'over'
                      ? t('profile.storage.over', { size: formatBytes(storageStatus.overBytes) })
                      : storageStatus.level === 'full'
                      ? t('profile.storage.full')
                      : t('profile.storage.free', { percent: 100 - storageStatus.percent })}
                  </p>
                </div>

                {aiLine && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">{aiLine}</p>
                )}
              </section>

              {/* Form Sửa Tên & Email */}
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('profile.name.label')}
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    {/*
                      `name` + autoComplete="off": ô text trần trong một <form> bị
                      Chrome đoán là ô "tên/tài khoản" và bật gợi ý autofill — bấm
                      vào ô là hiện tên đã lưu của tài khoản KHÁC, chọn nhầm một
                      cái là đổi tên hiển thị của mình lúc nào không hay.
                    */}
                    <input
                      type="text"
                      required
                      name="fullName"
                      autoComplete="off"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="glass-input w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium text-gray-800 dark:text-gray-200"
                      placeholder={t('profile.name.placeholder')}
                    />
                  </div>
                </div>

                {/* Công tắc: cho phép tìm thấy mình qua email khi chia sẻ tệp */}
                <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                  <div className="min-w-0">
                    <p
                      id="discoverable-label"
                      className="text-sm font-bold text-gray-800 dark:text-gray-200"
                    >
                      {t('profile.discoverable.title')}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {t('profile.discoverable.desc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDiscoverable}
                    aria-labelledby="discoverable-label"
                    onClick={() => setIsDiscoverable((prev) => !prev)}
                    disabled={isSavingProfile}
                    // Núm giọt nước (`liquid-switch`, styles/liquid-glass.css): công tắc 24×44 → núm 20px.
                    className={`liquid-switch [--knob:20px] [--knob-inset:2px] shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#1f2020] disabled:opacity-60 disabled:cursor-not-allowed ${
                      isDiscoverable
                        ? 'bg-[var(--accent)]'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span className="liquid-switch-knob" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('profile.email.label')}
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
                    className="px-5 py-2.5 btn-accent hover:brightness-105 rounded-full font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t('profile.save')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: ĐỔI MẬT KHẨU (Chỉ hiển thị cho local user) */}
          {activeTab === 'password' && user.provider === 'local' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="p-3 bg-[var(--tone-warn-soft)] rounded-xl text-[var(--ink)] text-xs">
                <span>
                  {t('profile.password.securityHint')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('profile.password.currentLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('auth.password.newLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder={t('profile.password.minHint')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('profile.password.confirmLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="glass-input w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all font-medium text-gray-800 dark:text-gray-200"
                    placeholder={t('profile.password.confirmPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-5 py-2.5 btn-accent hover:brightness-105 rounded-full font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isChangingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {t('profile.password.submit')}
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
                    {t('profile.sessions.title', { count: sessions.length })}
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {t('profile.sessions.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="p-2 rounded-xl text-gray-600 dark:text-gray-300 transition-colors"
                    title={t('profile.sessions.refresh')}
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                  </button>

                  {sessions.filter((s) => !s.isCurrent && !s.isRevoked).length > 0 && (
                    <button
                      onClick={handleRevokeAllOtherSessions}
                      disabled={isRevokingAll}
                      className="btn-danger px-3 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isRevokingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5" />
                      )}
                      {t('profile.sessions.revokeOthers')}
                    </button>
                  )}
                </div>
              </div>

              {isLoadingSessions ? (
                <div className="space-y-2.5" aria-busy="true" aria-live="polite">
                  <span className="sr-only">{t('profile.sessions.loading')}</span>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="glass-soft p-3.5 rounded-2xl border flex items-center justify-between gap-3 animate-pulse"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Placeholder icon thiết bị */}
                        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          {/* Dòng 1: tên thiết bị + badge */}
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
                            <div className="h-3 w-16 rounded-full bg-gray-100 dark:bg-white/[0.07]" />
                          </div>
                          {/* Dòng 2: IP + thời gian */}
                          <div className="h-2.5 w-48 max-w-full rounded-full bg-gray-100 dark:bg-white/[0.07]" />
                        </div>
                      </div>
                      {/* Placeholder nút Thu hồi */}
                      <div className="h-6 w-16 rounded-xl bg-gray-100 dark:bg-white/[0.07] shrink-0" />
                    </div>
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-10 text-center text-gray-500 dark:text-gray-400 text-xs border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                  {t('profile.sessions.empty')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sessions.map((sess) => {
                    const { deviceString, Icon } = parseUserAgent(sess.userAgent, t);
                    return (
                      <div
                        key={sess.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          sess.isCurrent
                            ? 'glass-active border-transparent'
                            : sess.isRevoked
                            ? 'bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-gray-700 opacity-60'
                            : 'glass-soft'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              sess.isCurrent
                                ? 'bg-[var(--ink)] text-white dark:text-[#161618]'
                                : 'bg-[var(--chip-fill)] text-[var(--ink-muted)]'
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
                                <span className="chip px-2 py-0.5 text-[10px] text-[var(--ink)]">
                                  <CheckCircle2 className="w-3 h-3" /> {t('profile.session.thisDevice')}
                                </span>
                              )}
                              {sess.isRevoked && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-[10px] font-medium">
                                  {t('profile.session.revokedBadge')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              <span>IP: {sess.ipAddress}</span>
                              <span>•</span>
                              {/* Hai mốc thời gian KHÁC nhau, và trước đây chỗ này chỉ có
                                  một: mục "Thiết bị đang đăng nhập" ghi nhãn hoạt động
                                  nhưng in `createdAt` — thời điểm ĐĂNG NHẬP. Một phiên mở
                                  suốt hai tuần vẫn hiện "2 tuần trước" dù vừa dùng xong,
                                  nên không có cách nào nhìn ra thiết bị nào còn dùng thật.
                                  Hạn phiên nay tính theo thời gian không dùng nên
                                  `lastUsedAt` chính là mốc quyết định phiên còn sống. */}
                              <span className="flex items-center gap-1" title={t('profile.session.lastUsed')}>
                                <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                {t('profile.session.lastUsed')}: {formatSessionDate(sess.lastUsedAt ?? sess.createdAt, t, locale)}
                              </span>
                              <span>•</span>
                              <span title={t('profile.session.signedInAt')}>
                                {t('profile.session.signedInAt')}: {formatSessionDate(sess.createdAt, t, locale)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Revoke Button */}
                        {!sess.isCurrent && !sess.isRevoked && (
                          <button
                            onClick={() => handleRevokeSession(sess.id)}
                            disabled={revokingSessionId === sess.id}
                            className="px-3 py-1.5 text-xs font-semibold text-[var(--tone-danger)] rounded-full transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                          >
                            {revokingSessionId === sess.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              t('profile.sessions.revoke')
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

          {/* DANGER ZONE (VÙNG NGUY HIỂM)
             *
             * CHỈ ở tab "Thông tin". Trước đây khối này nằm NGOÀI mọi nhánh
             * `activeTab === ...` nên nó hiện lại ở cả tab "Mật khẩu" và tab
             * "Phiên đăng nhập" — kéo xuống cuối danh sách thiết bị lại thấy nút
             * "Xoá tài khoản" y hệt cái ở tab đầu, đúng chỗ người dùng báo trùng.
             * Xoá tài khoản là thao tác thuộc hồ sơ, không thuộc quản lý phiên.
             */}
          {activeTab === 'profile' && (
          <div className="pt-4 border-t border-glass-divider">
            <div className="p-4 rounded-2xl bg-[var(--tone-danger-soft)] space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/70 dark:bg-white/10 text-[var(--tone-danger)] flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h5 className="text-xs font-semibold text-[var(--tone-danger)] uppercase tracking-wider">
                    {t('profile.danger.title')}
                  </h5>
                  <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-relaxed">
                    {t('profile.danger.desc')}
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn-danger px-3.5 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('profile.danger.button')}
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL: XOÁ TÀI KHOẢN AN TOÀN */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 glass-overlay animate-fade-in"
            onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
          />
          <div
            className="glass-strong relative rounded-[28px] w-full max-w-md overflow-hidden p-6 space-y-5 animate-glass-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Warning */}
            <div className="flex items-center gap-3 text-[var(--tone-danger)]">
              <div className="w-10 h-10 rounded-2xl bg-[var(--tone-danger-soft)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('profile.delete.title')}</h4>
                <p className="text-xs text-[var(--ink-muted)] font-medium">{t('profile.delete.subtitle')}</p>
              </div>
            </div>

            {/* Warning Description */}
            <div className="p-3.5 bg-[var(--tone-danger-soft)] rounded-2xl text-[var(--ink)] text-xs space-y-1.5 leading-relaxed">
              <p className="font-bold">{t('profile.delete.warnTitle')}</p>
              <ul className="list-disc list-inside space-y-1 text-[var(--ink-muted)] text-[11px]">
                <li>{t('profile.delete.warn1')}</li>
                <li>{t('profile.delete.warn2')}</li>
                <li>{t('profile.delete.warn3')}</li>
              </ul>
            </div>

            {/* Inputs Confirmation */}
            <div className="space-y-4">
              {needsPassword ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('profile.delete.step1Password')}
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={t('profile.delete.passwordPlaceholder')}
                    className="glass-input w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tone-danger-soft)] transition-all"
                  />
                </div>
              ) : (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={deleteConfirmedCheckbox}
                    onChange={(e) => setDeleteConfirmedCheckbox(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded-sm accent-[var(--tone-danger)]"
                  />
                  <span>
                    {t('profile.delete.oauthConfirm', { provider: user.provider })}
                  </span>
                </label>
              )}

              {!needsPassword && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('profile.delete.stepCode', { email: user.email })}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={deleteCode}
                      onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, ''))}
                      placeholder={t('profile.delete.codePlaceholder')}
                      className="glass-input flex-1 min-w-0 px-3.5 py-2.5 border rounded-xl text-sm font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[var(--tone-danger-soft)] transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleSendDeleteCode}
                      disabled={isSendingDeleteCode || isDeletingAccount}
                      className="glass-soft shrink-0 px-3 py-2.5 rounded-full text-xs font-semibold text-[var(--ink)] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {isSendingDeleteCode && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {deleteCodeSent ? t('profile.delete.resendCode') : t('profile.delete.sendCode')}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  {needsPassword ? '2. ' : ''}
                  {tRich(t('profile.delete.typeKeyword'), {
                    keyword: (
                      <span className="text-[var(--tone-danger)] font-mono font-black">DELETE</span>
                    ),
                  })}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={t('profile.delete.keywordPlaceholder')}
                  className="glass-input w-full px-3.5 py-2.5 border rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--tone-danger-soft)] transition-all"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!isDeleteButtonEnabled || isDeletingAccount}
                onClick={handleDeleteAccount}
                className="btn-danger px-5 py-2.5 rounded-full text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isDeletingAccount ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {t('profile.delete.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

