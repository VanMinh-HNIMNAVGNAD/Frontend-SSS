import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { UploadProvider } from './context/UploadContext';
import { FileProvider } from './context/FileContext';
import { AiPanelProvider } from './context/AiPanelContext';
import { TagsProvider } from './context/TagsContext';
import AppRouter from './routes/AppRouter';
import GlobalProgressBar from './components/common/GlobalProgressBar';
import GlassToaster from './components/ui/GlassToaster';
import DialogHost from './components/ui/DialogHost';

export default function App() {
    return (
        <BrowserRouter>
            <LanguageProvider>
                <AuthProvider>
                    {/* UploadProvider phải nằm ngoài FileProvider vì FileProvider gọi useUpload() */}
                    <UploadProvider>
                        <FileProvider>
                            <AiPanelProvider>
                            {/* Nhãn (##91) — trong FileProvider vì gắn/gỡ nhãn sửa tại chỗ danh sách tệp. */}
                            <TagsProvider>
                            {/* Toast kính + hộp thoại kính (thay alert/confirm/prompt của trình duyệt) */}
                            <GlassToaster />
                            <DialogHost />
                            <GlobalProgressBar />
                            <AppRouter />
                            </TagsProvider>
                            </AiPanelProvider>
                        </FileProvider>
                    </UploadProvider>
                </AuthProvider>
            </LanguageProvider>
        </BrowserRouter>
    );
}