import { memo } from 'react';
import { Folder, MoreVertical, Users, CheckSquare, Square, Star } from 'lucide-react';
import StarButton from '../common/StarButton';
import { getCardColorVars } from '../../utils/fileColors';
import { useLanguage } from '../../context/LanguageContext';
import ItemLocation from './ItemLocation';
import { TagIcons } from '../common/TagChips';

function FolderCard({ folder, onDoubleClick, onContextMenu, onStarToggle, isSelected, isCut = false, onToggleSelect, onSelectRange, onOpenLocation }) {
    const { t } = useLanguage();
    // Cả thẻ ăn theo màu hiệu lực (customColor, hoặc xám mặc định của thư mục):
    // nền, viền, tên và icon đều đọc từ cùng một bộ biến CSS đã cân tương phản.
    // Chi tiết xem đầu file FileCard.jsx và utils/fileColors.js.
    const colorVars = getCardColorVars(folder);

    // Bật/tắt chọn — chung cho ô chọn ở góc (máy tính) và ô chọn đè lên icon (thẻ gọn).
    const handleSelectClick = (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
            e.preventDefault();
            onSelectRange && onSelectRange(folder.id);
        } else {
            onToggleSelect && onToggleSelect(folder.id);
        }
    };
    const stopDoubleClick = (e) => { e.stopPropagation(); e.preventDefault(); };

    // Thẻ gọn (`compact:` — điện thoại / tablet, xem index.css): thẻ chỉ rộng ~140–190px nên
    // bỏ khoảng chừa cho ô chọn ở góc (ô chọn đè lên icon như FileCard), sao / "được chia sẻ"
    // thu thành huy hiệu ở góc icon (gắn/bỏ sao qua menu ⋮) và tên xuống tối đa 2 dòng thay vì
    // cắt còn vài chữ. Thẻ nào cũng chỉ còn [icon] tên ⋮ nên chiều cao đều nhau.
    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, folder)}
            style={colorVars}
            className={`group relative flex items-center justify-between gap-0 compact:gap-1 p-3.5 tablet:p-2.5 phone:p-2 compact:min-h-16 rounded-[18px] cursor-pointer transition-all duration-200 border shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(15,23,42,0.05)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_24px_-12px_rgba(15,23,42,0.28)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-12px_rgba(0,0,0,0.7)] hover:-translate-y-0.5
                bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)]
                hover:bg-[var(--fc-hover-l)] dark:hover:bg-[var(--fc-hover-d)]
                border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)] ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500/80 ring-offset-2 ring-offset-transparent' : ''}`}
        >
            {/* Checkbox top-left – only this triggers selection */}
            <button
                onClick={handleSelectClick}
                onDoubleClick={stopDoubleClick}
                className={`absolute top-2 left-2 z-20 p-0.5 rounded transition-all compact:hidden ${
                    isSelected
                        ? 'opacity-100 text-blue-600 dark:text-blue-400'
                        : 'opacity-0 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-blue-600 dark:hover:text-blue-400'
                }`}
                title={isSelected ? t('card.deselect') : t('card.select')}
            >
                {isSelected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-3 tablet:gap-2 phone:gap-1.5 min-w-0 pr-2 pl-5 compact:pr-0 compact:pl-0">
                <div className="relative p-2 tablet:p-1.5 phone:p-1 rounded-xl shadow-2xs shrink-0 bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)] border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                    <Folder className={`w-5 h-5 fill-current text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)] transition-opacity ${
                        isSelected ? 'compact:opacity-0' : 'compact:group-hover:opacity-0'
                    }`} />
                    {/* Ô chọn của thẻ gọn: đè lên icon thư mục */}
                    <button
                        onClick={handleSelectClick}
                        onDoubleClick={stopDoubleClick}
                        className={`hidden compact:flex absolute inset-0 items-center justify-center rounded-xl transition-opacity ${
                            isSelected
                                ? 'opacity-100 text-blue-600 dark:text-blue-400'
                                : 'opacity-0 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                        title={isSelected ? t('card.deselect') : t('card.select')}
                    >
                        {isSelected
                            ? <CheckSquare className="w-4 h-4" />
                            : <Square className="w-4 h-4" />}
                    </button>
                    {/* Thẻ gọn: sao và "được chia sẻ" thành huy hiệu ở góc icon, nhường chỗ cho tên */}
                    {folder.isStarred && !folder.isSharedWithMe && (
                        <span role="img" aria-label={t('card.starredBadge')} className="hidden compact:flex absolute -top-1 -right-1 pointer-events-none items-center justify-center w-4 h-4 rounded-full bg-white/90 dark:bg-[#3a3a3e] ring-1 ring-[var(--fc-border-l)] dark:ring-[var(--fc-border-d)]">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                        </span>
                    )}
                    {folder.isShared && (
                        <span role="img" aria-label={t('card.sharedBadge')} className="hidden compact:flex absolute -bottom-1 -right-1 pointer-events-none items-center justify-center w-4 h-4 rounded-full bg-white/90 dark:bg-[#3a3a3e] ring-1 ring-[var(--fc-border-l)] dark:ring-[var(--fc-border-d)]">
                            <Users className="w-2.5 h-2.5 text-blue-500" />
                        </span>
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <span
                        className="text-sm phone:text-[13px] font-semibold truncate compact:whitespace-normal compact:line-clamp-2 compact:break-words compact:leading-snug text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]"
                        title={folder.name}
                    >
                        {folder.name}
                    </span>
                    {folder.isShared && (
                        <span className="text-[11px] flex compact:hidden items-center gap-1 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                            <Users className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate">{t('card.sharedBadge')}</span>
                        </span>
                    )}
                    {/* Kết quả tìm kiếm: thư mục này nằm ở đâu (##90) */}
                    <ItemLocation item={folder} onOpen={onOpenLocation} />
                </div>
            </div>

            <div className="flex items-center gap-1 compact:gap-0 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                {/* Nhãn riêng của người xem (##91) — icon nhãn, tên trong tooltip */}
                <TagIcons tags={folder.tags} stacked className="mr-0.5" />
                {/* Tep nguoi khac chia se: cot is_starred thuoc chu so huu nen an nut */}
                {!folder.isSharedWithMe && (
                    <StarButton
                        size="sm"
                        isStarred={folder.isStarred}
                        onToggle={() => onStarToggle && onStarToggle(folder.id)}
                        className="compact:hidden"
                    />
                )}
                <button
                    onClick={(e) => onContextMenu && onContextMenu(e, folder)}
                    onDoubleClick={stopDoubleClick}
                    className="p-1 rounded-full transition-colors text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-[var(--fc-ink-l)] dark:hover:text-[var(--fc-ink-d)] hover:bg-white/60 dark:hover:bg-white/10"
                    title={t('home.moreActions')}
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export default memo(FolderCard);
