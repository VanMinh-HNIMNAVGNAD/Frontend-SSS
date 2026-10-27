import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { Clock } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';

export default function RecentPage() {
    const { t } = useLanguage();
    const {
        viewMode,
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
            <PageHeader icon={Clock} title={t('page.recent.title')} />

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
            <div className="flex-1 overflow-y-auto pt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
