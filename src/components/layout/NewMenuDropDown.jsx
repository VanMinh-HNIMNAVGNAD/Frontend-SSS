import React from 'react';
import { FolderPlus, FileUp } from 'lucide-react';

export default function NewMenuDropDown({ onCreateFolder, onUploadFile, onClose }) {
    return (
        <div className="w-56 bg-white dark:bg-[#282a2c] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 text-sm text-gray-700 dark:text-gray-300">
            <button
                onClick={() => { onCreateFolder && onCreateFolder(); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left font-medium"
            >
                <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Thư mục mới</span>
            </button>
            <button
                onClick={() => { onUploadFile && onUploadFile(); onClose && onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left font-medium"
            >
                <FileUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Tải tệp lên</span>
            </button>
        </div>
    );
}