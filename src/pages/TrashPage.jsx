import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import PageHeader from '../components/common/PageHeader';
import Notice from '../components/common/Notice';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { confirmDialog } from '../utils/dialog';
import { Trash2, Clock } from 'lucide-react';

export default function TrashPage() {
    const { t } = useLanguage();
    const {
        viewMode,
        items,
        emptyTrash,
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

    const handleEmptyTrash = async () => {
        const ok = await confirmDialog({
            message: t('trash.empty.confirm'),
            confirmLabel: t('trash.empty.button'),
            danger: true,
        });
        if (ok) emptyTrash();
    };

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            <PageHeader
                icon={Trash2}
                title={t('page.trash.title')}
                actions={trashItems.length > 0 && (
                    <button
                        onClick={handleEmptyTrash}
                        className="btn-danger h-8 px-3.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('trash.empty.button')}
                    </button>
                )}
            />

            {/* Thùng rác tự dọn sau 30 ngày */}
            <Notice icon={Clock} className="mb-3">
                {t('trash.banner.body')}
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

            {/* List or Grid View */}
            <div className="flex-1 overflow-y-auto pt-2">
                {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
            </div>
        </div>
    );
}
