import { useState, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';
import { splitFileName, fileExtension } from '../../utils/fileName';

export default function RenameModal({ isOpen, item, onClose, onRename }) {
    const { t } = useLanguage();
    // `name` chỉ chứa PHẦN TÊN (base), không chứa phần mở rộng — xem khối chú
    // thích của `lockedExt` bên dưới.
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isFolder = item?.type === 'folder';
    /**
     * KHOÁ PHẦN MỞ RỘNG: người dùng không được đổi '.txt' thành '.mp3' qua modal
     * này (đổi đuôi làm sai định dạng thật của tệp, làm lệch icon/màu/khung xem
     * trước, và trước đây còn là đường vòng để né bộ quét tệp đáng ngờ ở luồng
     * upload — luồng đổi tên không quét lại).
     *
     * Chỉ khoá đoạn sau dấu chấm CUỐI CÙNG, nên tệp 'abc.xyz.mno' vẫn cho sửa
     * 'abc.xyz' và giữ nguyên '.mno' — '.xyz' ở giữa chỉ là phần của tên, không
     * quyết định định dạng. Thư mục không có khái niệm phần mở rộng nên sửa cả tên.
     */
    const lockedExt = isFolder ? '' : splitFileName(item?.name).ext;

    useEffect(() => {
        if (item) {
            const { base, ext } = item.type === 'folder'
                ? { base: item.name || '', ext: '' }
                : splitFileName(item.name);
            setName(ext ? base : (item.name || ''));
        }
    }, [item]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen && !isSubmitting) {
                onClose && onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, isSubmitting]);

    /**
     * Tệp KHÔNG có phần mở rộng (ví dụ 'README', hay tệp ẩn '.env') thì không có
     * gì để khoá bằng hậu tố cố định, nhưng vẫn phải chặn: gõ 'README.mp3' là
     * đang GẮN THÊM một định dạng cho tệp. Chặn ngay ở đây để UI khớp với luật
     * backend (`renameItem` trả 400) thay vì để người dùng bấm rồi mới thấy lỗi.
     */
    const extError = !!item && !isFolder && !lockedExt && fileExtension(name.trim()) !== '';

    if (!isOpen || !item) return null;

    /**
     * CHỜ kết quả đổi tên rồi mới đóng modal.
     *
     * Bản cũ gọi `onRename(...)` rồi `onClose()` ngay: request lỗi (403 tệp chỉ
     * được xem, 404 tệp đã bị xoá, 400 tên rỗng) cũng vẫn đóng modal như thường,
     * nên người dùng chỉ thấy tên cũ nằm nguyên đó — trông y hệt "đã lưu rồi bị
     * revert". `renameItem` trong FileContext trả `{ ok, error }` (không throw)
     * nên chỉ cần kiểm tra `ok`: lỗi thì toast đã báo, modal GIỮ NGUYÊN tên vừa gõ
     * để người dùng sửa lại hoặc bấm Huỷ.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (extError) return; // nút đã bị vô hiệu, đây là chốt cho Enter
        const nextName = name.trim() + lockedExt;
        if (!name.trim() || nextName === item.name) {
            onClose();
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await onRename(item.id, nextName);
            // `onRename` có thể là handler không trả gì — chỉ coi là thất bại khi
            // nó nói rõ `ok: false`.
            if (result && result.ok === false) {
                setIsSubmitting(false);
                return; // giữ modal mở để người dùng sửa lại tên hoặc huỷ
            }
            // Modal chỉ ẩn đi chứ không unmount, phải tự trả cờ về trước khi đóng
            // nếu không lần mở sau nút bấm sẽ kẹt ở trạng thái "Đang lưu...".
            setIsSubmitting(false);
            onClose();
        } catch {
            // onRename tự lo phần thông báo lỗi; ở đây chỉ cần đừng đóng modal
            setIsSubmitting(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4 animate-fade-in cursor-pointer"
            onClick={() => { if (!isSubmitting) onClose(); }}
        >
            <div 
                className="glass-strong relative dark:text-gray-100 rounded-[20px] w-full max-w-md border overflow-hidden transform transition-all cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-glass-divider">
                    <div className="flex items-center gap-2.5 font-semibold text-lg text-gray-800 dark:text-gray-100">
                        <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span>{item.type === 'folder' ? t('rename.titleFolder') : t('rename.titleFile')}</span>
                    </div>
                    <button 
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            {t('rename.newNameLabel')}
                        </label>
                        {/* Ô nhập chỉ nhận PHẦN TÊN; phần mở rộng nằm ngoài ô, không sửa được */}
                        <div className={`glass-soft flex items-center w-full rounded-xl border text-sm transition-all focus-within:ring-2 ${
                            extError
                                ? 'border-red-400 dark:border-red-500 focus-within:ring-red-500 focus-within:border-red-500'
                                : 'border-gray-300 dark:border-gray-600 focus-within:ring-blue-500 focus-within:border-blue-500'
                        }`}>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isSubmitting}
                                autoFocus
                                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-transparent text-gray-900 dark:text-gray-100 outline-none border-0"
                                placeholder={t('rename.placeholder')}
                                aria-invalid={extError || undefined}
                            />
                            {lockedExt && (
                                <span
                                    className="shrink-0 pr-4 pl-1 py-2.5 font-mono text-gray-500 dark:text-gray-400 select-none cursor-not-allowed"
                                >
                                    {lockedExt}
                                </span>
                            )}
                        </div>
                        {lockedExt && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {t('rename.extLocked', { ext: lockedExt })}
                            </p>
                        )}
                        {extError && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                                {t('rename.extAddBlocked', { ext: fileExtension(name.trim()) })}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 rounded-xl transition-colors cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || extError || !name.trim() || name.trim() + lockedExt === item.name}
                            className="px-5 py-2 text-sm font-semibold btn-accent hover:brightness-105 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                            {isSubmitting ? t('rename.saving') : t('rename.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
