import React from 'react';

export default function Button({
    children,
    variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
    size = 'md', // 'sm' | 'md' | 'lg'
    className = '',
    disabled = false,
    onClick,
    type = 'button',
    ...props
}) {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

    const variants = {
        primary: 'btn-accent hover:brightness-105 shadow-sm hover:shadow-md active:scale-[0.98]',
        secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 active:scale-[0.98]',
        outline: 'glass-soft border hover:border-gray-400 dark:hover:border-gray-500 text-gray-800 dark:text-gray-200 font-semibold',
        danger: 'btn-danger active:scale-[0.98]',
        ghost: 'bg-transparent text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-xs gap-1.5',
        md: 'px-4 py-2 text-sm gap-2',
        lg: 'px-6 py-3 text-base gap-2.5',
    };

    return (
        <button
            type={type}
            disabled={disabled}
            onClick={onClick}
            className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
