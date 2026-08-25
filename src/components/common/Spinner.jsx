import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 'md', className = '', label = 'Đang tải...' }) {
    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8',
        xl: 'w-12 h-12'
    };

    return (
        <div className={`flex items-center justify-center gap-2 ${className}`}>
            <Loader2 className={`${sizes[size] || sizes.md} animate-spin text-blue-600 dark:text-blue-400`} />
            {label && <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>}
        </div>
    );
}
