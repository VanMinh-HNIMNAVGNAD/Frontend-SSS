import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import MainLayout from '../components/layout/MainLayout';
import PageNotFound from '../pages/PageNotFound';
import SharePage from '../pages/SharePage';

// Pages
import HomePage from '../pages/HomePage';
import MyDrivePage from '../pages/MyDrivePage';
import SharedDrivesPage from '../pages/SharedDrivesPage';
import SharedWithMePage from '../pages/SharedWithMePage';
import RecentPage from '../pages/RecentPage';
import StarredPage from '../pages/StarredPage';
import SpamPage from '../pages/SpamPage';
import TrashPage from '../pages/TrashPage';
import BillingAndQuota from '../pages/BillingAndQuota';
import BillingSuccess from '../pages/BillingSuccess';
import BillingCancel from '../pages/BillingCancel';

import { readStartupPage } from '../constants/routes';

/**
 * Vào thẳng /app (đăng nhập xong, bấm logo, hoặc từ trang 404) thì đưa người
 * dùng tới đúng "Trang khởi động mặc định" họ đã chọn trong Cài đặt chung:
 *   'home'     -> /app/home
 *   'recent'   -> /app/recent
 *   mặc định   -> /app/my-drive   (chưa chọn, hoặc giá trị không hợp lệ)
 *
 * Đọc localStorage tại thời điểm redirect (không phải lúc module được import)
 * để lựa chọn vừa đổi trong SettingsModal.jsx có hiệu lực ngay ở lần điều hướng
 * kế tiếp, khỏi cần F5.
 *
 * `location.search` được giữ lại: callback OAuth quay về /app?token=... và
 * AuthContext.jsx đọc token từ query — mất query là mất luôn phiên đăng nhập.
 */
function IndexRedirect() {
    const location = useLocation();
    // Path tương đối (không có dấu / đầu) — react-router ghép vào route cha /app
    return <Navigate to={`${readStartupPage()}${location.search}`} replace />;
}

export default function AppRouter() {
    const navigate = useNavigate();

    return (
        <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Route công khai — xem file qua link chia sẻ, không cần đăng nhập */}
            <Route path="/share/:token" element={<SharePage />} />

            {/*
              Trang đích payOS đẩy trình duyệt khách về sau khi trả tiền / bấm huỷ.
              Đường dẫn phải khớp ĐÚNG payos.returnUrl / payos.cancelUrl ở
              backend/src/config/configuration.ts — mặc định là
              ${FRONTEND_URL}/billing/success và /billing/cancel.

              CỐ Ý đặt ngoài <Route path="/app">: payOS mở URL này như một trang
              đích độc lập nên không nên bọc trong MainLayout (sidebar, header,
              modal xem trước...). Auth/File/Toaster provider nằm ở App.jsx nên
              hai trang vẫn gọi được useAuth() và các api có JWT.
            */}
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/billing/cancel" element={<BillingCancel />} />

            <Route path="/app" element={<MainLayout />}>
                <Route index element={<IndexRedirect />} />
                <Route path="home" element={<HomePage />} />
                <Route path="my-drive" element={<MyDrivePage />} />
                <Route path="my-drive/folders/:folderId" element={<MyDrivePage />} />
                <Route path="shared-drives" element={<SharedDrivesPage />} />
                <Route path="shared-drives/folders/:folderId" element={<SharedDrivesPage />} />
                <Route path="shared-with-me" element={<SharedWithMePage />} />
                <Route path="shared-with-me/folders/:folderId" element={<SharedWithMePage />} />
                <Route path="recent" element={<RecentPage />} />
                <Route path="starred" element={<StarredPage />} />
                <Route path="spam" element={<SpamPage />} />
                <Route path="trash" element={<TrashPage />} />
                <Route path="billing" element={<BillingAndQuota />} />
            </Route>

            <Route path="*" element={<PageNotFound onGoHome={() => navigate('/app')} />} />
        </Routes>
    );
}
