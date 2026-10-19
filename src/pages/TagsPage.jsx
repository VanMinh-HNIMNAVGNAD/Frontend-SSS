import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { useTags } from '../context/TagsContext';
import { DEFAULT_TAG_COLOR } from '../constants/tags';
import { Tag, List, LayoutGrid, Settings2 } from 'lucide-react';

/**
 * Trang "Nhãn" (##91): mọi mục người dùng gắn một nhãn — tệp của mình, tệp được chia sẻ, tệp trong
 * Bộ nhớ chung — kèm bộ lọc, sắp xếp, tìm kiếm như mọi trang danh sách khác (backend `tab=tagged`).
 * Mục bị thu hồi quyền xem thì tự biến khỏi đây dù nhãn vẫn còn.
 */
export default function TagsPage() {
    const { t } = useLanguage();
    const {
        viewMode,
        setViewMode,
        currentTagId,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        uniqueOwners,
        clearFilters,
    } = useFiles();
    const tagsCtx = useTags();
    const tag = tagsCtx?.tags.find((x) => x.id === currentTagId) ?? null;
    const color = tag?.colorHex || DEFAULT_TAG_COLOR;

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Tag className="w-6 h-6 shrink-0" style={{ color }} fill={color} />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                        {tag ? tag.name : t('tags.page.title')}
                    </h1>
                    {tag && (
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                            {t('tags.fileCount', { count: tag.fileCount || 0 })}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {tagsCtx && (
                        <button
                            type="button"
                            onClick={tagsCtx.openManager}
                            title={t('tags.menu.manage')}
                            aria-label={t('tags.menu.manage')}
                            className="p-1.5 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 cursor-pointer"
                        >
                            <Settings2 className="w-4 h-4" />
                        </button>
                    )}
                    <div className="flex items-center bg-gray-200/90 dark:bg-gray-700 rounded-full p-0.5 border border-gray-300 dark:border-gray-700">
                        <button
                            onClick={() => setViewMode('list')}
                            title={t('view.list')}
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'list' ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            title={t('view.grid')}
                            className={`p-1.5 rounded-full transition-colors ${
                                viewMode === 'grid' ? 'bg-white dark:bg-[#282a2c] shadow-xs text-blue-700 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Nhãn đã bị xoá (hoặc liên kết cũ tới nhãn không còn) — nói rõ thay vì một danh sách rỗng. */}
            {tagsCtx?.loaded && !tag ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-gray-500 dark:text-gray-400">
                    <Tag className="w-10 h-10" />
                    <p className="text-sm font-medium">{t('tags.page.missing')}</p>
                </div>
            ) : (
                <>
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
                    <div className="flex-1 overflow-y-auto mt-2">
                        {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                    </div>
                </>
            )}
        </div>
    );
}
