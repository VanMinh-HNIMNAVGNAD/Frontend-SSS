import { memo } from 'react';
import { Folder, FolderGit2, HardDrive, Users } from 'lucide-react';
import { useDriveAccess } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Dòng "📁 <nơi chứa>" dưới tên một KẾT QUẢ TÌM KIẾM (##90).
 *
 * Tìm kiếm đi cả cây con (##77), nên một trang kết quả trộn tệp ở mọi tầng: hai tệp "report.pdf"
 * ở hai thư mục khác nhau trông y hệt nhau, và trước đây không có cách nào biết tệp vừa tìm ra nằm
 * ở đâu (ngăn chi tiết chỉ ghi "Trong một thư mục con"). Bấm vào là mở đúng nơi đó.
 *
 * Chỉ hiện khi backend kèm `parentName` — nó chỉ kèm cho kết quả TÌM KIẾM (danh sách một thư mục
 * thì nơi chứa là chính thư mục đang mở). `null` = mục ở GỐC vùng chứa nó, hoặc thư mục cha là chỗ
 * người xem không được thấy (thư mục riêng của chủ, phía trên mục được chia sẻ) ⇒ hiện tên vùng.
 *
 * `compact`: chữ nhỏ cho chân thẻ Lưới (thẻ cao cố định).
 *
 * `onOpen` do view truyền xuống (`openItemLocation` của FileContext) thay vì tự gọi `useFiles()`:
 * hàng/thẻ là `memo()`, đăng ký context lớn ở đây là mỗi lần danh sách đổi, mọi dòng vẽ lại.
 */
function ItemLocation({ item, onOpen, compact = false, className = '' }) {
    const { t } = useLanguage();
    const { driveNameOf } = useDriveAccess();
    if (!item || item.parentName === undefined) return null;

    let Icon = Folder;
    let label = item.parentName;
    if (!label) {
        if (item.sharedDriveId) {
            Icon = FolderGit2;
            label = driveNameOf(item.sharedDriveId) || t('nav.sharedDrives');
        } else if (item.isSharedWithMe) {
            Icon = Users;
            label = t('nav.sharedWithMe');
        } else {
            Icon = HardDrive;
            label = t('nav.myDrive');
        }
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onOpen?.(item);
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
            }}
            title={t('search.location.open', { name: label })}
            className={`flex items-center gap-1 min-w-0 max-w-full font-medium text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:underline cursor-pointer ${
                compact ? 'text-[9.5px] leading-3' : 'text-[11px] leading-4'
            } ${className}`}
        >
            <Icon className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} shrink-0`} aria-hidden />
            <span className="truncate">{label}</span>
        </button>
    );
}

export default memo(ItemLocation);
