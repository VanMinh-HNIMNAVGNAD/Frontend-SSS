import { useEffect } from 'react';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Trash2, List, LayoutGrid } from 'lucide-react';

export default function TrashPage() {
    const { t } = useLanguage();
    const { 
        viewMode,
        setViewMode,
        items, 
        emptyTrash,
        setActiveTab,
        filterType, 
        setFilterType, 
        filterDate, 
        setFilterDate, 
        filterOwner, 
        setFilterOwner, 
        uniqueOwners, 
        clearFilters
    } = useFiles();
    


    const trashItems = items.filter(i => i.isTrash);

    const handleEmptyTrash = () => {
        if (confirm(t('trash.empty.confirm'))) {
            emptyTrash();
        }
    };

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-glass-divider">
                <div className="flex items-center gap-2">
                    <Trash2 className="w-6 h-6 text-gray-800 dark:text-gray-200" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.trash.title')}</h1>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-200/90 dark:bg-gray-700 rounded-full p-0.5 border border-gray-300 dark:border-gray-700">
                        <button
                            onClick={() => setViewMode('list')}
                            title={t('view.list')}
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'list' ? 'glass-active text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            title={t('view.grid')}
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'grid' ? 'glass-active text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>

                    {trashItems.length > 0 && (
                        <button
                            onClick={handleEmptyTrash}
                            className="px-4 py-2 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t('trash.empty.button')}
                        </button>
                    )}
                </div>
            </div>

            {/* Banner Thông báo */}
            <p className="bg-blue-50/80 dark:bg-blue-500/15 border border-blue-300 dark:border-blue-400/25 rounded-2xl px-3.5 py-2.5 mb-2 text-xs font-medium text-blue-900 dark:text-blue-200 shadow-2xs">
                {t('trash.banner.body')}
            </p>

            {/* Quick Filter Bar */}
            <FileFilterBar
                filterType={filterType}
                setFilterType={setFilterType}
                filterDate={filterDate}
                setFilterDate={setFilterDate}
                filterOwner={filterOwner}
                setFilterOwner={setFilterOwner}
                uniqueOwners={uniqueOwners}
                onReset={clearFilters}
            />

            {/* List or Grid View */}
            <div className="flex-1 overflow-y-auto mt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
