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
                                    style: {
                                        borderRadius: '12px',
                                        background: 'var(--app-surface)',
                                        color: 'var(--app-ink)',
                                        border: '1px solid var(--app-border)',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
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