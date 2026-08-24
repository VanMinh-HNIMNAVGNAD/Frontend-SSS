import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { UploadProvider } from './context/UploadContext';
import { FileProvider } from './context/FileContext';
import AppRouter from './routes/AppRouter';

export default function App() {
    return (
        <BrowserRouter>
            <LanguageProvider>
                <AuthProvider>
                    {/* UploadProvider phải nằm ngoài FileProvider vì FileProvider gọi useUpload() */}
                    <UploadProvider>
                        <FileProvider>
                            <Toaster 
                                position="top-right" 
                                toastOptions={{
                                    duration: 3500,
                                    style: {
                                        borderRadius: '12px',
                                        background: '#1e293b',
                                        color: '#fff',
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
                            <AppRouter />
                        </FileProvider>
                    </UploadProvider>
                </AuthProvider>
            </LanguageProvider>
        </BrowserRouter>
    );
}