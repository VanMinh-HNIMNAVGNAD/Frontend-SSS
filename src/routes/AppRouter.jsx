import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import PageNotFound from '../pages/PageNotFound';
import { readStartupPage } from '../constants/routes';
import { LEGAL_ALIASES, LEGAL_DOCS, LEGAL_PATHS } from '../constants/legal';

// Bốn trang nằm trong khung app, người dùng chuyển qua lại liên tục → nạp thẳng.
// Tách chúng ra chunk riêng chỉ đổi một lần chờ mạng lấy một lần chờ mạng khác.
import HomePage from '../pages/HomePage';
import MyDrivePage from '../pages/MyDrivePage';
import RecentPage from '../pages/RecentPage';
import StarredPage from '../pages/StarredPage';

/**
 * Phần còn lại nạp theo yêu cầu.
 *
 * Trước đây mọi thứ nằm chung một gói 2,8 MB (845 KB sau nén) mà trình duyệt
 * phải tải xong mới vẽ được màn hình đăng nhập. Ba nhóm dưới đây là ba nhóm
 * đáng tách nhất vì phần lớn phiên làm việc không chạm tới chúng:
 *
 *  • Trang đăng nhập / đăng ký / quên mật khẩu — chỉ cần khi CHƯA đăng nhập,
 *    tức là đúng những phiên KHÔNG cần tới phần còn lại của app.
 *  • SharePage — route công khai cho người nhận link, và là nơi nặng nhất:
 *    nó kéo theo pdf.js, mammoth và bộ tô màu cú pháp. Người dùng đã đăng nhập
 *    không bao giờ mở nó.
 *  • Ba trang thanh toán + hai tab ít dùng — vào theo chủ đích, không phải
 *    đường đi hằng ngày.
 */
const LoginPage = lazy(() => import('../pages/LoginPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
// Ba trang pháp lý dùng CHUNG một chunk (cùng một component, khác `docId`) và
// nằm ngoài mọi khung app: người mở chúng thường CHƯA đăng nhập — thậm chí là
// người kiểm duyệt của Meta mở thẳng URL — nên không có lý do gì để họ phải tải
// theo cả Sidebar, Header và bộ xem trước tệp.
const LegalPage = lazy(() => import('../pages/LegalPage'));
const SharePage = lazy(() => import('../pages/SharePage'));
const SharedDrivesPage = lazy(() => import('../pages/SharedDrivesPage'));
const SharedWithMePage = lazy(() => import('../pages/SharedWithMePage'));
const SpamPage = lazy(() => import('../pages/SpamPage'));
const TrashPage = lazy(() => import('../pages/TrashPage'));
const BillingAndQuota = lazy(() => import('../pages/BillingAndQuota'));
const BillingSuccess = lazy(() => import('../pages/BillingSuccess'));
const BillingCancel = lazy(() => import('../pages/BillingCancel'));

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
        // Fallback để trống có chủ ý: các chunk này chỉ vài chục KB và tải xong
        // trong một nhịp, chèn spinner vào đó chỉ tạo thêm một cú nháy. Khung
        // app (Sidebar, Header) đã hiện sẵn vì MainLayout không lazy.
        <Suspense fallback={null}>
            <Routes>
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                {/*
                  Điều khoản / Quyền riêng tư / Hướng dẫn xoá dữ liệu.

                  BA URL NÀY KHÔNG PHẢI TRANG PHỤ: chúng dựng lên để điền vào ba ô
                  bắt buộc của Meta khi bật Facebook Login. Đăng nhập Facebook đã gỡ
                  11/09/2026 nhưng ba trang thì GIỮ — nghĩa vụ thông báo cho người
                  dùng không đi kèm nhà cung cấp nào, và Google/GitHub cũng hỏi tới
                  chúng khi xét duyệt. Đường dẫn lấy từ
                  `constants/legal.js` chứ không gõ chuỗi ở đây, để chỗ khai báo
                  đường dẫn và chỗ dùng nó không bao giờ lệch nhau.

                  Công khai và KHÔNG bọc MainLayout: người đọc chúng phần lớn chưa
                  có tài khoản, và trang đăng ký mở chúng ra tab mới.
                */}
                <Route path={LEGAL_PATHS[LEGAL_DOCS.TERMS]} element={<LegalPage docId={LEGAL_DOCS.TERMS} />} />
                <Route path={LEGAL_PATHS[LEGAL_DOCS.PRIVACY]} element={<LegalPage docId={LEGAL_DOCS.PRIVACY} />} />
                <Route
                    path={LEGAL_PATHS[LEGAL_DOCS.DATA_DELETION]}
                    element={<LegalPage docId={LEGAL_DOCS.DATA_DELETION} />}
                />

                {/*
                  Các tên gọi khác của cùng ba trang — '/privacy-policy' là dạng
                  tài liệu của Meta hay dùng, '/terms-of-service' là dạng phổ biến
                  ở nơi khác. Một URL pháp lý đã dán vào dashboard thì không được
                  phép chết, mà mình không kiểm soát được người ta đã dán bản nào
                  đi đâu, nên chúng chuyển hướng thay vì rơi vào trang 404.
                */}
                {Object.entries(LEGAL_ALIASES).map(([alias, target]) => (
                    <Route key={alias} path={alias} element={<Navigate to={target} replace />} />
                ))}

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
        </Suspense>
    );
}
