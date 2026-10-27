import React from 'react';
import { Loader2 } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';

export default function Spinner({ size = 'md', className = '', label }) {
    const { t } = useLanguage();
    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8',
        xl: 'w-12 h-12'
    };

    return (
        <div className={`flex items-center justify-center gap-2 ${className}`}>
            <Loader2 className={`${sizes[size] || sizes.md} animate-spin text-[var(--ink-muted)]`} />
            {/* `label ?? t(...)`, không phải `label ||`: chuỗi rỗng vẫn là ý muốn ẩn nhãn.
                Mặc định cũ là chuỗi tiếng Việt ghi trong tham số, không dịch được. */}
            {(label ?? t('common.loading')) && (
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {label ?? t('common.loading')}
                </span>
            )}
        </div>
    );
}
