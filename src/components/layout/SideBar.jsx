import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTags } from '../../context/TagsContext';
import { DEFAULT_TAG_COLOR } from '../../constants/tags';
import NewButton from './NewButton';
import QuickCleanupModal from '../modals/QuickCleanupModal';
import GlassLight from '../ui/GlassLight';
import LiquidGroup from '../ui/LiquidGroup';
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

/**
 * Một mục menu của thanh bên. Nền "đang chọn" và nền rê chuột KHÔNG còn nằm ở đây: viên kính
 * đang chọn và giọt nước theo chuột do <LiquidGroup> bọc ngoài vẽ, nối với mục qua
 * `data-liquid-key`. Mục chỉ còn đổi màu chữ/icon.
 *
 * Khai báo ở cấp module: trước đây NavItem nằm TRONG thân Sidebar, nên mỗi lần Sidebar render
 * (FileContext đổi là đổi) React thấy một kiểu component mới và gỡ/dựng lại toàn bộ nút menu.
 */
function NavItem({
  id,
  label,
  icon: Icon,
  badge,
  badgeColor = 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  hoverColor = 'group-hover:text-blue-600',
  activeColor = 'text-blue-600 dark:text-blue-400',
  isActive,
  isCollapsed,
  onSelect,
}) {
  return (
    <button
      type="button"
      data-liquid-key={id}
      onClick={() => onSelect(id)}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full flex items-center gap-4 px-4 py-2.5 short:py-2 rounded-[14px] transition-colors duration-150 text-[14px] font-medium text-left group relative cursor-pointer ${
        isCollapsed ? 'justify-center px-0 py-3 short:py-2.5' : 'justify-start'
      } ${isActive ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
    >
      <Icon
        className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
          isActive ? activeColor : `text-gray-600 dark:text-gray-400 ${hoverColor}`
        }`}
      />

      {!isCollapsed && <span className="truncate flex-1">{label}</span>}

      {!isCollapsed && badge > 0 && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>
      )}

      {isCollapsed && badge > 0 && (
        <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500" />
      )}
    </button>
  );
}

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

  // Ba thứ mọi NavItem đều cần — gom lại để mỗi dòng bên dưới chỉ còn phần riêng của nó.
  const navProps = (id) => ({ id, isActive: activeTab === id, isCollapsed: isSidebarCollapsed, onSelect: setActiveTab });

  // Khoá của viên kính "đang chọn": trang Nhãn thì là nhãn đang mở, còn lại là tab.
  const activeNavKey = activeTab === 'tags' ? `tag:${currentTagId}` : activeTab;

  return (
    <>
      {/* Mobile Backdrop */}
      {!isSidebarCollapsed && (
        <div 
          className="lg:hidden fixed inset-0 glass-overlay z-40 transition-opacity animate-fade-in"
          onClick={() => toggleSidebar()} 
        />
      )}
      {/* Kính NỔI: điện thoại là ngăn kéo đè lên nội dung nên có blur (`glass-strong`); máy tính
          là tấm kính đứng cạnh vùng nội dung, chỉ có nền ambient phía sau (`lg:glass`). */}
      <aside
        className={`glass-strong lg:glass rounded-[26px] flex flex-col pt-3 short:pt-2 select-none transition-all duration-300 ease-in-out shrink-0
          fixed lg:relative z-50 lg:z-0 top-2 bottom-2 left-2 lg:top-auto lg:bottom-auto lg:left-auto lg:my-3 lg:ml-3
          ${isSidebarCollapsed ? '-translate-x-[110%] lg:translate-x-0 lg:w-20 px-2' : 'translate-x-0 w-76 max-w-[calc(100vw-1rem)] px-3'}
        `}
      >
        {/* Ánh sáng theo chuột — `z-50`/`lg:z-0` ở trên đã cho thanh bên stacking context riêng
            nên lớp sáng nằm được dưới chữ. */}
        <GlassLight />

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
            toàn cho màn thấp hơn nữa.
            LiquidGroup: viên kính "đang chọn" trượt giữa các mục khi đổi trang, giọt nước trong
            suốt lướt theo chuột (components/ui/LiquidGroup.jsx). */}
        <LiquidGroup as="nav" activeKey={activeNavKey} className="flex-1 overflow-y-auto space-y-1 short:space-y-0.5 pr-1 custom-scrollbar">
          <NavItem {...navProps('home')} label={t('nav.home')} icon={Home} hoverColor="group-hover:text-blue-600" activeColor="text-blue-600 dark:text-blue-400" />
          <NavItem {...navProps('my-drive')} label={t('nav.myDrive')} icon={HardDrive} hoverColor="group-hover:text-emerald-600" activeColor="text-emerald-600 dark:text-emerald-400" />
          <NavItem {...navProps('shared-drives')} label={t('nav.sharedDrives')} icon={FolderGit2} hoverColor="group-hover:text-indigo-600" activeColor="text-indigo-600 dark:text-indigo-400" />
          <NavItem {...navProps('shared-with-me')} label={t('nav.sharedWithMe')} icon={Users} hoverColor="group-hover:text-teal-600" activeColor="text-teal-600 dark:text-teal-400" />
          <NavItem {...navProps('recent')} label={t('nav.recent')} icon={Clock} hoverColor="group-hover:text-amber-500" activeColor="text-amber-500 dark:text-amber-400" />
          <NavItem {...navProps('starred')} label={t('nav.starred')} icon={Star} hoverColor="group-hover:text-yellow-500" activeColor="text-yellow-500 dark:text-yellow-400" />

          {/* NHÃN (##91) — mỗi nhãn mở trang "Nhãn" của nó: mọi mục gắn nhãn đó, ở bất cứ đâu. */}
          {tagsCtx && (
            <div className="pt-2 short:pt-1">
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between pl-4 pr-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <span title={t('tags.page.about')}>{t('tags.sidebar.title')}</span>
                  <button
                    type="button"
                    onClick={tagsCtx.openManager}
                    title={t('tags.menu.manage')}
                    aria-label={t('tags.menu.manage')}
                    className="p-1 rounded-full normal-case cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {tags.length === 0 ? (
                <button
                  type="button"
                  data-liquid-key="tags:create"
                  onClick={tagsCtx.openManager}
                  title={isSidebarCollapsed ? t('tags.sidebar.create') : undefined}
                  className={`w-full flex items-center gap-4 px-4 py-2 short:py-1.5 rounded-[14px] text-[13px] text-gray-600 dark:text-gray-400 text-left cursor-pointer ${
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
                      data-liquid-key={`tag:${tag.id}`}
                      onClick={() => navigate(`/app/tags/${tag.id}`)}
                      title={isSidebarCollapsed ? tag.name : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-4 px-4 py-2 short:py-1.5 rounded-[14px] transition-colors duration-150 text-[14px] font-medium text-left cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center px-0' : ''
                      } ${active ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
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

          <div className="my-2 short:my-1 mx-2 border-t border-glass-divider" />

          <NavItem {...navProps('spam')} label={t('nav.spam')} icon={ShieldAlert} badge={spamCount} badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300" hoverColor="group-hover:text-orange-600" activeColor="text-orange-600 dark:text-orange-400" />
          <NavItem {...navProps('trash')} label={t('nav.trash')} icon={Trash2} badge={trashCount} hoverColor="group-hover:text-rose-600" activeColor="text-rose-600 dark:text-rose-400" />

          <div className="my-2 short:my-1 mx-2 border-t border-glass-divider" />

          <NavItem {...navProps('billing')} label={t('nav.billing')} icon={CreditCard} hoverColor="group-hover:text-purple-600" activeColor="text-purple-600 dark:text-purple-400" />
        </LiquidGroup>

        {/* KHỐI THANH LƯU TRỮ DYNAMIC COLOR */}
        <div className="mt-auto pt-3 pb-3 short:pt-2 short:pb-2">
          {isSidebarCollapsed ? (
            <div
              onClick={() => setActiveTab('billing')}
              className="flex flex-col items-center justify-center cursor-pointer p-2 rounded-2xl transition-colors"
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
            <div className="px-3 py-2.5 glass-soft rounded-[20px]">
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
              <div className="w-full bg-black/[0.07] dark:bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
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
                  className="flex-1 py-1.5 px-2 rounded-full text-xs font-semibold btn-accent hover:brightness-105 transition truncate cursor-pointer"
                >
                  {t('sidebar.storage.buy')}
                </button>
                <button
                  onClick={() => setIsCleanupOpen(true)}
                  className="py-1.5 px-3 glass-soft text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold transition-colors shrink-0 cursor-pointer"
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