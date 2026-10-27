import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FileListView from '../components/file-manager/FileListView';
import FileGridView from '../components/file-manager/FileGridView';
import FileFilterBar from '../components/common/FileFilterBar';
import { useFiles } from '../context/FileContext';
import { useLanguage } from '../context/LanguageContext';
import { useTags } from '../context/TagsContext';
import { DEFAULT_TAG_COLOR } from '../constants/tags';
import { Tag, Settings2 } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';

/**
 * Trang "Nhãn" (##91): mọi mục người dùng gắn một nhãn — tệp của mình, tệp được chia sẻ, tệp trong
 * Bộ nhớ chung — kèm bộ lọc, sắp xếp, tìm kiếm như mọi trang danh sách khác (backend `tab=tagged`).
 * Mục bị thu hồi quyền xem thì tự biến khỏi đây dù nhãn vẫn còn.
 *
 * ##92: trang tự nói nhãn dùng để làm gì và gắn bằng cách nào. Bản ##91 chỉ có một danh sách rỗng
 * chung chung, nên người dùng tưởng đây là một thư mục: tải tệp lên ngay trong trang, tệp vào Drive
 * của tôi, còn trang vẫn trống. Nay tải lên ở đây thì tệp vẫn vào Drive của tôi nhưng tự mang nhãn
 * này (FileContext `tagCreatedItems`).
 */
export default function TagsPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const {
        viewMode,
        currentTagId,
        filterType,
        setFilterType,
        filterDate,
        setFilterDate,
        filterOwner,
        setFilterOwner,
        uniqueOwners,
        clearFilters,
        isLoading,
        folders,
        files,
        searchQuery,
        enqueueUpload,
    } = useFiles();
    const tagsCtx = useTags();
    const tag = tagsCtx?.tags.find((x) => x.id === currentTagId) ?? null;
    const color = tag?.colorHex || DEFAULT_TAG_COLOR;
    const fileInputRef = useRef(null);

    // Rỗng vì đang tìm / lọc thì danh sách tự nói "không có kết quả" — hướng dẫn chỉ dành cho nhãn
    // thật sự chưa gắn vào đâu.
    const isQuerying = Boolean(searchQuery?.trim()) || filterType !== 'all' || filterDate !== 'all' || filterOwner !== 'all';
    const isEmptyTag = Boolean(tag) && !isLoading && !isQuerying && (folders?.length || 0) + (files?.length || 0) === 0;

    return (
        <div className="flex flex-col h-full" onContextMenu={(e) => e.preventDefault()}>
            {/* Màu của nhãn chỉ còn ở chấm tròn cạnh tên — icon tiêu đề màu mực như mọi trang */}
            <PageHeader
                icon={Tag}
                title={
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            aria-hidden="true"
                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/70 dark:ring-white/10"
                            style={{ backgroundColor: color }}
                        />
                        <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] truncate">
                            {tag ? tag.name : t('tags.page.title')}
                        </h1>
                    </div>
                }
                meta={tag ? t('tags.fileCount', { count: tag.fileCount || 0 }) : null}
                subtitle={tag ? t('tags.page.about') : null}
                actions={tagsCtx && (
                    <button
                        type="button"
                        onClick={tagsCtx.openManager}
                        title={t('tags.menu.manage')}
                        aria-label={t('tags.menu.manage')}
                        className="glass-soft flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-[var(--ink)] cursor-pointer"
                    >
                        <Settings2 className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                        <span className="hidden sm:inline">{t('tags.menu.manage')}</span>
                    </button>
                )}
            />

            {/* Nhãn đã bị xoá (hoặc liên kết cũ tới nhãn không còn) — nói rõ thay vì một danh sách rỗng. */}
            {tagsCtx?.loaded && !tag ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-[var(--ink-muted)]">
                    <Tag className="w-10 h-10 text-[var(--ink-subtle)]" />
                    <p className="text-sm font-medium">{t('tags.page.missing')}</p>
                </div>
            ) : isEmptyTag ? (
                <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md text-center">
                        <span className="glass-soft relative mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center">
                            <Tag className="w-7 h-7 text-[var(--ink-muted)]" />
                            <span
                                aria-hidden="true"
                                className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full ring-2 ring-white/80 dark:ring-white/10"
                                style={{ backgroundColor: color }}
                            />
                        </span>
                        <h2 className="text-base font-semibold text-[var(--ink)] break-words">
                            {t('tags.page.emptyTitle', { name: tag.name })}
                        </h2>
                        <p className="mt-3 text-sm text-[var(--ink-muted)]">{t('tags.page.howToTag', { name: tag.name })}</p>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">{t('tags.page.howToUpload')}</p>
                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-4 py-2 rounded-full btn-accent hover:brightness-105 text-sm font-semibold shadow-sm cursor-pointer"
                            >
                                {t('tags.page.uploadHere')}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/app/my-drive')}
                                className="glass-soft px-4 py-2 rounded-full text-sm font-medium text-[var(--ink)] cursor-pointer"
                            >
                                {t('tags.page.openMyDrive')}
                            </button>
                        </div>
                        {/* `enqueueUpload` tự gắn nhãn của trang đang đứng (##92). */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            aria-label={t('newBtn.aria.pickFiles')}
                            onChange={(e) => {
                                Array.from(e.target.files || []).forEach((file) => enqueueUpload(file));
                                e.target.value = '';
                            }}
                        />
                    </div>
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
                    <div className="flex-1 overflow-y-auto pt-2">
                        {viewMode === 'grid' ? <FileGridView /> : <FileListView />}
                    </div>
                </>
            )}
        </div>
    );
}
