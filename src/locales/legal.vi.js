// ─────────────────────────────────────────────────────────────────────────────
// Nội dung ba tài liệu pháp lý — bản tiếng Việt
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG NẰM TRONG `vi.js`: hai từ điển vi.js/en.js là bộ khoá PHẲNG cho
// chuỗi giao diện, và `scripts/check-i18n.mjs` soi từng khoá một. Nhồi ba tài
// liệu dài vào đó thì mỗi đoạn văn thành một khoá `privacy.section3.para2` —
// không ai đọc lại được văn bản pháp lý dưới dạng đó, mà sửa một câu là phải
// khớp tay hai file. Ở đây văn bản giữ nguyên hình dạng văn bản.
//
// `check-i18n.mjs` bỏ qua mọi file trong `src/locales/` khi dò khoá `t('...')`,
// và nó chỉ import đúng `en.js` + `vi.js`, nên hai file legal.*.js này không làm
// nó báo động. Nhưng CẶP ĐÔI VẪN PHẢI KHỚP NHAU BẰNG TAY: sửa mục nào ở đây thì
// sửa đúng mục đó ở `legal.en.js` — người kiểm duyệt của Meta đọc bản tiếng Anh,
// người dùng đọc bản tiếng Việt, và hai bản nói khác nhau là một vấn đề pháp lý
// thật chứ không phải lỗi hiển thị.
//
// ─── CÁC LOẠI KHỐI MÀ <LegalPage /> HIỂU ────────────────────────────────────
//   { type: 'p',     text }              đoạn văn
//   { type: 'ul',    items: [] }         danh sách không thứ tự
//   { type: 'ol',    items: [] }         danh sách có thứ tự (các bước làm)
//   { type: 'table', head: [], rows: [] } bảng — dùng cho danh sách bên thứ ba
//   { type: 'note',  text }              khối nhấn mạnh, viền màu
//
// Chỗ trống trong text được <LegalPage /> điền: {service} {site} {email}
// {effective} {version}. Riêng {email} được dựng thành liên kết mailto.

const privacy = {
  title: 'Chính sách quyền riêng tư',
  intro:
    '{service} ({site}) là dịch vụ lưu trữ và chia sẻ tệp trên nền web. Tài liệu này nói rõ chúng tôi thu thập dữ liệu gì, dùng để làm gì, gửi cho ai, giữ trong bao lâu, và bạn yêu cầu xoá bằng cách nào. Nếu có điều gì trong đây bạn không đồng ý, xin đừng tạo tài khoản.',
  sections: [
    {
      heading: '1. Ai xử lý dữ liệu của bạn',
      blocks: [
        {
          type: 'p',
          text: 'Dữ liệu của bạn do đội vận hành {service} xử lý. Mọi câu hỏi, yêu cầu truy cập hoặc yêu cầu xoá dữ liệu, xin gửi tới {email}.',
        },
        {
          type: 'p',
          text: '{service} hiện là một dịch vụ đang trong giai đoạn phát triển (bản alpha), do một nhóm nhỏ vận hành. Chúng tôi nói thẳng điều này vì nó ảnh hưởng tới kỳ vọng hợp lý của bạn về mức độ bảo đảm — xem thêm mục 9.',
        },
      ],
    },
    {
      heading: '2. Chúng tôi thu thập những gì',
      blocks: [
        {
          type: 'p',
          text: 'Chỉ những thứ cần để dịch vụ chạy được. Không mua dữ liệu từ bên thứ ba, không theo dõi bạn trên các website khác, không đặt mã quảng cáo trên trang.',
        },
        {
          type: 'table',
          head: ['Nhóm dữ liệu', 'Cụ thể là gì', 'Vì sao cần'],
          rows: [
            [
              'Thông tin tài khoản',
              'Địa chỉ email, nickname, ảnh đại diện (nếu bạn tải lên).',
              'Định danh chủ tài khoản, gửi mã xác minh, hiện tên bạn cho người được chia sẻ.',
            ],
            [
              'Mật khẩu',
              'Chỉ lưu bản BĂM bằng bcrypt. Chúng tôi không lưu và không thể đọc được mật khẩu gốc của bạn.',
              'Xác thực khi đăng nhập.',
            ],
            [
              'Đăng nhập bằng Google / GitHub',
              'Mã định danh người dùng do nhà cung cấp đó cấp, địa chỉ email, tên hiển thị và ảnh đại diện.',
              'Tạo và nhận diện tài khoản mà bạn không phải đặt thêm mật khẩu.',
            ],
            [
              'Nội dung bạn tải lên',
              'Tệp và nội dung bên trong tệp, tên tệp, cây thư mục, thẻ (tag), các phiên bản cũ của tệp, ảnh thu nhỏ do hệ thống sinh ra.',
              'Đây chính là dịch vụ: lưu tệp của bạn và trả lại cho bạn.',
            ],
            [
              'Dữ liệu chia sẻ',
              'Bạn chia sẻ tệp nào cho ai, quyền xem hay sửa, các liên kết chia sẻ bạn tạo, thành viên trong ổ đĩa dùng chung.',
              'Thực thi đúng quyền truy cập bạn đã đặt.',
            ],
            [
              'Nhật ký hoạt động',
              'Các hành động trên tệp (tải lên, đổi tên, di chuyển, xoá, chia sẻ, phục hồi) kèm thời điểm.',
              'Để bạn tra lại được ai đã làm gì với tệp trong ổ đĩa dùng chung, và để chúng tôi điều tra khi có sự cố.',
            ],
            [
              'Phiên đăng nhập',
              'Địa chỉ IP, chuỗi nhận dạng trình duyệt (user-agent), thời điểm đăng nhập và lần dùng gần nhất của từng thiết bị.',
              'Hiện danh sách "thiết bị đang đăng nhập" để bạn tự thu hồi phiên lạ, và phát hiện truy cập bất thường.',
            ],
            [
              'Lịch sử dùng tính năng AI',
              'Câu hỏi bạn gửi, câu trả lời nhận được, và lượng dùng để tính hạn mức.',
              'Hiện lại hội thoại cho bạn và kiểm soát hạn mức theo gói.',
            ],
            [
              'Giao dịch thanh toán',
              'Mã đơn, số tiền, trạng thái, gói đã mua, thời điểm. Chúng tôi KHÔNG nhận và KHÔNG lưu số thẻ hay thông tin tài khoản ngân hàng của bạn.',
              'Xác nhận bạn đã trả tiền và mở đúng hạn mức.',
            ],
          ],
        },
        {
          type: 'note',
          text: 'Về đăng nhập bằng Google hoặc GitHub: chúng tôi chỉ yêu cầu địa chỉ email và thông tin hồ sơ công khai. Chúng tôi KHÔNG đọc tệp trên Google Drive, kho mã riêng tư hay bất cứ dữ liệu nào khác của bạn ở đó, và KHÔNG bao giờ đăng hay thay đổi bất cứ thứ gì trên tài khoản đó. Nếu tài khoản của bạn không cung cấp email, chúng tôi không tạo được tài khoản và sẽ mời bạn dùng cách đăng nhập khác.',
        },
      ],
    },
    {
      heading: '3. Chúng tôi dùng dữ liệu để làm gì',
      blocks: [
        {
          type: 'ul',
          items: [
            'Cung cấp dịch vụ: nhận, lưu, trả lại và chia sẻ tệp của bạn theo đúng quyền bạn đặt.',
            'Xác thực và bảo vệ tài khoản: kiểm mật khẩu, gửi mã xác minh một lần (OTP) qua email, chống đăng ký và đăng nhập tự động bằng CAPTCHA.',
            'Tính hạn mức: dung lượng đã dùng, số lượt dùng AI, gói đang có hiệu lực.',
            'Xử lý thanh toán và xuất thông tin đơn hàng cho bạn.',
            'Gửi thư liên quan trực tiếp tới tài khoản: mã xác minh, đặt lại mật khẩu, thông báo về thay đổi quan trọng của dịch vụ.',
            'Phát hiện và ngăn lạm dụng: tệp độc hại, hành vi tự động, cố gắng vượt hạn mức.',
            'Đáp ứng yêu cầu hợp pháp của cơ quan có thẩm quyền, khi buộc phải làm.',
          ],
        },
        {
          type: 'p',
          text: 'Chúng tôi KHÔNG bán dữ liệu của bạn, KHÔNG cho thuê, KHÔNG dùng nội dung tệp của bạn để huấn luyện mô hình AI, và KHÔNG dùng dữ liệu của bạn để nhắm quảng cáo.',
        },
      ],
    },
    {
      heading: '4. Cơ sở để chúng tôi xử lý dữ liệu',
      blocks: [
        {
          type: 'ul',
          items: [
            'Để thực hiện hợp đồng với bạn — phần lớn hoạt động xử lý thuộc nhóm này: không lưu tệp thì không có dịch vụ nào để nói tới.',
            'Sự đồng ý của bạn — khi bạn bấm đồng ý với Điều khoản sử dụng và Chính sách này lúc tạo tài khoản, và khi bạn chủ động dùng tính năng AI. Bạn rút lại đồng ý được bất cứ lúc nào bằng cách ngừng dùng tính năng đó hoặc xoá tài khoản.',
            'Lợi ích chính đáng — bảo vệ hệ thống khỏi lạm dụng, ghi nhật ký để điều tra sự cố.',
            'Nghĩa vụ pháp lý — lưu chứng từ giao dịch theo quy định, và cung cấp thông tin khi có yêu cầu hợp pháp.',
          ],
        },
        {
          type: 'p',
          text: 'Với người dùng tại Việt Nam, chúng tôi xử lý dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.',
        },
      ],
    },
    {
      heading: '5. Chúng tôi gửi dữ liệu cho ai',
      blocks: [
        {
          type: 'p',
          text: 'Chúng tôi dùng một số nhà cung cấp hạ tầng để chạy dịch vụ. Họ chỉ được tiếp cận phần dữ liệu cần cho đúng việc của họ, và không được dùng dữ liệu đó cho mục đích riêng.',
        },
        {
          type: 'table',
          head: ['Nhà cung cấp', 'Họ nhận gì', 'Để làm gì'],
          rows: [
            [
              'Google Cloud Storage, Cloudflare R2, Backblaze B2',
              'Tệp bạn tải lên và ảnh thu nhỏ.',
              'Lưu trữ tệp. Tuỳ gói và tuỳ tệp mà nằm ở một trong ba nơi này.',
            ],
            [
              'Google Cloud Vertex AI — mô hình Gemini của Google, và mô hình của đối tác mà Google cung cấp qua Vertex AI (Anthropic Claude, xAI Grok) khi bạn chọn chúng',
              'Nội dung tài liệu và câu hỏi của bạn — CHỈ khi bạn chủ động bấm "Hỏi AI" trên một tệp, và chỉ tới đúng mô hình bạn chọn trong khung chat.',
              'Sinh câu trả lời. Nếu tính năng đối chiếu bằng Google Search đang bật (chỉ với Gemini), câu hỏi có thể được dùng để tra cứu web.',
            ],
            [
              'Cloudflare Turnstile',
              'Địa chỉ IP và tín hiệu kỹ thuật của trình duyệt tại thời điểm bạn đăng ký / đăng nhập.',
              'Phân biệt người thật với bot, không dùng hình ảnh đố vui và không theo dõi bạn giữa các trang.',
            ],
            [
              'Resend',
              'Địa chỉ email của bạn và nội dung thư hệ thống.',
              'Gửi mã xác minh, thư đặt lại mật khẩu, thông báo hệ thống.',
            ],
            [
              'payOS',
              'Thông tin đơn hàng và dữ liệu thanh toán bạn nhập trực tiếp trên trang của họ.',
              'Thu tiền. Thông tin thẻ / tài khoản của bạn đi thẳng tới payOS, không đi qua máy chủ của chúng tôi.',
            ],
            [
              'Heroku (máy chủ) và Vercel (giao diện web)',
              'Toàn bộ lưu lượng truy cập đi qua hạ tầng của họ.',
              'Chạy máy chủ và phân phối trang web.',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Ngoài danh sách trên, chúng tôi chỉ tiết lộ dữ liệu khi có yêu cầu hợp pháp từ cơ quan có thẩm quyền, hoặc khi cần thiết để bảo vệ quyền và an toàn của người dùng khác.',
        },
        {
          type: 'p',
          text: 'Các nhà cung cấp này đặt hạ tầng ở nhiều nơi trên thế giới, nên dữ liệu của bạn có thể được lưu và xử lý ngoài lãnh thổ Việt Nam.',
        },
      ],
    },
    {
      heading: '6. Chúng tôi giữ dữ liệu trong bao lâu',
      blocks: [
        {
          type: 'table',
          head: ['Loại dữ liệu', 'Thời gian giữ'],
          rows: [
            [
              'Tệp trong thùng rác',
              'Xoá vĩnh viễn tự động sau 30 ngày kể từ khi bạn chuyển vào thùng rác. Trước đó bạn phục hồi lại được.',
            ],
            [
              'Tệp và thư mục đang hoạt động',
              'Giữ đến khi bạn xoá, hoặc đến khi bạn xoá tài khoản.',
            ],
            [
              'Mã xác minh một lần (OTP)',
              'Sống tối đa 10 phút trong bộ nhớ tạm rồi tự biến mất.',
            ],
            [
              'Phiên đăng nhập',
              'Hết hiệu lực sau 2 ngày không hoạt động, và tối đa 30 ngày kể từ lần đăng nhập kể cả khi dùng liên tục. Bạn thu hồi tay được bất cứ lúc nào.',
            ],
            [
              'Nhật ký hoạt động trên tệp',
              'Giữ cùng tệp; xoá theo tệp hoặc theo tài khoản.',
            ],
            [
              'Lịch sử hội thoại AI',
              'Giữ đến khi bạn xoá hội thoại hoặc xoá tài khoản.',
            ],
            [
              'Chứng từ giao dịch',
              'Giữ theo thời hạn mà pháp luật về kế toán, thuế yêu cầu, kể cả sau khi bạn đã xoá tài khoản.',
            ],
          ],
        },
      ],
    },
    {
      heading: '7. Quyền của bạn',
      blocks: [
        {
          type: 'ul',
          items: [
            'Xem và sửa thông tin tài khoản (nickname, ảnh đại diện, mật khẩu) ngay trong phần Hồ sơ.',
            'Tải tệp của bạn về máy bất cứ lúc nào.',
            'Xem danh sách thiết bị đang đăng nhập và thu hồi từng phiên hoặc tất cả phiên khác.',
            'Tắt việc người khác tìm thấy bạn qua địa chỉ email, trong Cài đặt → Quyền riêng tư & Bảo mật.',
            'Xoá vĩnh viễn tài khoản cùng toàn bộ dữ liệu — xem mục 8.',
            'Ngắt liên kết với Google hoặc GitHub bằng cách xoá tài khoản {service}, hoặc gỡ ứng dụng trong phần cài đặt của nhà cung cấp đó.',
            'Rút lại sự đồng ý, phản đối việc xử lý, hoặc yêu cầu một bản sao dữ liệu của bạn — gửi yêu cầu tới {email}.',
          ],
        },
        {
          type: 'p',
          text: 'Chúng tôi trả lời các yêu cầu về dữ liệu cá nhân trong vòng 30 ngày. Nếu bạn cho rằng chúng tôi xử lý dữ liệu của bạn không đúng, bạn có quyền khiếu nại tới cơ quan nhà nước có thẩm quyền về bảo vệ dữ liệu cá nhân.',
        },
      ],
    },
    {
      heading: '8. Xoá dữ liệu',
      blocks: [
        {
          type: 'p',
          text: 'Bạn tự xoá được toàn bộ dữ liệu của mình, không cần xin phép ai và không cần chờ chúng tôi xử lý tay. Hướng dẫn từng bước — kể cả cách gửi yêu cầu khi bạn không đăng nhập được nữa — nằm ở trang Hướng dẫn xoá dữ liệu.',
        },
        {
          type: 'p',
          text: 'Khi bạn xoá tài khoản, chúng tôi xoá bản ghi tài khoản, mọi tệp và phiên bản tệp thuộc về bạn trên hệ thống lưu trữ, ảnh đại diện, các phiên đăng nhập, nhật ký hoạt động, lịch sử AI và các thiết lập chia sẻ của bạn. Việc này KHÔNG thể hoàn tác.',
        },
      ],
    },
    {
      heading: '9. Chúng tôi bảo vệ dữ liệu thế nào',
      blocks: [
        {
          type: 'ul',
          items: [
            'Toàn bộ kết nối đi qua HTTPS.',
            'Mật khẩu chỉ lưu dạng băm bcrypt, không lưu bản gốc.',
            'Đăng nhập hai bước: đúng mật khẩu rồi vẫn phải nhập mã gửi tới email của bạn.',
            'Phiên đăng nhập giữ trong cookie HttpOnly mà mã JavaScript trên trang không đọc được; vé truy cập ngắn hạn (15 phút) và tự làm mới.',
            'CAPTCHA của Cloudflare chặn đăng ký và đăng nhập tự động.',
            'Liên kết xem tệp là liên kết có hạn, hết giờ thì tự chết.',
          ],
        },
        {
          type: 'note',
          text: '{service} đang ở giai đoạn alpha. Không hệ thống nào an toàn tuyệt đối và chúng tôi không hứa điều đó. Với dữ liệu mà mất là không làm lại được, xin hãy luôn giữ thêm một bản sao ở nơi khác.',
        },
      ],
    },
    {
      heading: '10. Cookie và dữ liệu lưu trên trình duyệt',
      blocks: [
        {
          type: 'ul',
          items: [
            'Một cookie HttpOnly giữ phiên đăng nhập của bạn. Không có nó thì cứ 15 phút bạn lại phải đăng nhập lại.',
            'Bộ nhớ cục bộ của trình duyệt (localStorage) giữ các lựa chọn hiển thị: ngôn ngữ, giao diện sáng/tối, trang mở đầu, bật/tắt phím tắt.',
            'Cloudflare Turnstile đặt dữ liệu kỹ thuật riêng của nó khi ô xác minh chạy.',
          ],
        },
        {
          type: 'p',
          text: 'Chúng tôi không dùng cookie quảng cáo và không nhúng mã theo dõi của mạng quảng cáo nào.',
        },
      ],
    },
    {
      heading: '11. Trẻ em',
      blocks: [
        {
          type: 'p',
          text: '{service} không dành cho người dưới 16 tuổi. Nếu bạn dưới 16 tuổi, xin đừng tạo tài khoản. Nếu chúng tôi biết một tài khoản thuộc về người dưới 16 tuổi, chúng tôi sẽ xoá tài khoản đó. Cha mẹ hoặc người giám hộ phát hiện con mình đã tạo tài khoản, xin liên hệ {email} để chúng tôi xoá.',
        },
      ],
    },
    {
      heading: '12. Thay đổi chính sách này',
      blocks: [
        {
          type: 'p',
          text: 'Khi có thay đổi về nội dung, chúng tôi cập nhật ngày hiệu lực ở đầu trang và thông báo trong ứng dụng hoặc qua email trước khi thay đổi có hiệu lực. Tiếp tục dùng dịch vụ sau ngày đó nghĩa là bạn chấp nhận bản mới.',
        },
      ],
    },
    {
      heading: '13. Liên hệ',
      blocks: [
        {
          type: 'p',
          text: 'Mọi câu hỏi hoặc yêu cầu liên quan tới dữ liệu cá nhân, xin gửi tới {email}. Chúng tôi trả lời trong vòng 30 ngày.',
        },
      ],
    },
  ],
};

const terms = {
  title: 'Điều khoản sử dụng',
  intro:
    'Đây là thoả thuận giữa bạn và {service} ({site}). Bằng việc tạo tài khoản hoặc dùng dịch vụ, bạn xác nhận đã đọc và đồng ý với các điều khoản dưới đây cùng với Chính sách quyền riêng tư.',
  sections: [
    {
      heading: '1. Chấp nhận điều khoản',
      blocks: [
        {
          type: 'p',
          text: 'Bạn phải tích vào ô đồng ý trước khi tạo được tài khoản. Nếu bạn không đồng ý với bất kỳ điều nào ở đây, xin đừng dùng dịch vụ.',
        },
        {
          type: 'p',
          text: 'Bạn phải từ 16 tuổi trở lên, hoặc đủ tuổi để tự giao kết hợp đồng theo pháp luật nơi bạn sống — chọn mốc nào cao hơn.',
        },
      ],
    },
    {
      heading: '2. Tài khoản của bạn',
      blocks: [
        {
          type: 'ul',
          items: [
            'Thông tin bạn cung cấp phải đúng, và bạn giữ nó luôn đúng.',
            'Bạn chịu trách nhiệm giữ kín mật khẩu và mã xác minh của mình, và chịu trách nhiệm về mọi hoạt động diễn ra dưới tài khoản của bạn.',
            'Không được chia sẻ tài khoản cho người khác dùng chung, không được bán hoặc chuyển nhượng tài khoản.',
            'Nếu bạn nghi tài khoản bị người khác truy cập, hãy đổi mật khẩu, thu hồi các phiên đang đăng nhập, và báo cho chúng tôi qua {email}.',
          ],
        },
      ],
    },
    {
      heading: '3. Nội dung của bạn thuộc về bạn',
      blocks: [
        {
          type: 'p',
          text: 'Bạn giữ toàn bộ quyền đối với tệp bạn tải lên. Chúng tôi không đòi hỏi quyền sở hữu đối với nội dung của bạn.',
        },
        {
          type: 'p',
          text: 'Để chạy được dịch vụ, bạn cho chúng tôi một quyền sử dụng có giới hạn: lưu, sao chép (để dự phòng và tạo phiên bản), truyền tải, sinh ảnh thu nhỏ, và hiển thị nội dung của bạn cho chính bạn và cho những người bạn đã chia sẻ. Quyền này chỉ dùng cho việc cung cấp dịch vụ, và kết thúc khi bạn xoá nội dung đó hoặc xoá tài khoản.',
        },
        {
          type: 'p',
          text: 'Bạn cam kết mình có quyền đối với những gì mình tải lên, và việc tải lên đó không vi phạm quyền của ai.',
        },
      ],
    },
    {
      heading: '4. Những việc không được làm',
      blocks: [
        {
          type: 'ul',
          items: [
            'Tải lên hoặc chia sẻ nội dung vi phạm pháp luật Việt Nam, hoặc vi phạm quyền của người khác (bản quyền, nhãn hiệu, quyền riêng tư).',
            'Lưu trữ hoặc phát tán mã độc, tệp thực thi độc hại, công cụ tấn công.',
            'Dùng dịch vụ để phát tán thư rác, lừa đảo, giả mạo người khác, hoặc làm nơi trung chuyển nội dung khiêu khích thù địch, bạo lực.',
            'Nội dung lạm dụng tình dục trẻ em — chúng tôi xoá ngay, khoá tài khoản vĩnh viễn và trình báo cơ quan chức năng.',
            'Cố tình vượt hạn mức: lách giới hạn dung lượng, tạo tài khoản hàng loạt, gọi API tự động ngoài mục đích sử dụng bình thường.',
            'Dò tìm, quét, hoặc khai thác lỗ hổng của hệ thống mà không có sự đồng ý trước bằng văn bản của chúng tôi. Nếu bạn phát hiện lỗ hổng, xin báo tới {email} — chúng tôi biết ơn điều đó.',
            'Dùng dịch vụ làm hạ tầng phân phối tệp cho website hoặc ứng dụng khác.',
          ],
        },
        {
          type: 'p',
          text: 'Chúng tôi có thể xoá nội dung vi phạm và khoá tài khoản liên quan. Với vi phạm nghiêm trọng hoặc lặp lại, chúng tôi khoá tài khoản mà không hoàn lại khoản tiền đã trả.',
        },
      ],
    },
    {
      heading: '5. Chia sẻ tệp',
      blocks: [
        {
          type: 'p',
          text: 'Khi bạn chia sẻ một tệp — cho một địa chỉ email cụ thể hay bằng liên kết công khai — bạn tự quyết định ai xem được gì. Bất cứ ai có liên kết công khai đều mở được tệp cho tới khi bạn thu hồi liên kết đó. Hãy cân nhắc trước khi dán liên kết đó ra nơi công cộng.',
        },
      ],
    },
    {
      heading: '6. Gói dịch vụ và thanh toán',
      blocks: [
        {
          type: 'ul',
          items: [
            'Tài khoản mới có hạn mức lưu trữ miễn phí. Hạn mức và giá của các gói trả tiền được hiển thị trong ứng dụng trước khi bạn trả tiền.',
            'Thanh toán xử lý qua payOS. Thông tin thẻ hoặc tài khoản ngân hàng của bạn do payOS nhận, không đi qua máy chủ của chúng tôi.',
            'Gói có hiệu lực ngay sau khi thanh toán thành công, và hết hiệu lực vào cuối kỳ đã trả.',
            'Bạn huỷ gói bất cứ lúc nào; việc huỷ ngăn kỳ tiếp theo, không hoàn lại phần thời gian còn lại của kỳ đang dùng, trừ khi pháp luật yêu cầu khác.',
            'Nếu gói hết hạn mà dữ liệu của bạn đang vượt hạn mức miễn phí, bạn vẫn tải tệp về được nhưng sẽ không tải thêm lên được cho tới khi đưa dung lượng về dưới hạn mức.',
          ],
        },
      ],
    },
    {
      heading: '7. Tính năng AI',
      blocks: [
        {
          type: 'p',
          text: 'Khi bạn bấm "Hỏi AI" trên một tệp, nội dung tệp đó và câu hỏi của bạn được gửi tới Google Cloud Vertex AI để sinh câu trả lời, bằng mô hình bạn chọn trong khung chat: Gemini của Google hoặc một mô hình đối tác do Google cung cấp trên Vertex AI (Anthropic Claude, xAI Grok). Khi mô hình bạn chọn quá tải, một mô hình Gemini có thể trả lời thay và giao diện ghi rõ điều đó. Chỉ khi bạn chủ động bấm, không tự động chạy trên tệp nào.',
        },
        {
          type: 'p',
          text: 'Câu trả lời do mô hình sinh ra CÓ THỂ SAI hoặc thiếu. Đừng dùng nó thay cho tư vấn pháp lý, y tế, tài chính hay bất kỳ tư vấn chuyên môn nào. Bạn tự chịu trách nhiệm khi hành động dựa trên câu trả lời đó. Đừng gửi vào tính năng AI những tài liệu mà bạn không được phép chuyển cho bên thứ ba.',
        },
        {
          type: 'p',
          text: 'Mỗi gói có hạn mức lượt dùng AI riêng. Hết hạn mức thì tính năng tạm dừng cho tới kỳ sau.',
        },
      ],
    },
    {
      heading: '8. Dịch vụ được cung cấp "như hiện có"',
      blocks: [
        {
          type: 'note',
          text: '{service} đang ở bản alpha. Chúng tôi cung cấp dịch vụ trên nguyên tắc "như hiện có", không bảo đảm dịch vụ luôn sẵn sàng, không bảo đảm không có lỗi, và không bảo đảm dữ liệu không bao giờ mất. HÃY TỰ GIỮ MỘT BẢN SAO cho những dữ liệu quan trọng với bạn.',
        },
        {
          type: 'p',
          text: 'Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp, mất lợi nhuận, mất cơ hội kinh doanh hoặc mất dữ liệu phát sinh từ việc dùng dịch vụ. Nếu buộc phải xác định một giới hạn trách nhiệm, giới hạn đó là số tiền bạn đã trả cho chúng tôi trong 12 tháng gần nhất.',
        },
        {
          type: 'p',
          text: 'Chúng tôi có thể thay đổi, tạm dừng hoặc ngừng một tính năng. Nếu ngừng một phần quan trọng của dịch vụ, chúng tôi sẽ thông báo trước và cho bạn thời gian tải dữ liệu của mình về.',
        },
      ],
    },
    {
      heading: '9. Ngừng sử dụng và xoá tài khoản',
      blocks: [
        {
          type: 'p',
          text: 'Bạn ngừng lúc nào cũng được: xoá tài khoản trong phần Hồ sơ và toàn bộ dữ liệu của bạn bị xoá vĩnh viễn. Xem trang Hướng dẫn xoá dữ liệu.',
        },
        {
          type: 'p',
          text: 'Chúng tôi có thể khoá hoặc xoá tài khoản của bạn nếu bạn vi phạm các điều khoản này, hoặc khi buộc phải làm theo yêu cầu của pháp luật. Trừ trường hợp vi phạm nghiêm trọng, chúng tôi sẽ thông báo và cho bạn cơ hội tải dữ liệu về.',
        },
      ],
    },
    {
      heading: '10. Thay đổi điều khoản',
      blocks: [
        {
          type: 'p',
          text: 'Khi sửa các điều khoản này, chúng tôi cập nhật ngày hiệu lực ở đầu trang. Với thay đổi làm giảm quyền của bạn, chúng tôi thông báo trước trong ứng dụng hoặc qua email. Tiếp tục dùng dịch vụ sau ngày hiệu lực nghĩa là bạn chấp nhận bản mới; không đồng ý thì bạn có thể xoá tài khoản.',
        },
      ],
    },
    {
      heading: '11. Luật áp dụng',
      blocks: [
        {
          type: 'p',
          text: 'Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp phát sinh sẽ được ưu tiên giải quyết bằng thương lượng; không thương lượng được thì đưa ra toà án có thẩm quyền tại Việt Nam.',
        },
      ],
    },
    {
      heading: '12. Liên hệ',
      blocks: [
        {
          type: 'p',
          text: 'Có câu hỏi về các điều khoản này? Gửi thư tới {email}.',
        },
      ],
    },
  ],
};

const dataDeletion = {
  title: 'Hướng dẫn xoá dữ liệu',
  intro:
    'Bạn có quyền xoá vĩnh viễn tài khoản {service} và toàn bộ dữ liệu gắn với nó. Trang này nói rõ cách làm, và điều gì xảy ra sau đó.',
  sections: [
    {
      heading: 'Cách 1 — Tự xoá trong ứng dụng (nhanh nhất)',
      blocks: [
        {
          type: 'ol',
          items: [
            'Đăng nhập vào {site}.',
            'Bấm vào ảnh đại diện của bạn ở góc trên bên phải, chọn Hồ sơ.',
            'Kéo xuống cuối, tìm phần "Xoá tài khoản".',
            'Nhập mật khẩu để xác nhận (tài khoản đăng nhập bằng Google hoặc GitHub thì không cần bước này), rồi xác nhận xoá.',
          ],
        },
        {
          type: 'p',
          text: 'Việc xoá diễn ra ngay lập tức. Không có thời gian chờ, và KHÔNG THỂ hoàn tác.',
        },
      ],
    },
    {
      heading: 'Cách 2 — Gửi yêu cầu qua email',
      blocks: [
        {
          type: 'p',
          text: 'Nếu bạn không đăng nhập được nữa — mất mật khẩu, mất quyền truy cập email, hoặc đã gỡ ứng dụng khỏi Google / GitHub — hãy gửi thư tới {email} với tiêu đề "Yêu cầu xoá dữ liệu".',
        },
        {
          type: 'p',
          text: 'Trong thư, xin cho biết địa chỉ email bạn đã dùng để đăng ký và cách bạn đã đăng nhập (email và mật khẩu, hay Google / GitHub). Chúng tôi cần xác minh bạn đúng là chủ tài khoản trước khi xoá — điều này bảo vệ bạn khỏi việc người khác xoá dữ liệu của bạn.',
        },
        {
          type: 'p',
          text: 'Chúng tôi xử lý yêu cầu trong vòng 30 ngày và gửi thư xác nhận khi hoàn tất.',
        },
      ],
    },
    {
      heading: 'Gỡ quyền truy cập của Google / GitHub',
      blocks: [
        {
          type: 'p',
          text: 'Xoá tài khoản {service} đã cắt liên kết giữa {service} và tài khoản Google hoặc GitHub của bạn. Nếu bạn muốn dọn thêm ở phía nhà cung cấp: với Google vào Tài khoản Google → Bảo mật → Ứng dụng của bên thứ ba; với GitHub vào Settings → Applications → Authorized OAuth Apps, chọn {service} rồi gỡ.',
        },
        {
          type: 'note',
          text: 'Gỡ ứng dụng ở phía nhà cung cấp chỉ ngăn họ chia sẻ thêm thông tin với chúng tôi. Nó KHÔNG tự xoá tài khoản {service} của bạn — muốn xoá dữ liệu thì vẫn phải làm theo Cách 1 hoặc Cách 2 ở trên.',
        },
      ],
    },
    {
      heading: 'Những gì bị xoá',
      blocks: [
        {
          type: 'ul',
          items: [
            'Bản ghi tài khoản: email, nickname, mật khẩu đã băm, mã định danh từ Google / GitHub.',
            'Mọi tệp và mọi phiên bản cũ của tệp thuộc về bạn, xoá khỏi hệ thống lưu trữ.',
            'Ảnh đại diện và các ảnh thu nhỏ đã sinh ra.',
            'Toàn bộ phiên đăng nhập, trên mọi thiết bị.',
            'Nhật ký hoạt động, thẻ, và các thiết lập chia sẻ do bạn tạo.',
            'Lịch sử hội thoại với tính năng AI.',
          ],
        },
      ],
    },
    {
      heading: 'Những gì có thể còn lại, và vì sao',
      blocks: [
        {
          type: 'ul',
          items: [
            'Chứng từ giao dịch thanh toán — pháp luật về kế toán và thuế buộc chúng tôi giữ lại trong một thời hạn nhất định. Các bản ghi này không còn dùng để nhận diện bạn trong dịch vụ.',
            'Tệp mà người khác đã tự tạo bản sao vào ổ đĩa của họ trước khi bạn xoá — bản sao đó thuộc về họ, chúng tôi không xoá dữ liệu của người khác.',
            'Bản sao lưu hệ thống và bản ghi máy chủ có thể còn chứa dữ liệu cũ trong một thời gian ngắn trước khi bị ghi đè theo chu kỳ.',
          ],
        },
      ],
    },
    {
      heading: 'Chỉ muốn xoá một phần?',
      blocks: [
        {
          type: 'p',
          text: 'Không cần xoá cả tài khoản: bạn xoá riêng từng tệp hoặc thư mục được (chuyển vào thùng rác, hoặc xoá vĩnh viễn ngay), thu hồi riêng từng liên kết chia sẻ, xoá riêng từng hội thoại AI, và thu hồi riêng từng phiên đăng nhập trong phần Hồ sơ. Tệp trong thùng rác tự xoá vĩnh viễn sau 30 ngày.',
        },
      ],
    },
  ],
};

export default { privacy, terms, dataDeletion };
