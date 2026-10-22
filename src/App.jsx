import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { UploadProvider } from './context/UploadContext';
import { FileProvider } from './context/FileContext';
import { AiPanelProvider } from './context/AiPanelContext';
import { TagsProvider } from './context/TagsContext';
import AppRouter from './routes/AppRouter';
import GlobalProgressBar from './components/common/GlobalProgressBar';

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
                            <Toaster 
                                position="top-right" 
                                toastOptions={{
                                    duration: 3500,
                                    // Toast là kính nổi như menu/popover (`glass-strong` ở index.css) —
                                    // viết bằng style vì react-hot-toast nhận style, không nhận class.
                                    style: {
                                        borderRadius: '18px',
                                        background: 'var(--glass-fill-strong)',
                                        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                                        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
                                        color: 'var(--app-ink)',
                                        border: '1px solid var(--glass-rim)',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        boxShadow: 'var(--glass-highlight), 0 0 0 1px var(--glass-hairline), var(--glass-shadow-pop)',
                                    },
                                    success: {
                                        iconTheme: {
                                            primary: '#10b981',
                                            secondary: '#fff',
                                        },
                                    },
                                    error: {
                                        iconTheme: {
                                            primary: '#ef4444',
                                            secondary: '#fff',
                                        },
                                    },
                                }}
                            />
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