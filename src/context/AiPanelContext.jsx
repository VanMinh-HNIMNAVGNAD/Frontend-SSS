import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Một chỗ duy nhất trong toàn ứng dụng quyết định "panel AI đang mở cho mục nào".
 *
 * Vì sao cần context cho một thứ nhỏ như vậy: trước đây `GeminiModal` được mount BA lần —
 * `HomePage`, `FileListView`, `FileGridView` — mỗi nơi một cặp state `geminiItemTarget` +
 * `geminiAction` giống hệt nhau. Ba bản sao của cùng một thứ thì sớm muộn cũng lệch nhau,
 * và quan trọng hơn: cửa sổ xem trước nằm ở `MainLayout`, KHÔNG phải con của ba view đó,
 * nên nút "Hỏi AI" trong lúc xem trước sẽ không có bản nào để gọi. Gom về một chỗ là điều
 * kiện để có cái nút đó, không phải dọn dẹp cho gọn.
 *
 * Panel được mount ngay trong provider chứ không ở `MainLayout`: như vậy chỉ có ĐÚNG MỘT
 * bản tồn tại, và không nơi nào cần nhớ phải render nó. Nạp lười vì nó kéo theo `marked`.
 */

const AiPanelContext = createContext(null);

const AiAssistantPanel = lazy(() => import('../components/file-manager/GeminiModal'));

export function AiPanelProvider({ children }) {
    // Một state cho cả hai giá trị: mục và lệnh nhanh luôn đổi CÙNG NHAU. Tách thành hai
    // `useState` là mở đường cho một lần render trung gian mang mục mới kèm lệnh nhanh cũ
    // — và lệnh nhanh thì tự chạy ngay khi panel mở, tức nó sẽ chạy nhầm.
    const [target, setTarget] = useState(null);

    const openAi = useCallback((item, action = null) => {
        if (!item) return;
        setTarget({ item, action });
    }, []);

    const closeAi = useCallback(() => setTarget(null), []);

    const value = useMemo(
        () => ({ aiItem: target?.item ?? null, aiAction: target?.action ?? null, openAi, closeAi }),
        [target, openAi, closeAi],
    );

    return (
        <AiPanelContext.Provider value={value}>
            {children}
            {target?.item && (
                <Suspense fallback={null}>
                    {/* `key` theo id: đổi sang mục khác là dựng lại khung chat từ đầu, chứ
                        không để lại lịch sử trò chuyện của tệp trước. */}
                    <AiAssistantPanel
                        key={target.item.id}
                        isOpen
                        item={target.item}
                        initialAction={target.action}
                        onClose={closeAi}
                    />
                </Suspense>
            )}
        </AiPanelContext.Provider>
    );
}

export function useAiPanel() {
    const context = useContext(AiPanelContext);
    if (!context) throw new Error('useAiPanel phải nằm trong <AiPanelProvider>');
    return context;
}
