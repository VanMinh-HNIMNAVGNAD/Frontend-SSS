import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Users, Share2 } from 'lucide-react';
import Breadcrumb from '../components/file-manager/Breadcrumb';
import PageHeader from '../components/common/PageHeader';

export default function SharedWithMePage() {
    const { t } = useLanguage();
    const {
        viewMode,
        currentFolderId,
        breadcrumb,
        openFolder,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        uniqueOwners,
        clearFilters,
        items,
        isLoading,
        error,
    } = useFiles();

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            {/* Tiêu đề = đường dẫn: gốc "Được chia sẻ với tôi" rồi tới các thư mục đã mở */}
            <PageHeader
                title={
                    <Breadcrumb
                        rootLabel={t('page.sharedWithMe.title')}
                        rootIcon={Users}
                        path={currentFolderId ? breadcrumb.filter((b) => b.id !== null) : []}
                        onNavigate={(id) => openFolder({ id })}
                    />
                }
            />

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

            {/* Error state */}
            {error && (
                <div className="mt-3 p-3 rounded-2xl bg-[var(--tone-danger-soft)] text-[var(--tone-danger)] text-sm font-medium">
                    {error}
                </div>
            )}

            {/* Empty state when not loading and no items */}
            {!isLoading && !error && items.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
                    <div className="glass-soft p-5 rounded-[22px]">
                        <Share2 className="w-10 h-10 text-[var(--ink-subtle)]" />
                    </div>
                    <div className="text-center">
                        <p className="text-base font-semibold text-[var(--ink)]">
                            {currentFolderId ? t('sharedWithMe.empty.folderTitle') : t('sharedWithMe.empty.title')}
                        </p>
                        <p className="text-sm text-[var(--ink-muted)] mt-1">
                            {currentFolderId
                                ? t('sharedWithMe.empty.folderBody')
                                : t('sharedWithMe.empty.body')}
                        </p>
                    </div>
                </div>
            )}

            {/* View Container */}
            {(isLoading || items.length > 0) && (
                <div className="flex-1 overflow-y-auto pt-2">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            )}
        </div>
    );
}
