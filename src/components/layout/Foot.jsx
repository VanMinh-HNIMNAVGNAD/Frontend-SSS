export default function Foot() {
    return (
        <footer className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-[#282a2c] shrink-0 rounded-b-2xl flex flex-col justify-center">
            {/* Placeholder Breadcrumb Text */}
            <div className="text-[13px] text-gray-600 dark:text-gray-300 font-mono tracking-tight truncate">
                ./Drive của tôi/Dự án Công ty/Báo cáo/...
            </div>
            {/* Version nhỏ hơn ở dưới */}
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Version 1.0.0-alpha
            </div>
        </footer>
    );
}