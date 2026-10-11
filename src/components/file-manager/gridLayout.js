// Cột của chế độ Lưới — dùng chung cho FileGridView và khung chờ của nó (FileSkeleton),
// để lúc đang tải và lúc có dữ liệu cùng một số cột, không giật bố cục.
//
// `auto-fill` + cỡ tối thiểu theo loại màn (biến thể `phone` / `tablet` trong index.css):
// máy tính giữ cỡ cũ, tablet 4–5 cột, điện thoại 2 cột (vừa cả màn 320px).
export const FOLDER_GRID_CLASS =
    'grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] ' +
    'tablet:gap-3 tablet:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] ' +
    'phone:gap-2.5 phone:grid-cols-[repeat(auto-fill,minmax(136px,1fr))]';

export const FILE_GRID_CLASS =
    'grid gap-4 grid-cols-[repeat(auto-fill,minmax(210px,1fr))] ' +
    'tablet:gap-3 tablet:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] ' +
    'phone:gap-2.5 phone:grid-cols-[repeat(auto-fill,minmax(136px,1fr))]';

// Chiều cao thẻ tệp: thẻ hẹp đi thì thấp theo để ô xem trước giữ tỉ lệ gần vuông.
export const FILE_CARD_HEIGHT_CLASS = 'h-52 tablet:h-48 phone:h-44';
