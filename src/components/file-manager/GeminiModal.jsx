import { useState, useEffect } from 'react';
import { Sparkles, X, Send, Bot, FileText, CheckCircle2 } from 'lucide-react';

import { useLanguage } from '../../context/LanguageContext';

export default function GeminiModal({ isOpen, item, onClose }) {
    const { t } = useLanguage();
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState([
        {
            sender: 'ai',
            text: t('gemini.greeting', { name: item?.name || t('gemini.thisItem') }),
        }
    ]);
    const [isThinking, setIsThinking] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose && onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !item) return null;

    const handleSend = (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        const userMsg = prompt.trim();
        setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setPrompt('');
        setIsThinking(true);

        setTimeout(() => {
            setIsThinking(false);
            setMessages(prev => [
                ...prev, 
                { 
                    sender: 'ai', 
                    text: t('gemini.mockReply', {
                        name: item.name,
                        question: userMsg,
                        size: item.size
                            ? `${(item.size / 1024 / 1024).toFixed(2)} MB`
                            : t('gemini.folderSize'),
                        updatedAt: item.updatedAt,
                    })
                }
            ]);
        }, 1000);
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-[#1e1e1e] dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-[520px] cursor-default"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-md">
                            <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                Hỏi Gemini
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-semibold">AI Assistant</span>
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                Tệp đang chọn: <span className="font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-[#18191a]">
                    {messages.map((msg, idx) => (
                        <div 
                            key={idx} 
                            className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.sender === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs text-xs font-bold">
                                    <Bot className="w-4 h-4" />
                                </div>
                            )}
                            <div 
                                className={`max-w-[82%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                                    msg.sender === 'user' 
                                        ? 'bg-blue-600 text-white rounded-br-none shadow-sm' 
                                        : 'bg-white dark:bg-[#282a2c] text-gray-800 dark:text-gray-200 border border-gray-200/80 dark:border-gray-700 rounded-bl-none shadow-xs whitespace-pre-line'
                                }`}
                            >
                                {msg.text}
                            </div>
                        </div>
                    ))}

                    {isThinking && (
                        <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium py-2">
                            <Sparkles className="w-4 h-4 animate-spin" />
                            Gemini đang đọc dữ liệu tệp và suy nghĩ...
                        </div>
                    )}
                </div>

                {/* Quick Suggestion Chips */}
                <div className="px-4 py-2 bg-white dark:bg-[#1e1e1e] border-t border-gray-100 dark:border-gray-800 flex gap-2 overflow-x-auto text-xs">
                    <button 
                        onClick={() => setPrompt(t('gemini.suggest.summarize'))}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-700 dark:text-gray-300 rounded-full shrink-0 transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1 cursor-pointer"
                    >
                        <FileText className="w-3.5 h-3.5 text-purple-500" /> Tóm tắt tệp
                    </button>
                    <button 
                        onClick={() => setPrompt(t('gemini.suggest.quiz'))}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 rounded-full shrink-0 transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1 cursor-pointer"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> Tạo câu hỏi
                    </button>
                </div>

                {/* Input Prompt Box */}
                <form onSubmit={handleSend} className="p-3 bg-white dark:bg-[#1e1e1e] border-t border-gray-100 dark:border-gray-800 flex gap-2">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={t('gemini.placeholder')}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 outline-none text-xs"
                    />
                    <button
                        type="submit"
                        disabled={!prompt.trim() || isThinking}
                        className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-sm disabled:opacity-50 transition-all flex items-center gap-1 text-xs cursor-pointer"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
