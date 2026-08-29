import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumb({ path = [], onNavigate }) {
    return (
        <nav className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 font-medium overflow-x-auto py-1">
            <button
                onClick={() => onNavigate && onNavigate(null)}
                className="flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-400 transition-colors shrink-0 font-semibold"
            >
                <Home className="w-4 h-4 text-gray-700 dark:text-gray-400" />
                <span>Driver riêng của tôi</span>
            </button>

            {path.map((item, index) => (
                <div key={item.id || index} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-500" />
                    <button
                        onClick={() => onNavigate && onNavigate(item.id)}
                        className={`hover:text-blue-700 dark:hover:text-blue-400 transition-colors ${
                            index === path.length - 1 ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-700 dark:text-gray-300'
                        }`}
                    >
                        {item.name}
                    </button>
                </div>
            ))}
        </nav>
    );
}
