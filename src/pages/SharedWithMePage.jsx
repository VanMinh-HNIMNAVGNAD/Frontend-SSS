import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Users, Share2, ChevronRight } from 'lucide-react';
import ViewModeToggle from '../components/common/ViewModeToggle';

export default function SharedWithMePage() {
    const { t } = useLanguage();
    const {
        viewMode,
        setViewMode,
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
            {/* Header */}
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-glass-divider">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Users className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                    {currentFolderId ? (
                        <nav className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 font-medium overflow-x-auto py-1">
                            <button
                                onClick={() => openFolder({ id: null })}
                                className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors shrink-0 text-xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer"
                            >
                                {t('page.sharedWithMe.title')}
                            </button>
                            {breadcrumb
                                .filter((b) => b.id !== null)
                                .map((item, index, arr) => (
                                    <div key={item.id || index} className="flex items-center gap-1 shrink-0">
                                        <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-500 shrink-0" />
                                        <button
                                            onClick={() => openFolder({ id: item.id })}
                                            className={`hover:text-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer text-xl ${
                                                index === arr.length - 1
                                                    ? 'font-bold text-gray-900 dark:text-gray-100'
                                                    : 'text-gray-700 dark:text-gray-300 font-semibold'
                                            }`}
                                        >
                                            {item.name}
                                        </button>
                                    </div>
                                ))}
                        </nav>
                    ) : (
                        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.sharedWithMe.title')}</h1>
                    )}
                </div>

                {/* View Switcher */}
                <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} className="shrink-0" />
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

            {/* Error state */}
            {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Empty state when not loading and no items */}
            {!isLoading && !error && items.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
                    <div className="p-5 rounded-2xl bg-gray-100 dark:bg-gray-700">
                        <Share2 className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="text-center">
                        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {currentFolderId ? t('sharedWithMe.empty.folderTitle') : t('sharedWithMe.empty.title')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {currentFolderId
                                ? t('sharedWithMe.empty.folderBody')
                                : t('sharedWithMe.empty.body')}
                        </p>
                    </div>
                </div>
            )}

            {/* View Container */}
            {(isLoading || items.length > 0) && (
                <div className="flex-1 overflow-y-auto mt-2">
                    {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                </div>
            )}
        </div>
    );
}
