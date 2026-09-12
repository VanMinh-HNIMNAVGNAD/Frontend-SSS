import React from 'react';
import { Download as DownloadIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function Download({ file, onDownload }) {
    const { t } = useLanguage();

    if (!file) return null;
    return (
        <button
            onClick={() => onDownload && onDownload(file)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors"
        >
            <DownloadIcon className="w-4 h-4" />
            <span>{t('file.downloadNamed', { name: file.name })}</span>
        </button>
    );
}
