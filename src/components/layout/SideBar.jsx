import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTags } from '../../context/TagsContext';
import { DEFAULT_TAG_COLOR } from '../../constants/tags';
import NewButton from './NewButton';
import QuickCleanupModal from '../modals/QuickCleanupModal';
import GlassEdge from '../ui/GlassEdge';
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
 * Một mục menu của thanh bên. Nền "đang chọn" KHÔNG nằm ở đây: giọt kính đang chọn do
 * <LiquidGroup> bọc ngoài vẽ, nối với mục qua `data-liquid-key`. Mục chỉ còn đổi màu chữ/icon
 * (rê chuột cũng chỉ đổi màu, không có nền).
 *
 * Đơn sắc (26/10/2026): mỗi mục từng có một màu icon riêng khi chọn/rê chuột (xanh, lục, chàm,
 * ngọc, hổ phách, vàng, cam, hồng, tím) — chín màu cho chín mục. Nay icon xám, mục đang chọn icon
 * và chữ màu mực đậm; số đếm (Nội dung rác, Thùng rác) là chữ xám như số tệp của nhãn.
 *
 * Khai báo ở cấp module: trước đây NavItem nằm TRONG thân Sidebar, nên mỗi lần Sidebar render
 * (FileContext đổi là đổi) React thấy một kiểu component mới và gỡ/dựng lại toàn bộ nút menu.
 */
function NavItem({
  id,
  label,
  icon: Icon,
  badge,
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
      } ${isActive ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink)]/85'}`}
    >
      <Icon
        className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
          isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)] group-hover:text-[var(--ink)]'
        }`}
      />

      {!isCollapsed && <span className="truncate flex-1">{label}</span>}

      {!isCollapsed && badge > 0 && (
        <span className="text-xs font-medium tabular-nums text-[var(--ink-subtle)]">{badge}</span>
      )}

      {isCollapsed && badge > 0 && (
        <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-[var(--ink-muted)]" />
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

  // Màu thanh theo MỨC chứ không theo con số: bình thường là thanh xám (dải cầu vồng xanh → ngọc →
  // lục cũ không nói thêm gì); gần đầy chuyển hổ phách dịu, đầy / vượt mức là đỏ — không tải lên
  // được nữa. Chỉ hai mức cuối mới được phép có màu.
  const getProgressBarColor = (level) => {
    if (level === 'over' || level === 'full') return 'bg-[var(--tone-danger)]';
    if (level === 'almostFull' || level === 'warning') return 'bg-[var(--tone-warn)]';
    return 'bg-[var(--ink-muted)]';
  };

  const storageBadge = {
    over: { labelKey: 'sidebar.storage.full', tone: 'text-[var(--tone-danger)] bg-[var(--tone-danger-soft)]' },
    full: { labelKey: 'sidebar.storage.full', tone: 'text-[var(--tone-danger)] bg-[var(--tone-danger-soft)]' },
    almostFull: { labelKey: 'sidebar.storage.almostFull', tone: 'text-[var(--tone-warn)] bg-[var(--tone-warn-soft)]' },
    warning: { labelKey: 'sidebar.storage.warning', tone: 'text-[var(--tone-warn)] bg-[var(--tone-warn-soft)]' },
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
        {/* Viền sáng của kính — `z-50`/`lg:z-0` ở trên đã cho thanh bên stacking context riêng
            nên viền nằm được dưới chữ. */}
        <GlassEdge />

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
            LiquidGroup: giọt kính "đang chọn" nhảy giữa các mục khi đổi trang
            (components/ui/LiquidGroup.jsx). */}
        <LiquidGroup as="nav" activeKey={activeNavKey} className="flex-1 overflow-y-auto space-y-1 short:space-y-0.5 pr-1 custom-scrollbar">
          <NavItem {...navProps('home')} label={t('nav.home')} icon={Home} />
          <NavItem {...navProps('my-drive')} label={t('nav.myDrive')} icon={HardDrive} />
          <NavItem {...navProps('shared-drives')} label={t('nav.sharedDrives')} icon={FolderGit2} />
          <NavItem {...navProps('shared-with-me')} label={t('nav.sharedWithMe')} icon={Users} />
          <NavItem {...navProps('recent')} label={t('nav.recent')} icon={Clock} />
          <NavItem {...navProps('starred')} label={t('nav.starred')} icon={Star} />

          {/* NHÃN (##91) — mỗi nhãn mở trang "Nhãn" của nó: mọi mục gắn nhãn đó, ở bất cứ đâu. */}
          {tagsCtx && (
            <div className="pt-2 short:pt-1">
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between pl-4 pr-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-subtle)]">
                  <span title={t('tags.page.about')}>{t('tags.sidebar.title')}</span>
                  <button
                    type="button"
                    onClick={tagsCtx.openManager}
                    title={t('tags.menu.manage')}
                    aria-label={t('tags.menu.manage')}
                    className="p-1 rounded-full normal-case text-[var(--ink-subtle)] hover:text-[var(--ink)] cursor-pointer"
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
                  className={`w-full flex items-center gap-4 px-4 py-2 short:py-1.5 rounded-[14px] text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] text-left cursor-pointer ${
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
                      } ${active ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink)]/85'}`}
                    >
                      {/* Màu của nhãn là một chấm tròn trong ô icon (như thẻ màu ở Finder) thay cho
                          cả một icon thẻ treo tô màu — bốn năm nhãn là bốn năm mảng màu trên thanh bên. */}
                      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        <span
                          className={`rounded-full ring-2 ring-white/80 dark:ring-white/10 ${active ? 'w-3 h-3' : 'w-2.5 h-2.5'}`}
                          style={{ backgroundColor: color }}
                        />
                      </span>
                      {!isSidebarCollapsed && <span className="truncate flex-1">{tag.name}</span>}
                      {!isSidebarCollapsed && tag.fileCount > 0 && (
                        <span className="text-xs font-medium tabular-nums text-[var(--ink-subtle)]">{tag.fileCount}</span>
                      )}
                    </button>
                  );
                })
              )}
              {!isSidebarCollapsed && tags.length > SIDEBAR_TAG_LIMIT && (
                <button
                  type="button"
                  onClick={tagsCtx.openManager}
                  className="w-full pl-[3.25rem] pr-4 py-1.5 text-left text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline cursor-pointer"
                >
                  {t('tags.sidebar.more', { count: tags.length - SIDEBAR_TAG_LIMIT })}
                </button>
              )}
            </div>
          )}

          <div className="my-2 short:my-1 mx-2 border-t border-glass-divider" />

          <NavItem {...navProps('spam')} label={t('nav.spam')} icon={ShieldAlert} badge={spamCount} />
          <NavItem {...navProps('trash')} label={t('nav.trash')} icon={Trash2} badge={trashCount} />

          <div className="my-2 short:my-1 mx-2 border-t border-glass-divider" />

          <NavItem {...navProps('billing')} label={t('nav.billing')} icon={CreditCard} />
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
                  storageStatus.isFull ? 'text-[var(--tone-danger)]' : 'text-[var(--ink-muted)]'
                }`}
              />
              <span
                className={`text-[10px] font-bold tabular-nums ${
                  storageStatus.isFull ? 'text-[var(--tone-danger)]' : 'text-[var(--ink-muted)]'
                }`}
              >
                {storageStatus.percent}%
              </span>
            </div>
          ) : (
            <div className="px-3 py-2.5 glass-soft rounded-[20px]">
              <div className="flex items-center justify-between mb-2 text-xs font-semibold text-[var(--ink)]">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-[var(--ink-muted)]" />
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

              <div className="text-xs text-[var(--ink-muted)] mb-3 short:mb-2">
                {t('sidebar.storage.usedLabel')}{' '}
                <span
                  className={`font-semibold ${
                    storageStatus.isFull ? 'text-[var(--tone-danger)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {storageInfo.usedFormatted || `${storageInfo.usedGB} GB`}
                </span>{' '}
                {t('sidebar.storage.ofTotal', { total: storageInfo.totalGB })}
                {/* Đầy thì nói luôn hậu quả: tải lên bị chặn tới khi dọn bớt hoặc mua thêm. */}
                {storageStatus.isFull && (
                  <p className="mt-1 text-[11px] font-semibold leading-snug text-[var(--tone-danger)]">
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
                  className="py-1.5 px-3 glass-soft text-[var(--ink)] rounded-full text-xs font-semibold transition-colors shrink-0 cursor-pointer"
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