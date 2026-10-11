import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Ban,
  CreditCard,
  ExternalLink,
  Hash,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { displayPlanName } from '../../utils/planName';
import { billingApi } from '../../services/api';
import { localeTagOf } from '../../utils/locale';
import {
  CYCLE_LABEL_KEY,
  PAYMENT_METHOD_LABEL,
  PENDING_STATUSES,
  formatVnd,
  resolveTxStatus,
} from '../../constants/billing';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Popup chi tiết một giao dịch (mở từ bảng Lịch sử giao dịch)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Component này KHÔNG tự tải dữ liệu: nó hiển thị đúng bản ghi mà bảng đã có từ
 * `GET /billing/transactions`. Đóng/mở modal vì thế không phát sinh request nào.
 *
 * HUỶ HOÁ ĐƠN — chỉ hiện với `status === 'PENDING'`:
 *   • `PROCESSING` CỐ Ý không được huỷ. Trạng thái đó nghĩa là payOS đang trong
 *     quá trình ghi nhận tiền; huỷ vào đúng lúc ấy có thể tạo ra cảnh khách đã
 *     chuyển khoản nhưng hoá đơn đã đóng.
 *   • Sau khi huỷ thành công, cha `onCancelled()` chịu trách nhiệm tải lại danh
 *     sách rồi đóng modal — modal không tự sửa dữ liệu trong tay nó, vì trạng
 *     thái thật vẫn là thứ backend trả về (payOS có thể đã EXPIRED trước đó).
 *
 * Bước xác nhận huỷ được reset bằng `key={transaction.id}` ở phía cha (modal remount khi
 * đổi giao dịch), nên ở đây không cần effect nào để dọn state.
 *
 * @param {object|null} transaction Bản ghi từ `billingApi.getTransactions()`; null = đóng.
 * @param {() => void}  onClose     Đóng modal.
 * @param {() => (void|Promise<void>)} onCancelled Gọi sau khi huỷ thành công.
 */
export default function TransactionDetailModal({ transaction, onClose, onCancelled }) {
  const { t, language } = useLanguage();
  const locale = localeTagOf(language);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Esc để đóng — nhưng không cho đóng khi request huỷ đang bay.
  useEffect(() => {
    if (!transaction) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isCancelling) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transaction, isCancelling, onClose]);

  if (!transaction) return null;

  const status = resolveTxStatus(transaction.status);
  const StatusIcon = status.Icon;
  // Chưa chốt = còn đối soát lại được với payOS. Nhưng chỉ PENDING mới huỷ được.
  const isOpen = PENDING_STATUSES.includes(transaction.status);
  const canCancel = transaction.status === 'PENDING';

  const handleBackdropClick = () => {
    if (!isCancelling) onClose?.();
  };

  const handleCancelInvoice = async () => {
    if (!transaction.orderCode) {
      toast.error(t('tx.noOrderCode'));
      return;
    }

    try {
      setIsCancelling(true);
      await billingApi.cancelTransaction(transaction.orderCode);
      toast.success(t('tx.cancelled', { code: transaction.orderCode }));
      // Tải lại danh sách TRƯỚC khi đóng: bảng phía sau phải hiện "Đã huỷ" ngay khi
      // modal biến mất, chứ không để người dùng nhìn thấy dòng "Đang chờ" cũ.
      await onCancelled?.();
      onClose?.();
    } catch (err) {
      // 400/404 = trạng thái đã đổi (vừa được trả tiền / đã huỷ / hết hạn). Thông điệp của
      // backend đã là câu tiếng Việt nên hiển thị thẳng.
      toast.error(err?.message || t('tx.cancelFailed'), { duration: 6000 });

      if (err?.status === 400 || err?.status === 404) {
        // Tải lại danh sách RỒI ĐÓNG. `transaction` trong tay modal là bản chụp lúc mở, giờ
        // đã sai — giữ modal mở là khoe một trạng thái mà chính bảng phía sau vừa phủ nhận.
        await onCancelled?.();
        onClose?.();
        return;
      }

      // Lỗi tạm thời (503 payOS, mất mạng): giữ modal để người dùng thử lại.
      setConfirmingCancel(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const rows = [
    {
      key: 'orderCode',
      Icon: Hash,
      label: t('tx.field.code'),
      value: <span className="font-mono font-bold">{transaction.orderCode || '—'}</span>,
    },
    {
      key: 'plan',
      Icon: Package,
      label: t('tx.field.plan'),
      value: displayPlanName(transaction.planName, language) || t('billing.tx.deletedPlan'),
    },
    {
      key: 'cycle',
      Icon: RefreshCw,
      label: t('tx.field.cycle'),
      value: CYCLE_LABEL_KEY[transaction.billingCycle]
        ? t(CYCLE_LABEL_KEY[transaction.billingCycle])
        : transaction.billingCycle || '—',
    },
    {
      key: 'method',
      Icon: CreditCard,
      label: t('tx.field.method'),
      value: PAYMENT_METHOD_LABEL[transaction.paymentMethod] || transaction.paymentMethod || '—',
    },
    {
      key: 'createdAt',
      Icon: Receipt,
      label: t('tx.field.createdAt'),
      value: transaction.createdAt ? new Date(transaction.createdAt).toLocaleString(locale) : '—',
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-[#282a2c] rounded-3xl max-w-md w-full p-7 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-700"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('tx.ariaTitle', { code: transaction.orderCode || '' })}
      >
        <button
          onClick={onClose}
          disabled={isCancelling}
          className="absolute right-5 top-5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t('common.close')}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tiêu đề + trạng thái */}
        <div className="mb-6 pr-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 mb-4 ring-1 ring-blue-500/20 shadow-sm">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-3 tracking-tight">
            {t('tx.detail.title')}
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-bold rounded-full border whitespace-nowrap ${status.tone}`}
          >
            <StatusIcon className="w-3.5 h-3.5" /> {status.label}
          </span>
        </div>

        {/* Số tiền */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-white/5 px-5 py-4 mb-4">
          <div className="text-[13px] font-semibold text-gray-500 dark:text-gray-400">{t('tx.amount')}</div>
          <div className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight mt-0.5">
            {formatVnd(transaction.amount, locale)}
          </div>
        </div>

        {/* Các trường chi tiết */}
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 mb-6">
          {rows.map(({ key, Icon, label, value }) => (
            <div key={key} className="flex items-start justify-between gap-4 px-5 py-3">
              <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                <Icon className="w-4 h-4" /> {label}
              </span>
              <span className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 text-right break-all min-w-0">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Hành động */}
        {isOpen && (
          <div className="space-y-3">
            <Link
              to={`/billing/success?orderCode=${transaction.orderCode}`}
              className="w-full py-3 rounded-xl bg-gray-900 hover:bg-black dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-[14px] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" /> {t('tx.recheck')}
            </Link>

            {/* PROCESSING: nói rõ vì sao KHÔNG có nút huỷ, thay vì im lặng giấu nút đi. */}
            {!canCancel && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/30 p-4">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[13.5px] text-amber-800 dark:text-amber-200 leading-snug">
                  {t('tx.processingNote')}
                </p>
              </div>
            )}

            {!canCancel ? null : confirmingCancel ? (
              <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-950/30 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[13.5px] text-rose-800 dark:text-rose-200 leading-snug">
                    {t('tx.cancelWarn')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    disabled={isCancelling}
                    className="flex-1 py-2.5 rounded-xl bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 font-bold text-[14px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('tx.detail.keep')}
                  </button>
                  <button
                    onClick={handleCancelInvoice}
                    disabled={isCancelling}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[14px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> {t('tx.cancelling')}
                      </>
                    ) : (
                      t('tx.confirmCancel')
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full py-3 rounded-xl bg-white dark:bg-[#282a2c] border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-bold text-[14px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Ban className="w-4 h-4" /> {t('tx.cancelInvoice')}
              </button>
            )}
          </div>
        )}

        {!isOpen && (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 font-bold text-[14px] transition-all cursor-pointer"
          >
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  );
}
