import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, XCircle, LifeBuoy } from 'lucide-react';
import { billingApi } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import tRich from '../utils/tRich';

/**
 * cancelUrl mà backend gửi cho payOS (config/configuration.ts → payos.cancelUrl):
 *   ${FRONTEND_URL}/billing/cancel?orderCode=<orderCode>
 *
 * Route này nằm NGOÀI /app (không có MainLayout) vì payOS mở nó như một trang đích
 * độc lập — người dùng vừa rời khỏi app sang trang thanh toán rồi quay về, chưa chắc
 * còn nằm trong layout cũ. Các provider (Auth/File/Toaster) đều ở cấp App.jsx nên
 * vẫn dùng được bình thường.
 *
 * payOS còn tự thêm params của nó (`code`, `id`, `cancel=true`, `status=CANCELLED`);
 * ta chỉ đọc `orderCode` — đó là khoá đối soát duy nhất thuộc quyền mình.
 */
export default function BillingCancel() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');

  /**
   * Gọi một lần cho có tác dụng phụ, KHÔNG dùng kết quả: bấm huỷ ở trang payOS chỉ
   * đóng link phía payOS, hàng `payment_transactions` của ta vẫn đang PENDING. Endpoint
   * này khi thấy PENDING sẽ hỏi payOS rồi ghi lại trạng thái thật (CANCELLED), nhờ vậy
   * Lịch Sử Giao Dịch không treo một dòng "Đang chờ" vĩnh viễn — hiện chưa có cron nào
   * dọn các giao dịch PENDING quá hạn.
   *
   * Lỗi thì im lặng: đây không phải thông tin người dùng đang chờ, và trang huỷ vẫn
   * hiển thị đúng dù đồng bộ thất bại.
   */
  useEffect(() => {
    if (!orderCode) return;
    billingApi.getTransactionStatus(orderCode).catch(() => {});
  }, [orderCode]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-[#1b1c1d]">
      <div className="w-full max-w-md bg-white dark:bg-[#282a2c] rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center bg-amber-50 dark:bg-amber-500/10 text-amber-500 ring-1 ring-amber-200 dark:ring-amber-500/30">
          <XCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100 mb-2">
          {t('payCancel.title')}
        </h1>
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {tRich(t('payCancel.body'), {
            bold: (
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {t('payCancel.bold')}
              </span>
            ),
          })}
        </p>

        {orderCode && (
          <div className="mt-6 px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 text-left">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t('payResult.field.orderCode')}
            </div>
            <div className="font-mono text-[15px] font-semibold text-gray-800 dark:text-gray-200 break-all mt-0.5">
              {orderCode}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <Link
            to="/app/billing"
            className="w-full py-3.5 px-4 rounded-xl bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 text-white font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại trang Gói dịch vụ
          </Link>
          <Link
            to="/app"
            className="w-full py-3 px-4 rounded-xl bg-white dark:bg-transparent text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 font-bold text-[15px] transition-all flex items-center justify-center gap-2"
          >
            Về driveR
          </Link>
        </div>

        <p className="mt-6 text-[13px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5">
          <LifeBuoy className="w-3.5 h-3.5 shrink-0" />
          Gặp vấn đề khi thanh toán? Thử lại hoặc dùng app ngân hàng khác để quét QR.
        </p>
      </div>
    </div>
  );
}
