import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Clock, List, LayoutGrid } from 'lucide-react';

export default function RecentPage() {
    const { t } = useLanguage();
    const {
        viewMode,
        setViewMode,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        clearFilters,
    } = useFiles();

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-glass-divider">
                <div className="flex items-center gap-2">
                    <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.recent.title')}</h1>
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

            {/* Bộ lọc đi theo người dùng qua mọi trang (FileContext) và backend vẫn lọc tab này:
                không hiện thanh lọc ở đây là có bộ lọc vô hình — chọn "Hình ảnh" ở cloudSSS của tôi
                rồi sang đây thì chỉ còn ảnh, không có gì nói vì sao (##83). Không có ô Sắp xếp:
                trang này luôn theo lượt mở gần nhất. */}
            <FileFilterBar
                filterType={filterType}
                setFilterType={setFilterType}
                filterDate={filterDate}
                setFilterDate={setFilterDate}
                filterOwner={filterOwner}
                setFilterOwner={setFilterOwner}
                onReset={clearFilters}
                showSort={false}
            />

            {/* View Container */}
            <div className="flex-1 overflow-y-auto mt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
