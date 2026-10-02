/**
 * Hàm ngoài component nên phải NHẬN `t` và `locale` qua tham số — bản cũ ghi cứng
 * cả câu tiếng Việt lẫn 'vi-VN', nên "3 phút trước" và định dạng ngày không bao
 * giờ đổi theo giao diện.
 */
export function formatRelativeTime(dateInput, t, locale) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // Dưới một phút là "vừa xong" — ngưỡng 45 giây cũ để lọt khoảng 45–59 giây thành "0 phút trước".
    if (diffMin < 1) return t('activity.time.justNow');
    if (diffMin < 60) return t('activity.time.minutes', { count: diffMin });
    if (diffHour < 24) return t('activity.time.hours', { count: diffHour });
    if (diffDay === 1) {
        const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        return t('activity.time.yesterday', { time: timeStr });
    }
    if (diffDay < 7) return t('activity.time.days', { count: diffDay });

    return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
