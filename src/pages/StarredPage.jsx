import { useEffect } from 'react';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Star } from 'lucide-react';
import ViewModeToggle from '../components/common/ViewModeToggle';

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

                <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
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
