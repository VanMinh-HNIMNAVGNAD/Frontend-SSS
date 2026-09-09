import { useEffect, useRef, useState } from 'react';

import { subscribeApiBusy } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Thanh tiến trình mảnh ở đỉnh trang: bật khi có request nào đang bay, tắt khi hết.
 *
 * Sinh ra để trả lời đúng một câu hỏi của người dùng: "bấm rồi, web còn xử lý hay
 * treo?". Các thao tác một-lượt-gọi (đánh dấu sao, sao chép liên kết, xoá, dán,
 * chia sẻ, đổi tên...) trước đây không có tín hiệu nào trong lúc chờ — với backend
 * Heroku (US) gọi Supabase (ap-southeast-1), mỗi lượt tốn khoảng một giây.
 *
 * Nguồn dữ liệu là bộ đếm request ở `services/api.js`, KHÔNG phải state của React,
 * nên thanh này không cần component nào truyền cờ loading xuống và không kéo theo
 * một lần render nào của cây file.
 *
 * Ba hằng số thời gian, cả ba đều để tránh nhấp nháy:
 *   • SHOW_DELAY_MS — request nhanh hơn mức này thì không vẽ gì cả. Không có nó thì
 *     mỗi cú bấm sao (đã cập nhật UI ngay tại chỗ) lại kèm một vệt sáng loé lên.
 *   • MIN_VISIBLE_MS — đã vẽ ra thì giữ đủ lâu để mắt kịp thấy, không thì thanh
 *     xuất hiện và biến mất trong một khung hình.
 *   • HIDE_GRACE_MS — hết request thì CHỜ một nhịp trước khi tắt, vì rất nhiều
 *     thao tác trong app là một CHUỖI lượt gọi nối nhau chứ không phải một lượt
 *     (chọn nhiều mục rồi xoá, dán một loạt, mỗi tệp upload xong kéo theo phần
 *     việc riêng). Không có nhịp chờ này thì mỗi khe hở giữa hai request thành
 *     một lần tắt-rồi-bật-lại-từ-8%, và người dùng thấy thanh "load liên tục".
 *     Có nó thì cả chuỗi đọc thành MỘT lần chạy liền mạch: thanh giữ nguyên chỗ
 *     đang đứng, đợi lượt sau tiếp tục đẩy đi.
 */
const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 320;
const HIDE_GRACE_MS = 500;

export default function GlobalProgressBar() {
  const { t } = useLanguage();

  const [visible, setVisible] = useState(false);
  // 0–100. Không bao giờ tự chạy quá 92% khi đang chờ: tiến trình thật không đo được
  // (không biết request còn bao lâu), chạm 100% rồi mà vẫn treo là nói dối người dùng.
  const [percent, setPercent] = useState(0);

  // Toàn bộ trạng thái điều khiển nằm ở ref, và effect chạy ĐÚNG MỘT LẦN (deps rỗng).
  // Nếu để effect phụ thuộc vào `visible` thì lần setVisible(true) đầu tiên sẽ kích
  // hoạt cleanup, cleanup xoá luôn interval vừa mới hẹn, và thanh đứng cứng ở 8%.
  const visibleRef = useRef(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const creepTimerRef = useRef(null);
  const shownAtRef = useRef(0);
  // Nhịp chờ trước khi tắt (HIDE_GRACE_MS). Khác `hideTimerRef`: cái này còn HUỶ
  // được khi có request mới, còn hideTimerRef là pha tắt đã chốt (thanh đã ở 100%).
  const graceTimerRef = useRef(null);
  // Số request đang bay, đọc được ở NGOÀI luồng thông báo.
  //
  // Cần vì `subscribeApiBusy` chỉ gọi khi bộ đếm ĐỔI: nếu một request bay lên đúng
  // lúc thanh đang mờ dần thì lượt thông báo đó bị nhánh `hideTimerRef` bỏ qua, và
  // sau đó không còn lượt nào nữa — thanh sẽ nằm im suốt một request có thể dài
  // hàng giây. Pha tắt tự soi lại con số này để bắt đầu một lần chạy mới.
  const inFlightRef = useRef(0);

  useEffect(() => {
    const startCreep = () => {
      clearInterval(creepTimerRef.current);
      creepTimerRef.current = setInterval(() => {
        // Bước nhỏ dần theo khoảng còn lại: nhanh ở đoạn đầu, gần như đứng ở đoạn cuối.
        setPercent((prev) => (prev >= 92 ? 92 : prev + Math.max(0.6, (92 - prev) / 12)));
      }, 160);
    };

    const show = () => {
      showTimerRef.current = null;
      shownAtRef.current = Date.now();
      visibleRef.current = true;
      setPercent(8);
      setVisible(true);
      startCreep();
    };

    /** Chốt pha tắt: đẩy lên 100% rồi mờ dần. */
    const finish = () => {
      graceTimerRef.current = null;
      setPercent(100);

      const shownFor = Date.now() - shownAtRef.current;
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        visibleRef.current = false;
        setVisible(false);
        setPercent(0);

        // Có việc mới xen vào trong lúc mờ dần: mở một lần chạy mới ngay tại đây,
        // vì bộ đếm sẽ không đổi nữa nên sẽ không có lượt thông báo nào để làm việc đó.
        if (inFlightRef.current > 0) {
          showTimerRef.current = setTimeout(show, SHOW_DELAY_MS);
        }
      }, Math.max(MIN_VISIBLE_MS - shownFor, 160));
    };

    const unsubscribe = subscribeApiBusy((inFlight) => {
      inFlightRef.current = inFlight;

      if (inFlight > 0) {
        // Còn trong nhịp chờ (HIDE_GRACE_MS) mà đã có việc mới: huỷ nhịp chờ và đẩy
        // tiếp TỪ CHỖ ĐANG ĐỨNG. Đây là cả mục đích của HIDE_GRACE_MS — chuỗi thao
        // tác đọc thành một lần chạy, không phải một tràng nhấp nháy.
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current);
          graceTimerRef.current = null;
          startCreep();
          return;
        }
        // Đã sang pha tắt (thanh ở 100%, đang mờ dần) thì để nó tắt cho xong; lượt
        // việc mới sẽ tự mở một lần chạy mới qua nhánh dưới.
        if (hideTimerRef.current) return;
        // Đang hiện rồi (hoặc đã hẹn hiện) thì để nguyên — một request mới bay lên
        // KHÔNG kéo thanh về 0, nếu không thì mỗi lượt gọi trong một chuỗi thao tác
        // lại giật thanh về đầu.
        if (visibleRef.current || showTimerRef.current) return;
        showTimerRef.current = setTimeout(show, SHOW_DELAY_MS);
        return;
      }

      // inFlight === 0: xong hết — HOẶC chỉ là khe hở giữa hai lượt gọi.
      if (showTimerRef.current) {
        // Chưa kịp vẽ gì — huỷ luôn, request quá nhanh để cần chỉ báo.
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
        return;
      }
      if (!visibleRef.current) return;
      // Đã hẹn tắt rồi thì đừng hẹn lần nữa (bộ đếm có thể về 0 nhiều lần liền nhau).
      if (graceTimerRef.current || hideTimerRef.current) return;

      // Đứng lại đúng chỗ trong lúc chờ: bò tiếp mà rồi không có việc gì thật là
      // vẽ ra một tiến trình không tồn tại.
      clearInterval(creepTimerRef.current);
      creepTimerRef.current = null;
      graceTimerRef.current = setTimeout(finish, HIDE_GRACE_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      clearTimeout(graceTimerRef.current);
      clearInterval(creepTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      // z cao hơn mọi modal của app (modal cao nhất hiện dùng z-[70]) để thao tác
      // bên trong modal — chia sẻ, đổi tên, thêm thành viên — cũng thấy được thanh này.
      className="fixed top-0 left-0 right-0 z-100 h-0.75 pointer-events-none"
      role="progressbar"
      aria-label={t('progress.busy')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className="h-full bg-linear-to-r from-blue-500 via-indigo-500 to-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${percent}%` }}
      />
      <span className="sr-only">{t('progress.busy')}</span>
    </div>
  );
}
