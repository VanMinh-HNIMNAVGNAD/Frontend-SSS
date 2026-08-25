import { memo } from 'react';
import { Folder, MoreVertical, Star, Users, CheckSquare, Square } from 'lucide-react';

const folderColorPalettes = [
    { bg: 'bg-red-50 dark:bg-red-500/15 border-red-200 hover:bg-red-100 hover:border-red-300', text: 'text-red-700 dark:text-red-300', icon: 'text-red-500' },
    { bg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 hover:bg-amber-100 hover:border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' },
    { bg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300', text: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-500' },
    { bg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 hover:bg-blue-100 hover:border-blue-300', text: 'text-blue-700 dark:text-blue-300', icon: 'text-blue-500' },
    { bg: 'bg-purple-50 dark:bg-purple-500/15 border-purple-200 hover:bg-purple-100 hover:border-purple-300', text: 'text-purple-700', icon: 'text-purple-500' },
    { bg: 'bg-teal-50 dark:bg-teal-500/15 border-teal-200 hover:bg-teal-100 hover:border-teal-300', text: 'text-teal-700', icon: 'text-teal-500' },
    { bg: 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300', text: 'text-indigo-700', icon: 'text-indigo-500' },
    { bg: 'bg-sky-50 dark:bg-sky-500/15 border-sky-200 hover:bg-sky-100 hover:border-sky-300', text: 'text-sky-700', icon: 'text-sky-500' },
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
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onStarToggle && onStarToggle(folder.id);
                        }}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-amber-500 rounded-full hover:bg-white/60 transition-colors"
                        title={folder.isStarred ? 'Bo danh dau sao' : 'Danh dau sao'}
                    >
                        <Star className={`w-4 h-4 ${folder.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                    </button>
                )}
                <button
                    onClick={(e) => onContextMenu && onContextMenu(e, folder)}
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
