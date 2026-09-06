import { memo } from 'react';
import { Folder, MoreVertical, Users, CheckSquare, Square } from 'lucide-react';
import StarButton from '../common/StarButton';
import { getEffectiveColor } from '../../utils/fileColors';

function FolderCard({ folder, onDoubleClick, onContextMenu, onStarToggle, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    // Màu hiệu lực: customColor do người dùng chọn, hoặc xám mặc định
    const color = getEffectiveColor(folder);

    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, folder)}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected
                ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50 dark:bg-blue-500/15'
                : 'bg-gray-50/80 dark:bg-white/5 border-gray-200/80 dark:border-gray-700 hover:bg-gray-100/80 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
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
                        : 'opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
                title={isSelected ? 'Bo chon' : 'Chon'}
            >
                {isSelected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-3 min-w-0 pr-2 pl-5">
                <div className="p-2 rounded-xl bg-white/80 dark:bg-white/5 shadow-2xs shrink-0">
                    <Folder className="w-5 h-5 fill-current" style={{ color }} />
                </div>
                <div className="flex flex-col min-w-0">
                    <span
                        className="text-sm font-semibold truncate text-gray-800 dark:text-gray-100"
                        title={folder.name}
                    >
                        {folder.name}
                    </span>
                    {folder.isShared && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
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
                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 rounded-full hover:bg-white/60 transition-colors"
                    title="Tuy chon khac"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export default memo(FolderCard);
