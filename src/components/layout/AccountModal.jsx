import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUploadActions } from '../../context/UploadContext';
import { User as UserIcon, LogOut, CreditCard, ChevronRight } from 'lucide-react';
import UserProfileModal from '../modals/UserProfileModal';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AccountSwitcher from './AccountSwitcher';
import useMySubscription from '../../hooks/useMySubscription';
import { PLAN_TERM_KEY, formatPlanDate } from '../../constants/billing';
import { displayPlanName } from '../../utils/planName';
import { localeTagOf } from '../../utils/locale';

/** Tệp còn dở — rời trang (chuyển / thêm / đăng xuất tài khoản) là dừng chúng. */
const UNFINISHED_UPLOAD = new Set(['pending', 'uploading', 'confirming', 'paused']);

export default function AccountModal({ isOpen, onClose }) {
    const { user, logout, signOutAccount, signedInAccounts } = useAuth();
    const { setActiveTab } = useFiles();
    const { t, language } = useLanguage();
    // Chỉ các hàm + ref — KHÔNG `useUpload()`: menu này không được render lại theo từng % tải lên.
    const { uploadQueueRef } = useUploadActions();
    const modalRef = useRef(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    // Gói đang dùng (##87) — hỏi lại mỗi lần mở menu, xem `useMySubscription`.
    const { subscription } = useMySubscription(Boolean(isOpen));

    /**
     * Rời phiên này khi còn tệp đang tải lên là dừng chúng (trang tải lại). Hỏi trước — tệp lớn
     * thì tải tiếp được sau, tệp nhỏ thì phải tải lại. `{ count, run }` | null.
     */
    const [leavePrompt, setLeavePrompt] = useState(null);
    const guardUploads = useCallback((run) => {
        const count = (uploadQueueRef.current || []).filter((j) => UNFINISHED_UPLOAD.has(j.status)).length;
        if (count > 0) setLeavePrompt({ count, run });
        else run();
    }, [uploadQueueRef]);
    const confirmLeave = () => {
        const run = leavePrompt?.run;
        setLeavePrompt(null);
        run?.();
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isProfileOpen || leavePrompt) return;
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                onClose && onClose();
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, isProfileOpen, leavePrompt]);

    if (!isOpen) return null;

    // logout() gọi POST /auth/logout (xoá cookie refreshToken HttpOnly + thu hồi phiên
    // trong DB) rồi TẢI LẠI trang về /login. Không `navigate` ở đây: chuyển trang kiểu SPA
    // giữ nguyên panel AI và danh sách tệp của người vừa đăng xuất cho người kế tiếp (##69).
    //
    // Có tài khoản khác cùng đăng nhập (##89): "Đăng xuất tài khoản này" chỉ rời tài khoản đang
    // dùng và vào luôn tài khoản kế tiếp; "Đăng xuất tất cả" là hành vi cũ — máy không còn ai.
    const otherAccountCount = Array.isArray(signedInAccounts)
        ? signedInAccounts.filter((a) => !a.isCurrent && a.id !== user?.id).length
        : 0;
    const handleLogout = () => guardUploads(() => logout());
    const handleLogoutCurrent = () => guardUploads(() => signOutAccount(user?.id));

    const getProviderBadge = (provider) => {
        if (provider === 'google') return 'Google';
        if (provider === 'github') return 'GitHub';
        return 'cloudSSS';
    };

    const initialLetter = (user?.fullName || user?.email || 'U').charAt(0).toUpperCase();

    // Dòng gói dưới huy hiệu tài khoản. 'loading' / 'error' KHÔNG được hiện thành "Miễn phí" —
    // đoán sai gói ngay trong menu tài khoản là đúng kiểu lỗi ##87 đang sửa.
    const hasPlan = Boolean(subscription && typeof subscription === 'object' && subscription.planName);
    const planText = (() => {
        if (subscription === 'loading') return t('profile.plan.loadingShort');
        if (subscription === 'error') return t('profile.plan.unavailableShort');
        if (!hasPlan) return t('profile.plan.freeName');
        const termKey = PLAN_TERM_KEY[subscription.billingCycle];
        const name = displayPlanName(subscription.planName, language);
        return termKey ? `${name} · ${t(termKey)}` : name;
    })();
    const planUntil = hasPlan
        ? t('account.planUntil', { date: formatPlanDate(subscription.endDate, localeTagOf(language)) })
        : null;

    const openBilling = () => {
        setActiveTab?.('billing');
        onClose && onClose();
    };

    // z-[60]: trên bảng tiến trình tải lên (z-50, góc dưới phải) — menu dài thêm danh sách tài
    // khoản (##89) là chạm tới nó, và menu đang mở là thứ người dùng đang thao tác.
    return (
        <div 
            ref={modalRef}
            className="glass-strong absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-[22px] overflow-hidden z-[60] text-gray-800 dark:text-gray-200 text-left cursor-default animate-glass-in origin-top-right"
        >
            {/* Phần cuộn nằm TRONG khung kính: lớp blur `::before` của `glass-strong` là phần tử
                absolute, đặt trong chính khung cuộn thì nó trôi theo nội dung (index.css). */}
            <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain p-5">
            {/* User Details */}
            <div className="flex items-center gap-3 pb-4 border-b border-glass-divider">
                {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 dark:from-zinc-500 dark:to-zinc-700 text-white flex items-center justify-center font-semibold text-lg shadow-sm">
                        {initialLetter}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.fullName || t('profile.defaultName')}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email || 'user@cloudsss.com'}</p>
                    <span className="chip mt-1 px-2 py-0.5 text-[11px]">
                        {t('account.providerBadge', { provider: getProviderBadge(user?.provider) })}
                    </span>
                </div>
            </div>

            {/* Gói đang dùng — bấm là sang trang Gói dịch vụ. */}
            <button
                type="button"
                onClick={openBilling}
                className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors text-left cursor-pointer"
            >
                <CreditCard className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" />
                <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('profile.plan.sectionTitle')}
                    </span>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={planText}>
                        {planText}
                    </span>
                    {planUntil && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{planUntil}</span>
                    )}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
            </button>

            {/* Các tài khoản khác đang đăng nhập trên trình duyệt này (##89) */}
            <AccountSwitcher guard={guardUploads} onNavigate={onClose} />

            {/* Menu Options */}
            <div className="mt-2 pt-2 space-y-1 border-t border-glass-divider">
                <button
                    onClick={() => {
                        setIsProfileOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-xl transition-colors text-left cursor-pointer"
                >
                    <UserIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    {t('account.myAccount')}
                </button>
                {otherAccountCount > 0 && (
                    <button
                        onClick={handleLogoutCurrent}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-xl transition-colors text-left cursor-pointer"
                    >
                        <LogOut className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        {t('account.logoutCurrent')}
                    </button>
                )}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--tone-danger)] rounded-xl transition-colors text-left font-medium cursor-pointer"
                >
                    <LogOut className="w-4 h-4" />
                    {otherAccountCount > 0 ? t('account.logoutAll') : t('account.logout')}
                </button>
            </div>

            {/* Còn tệp đang tải lên mà sắp rời phiên này */}
            <Modal
                isOpen={Boolean(leavePrompt)}
                onClose={() => setLeavePrompt(null)}
                title={t('account.switch.uploadsTitle', { count: leavePrompt?.count ?? 0 })}
                maxWidth="max-w-sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{t('account.switch.uploadsBody')}</p>
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={() => setLeavePrompt(null)}>
                            {t('account.switch.uploadsStay')}
                        </Button>
                        <Button variant="danger" onClick={confirmLeave}>
                            {t('account.switch.uploadsContinue')}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Profile Modal */}
            <UserProfileModal
                isOpen={isProfileOpen}
                onClose={() => {
                    setIsProfileOpen(false);
                    onClose && onClose();
                }}
            />
            </div>
        </div>
    );
}
