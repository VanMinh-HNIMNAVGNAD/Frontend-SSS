import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import PageHeader from '../components/common/PageHeader';
import Notice from '../components/common/Notice';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export default function SpamPage() {
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
            <PageHeader icon={ShieldAlert} title={t('page.spam.title')} />

            {/* Cảnh báo tệp nghi ngờ — sắc hổ phách chỉ còn ở viên icon */}
            <Notice icon={AlertTriangle} tone="warning" title={t('spam.banner.title')} className="mb-3">
                {t('spam.banner.body')}
            </Notice>

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
