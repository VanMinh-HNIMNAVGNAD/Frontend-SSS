import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = 'max-w-md',
    showCloseButton = true
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 dark:bg-black/55 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
            onClick={onClose}
        >
            <div
                className={`w-full ${maxWidth} bg-[var(--app-surface)] rounded-3xl shadow-2xl border border-[var(--app-border)] overflow-hidden transform transition-all duration-200 scale-100 animate-in zoom-in-95 cursor-default`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--app-border)] bg-black/[0.025] dark:bg-white/[0.045]">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-full hover:bg-gray-200/70 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* Body */}
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
