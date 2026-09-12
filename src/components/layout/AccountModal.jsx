import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { User as UserIcon, LogOut, ShieldCheck } from 'lucide-react';
import UserProfileModal from '../modals/UserProfileModal';

export default function AccountModal({ isOpen, onClose }) {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const modalRef = useRef(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

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

    // `await`: logout() nay còn gọi POST /auth/logout để server xoá cookie
    // refreshToken (HttpOnly, JS không đụng được) và thu hồi phiên trong DB. Rời
    // trang trước khi lượt gọi đó xong là cookie có thể sống sót — máy dùng chung
    // sẽ refresh lại được đúng phiên vừa đăng xuất.
    const handleLogout = async () => {
        await logout();
        onClose && onClose();
        navigate('/login');
    };

    const getProviderBadge = (provider) => {
        if (provider === 'google') return 'Google';
        if (provider === 'github') return 'GitHub';
        return 'driveR';
    };

    const initialLetter = (user?.fullName || user?.email || 'U').charAt(0).toUpperCase();

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
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email || 'user@driver.com'}</p>
                    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" /> {t('account.providerBadge', { provider: getProviderBadge(user?.provider) })}
                    </span>
                </div>
            </div>

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
