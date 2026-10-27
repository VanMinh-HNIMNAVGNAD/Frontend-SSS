import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ACCOUNT_NOT_SIGNED_IN_CODE } from '../../services/api';

/** Ảnh đại diện hoặc chữ cái đầu của một tài khoản. */
export function AccountAvatar({ account, className = 'w-9 h-9 text-sm' }) {
    const initial = (account?.fullName || account?.email || 'U').charAt(0).toUpperCase();
    if (account?.avatarUrl) {
        return (
            <img
                src={account.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className={`${className} rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700`}
            />
        );
    }
    return (
        <div className={`${className} rounded-full bg-linear-to-br from-slate-500 to-slate-700 text-white flex items-center justify-center font-bold shrink-0`}>
            {initial}
        </div>
    );
}

/**
 * Các tài khoản KHÁC đang đăng nhập trên trình duyệt này + "Thêm tài khoản khác" (##89).
 *
 * Danh sách hỏi lại backend mỗi lần mở menu (`GET /auth/accounts`): phiên của một tài khoản có
 * thể đã bị thu hồi từ máy khác hay hết hạn do không dùng — hiện một tài khoản bấm vào là 401 thì
 * tệ hơn không hiện. Backend chưa có tính năng thì không hiện gì cả.
 *
 * `guard(run)` — AccountModal hỏi lại trước khi rời trang khi còn tệp đang tải lên.
 */
export default function AccountSwitcher({ guard, onNavigate }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const {
        user, signedInAccounts, maxSignedInAccounts, refreshSignedInAccounts,
        switchAccount, signOutAccount,
    } = useAuth();

    const [busyId, setBusyId] = useState(null);
    const [problem, setProblem] = useState(null); // { kind: 'expired' | 'failed', account, message }

    useEffect(() => {
        refreshSignedInAccounts();
    }, [refreshSignedInAccounts]);

    // Không vẽ gì khi: chưa có câu trả lời (null), backend chưa hỗ trợ (null), hoặc danh sách RỖNG
    // dù đang đăng nhập — tức trình duyệt không giữ được cookie phiên (Safari / Brave chặn cookie
    // bên thứ ba). Ở đó "Thêm tài khoản" chỉ âm thầm thay tài khoản hiện tại, không thêm được gì.
    if (!Array.isArray(signedInAccounts) || signedInAccounts.length === 0) return null;

    const others = signedInAccounts.filter((a) => !a.isCurrent && a.id !== user?.id);
    const atLimit = maxSignedInAccounts > 0 && signedInAccounts.length >= maxSignedInAccounts;

    const handleSwitch = (account) => guard(async () => {
        setProblem(null);
        setBusyId(account.id);
        try {
            await switchAccount(account.id); // thành công là trang tải lại — không có "sau đó"
        } catch (err) {
            setBusyId(null);
            if (err?.errorCode === ACCOUNT_NOT_SIGNED_IN_CODE) {
                setProblem({ kind: 'expired', account });
                refreshSignedInAccounts();
            } else {
                setProblem({ kind: 'failed', account, message: err?.message });
            }
        }
    });

    const handleSignOut = (account) => {
        setProblem(null);
        setBusyId(account.id);
        signOutAccount(account.id)
            .catch((err) => setProblem({ kind: 'failed', account, message: err?.message }))
            .finally(() => setBusyId(null));
    };

    const goToLogin = (email) => guard(() => {
        const params = new URLSearchParams({ mode: 'add' });
        if (email) params.set('email', email);
        onNavigate?.();
        navigate(`/login?${params.toString()}`);
    });

    return (
        <div className="mt-3">
            {others.length > 0 && (
                <>
                    <p className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('account.switch.title')}
                    </p>
                    <ul className="space-y-0.5">
                        {others.map((account) => (
                            <li key={account.id} className="group flex items-center gap-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => handleSwitch(account)}
                                    disabled={Boolean(busyId)}
                                    title={t('account.switch.to', { email: account.email })}
                                    className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left cursor-pointer disabled:cursor-wait"
                                >
                                    <AccountAvatar account={account} className="w-8 h-8 text-xs" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {account.fullName || account.email}
                                        </span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {account.email}
                                        </span>
                                    </span>
                                    {busyId === account.id && (
                                        <Loader2 className="w-4 h-4 text-[var(--ink-muted)] animate-spin shrink-0" aria-label={t('account.switch.switching')} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSignOut(account)}
                                    disabled={Boolean(busyId)}
                                    title={t('account.switch.signOutOne', { email: account.email })}
                                    aria-label={t('account.switch.signOutOne', { email: account.email })}
                                    className="p-2 mr-1 rounded-full text-[var(--ink-subtle)] hover:text-[var(--tone-danger)] opacity-60 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer disabled:cursor-wait"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {problem && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--tone-warn-soft)] px-3 py-2 text-xs text-[var(--ink)]" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="break-words">
                            {problem.kind === 'expired'
                                ? t('account.switch.expired', { email: problem.account.email })
                                : t('account.switch.failed', { reason: problem.message || t('common.genericError') })}
                        </p>
                        {problem.kind === 'expired' && (
                            <button
                                type="button"
                                onClick={() => goToLogin(problem.account.email)}
                                className="mt-1 font-semibold text-[var(--ink)] underline-offset-2 hover:underline cursor-pointer"
                            >
                                {t('account.switch.signInAgain')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={() => goToLogin()}
                disabled={atLimit || Boolean(busyId)}
                title={atLimit ? t('account.switch.addLimit', { count: maxSignedInAccounts }) : undefined}
                className="mt-1 w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-xl transition-colors text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <UserPlus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                {t('account.switch.add')}
            </button>
        </div>
    );
}
