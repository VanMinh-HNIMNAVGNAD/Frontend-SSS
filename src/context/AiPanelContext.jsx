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

    /**
     * Mở panel.
     *
     * `item` CÓ THỂ null, và đó là thay đổi quan trọng nhất của bản này: nút AI trên thanh
     * điều hướng mở panel khi người dùng chưa chọn tệp nào, rồi họ tự đính tệp từ máy hoặc
     * chọn trong Drive ngay trong panel. Bản trước `if (!item) return` nên cái nút đó
     * không thể tồn tại.
     *
     * Vẫn giữ đường một-mục nguyên vẹn: menu chuột phải gọi `openAi(item, 'summarize')`
     * y như cũ và panel mở ra đã sẵn tệp đó trong ngữ cảnh.
     */
    const openAi = useCallback((item = null, action = null) => {
        setTarget({ item: item ?? null, action });
    }, []);

    const closeAi = useCallback(() => setTarget(null), []);

    const value = useMemo(
        () => ({
            aiItem: target?.item ?? null,
            aiAction: target?.action ?? null,
            aiOpen: target !== null,
            openAi,
            closeAi,
        }),
        [target, openAi, closeAi],
    );

    return (
        <AiPanelContext.Provider value={value}>
            {children}
            {target && (
                <Suspense fallback={null}>
                    {/* `key` theo id: đổi sang mục khác là dựng lại khung chat từ đầu, chứ
                        không để lại lịch sử trò chuyện của tệp trước.

                        Mở không kèm mục thì key là 'blank' — mọi lần mở từ thanh điều hướng
                        dùng CÙNG một key, nên đóng rồi mở lại vẫn là một instance mới (vì
                        `target` về null làm panel unmount), còn trong một phiên mở thì
                        không có gì làm nó dựng lại giữa chừng và mất các tệp vừa đính. */}
                    <AiAssistantPanel
                        key={target.item?.id ?? 'blank'}
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
