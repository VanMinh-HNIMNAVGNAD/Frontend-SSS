import { useEffect, useState } from 'react';
import { aiApi, billingApi } from '../services/api';

/**
 * Gói đang dùng + hạn mức AI của chính mình — cho hồ sơ (`UserProfileModal`) và menu tài
 * khoản (`AccountModal`), hai nơi người dùng tìm "mình đang ở gói nào" (##87).
 *
 * `subscription` có BA trạng thái khác nhau, đừng gộp:
 *   'loading' → chưa hỏi xong;
 *   'error'   → hỏi mà không trả lời được (mất mạng, 500). KHÔNG được coi là "Miễn phí": im
 *               lặng đoán sai ngay cạnh thanh dung lượng 100 GB đúng là lỗi cũ của hồ sơ;
 *   null      → server ĐÃ trả lời: không có gói nào đang chạy (chưa mua, hoặc đã hết hạn);
 *   {…}       → gói thật (`GET /billing/subscription`).
 *
 * `aiQuota` là `quota` của `GET /ai/status` (`periodMonths` khác null = hạn mức đi cùng gói),
 * `null` khi chưa có / AI đang tắt / lỗi — chỉ là dòng phụ, không bao giờ chặn gì.
 *
 * Hỏi lại MỖI LẦN `enabled` bật lên (mở modal / mở menu): người vừa thanh toán xong mở hồ sơ ra
 * xem thì phải thấy gói mới. Gói cố ý không cache; `/ai/status` vẫn qua bộ đệm 5 phút của
 * `aiApi.getStatus` (trang thanh toán thành công tự bỏ bộ đệm đó).
 */
export default function useMySubscription(enabled) {
  const [subscription, setSubscription] = useState('loading');
  const [aiQuota, setAiQuota] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    // Hai IIFE độc lập: gói hỏng không được kéo theo dòng AI và ngược lại. setState nằm trong
    // hàm async — gọi thẳng trong thân effect bị `react-hooks/set-state-in-effect` chặn.
    (async () => {
      setSubscription('loading');
      try {
        const data = await billingApi.getMySubscription();
        if (!cancelled) setSubscription(data ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error('[useMySubscription] Không đọc được gói đang dùng:', err);
        setSubscription('error');
      }
    })();

    (async () => {
      try {
        const status = await aiApi.getStatus();
        if (!cancelled) setAiQuota(status?.enabled === false ? null : (status?.quota ?? null));
      } catch {
        if (!cancelled) setAiQuota(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { subscription, aiQuota };
}
