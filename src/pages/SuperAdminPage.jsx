import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../services/api';
import { ShieldCheck, Users, HardDrive, Lock, Unlock, Edit3, Search, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SuperAdminPage() {
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [newQuotaGB, setNewQuotaGB] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, analyticsData] = await Promise.all([
        adminApi.getUsers({ search, page, limit: 15 }),
        adminApi.getSystemAnalytics(),
      ]);
      setUsers(usersData.users || []);
      if (usersData.meta) {
        setTotalPages(usersData.meta.totalPages || 1);
      }
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err.message || 'Không thể tải dữ liệu Quản trị SuperAdmin');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = async (user) => {
    try {
      const newStatus = !user.isActive;
      await adminApi.updateUserStatus(user.id, newStatus);
      setStatusMsg(`Đã ${newStatus ? 'mở khóa' : 'khóa'} tài khoản ${user.email}`);
      setTimeout(() => setStatusMsg(''), 3000);
      loadData();
    } catch (err) {
      alert('Lỗi cập nhật trạng thái: ' + err.message);
    }
  };

  const handleSaveQuota = async (userId) => {
    const gb = parseFloat(newQuotaGB);
    if (isNaN(gb) || gb <= 0) {
      alert('Vui lòng nhập dung lượng GB hợp lệ (> 0)');
      return;
    }
    const bytes = Math.round(gb * 1024 * 1024 * 1024);
    try {
      await adminApi.updateUserQuota(userId, bytes);
      setStatusMsg(`Đã cập nhật Quota tài khoản thành ${gb} GB`);
      setEditingUser(null);
      setTimeout(() => setStatusMsg(''), 3000);
      loadData();
    } catch (err) {
      alert('Lỗi cập nhật Quota: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-12 select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-gray-100 tracking-tight">SuperAdmin Management Center</h1>
            <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">
              Trang riêng quản trị Tài khoản, Hạn mức Quota & Thống kê Hệ thống Multi-Cloud
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 text-slate-700 dark:text-gray-300 rounded-2xl text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* System Storage & Account Stats Cards */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-3xl bg-white dark:bg-[#282a2c] border border-slate-200/80 dark:border-gray-700/60 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tổng người dùng</span>
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-gray-100">{analytics.totalUsers}</div>
            <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1">
              {analytics.activeUsers} tài khoản đang hoạt động
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#282a2c] border border-slate-200/80 dark:border-gray-700/60 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Dung lượng sử dụng</span>
              <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-gray-100">{analytics.storage?.usedGB} GB</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-gray-400 mt-1">
              Trên tổng số {analytics.storage?.limitGB} GB ({analytics.storage?.percentage}%)
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#282a2c] border border-slate-200/80 dark:border-gray-700/60 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tài khoản bị khóa</span>
              <Lock className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-gray-100">{analytics.disabledUsers}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-gray-400 mt-1">Vi phạm chính sách / Khóa thủ công</div>
          </div>

          <div className="p-5 rounded-3xl bg-white dark:bg-[#282a2c] border border-slate-200/80 dark:border-gray-700/60 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">SuperAdmin</span>
              <ShieldCheck className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-gray-100">{analytics.superAdmins}</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-gray-400 mt-1">Quyền quản trị toàn hệ thống</div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {statusMsg && (
        <div className="mb-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="mb-6 p-4 rounded-2xl bg-slate-900 text-slate-300 text-xs flex items-start gap-3 border border-slate-800 shadow-md">
        <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-white mb-0.5">Cam kết Bảo mật Dữ liệu Riêng tư (Data Privacy):</p>
          <p className="text-slate-400 leading-relaxed">
            SuperAdmin chỉ có quyền điều chỉnh hạn mức Quota dung lượng, trạng thái tài khoản và theo dõi tổng thể hệ thống. SuperAdmin tuyệt đối KHÔNG có quyền truy cập, duyệt hoặc xem tệp riêng tư của người dùng khác.
          </p>
        </div>
      </div>

      {/* Users Table Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-gray-100">Danh sách Tài khoản Người dùng</h2>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo email hoặc họ tên..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#282a2c] border border-slate-200 dark:border-gray-700 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-slate-200/80 dark:border-gray-700/60 rounded-3xl bg-white dark:bg-[#282a2c] overflow-hidden shadow-xs mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-white/5 border-b border-slate-200 dark:border-gray-700 text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Người dùng</th>
                <th className="py-3.5 px-4">Vai trò</th>
                <th className="py-3.5 px-4">Đăng nhập từ</th>
                <th className="py-3.5 px-4">Dung lượng Quota</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4 text-right">Thao tác Quản trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.fullName} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-gray-700 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0">
                          {(u.fullName || u.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900 dark:text-gray-100">{u.fullName || 'Người dùng'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full ${
                        u.role === 'SUPER_ADMIN' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-500 dark:text-gray-400 capitalize">{u.provider || 'local'}</td>

                  <td className="py-3 px-4">
                    {editingUser === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          placeholder="GB"
                          value={newQuotaGB}
                          onChange={(e) => setNewQuotaGB(e.target.value)}
                          className="w-20 px-2 py-1 bg-white dark:bg-[#282a2c] border border-indigo-300 rounded-lg text-xs"
                        />
                        <button
                          onClick={() => handleSaveQuota(u.id)}
                          className="px-2.5 py-1 bg-indigo-600 text-white font-bold rounded-lg text-[11px]"
                        >
                          Lưu
                        </button>
                        <button onClick={() => setEditingUser(null)} className="text-slate-400 text-[11px]">
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-gray-100">{u.usedGB} GB</span>
                        <span className="text-slate-400">/ {u.limitGB} GB</span>
                        <button
                          onClick={() => {
                            setEditingUser(u.id);
                            setNewQuotaGB(u.limitGB);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Sửa Hạn mức Quota"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        u.isActive ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                        u.isActive
                          ? 'bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {u.isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      <span>{u.isActive ? 'Khóa TK' : 'Mở khóa'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
        <span>Trang {page} / {totalPages}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-[#282a2c] hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Trang trước
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-[#282a2c] hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Trang sau
          </button>
        </div>
      </div>
    </div>
  );
}
