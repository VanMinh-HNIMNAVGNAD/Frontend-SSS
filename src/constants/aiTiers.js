// ─────────────────────────────────────────────────────────────────────────────
// Bậc gói cho Hỏi AI (22/10/2026) — gói nào chọn được model nào.
// ─────────────────────────────────────────────────────────────────────────────
//
// NGUỒN SỰ THẬT ở backend (`backend/src/ai/ai-plan-tier.ts` + `minTier` của từng model trong
// `ai-models.ts`): `GET /ai/status` trả mỗi model kèm `minTier` và `locked` cho người đang hỏi.
// File này chỉ có thứ tự bậc + nhãn hiển thị — KHÔNG có bảng "gói nào có model nào": trang Gói
// cước dựng bảng đó từ chính `minTier` của danh sách model, để không có hai bản sự thật lệch nhau.
//
//   free < lite < pro < plus < max   (bậc là thang: gói trên có mọi model gói dưới có)

export const AI_TIERS = ['free', 'lite', 'pro', 'plus', 'max'];

/** Nhãn ngắn của bậc — trùng tên gói trong bảng giá (migration 042: "Pro Plus" là bậc `plus`). */
export const TIER_LABEL = {
    free: 'Free',
    lite: 'Lite',
    pro: 'Pro',
    plus: 'Pro Plus',
    max: 'Max',
};

/** Thứ hạng của bậc; giá trị lạ = thấp nhất (giống `tierRank` ở backend). */
export const tierRank = (tier) => Math.max(0, AI_TIERS.indexOf(tier));

/**
 * Bậc của một thẻ gói trên trang Gói cước, từ `key` của `resolvePlanUi` (constants/billing.js).
 * Thẻ "ultra" là gói Max (tên DB "Max", cũ hơn "Gói Tối Đa (Max)" / "(Ultra)"); thẻ lạ = null (không hiện
 * dòng model nào thay vì đoán).
 */
export const tierOfPlanUiKey = (key) =>
    ({ free: 'free', lite: 'lite', pro: 'pro', plus: 'plus', ultra: 'max' })[key] ?? null;

const modelNames = (list) => list.map((m) => m.label || m.id).join(', ');

/**
 * Dòng "Model AI" trên một thẻ gói — dựng từ `minTier` của danh sách model mà `GET /ai/status`
 * trả về (đúng danh sách người vận hành đang mở), nên gỡ một model khỏi `VERTEX_MODELS` là bảng
 * giá tự thôi quảng cáo nó. Trả `{ key, params }` cho `t()`, hoặc `null` khi không dựng được
 * (backend cũ chưa có `minTier`, chưa tải được danh sách, thẻ gói lạ).
 *
 *   Free / Lite  → "Gemini 2.5 Flash"
 *   Pro          → "Gemini 3.5 Flash, Gemini 3.1 Pro, Gemini 3.5 Flash-Lite, Gemini 2.5 Flash"
 *   Pro Plus     → "Gemini 3.8 Flash, Gemini 4 Argon + mọi model của gói Pro"
 *   Max          → "Mọi model AI"
 */
export function aiModelsLineFor(tier, models) {
    if (!tier || !Array.isArray(models) || !models.length || !models.every((m) => m.minTier)) return null;
    const rank = tierRank(tier);
    const allowed = models.filter((m) => tierRank(m.minTier) <= rank);
    if (!allowed.length) return { key: 'billing.aiModels.none' };
    const fresh = allowed.filter((m) => m.minTier === tier);
    const older = allowed.filter((m) => m.minTier !== tier);
    if (!fresh.length && allowed.length === models.length) return { key: 'billing.aiModels.all' };
    if (fresh.length && older.length > 2) {
        const prev = older.reduce(
            (best, m) => (tierRank(m.minTier) > tierRank(best) ? m.minTier : best),
            older[0].minTier,
        );
        return { key: 'billing.aiModels.plusTier', params: { models: modelNames(fresh), tier: TIER_LABEL[prev] } };
    }
    return { key: 'billing.aiModels.list', params: { models: modelNames(allowed) } };
}
