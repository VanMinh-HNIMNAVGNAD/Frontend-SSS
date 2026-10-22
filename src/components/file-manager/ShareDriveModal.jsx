import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, AlertCircle, X, Crown, ShieldCheck, Eye, Pencil } from 'lucide-react';
import Modal from '../common/Modal';
import { sharedDrivesApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import tRich from '../../utils/tRich';

/**
 * Chia sẻ một BỘ NHỚ DÙNG CHUNG — khác hẳn `ShareModal` của tệp/thư mục.
 *
 * `ShareModal` ghi vào bảng `file_shares` (chia sẻ từng tệp một, có link công khai,
 * mật khẩu, hạn dùng). Modal này ghi vào bảng `shared_drive_members`: thêm một người
 * vào drive là họ thấy được TOÀN BỘ tệp/thư mục con bên trong, xóa họ khỏi drive là
 * mất quyền với tất cả ngay lập tức. Đó chính là "share cascade" mà không cần thêm
 * bảng nào — nên ở đây KHÔNG có link công khai / mật khẩu / hạn dùng.
 */
const ROLE_OPTIONS = [
    { value: 'ADMIN', labelKey: 'driveShare.role.admin', hintKey: 'driveShare.role.admin.hint', icon: ShieldCheck, badge: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200' },
    { value: 'MEMBER', labelKey: 'driveShare.role.member', hintKey: 'driveShare.role.member.hint', icon: Pencil, badge: 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200' },
    { value: 'VIEWER', labelKey: 'driveShare.role.viewer', hintKey: 'driveShare.role.viewer.hint', icon: Eye, badge: 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-700' },
];

const ROLE_MAP = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r]));

function Avatar({ name }) {
    const initials = name?.charAt(0)?.toUpperCase() || '?';
    return (
        <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
            {initials}
        </div>
    );
}

export default function ShareDriveModal({ isOpen, drive, onClose, onChanged }) {
    const { t } = useLanguage();
    const { user } = useAuth();

    const [email, setEmail] = useState('');
    const [role, setRole] = useState('MEMBER');
    const [members, setMembers] = useState([]);
    const [myRole, setMyRole] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [removingUserId, setRemovingUserId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const driveId = drive?.id;

    const loadMembers = useCallback(async () => {
        if (!driveId) return;
        try {
            setIsLoading(true);
            const data = await sharedDrivesApi.getOne(driveId);
            setMembers(Array.isArray(data?.members) ? data.members : []);
            setMyRole(data?.userRole ?? null);
        } catch (err) {
            setErrorMsg(err.message || t('driveShare.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    }, [driveId, t]);

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setRole('MEMBER');
            setErrorMsg('');
            loadMembers();
        }
    }, [isOpen, loadMembers]);

    if (!isOpen || !drive) return null;

    const isAdmin = myRole === 'ADMIN';

    const handleAddMember = async (e) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;

        setErrorMsg('');
        try {
            setIsSubmitting(true);
            await sharedDrivesApi.addMember(driveId, { email: trimmed, role });
            setEmail('');
            await loadMembers();
            onChanged?.();
        } catch (err) {
            setErrorMsg(err.message || t('driveShare.addFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveMember = async (targetUserId) => {
        setErrorMsg('');
        try {
            setRemovingUserId(targetUserId);
            // API nhận USER id, không phải id của hàng shared_drive_members
            await sharedDrivesApi.removeMember(driveId, targetUserId);
            await loadMembers();
            onChanged?.();
        } catch (err) {
            setErrorMsg(err.message || t('driveShare.removeFailed'));
        } finally {
            setRemovingUserId(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('driveShare.title', { name: drive.name })} maxWidth="max-w-lg">
            {/* Trang Bộ nhớ dùng chung chặn right-click ở div bọc ngoài (BUG10) và modal
                render inline nên nằm trong đó — chặn event tại đây để còn Dán được vào ô email */}
            <div className="space-y-5" onContextMenu={(e) => e.stopPropagation()}>
                {/* Giải thích bản chất share của Bộ nhớ dùng chung */}
                <div className="flex gap-2.5 p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-400/15 border border-indigo-100 dark:border-indigo-400/25 text-[12px] text-indigo-900 dark:text-indigo-200 leading-relaxed">
                    <Users className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                    <p>
                        {tRich(t('driveShare.explain'), {
                            all: <strong>{t('driveShare.explain.all')}</strong>,
                        })}
                    </p>
                </div>

                {errorMsg && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{errorMsg}</span>
                        <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Form thêm thành viên — chỉ ADMIN */}
                {isAdmin ? (
                    <form onSubmit={handleAddMember} className="space-y-2">
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('driveShare.addMember')}
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                                placeholder={t('driveShare.email.placeholder')}
                                className="glass-input flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl border text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            />
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="glass-input px-3 py-2.5 rounded-2xl border text-sm font-medium text-slate-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={!email.trim() || isSubmitting}
                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-2xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{t('driveShare.add')}</span>}
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400">{ROLE_MAP[role]?.hintKey ? t(ROLE_MAP[role].hintKey) : ''}</p>
                    </form>
                ) : (
                    <div className="px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-gray-700 text-xs text-slate-500 dark:text-gray-400">
                        {t('driveShare.adminOnly')}
                    </div>
                )}

                {/* Danh sách thành viên */}
                <div>
                    <h4 className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        {t('driveShare.members', { count: members.length })}
                    </h4>
                    <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t('share.loadingList')}</span>
                            </div>
                        ) : members.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">{t('driveShare.noMembers')}</div>
                        ) : members.map((member) => {
                            const roleInfo = ROLE_MAP[member.role] || ROLE_MAP.MEMBER;
                            const RoleIcon = roleInfo.icon;
                            const memberUserId = member.user?.id;
                            const isCreator = memberUserId === drive.createdBy;
                            const isSelf = memberUserId === user?.id;

                            return (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between gap-2 p-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar name={member.user?.fullName || member.user?.email} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                                                {member.user?.fullName || member.user?.email}
                                                {isCreator && (
                                                    <span title={t('driveShare.creatorTitle')}>
                                                        <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                    </span>
                                                )}
                                                {isSelf && <span className="text-[10px] font-bold text-slate-400">{t('driveShare.you')}</span>}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{member.user?.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border ${roleInfo.badge}`}>
                                            <RoleIcon className="w-3 h-3" />
                                            {t(roleInfo.labelKey)}
                                        </span>

                                        {/* Không cho tự gỡ chính mình: gỡ xong sẽ mất luôn quyền vào drive */}
                                        {isAdmin && !isSelf && (
                                            <button
                                                onClick={() => handleRemoveMember(memberUserId)}
                                                disabled={removingUserId === memberUserId}
                                                title={t('driveShare.remove')}
                                                className="p-1.5 rounded-lg text-slate-300 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                                            >
                                                {removingUserId === memberUserId
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <X className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Chưa có API đổi role cho member sẵn có — nói thẳng thay vì để người dùng đi tìm */}
                {isAdmin && members.length > 0 && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        {t('driveShare.changeRoleHint')}
                    </p>
                )}

                <div className="flex justify-end pt-3 border-t border-glass-divider">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                        {t('common.done')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
