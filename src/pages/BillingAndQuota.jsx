import { useState } from 'react';
import { useFiles } from '../context/FileContext';
import {
  CreditCard,
  Cloud,
  Check,
  Zap,
  Sparkles,
  X,
  QrCode,
  ShieldCheck,
  History,
  Download,
  HardDrive,
  RefreshCw
} from 'lucide-react';
import { userApi } from '../services/api';

export default function BillingAndQuota() {
  const { storageInfo } = useFiles();
  const [activeSection, setActiveSection] = useState('pricing'); // 'pricing' | 'history'
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState('vnpay'); // 'vnpay' | 'momo' | 'card'
  const [isSyncing, setIsSyncing] = useState(false);

  const handleRecalculateQuota = async () => {
    try {
      setIsSyncing(true);
      await userApi.recalculateQuota();
      // Wait for UI to update
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      alert('Lỗi đồng bộ dung lượng');
    } finally {
      setIsSyncing(false);
    }
  };

  const historyData = [
    {
      id: 'INV-2026-001',
      date: '2026-07-01 10:15',
      plan: 'Gói Cá Nhân (Pro) 100GB',
      amount: '45.000 đ',
      method: 'Ví MoMo',
      status: 'Thành công',
    },
    {
      id: 'INV-2026-002',
      date: '2026-06-01 09:30',
      plan: 'Gói Cá Nhân (Pro) 100GB',
      amount: '45.000 đ',
      method: 'VNPay QR',
      status: 'Thành công',
    },
  ];

  const pricingTiers = [
    {
      id: 'free',
      name: 'Gói Miễn Phí (Free)',
      tag: 'Cơ bản',
      size: '2 GB',
      monthlyPrice: '0 đ',
      yearlyPrice: '0 đ',
      period: 'vĩnh viễn',
      features: ['2 GB lưu trữ Multi-Cloud', 'Tải xuống tốc độ tiêu chuẩn', 'Xem & Chia sẻ tệp trực tuyến'],
      buttonText: 'Đang sử dụng',
      isCurrent: true,
    },
    {
      id: 'pro_100gb',
      name: 'Gói Cá Nhân (Pro)',
      tag: 'Phổ biến nhất',
      size: '100 GB',
      monthlyPrice: '45.000 đ',
      yearlyPrice: '450.000 đ',
      period: billingCycle === 'yearly' ? 'năm' : 'tháng',
      popular: true,
      features: [
        '100 GB dung lượng tốc độ cao',
        'Bảo mật liên kết nâng cao',
        'Hỗ trợ kỹ thuật 24/7',
      ],
      buttonText: 'Nâng cấp Pro 100 GB',
    },
    {
      id: 'storage_plus_1tb',
      name: 'Gói Cao Cấp (Storage Plus)',
      tag: 'Khuyên dùng',
      size: '1 TB',
      monthlyPrice: '199.000 đ',
      yearlyPrice: '1.990.000 đ',
      period: billingCycle === 'yearly' ? 'năm' : 'tháng',
      premiumBadge: true,
      features: [
        '1 TB bộ nhớ khủng Multi-Cloud',
        'Không giới hạn băng thông',
        'Khôi phục tệp trong 30 ngày',
      ],
      buttonText: 'Nâng cấp 1 TB',
    },
  ];

  const getProgressColor = (percent) => {
    if (percent > 90) return 'bg-rose-500';
    if (percent > 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 custom-scrollbar bg-gray-50/30 dark:bg-white/5">
      <div className="max-w-7xl mx-auto w-full pt-6 sm:pt-10 space-y-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            
            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 truncate tracking-tight">Quản lý dung lượng lưu trữ</h1>
            </div>
          </div>

          {/* Section Switcher */}
          <div className="flex bg-white dark:bg-[#282a2c] p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setActiveSection('pricing')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'pricing' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Gói Dịch Vụ
            </button>
            <button
              onClick={() => setActiveSection('history')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'history' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <History className="w-4 h-4" /> Lịch Sử Giao Dịch
            </button>
          </div>
        </div>

        {/* Modern Storage Summary Card */}
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 md:p-10 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8 border border-slate-800 relative overflow-hidden">
          {/* Soft background glows - purely decorative and absolute */}
          <div className="absolute right-0 top-0 translate-x-1/3 -translate-y-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-0 bottom-0 -translate-x-1/3 translate-y-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex-1 w-full min-w-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 dark:bg-white/5 rounded-lg text-blue-200 text-xs font-bold uppercase tracking-wide border border-white/10 backdrop-blur-md">
                <HardDrive className="w-4 h-4" /> Tổng quan lưu trữ
              </div>
              <button
                onClick={handleRecalculateQuota}
                disabled={isSyncing}
                title="Đồng bộ lại dung lượng"
                className={`p-1.5 rounded-lg bg-white/10 dark:bg-white/5 text-blue-200 hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md cursor-pointer ${isSyncing ? 'animate-spin opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight">{storageInfo.usedFormatted || `${storageInfo.usedGB} GB`}</h2>
              <span className="text-slate-400 text-lg md:text-xl font-medium">/ {storageInfo.totalGB} GB đã dùng</span>
            </div>
          </div>

          <div className="relative z-10 w-full md:w-1/2 shrink-0">
            <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden shadow-inner border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(storageInfo.percentage)}`}
                style={{ width: `${Math.min(100, Math.max(1, storageInfo.percentage))}%` }}
              />
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-400">
              <span>Đã dùng {storageInfo.percentage}%</span>
              <span>Trống {Math.max(0, Number(storageInfo.totalGB) - Number(storageInfo.usedGB)).toFixed(2)} GB</span>
            </div>
          </div>
        </div>

        {/* SECTION 1: PRICING TIERS */}
        {activeSection === 'pricing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Nâng cấp trải nghiệm driveR
              </h2>

              <div className="flex items-center gap-1 bg-white dark:bg-[#282a2c] p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm w-full sm:w-auto">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 sm:py-2 rounded-lg text-[15px] font-bold transition-all ${
                    billingCycle === 'monthly' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Gói Tháng
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 sm:py-2 rounded-lg text-[15px] font-bold transition-all flex items-center justify-center gap-2 ${
                    billingCycle === 'yearly' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Gói Năm <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] rounded-md tracking-wide uppercase whitespace-nowrap">-20%</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8 items-stretch">
              {pricingTiers.map((plan) => (
                <div
                  key={plan.id}
                  className={`flex flex-col bg-white dark:bg-[#282a2c] rounded-2xl p-6 sm:p-8 border transition-all duration-300 h-full ${
                    plan.popular
                      ? 'border-gray-900 shadow-xl ring-1 ring-gray-900 hover:-translate-y-1'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg shadow-sm hover:-translate-y-1'
                  }`}
                >
                  <div className="mb-8">
                    {plan.popular ? (
                       <div className="inline-block px-3 py-1 bg-gray-900 text-white text-xs font-bold rounded-lg mb-4 tracking-wide uppercase">Lựa Chọn Phổ Biến</div>
                    ) : (
                       <div className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-lg mb-4 tracking-wide uppercase">{plan.tag}</div>
                    )}
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 break-words">{plan.name}</h3>
                    
                    <div className="flex flex-col justify-start min-h-[96px]">
                      <div className="flex items-baseline gap-1 mt-2 flex-wrap">
                        <span className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight break-words">{billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice}</span>
                      </div>
                      <div className="text-[15px] font-medium text-gray-500 dark:text-gray-400 mt-1">
                        / {plan.period}
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-gray-900 dark:text-gray-100 shrink-0" />
                        <span className="text-[15px] text-gray-600 dark:text-gray-300 leading-snug break-words">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => !plan.isCurrent && setSelectedPlan(plan)}
                    disabled={plan.isCurrent}
                    className={`mt-auto w-full py-3 px-4 rounded-xl text-[15px] font-bold transition-all shrink-0 ${
                      plan.isCurrent
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-transparent'
                        : plan.popular
                        ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-md'
                        : 'bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm'
                    }`}
                  >
                    {plan.buttonText}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: BILLING HISTORY */}
        {activeSection === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-700 text-[13px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="py-4 px-6 whitespace-nowrap">Mã giao dịch</th>
                      <th className="py-4 px-6 whitespace-nowrap">Chi tiết gói</th>
                      <th className="py-4 px-6 whitespace-nowrap">Tổng tiền</th>
                      <th className="py-4 px-6 whitespace-nowrap">Phương thức</th>
                      <th className="py-4 px-6 whitespace-nowrap">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-[15px]">
                    {historyData.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 transition-colors">{row.id}</div>
                          <div className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{row.date}</div>
                        </td>
                        <td className="py-4 px-6 font-semibold text-gray-800 dark:text-gray-200">{row.plan}</td>
                        <td className="py-4 px-6 font-bold text-gray-900 dark:text-gray-100">{row.amount}</td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold">
                            {row.method === 'Ví MoMo' ? <span className="w-2 h-2 rounded-full bg-pink-500" /> : <span className="w-2 h-2 rounded-full bg-blue-500" />}
                            {row.method}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[13px] font-bold rounded-full border border-emerald-100">
                            <Check className="w-3.5 h-3.5" /> {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PAYMENT MODAL */}
        {selectedPlan && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#282a2c] rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
              <button
                onClick={() => setSelectedPlan(null)}
                className="absolute right-5 top-5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/5 p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 ring-1 ring-gray-900/5 dark:ring-white/10 shadow-sm">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 tracking-tight">Thanh toán dịch vụ</h3>
                <p className="text-gray-500 dark:text-gray-400 text-[15px]">
                  Gói <span className="font-bold text-gray-900 dark:text-gray-100">{selectedPlan.name}</span> - {billingCycle === 'yearly' ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <label className="block text-[15px] font-bold text-gray-900 dark:text-gray-100">Phương thức thanh toán</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedPayment('vnpay')}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                      selectedPayment === 'vnpay' ? 'border-gray-900 bg-gray-50 dark:bg-white/5 shadow-sm' : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <QrCode className={`w-8 h-8 ${selectedPayment === 'vnpay' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`} />
                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">VNPay QR</span>
                  </button>
                  <button
                    onClick={() => setSelectedPayment('momo')}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                      selectedPayment === 'momo' ? 'border-gray-900 bg-gray-50 dark:bg-white/5 shadow-sm' : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${selectedPayment === 'momo' ? 'bg-[#A50064] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      Mo
                    </div>
                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">Ví MoMo</span>
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  alert(`Đã giả lập thanh toán thành công gói ${selectedPlan.name} qua ${selectedPayment.toUpperCase()}!`);
                  setSelectedPlan(null);
                }}
                className="w-full py-4 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-5 h-5" /> Xác nhận thanh toán an toàn
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

