import { useState } from 'react';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import NewButton from './NewButton';
import QuickCleanupModal from '../modals/QuickCleanupModal';
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
} from 'lucide-react';

export default function Sidebar() {
  const { activeTab, setActiveTab, isSidebarCollapsed, toggleSidebar, storageInfo, items } = useFiles();
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);

  // Nhãn menu và khối bộ nhớ lấy qua t() — NavItem ở dưới nằm trong cùng
  // component nên dùng được t() qua closure, không cần truyền prop
  const { t } = useLanguage();

  // Counts for badges
  const spamCount = items.filter((i) => i.isSpam && !i.isTrash).length;
  const trashCount = items.filter((i) => i.isTrash).length;

  // Dynamic vibrant progress bar color calculation
  const getProgressBarColor = (percent) => {
    if (percent > 90) return 'bg-gradient-to-r from-amber-500 to-rose-600 shadow-sm shadow-rose-500/40';
    if (percent >= 70) return 'bg-gradient-to-r from-emerald-500 via-amber-400 to-amber-500';
    return 'bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-500';
  };

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
          ${isSidebarCollapsed ? '-translate-x-full lg:translate-x-0 lg:w-20 px-2' : 'translate-x-0 w-72 lg:w-64 px-3'}
        `}
      >
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
                percent: storageInfo.percentage,
              })}
            >
              <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-1" />
              <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{storageInfo.percentage}%</span>
            </div>
          ) : (
            <div className="px-3 py-2 bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <div className="flex items-center justify-between mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('sidebar.storage.title')}</span>
                </div>
                {/* Dynamic warning badge */}
                {storageInfo.percentage >= 70 && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 rounded-md">
                    {storageInfo.percentage >= 90
                      ? t('sidebar.storage.almostFull')
                      : t('sidebar.storage.warning')}
                  </span>
                )}
              </div>

              {/* Dynamic Color Progress Bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className={`${getProgressBarColor(storageInfo.percentage)} h-full rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(100, storageInfo.percentage)}%` }}
                />
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-300 mb-3 short:mb-2">
                {t('sidebar.storage.usedLabel')}{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">{storageInfo.usedFormatted || `${storageInfo.usedGB} GB`}</span>{' '}
                {t('sidebar.storage.ofTotal', { total: storageInfo.totalGB })}
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