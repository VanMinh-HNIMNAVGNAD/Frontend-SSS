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
    { value: 'ADMIN', labelKey: 'driveShare.role.admin', hintKey: 'driveShare.role.admin.hint', icon: ShieldCheck },
    { value: 'MEMBER', labelKey: 'driveShare.role.member', hintKey: 'driveShare.role.member.hint', icon: Pencil },
    { value: 'VIEWER', labelKey: 'driveShare.role.viewer', hintKey: 'driveShare.role.viewer.hint', icon: Eye },
];

const ROLE_MAP = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r]));

function Avatar({ name }) {
    const initials = name?.charAt(0)?.toUpperCase() || '?';
    return (
        <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 dark:from-zinc-500 dark:to-zinc-700 flex items-center justify-center text-white font-semibold text-sm">
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
                <div className="glass-soft flex gap-2.5 p-3 rounded-2xl text-[12px] text-[var(--ink-muted)] leading-relaxed">
                    <Users className="w-4 h-4 shrink-0 mt-0.5 text-[var(--ink-muted)]" />
                    <p>
                        {tRich(t('driveShare.explain'), {
                            all: <strong>{t('driveShare.explain.all')}</strong>,
                        })}
                    </p>
                </div>

                {errorMsg && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--tone-danger-soft)] text-[var(--tone-danger)] text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{errorMsg}</span>
                        <button onClick={() => setErrorMsg('')} className="text-[var(--tone-danger)] opacity-70 hover:opacity-100 cursor-pointer">
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
                                className="glass-input flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] transition-all"
                            />
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="glass-select pl-3 py-2.5 rounded-2xl text-sm font-medium text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent-soft)] cursor-pointer"
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={!email.trim() || isSubmitting}
                                className="px-4 py-2.5 btn-accent hover:brightness-105 text-sm font-semibold rounded-full disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
                                    className="flex items-center justify-between gap-2 p-2.5 rounded-2xl row-hover transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar name={member.user?.fullName || member.user?.email} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                                                {member.user?.fullName || member.user?.email}
                                                {isCreator && (
                                                    <span title={t('driveShare.creatorTitle')}>
                                                        <Crown className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                                                    </span>
                                                )}
                                                {isSelf && <span className="text-[10px] font-bold text-slate-400">{t('driveShare.you')}</span>}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{member.user?.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="chip px-2 py-1 text-[11px]">
                                            <RoleIcon className="w-3 h-3" />
                                            {t(roleInfo.labelKey)}
                                        </span>

                                        {/* Không cho tự gỡ chính mình: gỡ xong sẽ mất luôn quyền vào drive */}
                                        {isAdmin && !isSelf && (
                                            <button
                                                onClick={() => handleRemoveMember(memberUserId)}
                                                disabled={removingUserId === memberUserId}
                                                title={t('driveShare.remove')}
                                                className="p-1.5 rounded-full text-[var(--ink-subtle)] hover:text-[var(--tone-danger)] transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
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
                        className="px-5 py-2 btn-accent hover:brightness-105 text-sm font-semibold rounded-full transition-all cursor-pointer"
                    >
                        {t('common.done')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
