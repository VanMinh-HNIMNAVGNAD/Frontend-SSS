import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { User as UserIcon, LogOut, ShieldCheck, CreditCard, ChevronRight } from 'lucide-react';
import UserProfileModal from '../modals/UserProfileModal';
import useMySubscription from '../../hooks/useMySubscription';
import { PLAN_TERM_KEY, formatPlanDate } from '../../constants/billing';
import { displayPlanName } from '../../utils/planName';
import { localeTagOf } from '../../utils/locale';

export default function AccountModal({ isOpen, onClose }) {
    const { user, logout } = useAuth();
    const { setActiveTab } = useFiles();
    const { t, language } = useLanguage();
    const modalRef = useRef(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    // Gói đang dùng (##87) — hỏi lại mỗi lần mở menu, xem `useMySubscription`.
    const { subscription } = useMySubscription(Boolean(isOpen));

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isProfileOpen) return;
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
    }, [isOpen, onClose, isProfileOpen]);

    if (!isOpen) return null;

    // logout() gọi POST /auth/logout (xoá cookie refreshToken HttpOnly + thu hồi phiên
    // trong DB) rồi TẢI LẠI trang về /login. Không `navigate` ở đây: chuyển trang kiểu SPA
    // giữ nguyên panel AI và danh sách tệp của người vừa đăng xuất cho người kế tiếp (##69).
    const handleLogout = () => logout();

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

    return (
        <div 
            ref={modalRef}
            className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-[#282a2c] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 z-50 animate-in fade-in zoom-in-95 duration-150 text-gray-800 dark:text-gray-200 text-left cursor-default"
        >
            {/* User Details */}
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-700">
                {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700" />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                        {initialLetter}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{user?.fullName || t('profile.defaultName')}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email || 'user@cloudsss.com'}</p>
                    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" /> {t('account.providerBadge', { provider: getProviderBadge(user?.provider) })}
                    </span>
                </div>
            </div>

            {/* Gói đang dùng — bấm là sang trang Gói dịch vụ. */}
            <button
                type="button"
                onClick={openBilling}
                className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
                <CreditCard className={`w-4 h-4 shrink-0 ${hasPlan ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`} />
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

            {/* Menu Options */}
            <div className="pt-2 space-y-1">
                <button
                    onClick={() => {
                        setIsProfileOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-left cursor-pointer"
                >
                    <UserIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    {t('account.myAccount')}
                </button>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-xl transition-colors text-left font-medium cursor-pointer"
                >
                    <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    {t('account.logout')}
                </button>
            </div>

            {/* Profile Modal */}
            <UserProfileModal
                isOpen={isProfileOpen}
                onClose={() => {
                    setIsProfileOpen(false);
                    onClose && onClose();
                }}
            />
        </div>
    );
}
