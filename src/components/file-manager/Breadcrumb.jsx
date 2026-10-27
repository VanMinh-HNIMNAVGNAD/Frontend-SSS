import { ChevronRight, HardDrive } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';

/**
 * Đường dẫn thư mục, đồng thời là TIÊU ĐỀ của trang (26/10/2026): chặng đang đứng to và đậm như
 * tiêu đề các trang khác ("Gần đây", "Thùng rác"…), các chặng phía trước nhỏ hơn, màu mực nhạt. Bản
 * cũ là một dòng chữ 14px với icon ngôi nhà, nên "cloudSSS của tôi" trông như một dòng phụ trong khi
 * trang nào khác cũng có tiêu đề 20px.
 *
 * @param {Array<{id: string, name?: string, nameKey?: string}>} path Các chặng SAU gốc
 * @param {(id: string|null) => void} onNavigate null = về gốc
 * @param {string} [rootLabel] Tên gốc — mặc định "cloudSSS của tôi"
 * @param {React.ComponentType} [rootIcon] Icon gốc — mặc định ổ đĩa như ở thanh bên
 */
export default function Breadcrumb({ path = [], onNavigate, rootLabel, rootIcon: RootIcon = HardDrive }) {
    const { t } = useLanguage();
    const atRoot = path.length === 0;

    return (
        <nav className="flex items-center gap-1 min-w-0 overflow-x-auto py-0.5">
            <button
                onClick={() => onNavigate && onNavigate(null)}
                aria-current={atRoot ? 'page' : undefined}
                className={`flex items-center gap-2.5 shrink-0 transition-colors cursor-pointer ${
                    atRoot ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
            >
                <RootIcon className="w-[22px] h-[22px] shrink-0 text-[var(--ink-muted)]" />
                <span className={atRoot ? 'text-xl font-bold tracking-tight' : 'text-[15px] font-semibold'}>
                    {rootLabel ?? t('breadcrumb.myDriveRoot')}
                </span>
            </button>

            {path.map((item, index) => {
                const isLast = index === path.length - 1;
                return (
                    <div key={item.id || index} className="flex items-center gap-1 min-w-0 shrink-0">
                        <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-subtle)]" />
                        <button
                            onClick={() => onNavigate && onNavigate(item.id)}
                            aria-current={isLast ? 'page' : undefined}
                            title={item.nameKey ? t(item.nameKey) : item.name}
                            className={`truncate max-w-[16rem] transition-colors cursor-pointer ${
                                isLast
                                    ? 'text-xl font-bold tracking-tight text-[var(--ink)]'
                                    : 'text-[15px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]'
                            }`}
                        >
                            {item.nameKey ? t(item.nameKey) : item.name}
                        </button>
                    </div>
                );
            })}
        </nav>
    );
}
