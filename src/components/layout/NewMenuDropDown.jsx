import React from 'react';
import { FolderPlus, FileUp } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function NewMenuDropDown({ onCreateFolder, onUploadFile, onClose }) {
    const { t } = useLanguage();

    return (
        <div className="glass-strong relative w-56 rounded-[20px] border py-2 text-sm text-gray-700 dark:text-gray-300">
            <button
                onClick={() => { onCreateFolder && onCreateFolder(); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors text-left font-medium"
            >
                <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{t('menu.newFolder')}</span>
            </button>
            <button
                onClick={() => { onUploadFile && onUploadFile(); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors text-left font-medium"
            >
                <FileUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('menu.uploadFile')}</span>
            </button>
        </div>
    );
}