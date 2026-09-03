// ─────────────────────────────────────────────────────────────────────────────
// Đọc payload của access token — CHỈ để biết "token này thuộc về ai"
// ─────────────────────────────────────────────────────────────────────────────
// KHÔNG phải xác thực: chữ ký không được kiểm tra ở đây và cũng không thể kiểm
// tra ở trình duyệt. Mọi quyết định về quyền vẫn nằm ở backend. Frontend chỉ cần
// `sub` để phát hiện một tình huống rất cụ thể: token trong localStorage đã đổi
// chủ (tab khác đăng nhập tài khoản khác, hoặc /auth/refresh trả token của người
// khác) trong khi React state vẫn đang vẽ hồ sơ của người cũ.
//
// localStorage dùng chung cho MỌI tab của cùng origin, còn interceptor thì đọc
// lại `accessToken` ở từng request — nên một lần đăng nhập ở tab B là đủ để mọi
// request của tab A bay đi dưới danh nghĩa người khác mà tab A không hề hay biết.

/** Giải mã phần payload của JWT. Trả về `null` với mọi token hỏng/không phải JWT. */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // base64url → base64: JWT thay '+/' bằng '-_' và cắt '=' ở cuối.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    // decodeURIComponent(escape(...)) để không vỡ khi payload có ký tự UTF-8.
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * `sub` (id người dùng) của token, hoặc `null` nếu không đọc được.
 *
 * Trả `null` khi không đọc được là có chủ ý: nơi gọi sẽ coi "không biết" là
 * "không có gì để so sánh" và bỏ qua chốt chặn, thay vì đăng xuất oan người dùng
 * chỉ vì token có định dạng lạ.
 */
export function subjectOf(token) {
  const payload = decodeJwt(token);
  return payload?.sub ?? null;
}
