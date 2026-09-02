import { useState, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';

export default function RenameModal({ isOpen, item, onClose, onRename }) {
    const { t } = useLanguage();
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (item) {
            setName(item.name || '');
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
        const nextName = name.trim();
        if (!nextName || nextName === item.name) {
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
            onClick={() => { if (!isSubmitting) onClose(); }}
        >
            <div 
                className="bg-white dark:bg-[#282a2c] dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden transform transition-all cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2.5 font-semibold text-lg text-gray-800 dark:text-gray-100">
                        <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span>{item.type === 'folder' ? t('rename.titleFolder') : t('rename.titleFile')}</span>
                    </div>
                    <button 
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Tên mới
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isSubmitting}
                            autoFocus
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                            placeholder={t('rename.placeholder')}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim() || name.trim() === item.name}
                            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                            {isSubmitting ? t('rename.saving') : t('rename.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
