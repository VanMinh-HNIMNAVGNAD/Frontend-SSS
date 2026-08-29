import { memo } from 'react';
import { Folder, MoreVertical, Users, CheckSquare, Square } from 'lucide-react';
import StarButton from '../common/StarButton';

const folderColorPalettes = [
    { bg: 'bg-red-50/70 dark:bg-red-500/15 border-red-300/90 dark:border-red-900/50 hover:bg-red-100/80 dark:hover:bg-red-500/25 hover:border-red-400', text: 'text-red-900 dark:text-red-300 font-bold', icon: 'text-red-600 dark:text-red-400' },
    { bg: 'bg-amber-50/70 dark:bg-amber-500/15 border-amber-300/90 dark:border-amber-900/50 hover:bg-amber-100/80 dark:hover:bg-amber-500/25 hover:border-amber-400', text: 'text-amber-900 dark:text-amber-300 font-bold', icon: 'text-amber-600 dark:text-amber-400' },
    { bg: 'bg-emerald-50/70 dark:bg-emerald-500/15 border-emerald-300/90 dark:border-emerald-900/50 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/25 hover:border-emerald-400', text: 'text-emerald-900 dark:text-emerald-300 font-bold', icon: 'text-emerald-600 dark:text-emerald-400' },
    { bg: 'bg-blue-50/70 dark:bg-blue-500/15 border-blue-300/90 dark:border-blue-900/50 hover:bg-blue-100/80 dark:hover:bg-blue-500/25 hover:border-blue-400', text: 'text-blue-900 dark:text-blue-300 font-bold', icon: 'text-blue-600 dark:text-blue-400' },
    { bg: 'bg-purple-50/70 dark:bg-purple-500/15 border-purple-300/90 dark:border-purple-900/50 hover:bg-purple-100/80 dark:hover:bg-purple-500/25 hover:border-purple-400', text: 'text-purple-900 dark:text-purple-300 font-bold', icon: 'text-purple-600 dark:text-purple-400' },
    { bg: 'bg-teal-50/70 dark:bg-teal-500/15 border-teal-300/90 dark:border-teal-900/50 hover:bg-teal-100/80 dark:hover:bg-teal-500/25 hover:border-teal-400', text: 'text-teal-900 dark:text-teal-300 font-bold', icon: 'text-teal-600 dark:text-teal-400' },
    { bg: 'bg-indigo-50/70 dark:bg-indigo-500/15 border-indigo-300/90 dark:border-indigo-900/50 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/25 hover:border-indigo-400', text: 'text-indigo-900 dark:text-indigo-300 font-bold', icon: 'text-indigo-600 dark:text-indigo-400' },
    { bg: 'bg-sky-50/70 dark:bg-sky-500/15 border-sky-300/90 dark:border-sky-900/50 hover:bg-sky-100/80 dark:hover:bg-sky-500/25 hover:border-sky-400', text: 'text-sky-900 dark:text-sky-300 font-bold', icon: 'text-sky-600 dark:text-sky-400' },
];

function getFolderPalette(name = '') {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % folderColorPalettes.length;
    return folderColorPalettes[index];
}

function FolderCard({ folder, onDoubleClick, onContextMenu, onStarToggle, isSelected, isCut = false, onToggleSelect, onSelectRange }) {
    const palette = getFolderPalette(folder?.name);

    // Card click: no selection toggle here.
    // Selection is handled exclusively by the checkbox button.

    return (
        <div
            onDoubleClick={() => onDoubleClick && onDoubleClick(folder)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, folder)}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                isCut ? 'opacity-50 border-dashed' : ''
            } ${isSelected ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50 dark:bg-blue-500/15' : palette.bg}`}
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
                <div className={`p-2 rounded-xl bg-white/80 dark:bg-white/5 shadow-2xs ${palette.icon}`}>
                    <Folder className="w-5 h-5 fill-current" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-semibold truncate ${palette.text}`} title={folder.name}>
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
