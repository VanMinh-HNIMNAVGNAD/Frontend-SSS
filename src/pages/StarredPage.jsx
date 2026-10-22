import { useEffect } from 'react';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Star, List, LayoutGrid } from 'lucide-react';

export default function StarredPage() {
    const { t } = useLanguage();
    const { 
        viewMode,
        setViewMode,
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



    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-glass-divider">
                <div className="flex items-center gap-2">
                    <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.starred.title')}</h1>
                </div>

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
            </div>

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

            {/* View Container */}
            <div className="flex-1 overflow-y-auto mt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
