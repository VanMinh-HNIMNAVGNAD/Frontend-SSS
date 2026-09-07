import { memo } from 'react';
import { Folder, MoreVertical, Users, CheckSquare, Square } from 'lucide-react';
import StarButton from '../common/StarButton';
import { getCardColorVars } from '../../utils/fileColors';

function FolderCard({ folder, onDoubleClick, onContextMenu, onStarToggle, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    // Cả thẻ ăn theo màu hiệu lực (customColor, hoặc xám mặc định của thư mục):
    // nền, viền, tên và icon đều đọc từ cùng một bộ biến CSS đã cân tương phản.
    // Chi tiết xem đầu file FileCard.jsx và utils/fileColors.js.
    const colorVars = getCardColorVars(folder);

    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, folder)}
            style={colorVars}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5
                bg-[var(--fc-surface-l)] dark:bg-[var(--fc-surface-d)]
                hover:bg-[var(--fc-hover-l)] dark:hover:bg-[var(--fc-hover-d)]
                border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)] ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-[#1e1e1e]' : ''}`}
        >
            {/* Checkbox top-left – only this triggers selection */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                        e.preventDefault();
                        onSelectRange && onSelectRange(folder.id);
                    } else {
                        onToggleSelect && onToggleSelect(folder.id);
                    }
                }}
                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                className={`absolute top-2 left-2 z-20 p-0.5 rounded transition-all ${
                    isSelected
                        ? 'opacity-100 text-blue-600 dark:text-blue-400'
                        : 'opacity-0 group-hover:opacity-100 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-blue-600 dark:hover:text-blue-400'
                }`}
                title={isSelected ? 'Bo chon' : 'Chon'}
            >
                {isSelected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-3 min-w-0 pr-2 pl-5">
                <div className="p-2 rounded-xl shadow-2xs shrink-0 bg-[var(--fc-panel-l)] dark:bg-[var(--fc-panel-d)] border border-[var(--fc-border-l)] dark:border-[var(--fc-border-d)]">
                    <Folder className="w-5 h-5 fill-current text-[var(--fc-icon-l)] dark:text-[var(--fc-icon-d)]" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span
                        className="text-sm font-semibold truncate text-[var(--fc-ink-l)] dark:text-[var(--fc-ink-d)]"
                        title={folder.name}
                    >
                        {folder.name}
                    </span>
                    {folder.isShared && (
                        <span className="text-[11px] flex items-center gap-1 text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)]">
                            <Users className="w-3 h-3 text-blue-500" /> Duoc chia se
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                {/* Tep nguoi khac chia se: cot is_starred thuoc chu so huu nen an nut */}
                {!folder.isSharedWithMe && (
                    <StarButton
                        size="sm"
                        isStarred={folder.isStarred}
                        onToggle={() => onStarToggle && onStarToggle(folder.id)}
                    />
                )}
                <button
                    onClick={(e) => onContextMenu && onContextMenu(e, folder)}
                    onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className="p-1 rounded-full transition-colors text-[var(--fc-muted-l)] dark:text-[var(--fc-muted-d)] hover:text-[var(--fc-ink-l)] dark:hover:text-[var(--fc-ink-d)] hover:bg-white/60 dark:hover:bg-white/10"
                    title="Tuy chon khac"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export default memo(FolderCard);
