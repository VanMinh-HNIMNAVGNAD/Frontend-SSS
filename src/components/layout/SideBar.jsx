import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTags } from '../../context/TagsContext';
import { DEFAULT_TAG_COLOR } from '../../constants/tags';
import NewButton from './NewButton';
import QuickCleanupModal from '../modals/QuickCleanupModal';
import { formatBytes } from '../../utils/formatFileSize';
import { getStorageStatus } from '../../utils/storageStatus';
import {
  Home,
  HardDrive,
  FolderGit2,
  Users,
  Clock,
  Star,
  ShieldAlert,
  Trash2,
  CreditCard,
  Cloud,
  Tag,
  Settings2,
} from 'lucide-react';

/** Thanh bên hiện chừng này nhãn đầu (theo tên) — còn lại xem/sửa trong hộp quản lý. */
const SIDEBAR_TAG_LIMIT = 8;

export default function Sidebar() {
  const { activeTab, setActiveTab, isSidebarCollapsed, toggleSidebar, storageInfo, items, currentTagId } = useFiles();
  // Nhãn riêng của người dùng (##91) — `null` khi ngoài TagsProvider.
  const tagsCtx = useTags();
  const navigate = useNavigate();
  const tags = tagsCtx?.tags ?? [];
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);

  // Nhãn menu và khối bộ nhớ lấy qua t() — NavItem ở dưới nằm trong cùng
  // component nên dùng được t() qua closure, không cần truyền prop
  const { t } = useLanguage();

  // Counts for badges
  const spamCount = items.filter((i) => i.isSpam && !i.isTrash).length;
  const trashCount = items.filter((i) => i.isTrash).length;

  // Đầy / vượt hạn mức tính từ BYTE (##87): `percentage` của backend bị kẹp ở 100 nên người hết
  // gói, đang dùng 600% hạn mức Miễn phí, trước đây chỉ đọc được "Gần đầy!".
  const storageStatus = getStorageStatus(storageInfo.usedBytes, storageInfo.limitBytes);

  // Màu thanh theo MỨC chứ không theo con số: đầy và vượt mức là đỏ đặc — không tải lên được nữa.
  const getProgressBarColor = (level) => {
    if (level === 'over' || level === 'full') return 'bg-rose-600 shadow-sm shadow-rose-500/40';
    if (level === 'almostFull') return 'bg-gradient-to-r from-amber-500 to-rose-600 shadow-sm shadow-rose-500/40';
    if (level === 'warning') return 'bg-gradient-to-r from-emerald-500 via-amber-400 to-amber-500';
    return 'bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-500';
  };

  const storageBadge = {
    over: { labelKey: 'sidebar.storage.full', tone: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15' },
    full: { labelKey: 'sidebar.storage.full', tone: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15' },
    almostFull: { labelKey: 'sidebar.storage.almostFull', tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15' },
    warning: { labelKey: 'sidebar.storage.warning', tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15' },
  }[storageStatus.level];

  const NavItem = ({
    id,
    label,
    icon: Icon,
    badge,
    badgeColor = 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    hoverColor = 'group-hover:text-blue-600',
    activeColor = 'text-blue-600 dark:text-blue-400',
  }) => {
    const isActive = activeTab === id;

    return (
      <button
        onClick={() => setActiveTab(id)}
        title={isSidebarCollapsed ? label : undefined}
        className={`w-full flex items-center gap-4 px-4 py-2.5 short:py-2 rounded-full transition-all duration-150 text-[14px] font-medium text-left group relative ${
          isSidebarCollapsed ? 'justify-center px-0 py-3 short:py-2.5' : 'justify-start'
        } ${isActive ? 'bg-[#d3e3fd] dark:bg-blue-500/25 text-[#041e49] dark:text-blue-100 font-bold shadow-2xs' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-white/5'}`}
      >
        <Icon
          className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
            isActive ? activeColor : `text-gray-600 dark:text-gray-400 ${hoverColor}`
          }`}
        />

        {!isSidebarCollapsed && <span className="truncate flex-1">{label}</span>}

        {!isSidebarCollapsed && badge > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>
        )}

        {isSidebarCollapsed && badge > 0 && (
          <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500" />
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {!isSidebarCollapsed && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => toggleSidebar()} 
        />
      )}
      <aside
        className={`bg-[var(--app-sidebar)] border-r border-[var(--app-border)] flex flex-col pt-3 short:pt-2 select-none transition-all duration-300 ease-in-out shrink-0 h-full 
          fixed lg:relative z-50 lg:z-0 top-0 left-0
          ${isSidebarCollapsed ? '-translate-x-full lg:translate-x-0 lg:w-20 px-2' : 'translate-x-0 w-76 px-3'}
        `}
      >
        {/* Rộng 304px cả điện thoại lẫn desktop: nhãn dài nhất ("cloudSSS được chia sẻ với
            tôi") in đậm lúc đang chọn cần ~198px, bản 256px cũ chỉ cho 159px nên bị cắt
            thành "...". Thêm mục mới thì đo lại, đừng để nhãn nào phải cắt. */}
        {/* NÚT + MỚI */}
        <div className={`mb-5 short:mb-2.5 flex ${isSidebarCollapsed ? 'justify-center' : 'pl-2 justify-start'}`}>
          <NewButton isCollapsed={isSidebarCollapsed} />
        </div>

        {/* DANH SÁCH MENU SIDEBAR
            `short:` thu mật độ ở màn thấp (xem src/index.css) để cả menu nằm gọn ở
            zoom 100% trên laptop 768px/720px. `overflow-y-auto` chỉ còn là lưới an
            toàn cho màn thấp hơn nữa. */}
        <nav className="flex-1 overflow-y-auto space-y-1 short:space-y-0.5 pr-1 custom-scrollbar">
          <NavItem id="home" label={t('nav.home')} icon={Home} hoverColor="group-hover:text-blue-600" activeColor="text-blue-600 dark:text-blue-400" />
          <NavItem id="my-drive" label={t('nav.myDrive')} icon={HardDrive} hoverColor="group-hover:text-emerald-600" activeColor="text-emerald-600 dark:text-emerald-400" />
          <NavItem id="shared-drives" label={t('nav.sharedDrives')} icon={FolderGit2} hoverColor="group-hover:text-indigo-600" activeColor="text-indigo-600 dark:text-indigo-400" />
          <NavItem id="shared-with-me" label={t('nav.sharedWithMe')} icon={Users} hoverColor="group-hover:text-teal-600" activeColor="text-teal-600 dark:text-teal-400" />
          <NavItem id="recent" label={t('nav.recent')} icon={Clock} hoverColor="group-hover:text-amber-500" activeColor="text-amber-500 dark:text-amber-400" />
          <NavItem id="starred" label={t('nav.starred')} icon={Star} hoverColor="group-hover:text-yellow-500" activeColor="text-yellow-500 dark:text-yellow-400" />

          {/* NHÃN (##91) — mỗi nhãn mở trang "Nhãn" của nó: mọi mục gắn nhãn đó, ở bất cứ đâu. */}
          {tagsCtx && (
            <div className="pt-2 short:pt-1">
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between pl-4 pr-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <span>{t('tags.sidebar.title')}</span>
                  <button
                    type="button"
                    onClick={tagsCtx.openManager}
                    title={t('tags.menu.manage')}
                    aria-label={t('tags.menu.manage')}
                    className="p-1 rounded-full hover:bg-gray-200/80 dark:hover:bg-white/10 normal-case cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {tags.length === 0 ? (
                <button
                  type="button"
                  onClick={tagsCtx.openManager}
                  title={isSidebarCollapsed ? t('tags.sidebar.create') : undefined}
                  className={`w-full flex items-center gap-4 px-4 py-2 short:py-1.5 rounded-full text-[13px] text-gray-600 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-white/5 text-left cursor-pointer ${
                    isSidebarCollapsed ? 'justify-center px-0' : ''
                  }`}
                >
                  <Tag className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">{t('tags.sidebar.create')}</span>}
                </button>
              ) : (
                tags.slice(0, SIDEBAR_TAG_LIMIT).map((tag) => {
                  const active = activeTab === 'tags' && currentTagId === tag.id;
                  const color = tag.colorHex || DEFAULT_TAG_COLOR;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => navigate(`/app/tags/${tag.id}`)}
                      title={isSidebarCollapsed ? tag.name : undefined}
                      className={`w-full flex items-center gap-4 px-4 py-2 short:py-1.5 rounded-full transition-all duration-150 text-[14px] font-medium text-left cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center px-0' : ''
                      } ${active ? 'bg-[#d3e3fd] dark:bg-blue-500/25 text-[#041e49] dark:text-blue-100 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-white/5'}`}
                    >
                      <Tag className="w-5 h-5 shrink-0" style={{ color }} fill={active ? color : 'none'} />
                      {!isSidebarCollapsed && <span className="truncate flex-1">{tag.name}</span>}
                      {!isSidebarCollapsed && tag.fileCount > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{tag.fileCount}</span>
                      )}
                    </button>
                  );
                })
              )}
              {!isSidebarCollapsed && tags.length > SIDEBAR_TAG_LIMIT && (
                <button
                  type="button"
                  onClick={tagsCtx.openManager}
                  className="w-full pl-[3.25rem] pr-4 py-1.5 text-left text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                >
                  {t('tags.sidebar.more', { count: tags.length - SIDEBAR_TAG_LIMIT })}
                </button>
              )}
            </div>
          )}

          <div className="my-2 short:my-1 border-t border-gray-200 dark:border-gray-700/60" />

          <NavItem id="spam" label={t('nav.spam')} icon={ShieldAlert} badge={spamCount} badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" hoverColor="group-hover:text-orange-600" activeColor="text-orange-600 dark:text-orange-400" />
          <NavItem id="trash" label={t('nav.trash')} icon={Trash2} badge={trashCount} hoverColor="group-hover:text-rose-600" activeColor="text-rose-600 dark:text-rose-400" />

          <div className="my-2 short:my-1 border-t border-gray-200 dark:border-gray-700/60" />

          <NavItem id="billing" label={t('nav.billing')} icon={CreditCard} hoverColor="group-hover:text-purple-600" activeColor="text-purple-600 dark:text-purple-400" />
        </nav>

        {/* KHỐI THANH LƯU TRỮ DYNAMIC COLOR */}
        <div className="mt-auto pt-3 pb-4 short:pt-2 short:pb-2 border-t border-gray-200 dark:border-gray-700/60">
          {isSidebarCollapsed ? (
            <div
              onClick={() => setActiveTab('billing')}
              className="flex flex-col items-center justify-center cursor-pointer p-2 hover:bg-gray-200/60 dark:hover:bg-white/10 rounded-2xl transition-colors"
              title={t('sidebar.storage.tooltip', {
                used: storageInfo.usedGB,
                total: storageInfo.totalGB,
                percent: storageStatus.percent,
              })}
            >
              <Cloud
                className={`w-5 h-5 mb-1 ${
                  storageStatus.isFull ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                }`}
              />
              <span
                className={`text-[10px] font-bold ${
                  storageStatus.isFull ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {storageStatus.percent}%
              </span>
            </div>
          ) : (
            <div className="px-3 py-2 bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <div className="flex items-center justify-between mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('sidebar.storage.title')}</span>
                </div>
                {/* Nhãn cảnh báo theo mức: "Đã đầy!" khi dùng ≥ hạn mức (kể cả vượt xa sau khi
                    gói hết hạn) — trước ##87 mọi mức ≥ 90% đều là "Gần đầy!". */}
                {storageBadge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${storageBadge.tone}`}>
                    {t(storageBadge.labelKey)}
                  </span>
                )}
              </div>

              {/* Dynamic Color Progress Bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className={`${getProgressBarColor(storageStatus.level)} h-full rounded-full transition-all duration-500`}
                  style={{ width: `${storageStatus.barPercent}%` }}
                />
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-300 mb-3 short:mb-2">
                {t('sidebar.storage.usedLabel')}{' '}
                <span
                  className={`font-semibold ${
                    storageStatus.isFull ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {storageInfo.usedFormatted || `${storageInfo.usedGB} GB`}
                </span>{' '}
                {t('sidebar.storage.ofTotal', { total: storageInfo.totalGB })}
                {/* Đầy thì nói luôn hậu quả: tải lên bị chặn tới khi dọn bớt hoặc mua thêm. */}
                {storageStatus.isFull && (
                  <p className="mt-1 text-[11px] font-semibold leading-snug text-rose-600 dark:text-rose-400">
                    {storageStatus.level === 'over'
                      ? t('sidebar.storage.overBy', { size: formatBytes(storageStatus.overBytes) })
                      : t('sidebar.storage.noSpace')}
                  </p>
                )}
              </div>

              {/* Action Buttons: Mua thêm & Quick Cleanup */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('billing')}
                  className="flex-1 py-1.5 px-2 border border-gray-300 dark:border-gray-600 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/15 hover:border-blue-300 transition-colors truncate"
                >
                  {t('sidebar.storage.buy')}
                </button>
                <button
                  onClick={() => setIsCleanupOpen(true)}
                  className="py-1.5 px-3 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold transition-colors shrink-0"
                  title={t('sidebar.storage.cleanupTitle')}
                >
                  {t('sidebar.storage.cleanup')}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Quick Cleanup Modal */}
      <QuickCleanupModal isOpen={isCleanupOpen} onClose={() => setIsCleanupOpen(false)} />
    </>
  );
}