import { Home, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function PageNotFound({ onGoHome }) {
    const { t } = useLanguage();

    return (
        <div className="min-h-screen text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 glass rounded-[26px] flex items-center justify-center mb-6 text-[var(--ink-muted)]">
                <span className="text-3xl font-extrabold">404</span>
            </div>
            <h1 className="text-3xl font-extrabold mb-2">{t('notFound.title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mb-8">
                {t('notFound.body')}
            </p>
            <button
                onClick={onGoHome}
                className="px-6 py-3 rounded-2xl btn-accent hover:brightness-105 font-bold text-sm transition flex items-center gap-2 cursor-pointer"
            >
                <ArrowLeft className="w-4 h-4" /> {t('notFound.backHome')}
            </button>
        </div>
    );
}
