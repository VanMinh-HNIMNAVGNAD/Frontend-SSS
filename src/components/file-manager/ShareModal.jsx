import { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, Copy, Check, Lock, Shield, Eye, Edit3, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { sharingApi } from '../../services/api';
import { readDefaultShareRole } from '../../constants/privacy';

// Câu giải thích DÙNG CHUNG cho tooltip cạnh ô email và cho thông báo lỗi khi
// backend trả 404. Lý do đặt một chỗ: hai bên phải nói CÙNG một điều, nếu không
// người dùng đọc tooltip xong lại thấy lỗi mâu thuẫn với nó.
//
// Cố ý KHÔNG hứa hẹn phân biệt được hai trường hợp: FilesService.addShareAccess
// gộp "email không tồn tại" và "người này tắt is_discoverable_by_email" vào ĐÚNG
// một NotFoundException, có chủ đích — tách ra là biến ô nhập email thành máy tra
// cứu xem địa chỉ nào có tài khoản driveR, thậm chí biết ai đã chủ động ẩn mình
// (user enumeration). Vì vậy phía client cũng không được đoán: chỉ nêu ĐỦ CẢ HAI
// khả năng để người chia sẻ không kết luận sai rằng email không tồn tại.
// Khoá dịch, không phải câu: hằng số module không gọi được useLanguage().
const EMAIL_LOOKUP_HINT_KEY = 'share.emailHint';

const ROLE_CONFIG = {
    VIEWER: {
        labelKey: 'share.role.viewer',
        icon: Eye,
        color: 'text-sky-400',
        bg: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30',
    },
    EDITOR: {
        labelKey: 'share.role.editor',
        icon: Edit3,
        color: 'text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30',
    },
};

function Avatar({ name, avatarUrl, size = 9 }) {
    const initials = name?.charAt(0)?.toUpperCase() || '?';
    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name}
                className={`w-${size} h-${size} rounded-full object-cover ring-1 ring-gray-200 dark:ring-white/10`}
            />
        );
    }
    return (
        <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm ring-1 ring-gray-200 dark:ring-white/10`}>
            {initials}
        </div>
    );
}

export default function ShareModal({ isOpen, item, onClose }) {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    // Quyền mặc định cho người SẮP được thêm — đọc từ "Quyền chia sẻ mặc định"
    // trong Cài đặt. Truyền THAM CHIẾU hàm (không phải readDefaultShareRole())
    // để React chỉ gọi một lần lúc khởi tạo, không đụng localStorage mỗi lần
    // re-render. Hàm đã bọc try/catch và tự lọc về 'VIEWER' nếu giá trị lạ.
    const [role, setRole] = useState(readDefaultShareRole);
    const [copied, setCopied] = useState(false);
    const [sharePassword, setSharePassword] = useState('');
    const [expireDate, setExpireDate] = useState('');
    const [allowDownload, setAllowDownload] = useState(true);
    const [previewOnly, setPreviewOnly] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState('');
    const [members, setMembers] = useState([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [removingId, setRemovingId] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const loadMembers = useCallback(async () => {
        if (!item?.id) return;
        try {
            setIsLoadingMembers(true);
            const data = await sharingApi.getShareAccess(item.id);
            setMembers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load members', err);
        } finally {
            setIsLoadingMembers(false);
        }
    }, [item?.id]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose?.();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            loadMembers();
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, loadMembers, onClose]);

    // MainLayout.jsx luôn render <ShareModal isOpen={!!shareTargetItem} …>, modal
    // chỉ `return null` chứ KHÔNG unmount — nên useState ở trên chỉ chạy đúng MỘT
    // lần cho cả vòng đời app. Phải đọc lại readDefaultShareRole() mỗi lần MỞ, nếu
    // không: đổi mặc định sang Editor trong Cài đặt rồi mở lại ShareModal vẫn thấy
    // giá trị của lần mở ĐẦU TIÊN.
    //
    // Khoá theo (đang mở + id của mục) chứ không chỉ theo isOpen: mở ShareModal cho
    // một mục khác trong khi modal còn mở cũng phải reset — trước đây phần reset này
    // nằm trong useEffect phụ thuộc loadMembers (đổi theo item?.id) nên vẫn chạy.
    //
    // Đồng bộ ngay trong lúc render thay vì trong useEffect: cùng mẫu với
    // SettingsModal.jsx. Làm trong effect thì lần render đầu sau khi mở vẫn vẽ giá
    // trị CŨ rồi mới vẽ lại lần hai — người dùng thấy ô quyền nhảy — và eslint
    // (react-hooks/set-state-in-effect) cũng chặn.
    const shareSessionKey = isOpen ? (item?.id ?? null) : null;
    const [lastShareSessionKey, setLastShareSessionKey] = useState(shareSessionKey);
    if (shareSessionKey !== lastShareSessionKey) {
        setLastShareSessionKey(shareSessionKey);
        if (shareSessionKey !== null) {
            setRole(readDefaultShareRole());
            setEmail('');
            setErrorMsg('');
        }
    }

    if (!isOpen || !item) return null;

    const calculateExpiresInDays = (dateString) => {
        if (!dateString) return undefined;

        const target = new Date(`${dateString}T23:59:59.999`);
        if (Number.isNaN(target.getTime())) return undefined;

        const now = new Date();
        const diffMs = target.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / 86400000);

        return diffDays > 0 ? diffDays : undefined;
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setErrorMsg('');
        try {
            setIsSubmitting(true);
            await sharingApi.addShareAccess(item.id, { email: email.trim(), role });
            setEmail('');
            await loadMembers();
        } catch (err) {
            // 404 = nhánh gộp của backend: có thể email chưa có tài khoản, cũng có thể
            // chủ tài khoản đã tự ẩn mình. Ghép thêm EMAIL_LOOKUP_HINT để người chia sẻ
            // biết khả năng thứ hai thay vì tin chắc là mình gõ sai email. Các lỗi khác
            // (403 không có quyền, 400 dữ liệu sai, mất mạng…) giữ nguyên câu của server
            // — dán câu về quyền riêng tư vào đó chỉ làm người dùng đi sai hướng.
            const message = err.message || t('share.userNotFound');
            setErrorMsg(err.status === 404 ? `${message} ${t(EMAIL_LOOKUP_HINT_KEY)}` : message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemoveMember = async (userId) => {
        try {
            setRemovingId(userId);
            await sharingApi.removeShareAccess(item.id, userId);
            await loadMembers();
        } catch (err) {
            setErrorMsg(t('share.removeFailed', { reason: err.message || err }));
        } finally {
            setRemovingId(null);
        }
    };

    const handleChangeRole = async (userId, newRole) => {
        try {
            // Re-use addShareAccess to upsert
            const member = members.find(m => m.id === userId);
            if (!member) return;
            await sharingApi.addShareAccess(item.id, { email: member.email, role: newRole });
            await loadMembers();
        } catch (err) {
            setErrorMsg(t('share.roleUpdateFailed', { reason: err.message || err }));
        }
    };

    const handleCopyLink = async () => {
        const expiresInDays = calculateExpiresInDays(expireDate);

        if (expireDate && expiresInDays === undefined) {
            setErrorMsg(t('share.expiryInPast'));
            return;
        }

        try {
            const res = await sharingApi.createShareLink(item.id, {
                // Đọc lại từ Cài đặt ngay lúc bấm, KHÔNG dùng state `role` ở trên:
                // ô đó là quyền cho người sắp được mời qua email, người dùng có thể
                // vừa đổi nó cho một lời mời cụ thể mà không có ý đổi luôn quyền của
                // link công khai. Thiếu trường này thì backend rơi về default 'VIEWER'
                // của CreateShareLinkDto, bỏ qua lựa chọn trong Cài đặt.
                role: readDefaultShareRole(),
                password: sharePassword || undefined,
                expiresInDays,
                isDownloadAllowed: allowDownload,
                isPreviewOnly: previewOnly,
            });
            const fullShareUrl = `${window.location.origin}/share/${res.shareToken}`;
            await navigator.clipboard.writeText(fullShareUrl);
            setGeneratedUrl(fullShareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (err) {
            setErrorMsg(t('share.linkFailed', { reason: err.message || err }));
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in cursor-pointer"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2.5 font-bold text-base text-gray-900 dark:text-gray-100">
                        <div className="p-1.5 rounded-lg bg-blue-600/10 dark:bg-blue-500/15">
                            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="truncate max-w-[320px]">Chia sẻ "{item.name}"</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5 text-sm">
                    {/* Error message */}
                    {errorMsg && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMsg}</span>
                            <button onClick={() => setErrorMsg('')} className="ml-auto text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Add people form */}
                    <form onSubmit={handleAddMember} className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('share.addPeople')}</label>
                            {/* Tooltip gốc của trình duyệt (thuộc tính title) thay vì popover tự
                                dựng: chỉ là một câu tĩnh, không cần state/định vị, và vẫn đọc
                                được bằng trình đọc màn hình qua aria-label. tabIndex={0} để tới
                                được bằng bàn phím — chỉ đặt title lên <span> thì người không dùng
                                chuột không bao giờ thấy câu này. */}
                            <span
                                role="img"
                                title={t(EMAIL_LOOKUP_HINT_KEY)}
                                aria-label={t(EMAIL_LOOKUP_HINT_KEY)}
                                tabIndex={0}
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-full cursor-help transition-colors"
                            >
                                <HelpCircle className="w-3.5 h-3.5" />
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                                placeholder={t('share.email.placeholder')}
                                title={t(EMAIL_LOOKUP_HINT_KEY)}
                                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition"
                            />
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-300 font-medium outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                            >
                                <option value="VIEWER">{t('share.role.viewer')}</option>
                                <option value="EDITOR">{t('share.role.editor')}</option>
                            </select>
                            <button
                                type="submit"
                                disabled={!email.trim() || isSubmitting}
                                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{t('share.send')}</span>}
                            </button>
                        </div>
                    </form>

                    {/* People with access */}
                    <div>
                        <h4 className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 text-[11px]">
                            Người có quyền truy cập ({members.length})
                        </h4>
                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                            {isLoadingMembers ? (
                                <div className="flex items-center justify-center gap-2 py-6 text-gray-500 dark:text-gray-400 text-xs">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>{t('share.loadingList')}</span>
                                </div>
                            ) : members.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-xs">
                                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p>{t('share.noOne')}</p>
                                </div>
                            ) : members.map((member) => {
                                const roleInfo = ROLE_CONFIG[member.role] || ROLE_CONFIG.VIEWER;
                                const RoleIcon = roleInfo.icon;
                                return (
                                    <div
                                        key={member.id}
                                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar name={member.name} avatarUrl={member.avatarUrl} />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{member.name}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {/* Role Selector */}
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleChangeRole(member.id, e.target.value)}
                                                className={`text-xs px-2 py-1 rounded-lg border cursor-pointer outline-none bg-transparent ${roleInfo.bg} hover:opacity-80 transition`}
                                                title={t('share.changeRole')}
                                            >
                                                <option value="VIEWER" className="bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100">{t('share.role.viewer')}</option>
                                                <option value="EDITOR" className="bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100">{t('share.role.editor')}</option>
                                            </select>
                                            {/* Remove Button */}
                                            <button
                                                onClick={() => handleRemoveMember(member.id)}
                                                disabled={removingId === member.id}
                                                className="p-1 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                                title={t('share.revoke')}
                                            >
                                                {removingId === member.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <X className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Advanced Share Link Options */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <h4 className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[11px]">
                            {t('share.linkSecurity')}
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                                <Lock className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                                <input
                                    type="password"
                                    value={sharePassword}
                                    onChange={(e) => setSharePassword(e.target.value)}
                                    placeholder={t('share.password.placeholder')}
                                    className="w-full bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none text-xs"
                                />
                            </div>

                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                                <span className="text-gray-500 dark:text-gray-400 text-xs font-bold shrink-0">⏳</span>
                                <input
                                    type="date"
                                    value={expireDate}
                                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                    onChange={(e) => setExpireDate(e.target.value)}
                                    className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 text-xs">
                                <input
                                    type="checkbox"
                                    checked={allowDownload}
                                    onChange={(e) => setAllowDownload(e.target.checked)}
                                    className="rounded text-blue-500 focus:ring-blue-500 cursor-pointer accent-blue-500"
                                />
                                <span>{t('share.allowDownload')}</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300 text-xs">
                                <input
                                    type="checkbox"
                                    checked={previewOnly}
                                    onChange={(e) => setPreviewOnly(e.target.checked)}
                                    className="rounded text-blue-500 focus:ring-blue-500 cursor-pointer accent-blue-500"
                                />
                                <span>{t('share.previewOnly')}</span>
                            </label>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors font-medium text-sm cursor-pointer"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            <span>{copied ? t('share.copied') : t('share.copyLink')}</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                            Xong
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
