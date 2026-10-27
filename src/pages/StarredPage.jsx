import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Star } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';

export default function StarredPage() {
    const { t } = useLanguage();
    const { 
        viewMode,
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
            <PageHeader icon={Star} title={t('page.starred.title')} />

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
            <div className="flex-1 overflow-y-auto pt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
