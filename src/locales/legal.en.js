// ─────────────────────────────────────────────────────────────────────────────
// Nội dung ba tài liệu pháp lý — bản tiếng Anh
// ─────────────────────────────────────────────────────────────────────────────
// BẢN NÀY LÀ BẢN NGƯỜI KIỂM DUYỆT ĐỌC: hồ sơ xin quyền OAuth xét bằng tiếng Anh,
// nên bản dịch này không phải "cho đủ bộ" — nó là bản mà người quyết định app có
// được bật hay không sẽ mở ra, và cũng là bản người dùng không đọc được tiếng
// Việt sẽ mở ra.
//
// PHẢI KHỚP TỪNG MỤC với `legal.vi.js` — cùng số mục, cùng thứ tự, cùng nội dung.
// Không có script nào canh hai file này (`check-i18n.mjs` chỉ soi vi.js/en.js),
// nên đây là việc phải làm bằng tay: sửa một mục ở bản Việt thì sửa đúng mục đó
// ở đây. Hai bản nói khác nhau là một vấn đề pháp lý thật, không phải lỗi giao
// diện.
//
// Xem đầu file `legal.vi.js` để biết các loại khối và các chỗ trống được điền.

const privacy = {
  title: 'Privacy Policy',
  intro:
    '{service} ({site}) is a web-based file storage and sharing service. This document states exactly what data we collect, what we use it for, who we send it to, how long we keep it, and how you ask us to delete it. If there is anything here you do not agree with, please do not create an account.',
  sections: [
    {
      heading: '1. Who processes your data',
      blocks: [
        {
          type: 'p',
          text: 'Your data is processed by the {service} operating team. For any question, access request or deletion request, write to {email}.',
        },
        {
          type: 'p',
          text: '{service} is currently an early-stage (alpha) service run by a small team. We say this plainly because it affects what you can reasonably expect from us — see section 9.',
        },
      ],
    },
    {
      heading: '2. What we collect',
      blocks: [
        {
          type: 'p',
          text: 'Only what the service needs to work. We do not buy data from third parties, we do not track you across other websites, and we run no advertising code on our pages.',
        },
        {
          type: 'table',
          head: ['Category', 'Specifically', 'Why we need it'],
          rows: [
            [
              'Account information',
              'Email address, nickname, profile picture (if you upload one).',
              'To identify the account owner, send verification codes, and show your name to people you share with.',
            ],
            [
              'Password',
              'Stored only as a bcrypt hash. We do not store and cannot read your original password.',
              'To authenticate you at sign-in.',
            ],
            [
              'Google / GitHub sign-in',
              'The user identifier issued by that provider, your email address, display name and profile picture.',
              'To create and recognise your account without you setting another password.',
            ],
            [
              'Content you upload',
              'Your files and their contents, file names, folder structure, tags, previous versions of files, and thumbnails the system generates.',
              'This is the service itself: storing your files and giving them back to you.',
            ],
            [
              'Sharing data',
              'Which files you shared with whom, view or edit permissions, the share links you create, and members of shared drives.',
              'To enforce exactly the access you configured.',
            ],
            [
              'Activity log',
              'Actions on files (upload, rename, move, delete, share, restore) with timestamps.',
              'So you can trace who did what to a file in a shared drive, and so we can investigate incidents.',
            ],
            [
              'Sign-in sessions',
              'IP address, browser identification string (user-agent), sign-in time and last-used time for each device.',
              'To show you the list of signed-in devices so you can revoke unfamiliar ones, and to detect abnormal access.',
            ],
            [
              'AI feature usage',
              'The questions you send, the answers returned, and usage counts for quota.',
              'To show your conversations back to you and to enforce plan quotas.',
            ],
            [
              'Payment transactions',
              'Order reference, amount, status, plan purchased, timestamp. We do NOT receive and do NOT store your card number or bank account details.',
              'To confirm your payment and unlock the right quota.',
            ],
          ],
        },
        {
          type: 'note',
          text: 'About Google and GitHub sign-in: we request only your email address and public profile information. We do NOT read your Google Drive files, your private repositories or any other data held there, and we never post or change anything on that account. If your account does not provide an email address, we cannot create an account and will ask you to use another sign-in method.',
        },
      ],
    },
    {
      heading: '3. What we use your data for',
      blocks: [
        {
          type: 'ul',
          items: [
            'Providing the service: receiving, storing, returning and sharing your files according to the permissions you set.',
            'Authentication and account protection: checking passwords, sending one-time verification codes (OTP) by email, and blocking automated sign-up and sign-in with a CAPTCHA.',
            'Enforcing quotas: storage used, AI usage, and which plan is active.',
            'Processing payments and giving you your order details.',
            'Sending mail directly related to your account: verification codes, password resets, and notices about important service changes.',
            'Detecting and preventing abuse: malicious files, automated behaviour, and attempts to bypass quotas.',
            'Responding to lawful requests from competent authorities where we are required to.',
          ],
        },
        {
          type: 'p',
          text: 'We do NOT sell your data, do NOT rent it out, do NOT use the contents of your files to train AI models, and do NOT use your data for ad targeting.',
        },
      ],
    },
    {
      heading: '4. Our legal basis for processing',
      blocks: [
        {
          type: 'ul',
          items: [
            'Performance of our contract with you — most of our processing falls here: with no file storage there is no service to speak of.',
            'Your consent — given when you tick the box accepting these terms and this policy at sign-up, and when you actively use the AI feature. You may withdraw consent at any time by stopping use of that feature or by deleting your account.',
            'Legitimate interests — protecting the system from abuse and keeping logs to investigate incidents.',
            'Legal obligations — retaining transaction records as required, and providing information in response to lawful requests.',
          ],
        },
        {
          type: 'p',
          text: 'For users in Vietnam, we process personal data in accordance with Decree 13/2023/ND-CP on personal data protection.',
        },
      ],
    },
    {
      heading: '5. Who we share data with',
      blocks: [
        {
          type: 'p',
          text: 'We use a number of infrastructure providers to run the service. They only receive the data their specific job requires, and may not use it for their own purposes.',
        },
        {
          type: 'table',
          head: ['Provider', 'What they receive', 'What for'],
          rows: [
            [
              'Google Cloud Storage, Cloudflare R2, Backblaze B2',
              'The files you upload and their thumbnails.',
              'File storage. Depending on your plan and the file, your data sits in one of these three.',
            ],
            [
              'Google Cloud Vertex AI (Gemini)',
              'Document contents and your question — ONLY when you actively click "Ask AI" on a file.',
              'Generating the answer. If fact-checking via Google Search is enabled, your question may also be used for a web lookup.',
            ],
            [
              'Cloudflare Turnstile',
              'Your IP address and technical browser signals at the moment you sign up or sign in.',
              'Telling humans from bots. It uses no image puzzles and does not track you across sites.',
            ],
            [
              'Resend',
              'Your email address and the contents of system mail.',
              'Sending verification codes, password reset mail and system notices.',
            ],
            [
              'payOS',
              'Order details, plus whatever payment data you enter directly on their page.',
              'Collecting payment. Your card and bank details go straight to payOS and never pass through our servers.',
            ],
            [
              'Heroku (server) and Vercel (web front end)',
              'All traffic passes through their infrastructure.',
              'Running the server and delivering the website.',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Beyond the list above, we disclose data only on a lawful request from a competent authority, or where necessary to protect the rights and safety of other users.',
        },
        {
          type: 'p',
          text: 'These providers operate infrastructure in various parts of the world, so your data may be stored and processed outside Vietnam.',
        },
      ],
    },
    {
      heading: '6. How long we keep data',
      blocks: [
        {
          type: 'table',
          head: ['Type of data', 'Retention'],
          rows: [
            [
              'Files in the trash',
              'Permanently deleted automatically 30 days after you move them to the trash. Until then you can restore them.',
            ],
            [
              'Active files and folders',
              'Kept until you delete them, or until you delete your account.',
            ],
            [
              'One-time verification codes (OTP)',
              'Live at most 10 minutes in temporary storage, then disappear on their own.',
            ],
            [
              'Sign-in sessions',
              'Expire after 2 days of inactivity, and after at most 30 days from sign-in even with continuous use. You can revoke them manually at any time.',
            ],
            [
              'File activity logs',
              'Kept with the file; deleted with the file or with the account.',
            ],
            [
              'AI conversation history',
              'Kept until you delete the conversation or delete your account.',
            ],
            [
              'Transaction records',
              'Kept for the period required by accounting and tax law, including after you delete your account.',
            ],
          ],
        },
      ],
    },
    {
      heading: '7. Your rights',
      blocks: [
        {
          type: 'ul',
          items: [
            'View and change your account information (nickname, profile picture, password) in the Profile section.',
            'Download your files to your own device at any time.',
            'See the list of signed-in devices and revoke individual sessions or all other sessions.',
            'Turn off discovery by email address, under Settings → Privacy & Security.',
            'Permanently delete your account and all its data — see section 8.',
            'Disconnect Google or GitHub by deleting your {service} account, or by removing the app in that provider’s own settings.',
            'Withdraw consent, object to processing, or request a copy of your data — write to {email}.',
          ],
        },
        {
          type: 'p',
          text: 'We answer personal data requests within 30 days. If you believe we have handled your data improperly, you have the right to complain to the competent state authority for personal data protection.',
        },
      ],
    },
    {
      heading: '8. Data deletion',
      blocks: [
        {
          type: 'p',
          text: 'You can delete all of your data yourself, without asking anyone and without waiting for us to process it by hand. Step-by-step instructions — including how to request deletion when you can no longer sign in — are on the Data Deletion Instructions page.',
        },
        {
          type: 'p',
          text: 'When you delete your account we delete the account record, every file and file version belonging to you on the storage systems, your profile picture, your sign-in sessions, activity logs, AI history and the sharing settings you created. This CANNOT be undone.',
        },
      ],
    },
    {
      heading: '9. How we protect your data',
      blocks: [
        {
          type: 'ul',
          items: [
            'All connections use HTTPS.',
            'Passwords are stored only as bcrypt hashes, never in the clear.',
            'Two-step sign-in: even with the correct password you must enter a code sent to your email.',
            'Your session lives in an HttpOnly cookie that page JavaScript cannot read; access tickets are short-lived (15 minutes) and refresh themselves.',
            'Cloudflare CAPTCHA blocks automated sign-up and sign-in.',
            'File preview links are time-limited and die on expiry.',
          ],
        },
        {
          type: 'note',
          text: '{service} is in alpha. No system is perfectly secure and we do not claim otherwise. For data you cannot afford to lose, please always keep a copy elsewhere.',
        },
      ],
    },
    {
      heading: '10. Cookies and browser storage',
      blocks: [
        {
          type: 'ul',
          items: [
            'One HttpOnly cookie holds your sign-in session. Without it you would have to sign in again every 15 minutes.',
            'Your browser’s local storage holds display preferences: language, light/dark theme, startup page, and whether keyboard shortcuts are on.',
            'Cloudflare Turnstile sets its own technical data while the verification widget runs.',
          ],
        },
        {
          type: 'p',
          text: 'We use no advertising cookies and embed no ad-network tracking code.',
        },
      ],
    },
    {
      heading: '11. Children',
      blocks: [
        {
          type: 'p',
          text: '{service} is not intended for anyone under 16. If you are under 16, please do not create an account. If we learn that an account belongs to someone under 16, we will delete it. Parents or guardians who find that their child has created an account should contact {email} and we will delete it.',
        },
      ],
    },
    {
      heading: '12. Changes to this policy',
      blocks: [
        {
          type: 'p',
          text: 'When the substance changes, we update the effective date at the top of this page and notify you in the app or by email before the change takes effect. Continuing to use the service after that date means you accept the new version.',
        },
      ],
    },
    {
      heading: '13. Contact',
      blocks: [
        {
          type: 'p',
          text: 'For any question or request about personal data, write to {email}. We respond within 30 days.',
        },
      ],
    },
  ],
};

const terms = {
  title: 'Terms of Service',
  intro:
    'This is an agreement between you and {service} ({site}). By creating an account or using the service, you confirm that you have read and agree to the terms below together with the Privacy Policy.',
  sections: [
    {
      heading: '1. Accepting these terms',
      blocks: [
        {
          type: 'p',
          text: 'You must tick the consent box before you can create an account. If you do not agree with anything here, please do not use the service.',
        },
        {
          type: 'p',
          text: 'You must be at least 16 years old, or old enough to enter a contract under the law where you live — whichever is higher.',
        },
      ],
    },
    {
      heading: '2. Your account',
      blocks: [
        {
          type: 'ul',
          items: [
            'The information you give us must be accurate, and you keep it accurate.',
            'You are responsible for keeping your password and verification codes private, and for everything that happens under your account.',
            'Do not share your account with others, and do not sell or transfer it.',
            'If you suspect someone else has access to your account, change your password, revoke the active sessions, and tell us at {email}.',
          ],
        },
      ],
    },
    {
      heading: '3. Your content stays yours',
      blocks: [
        {
          type: 'p',
          text: 'You keep all rights to the files you upload. We claim no ownership of your content.',
        },
        {
          type: 'p',
          text: 'To be able to run the service, you grant us a limited right to store, copy (for backup and versioning), transmit, generate thumbnails of, and display your content to you and to the people you have shared it with. This right exists only to provide the service and ends when you delete that content or your account.',
        },
        {
          type: 'p',
          text: 'You confirm that you hold the rights to what you upload and that uploading it infringes nobody else’s rights.',
        },
      ],
    },
    {
      heading: '4. What you must not do',
      blocks: [
        {
          type: 'ul',
          items: [
            'Upload or share content that breaks Vietnamese law or infringes anyone’s rights (copyright, trademark, privacy).',
            'Store or distribute malware, malicious executables, or attack tooling.',
            'Use the service for spam, fraud, impersonation, or as a relay for hateful or violent content.',
            'Child sexual abuse material — we remove it immediately, permanently ban the account and report it to the authorities.',
            'Deliberately bypass quotas: circumventing storage limits, mass-creating accounts, or calling the API automatically outside normal use.',
            'Probe, scan or exploit vulnerabilities in the system without our prior written consent. If you find a vulnerability, please report it to {email} — we will be grateful.',
            'Use the service as a file delivery backend for another website or application.',
          ],
        },
        {
          type: 'p',
          text: 'We may remove infringing content and suspend the accounts involved. For serious or repeated violations we terminate the account without refunding amounts already paid.',
        },
      ],
    },
    {
      heading: '5. Sharing files',
      blocks: [
        {
          type: 'p',
          text: 'When you share a file — with a specific email address or via a public link — you decide who can see what. Anyone holding a public link can open the file until you revoke that link. Think before you post such a link somewhere public.',
        },
      ],
    },
    {
      heading: '6. Plans and payment',
      blocks: [
        {
          type: 'ul',
          items: [
            'New accounts get a free storage quota. Quotas and prices for paid plans are shown in the app before you pay.',
            'Payments are processed by payOS. Your card or bank details are received by payOS and never pass through our servers.',
            'A plan takes effect as soon as payment succeeds and lapses at the end of the paid period.',
            'You may cancel at any time; cancelling stops the next period and does not refund the remainder of the current one, unless the law requires otherwise.',
            'If your plan lapses while your data exceeds the free quota, you can still download your files but cannot upload more until you bring usage back under the limit.',
          ],
        },
      ],
    },
    {
      heading: '7. AI features',
      blocks: [
        {
          type: 'p',
          text: 'When you click "Ask AI" on a file, that file’s contents and your question are sent to Google Cloud Vertex AI to generate an answer. This happens only when you actively click; it never runs on a file by itself.',
        },
        {
          type: 'p',
          text: 'Model-generated answers CAN BE WRONG or incomplete. Do not rely on them instead of legal, medical, financial or any other professional advice. You are responsible for acting on those answers. Do not send documents through the AI feature if you are not permitted to pass them to a third party.',
        },
        {
          type: 'p',
          text: 'Each plan has its own AI usage quota. When it runs out, the feature pauses until the next period.',
        },
      ],
    },
    {
      heading: '8. The service is provided "as is"',
      blocks: [
        {
          type: 'note',
          text: '{service} is in alpha. We provide the service on an "as is" basis, with no guarantee that it is always available, no guarantee that it is free of defects, and no guarantee that data will never be lost. PLEASE KEEP YOUR OWN COPY of anything important to you.',
        },
        {
          type: 'p',
          text: 'To the extent the law permits, we are not liable for indirect damages, lost profits, lost business opportunity or lost data arising from your use of the service. Where a liability cap must be set, it is the amount you have paid us in the preceding 12 months.',
        },
        {
          type: 'p',
          text: 'We may change, suspend or discontinue a feature. If we discontinue a significant part of the service, we will give notice beforehand and time for you to download your data.',
        },
      ],
    },
    {
      heading: '9. Stopping and deleting your account',
      blocks: [
        {
          type: 'p',
          text: 'You can stop whenever you like: delete your account in the Profile section and all of your data is permanently deleted. See the Data Deletion Instructions page.',
        },
        {
          type: 'p',
          text: 'We may suspend or delete your account if you breach these terms, or where the law requires us to. Except for serious breaches, we will give notice and a chance to download your data.',
        },
      ],
    },
    {
      heading: '10. Changes to these terms',
      blocks: [
        {
          type: 'p',
          text: 'When we amend these terms we update the effective date at the top of the page. For changes that reduce your rights we give advance notice in the app or by email. Continuing to use the service after the effective date means you accept the new version; if you disagree, you may delete your account.',
        },
      ],
    },
    {
      heading: '11. Governing law',
      blocks: [
        {
          type: 'p',
          text: 'These terms are governed by the laws of Vietnam. Disputes will first be addressed through negotiation; where negotiation fails, they go to a competent court in Vietnam.',
        },
      ],
    },
    {
      heading: '12. Contact',
      blocks: [
        {
          type: 'p',
          text: 'Questions about these terms? Write to {email}.',
        },
      ],
    },
  ],
};

const dataDeletion = {
  title: 'Data Deletion Instructions',
  intro:
    'You have the right to permanently delete your {service} account and all data attached to it. This page explains how, and what happens afterwards.',
  sections: [
    {
      heading: 'Option 1 — Delete it yourself in the app (fastest)',
      blocks: [
        {
          type: 'ol',
          items: [
            'Sign in at {site}.',
            'Click your profile picture in the top right corner and choose Profile.',
            'Scroll to the bottom and find the "Delete account" section.',
            'Enter your password to confirm (accounts that sign in with Google or GitHub skip this step), then confirm the deletion.',
          ],
        },
        {
          type: 'p',
          text: 'Deletion happens immediately. There is no waiting period, and it CANNOT be undone.',
        },
      ],
    },
    {
      heading: 'Option 2 — Request it by email',
      blocks: [
        {
          type: 'p',
          text: 'If you can no longer sign in — you lost your password, lost access to your email, or already removed the app from Google / GitHub — write to {email} with the subject "Data deletion request".',
        },
        {
          type: 'p',
          text: 'In your message, tell us the email address you registered with and how you signed in (email and password, or Google / GitHub). We must verify that you are the account owner before deleting anything — this is what stops someone else from deleting your data.',
        },
        {
          type: 'p',
          text: 'We process requests within 30 days and send you a confirmation when it is done.',
        },
      ],
    },
    {
      heading: 'Removing Google / GitHub access',
      blocks: [
        {
          type: 'p',
          text: 'Deleting your {service} account already severs the link between {service} and your Google or GitHub account. If you want to tidy up on the provider’s side as well: for Google go to your Google Account → Security → Third-party apps; for GitHub go to Settings → Applications → Authorized OAuth Apps, select {service}, and remove it.',
        },
        {
          type: 'note',
          text: 'Removing the app on the provider’s side only stops them from sharing further information with us. It does NOT delete your {service} account by itself — to delete your data you still need Option 1 or Option 2 above.',
        },
      ],
    },
    {
      heading: 'What gets deleted',
      blocks: [
        {
          type: 'ul',
          items: [
            'The account record: email, nickname, hashed password, and the identifier from Google / GitHub.',
            'Every file and every previous version of every file belonging to you, removed from the storage systems.',
            'Your profile picture and any generated thumbnails.',
            'All sign-in sessions, on every device.',
            'Activity logs, tags, and the sharing settings you created.',
            'Your AI conversation history.',
          ],
        },
      ],
    },
    {
      heading: 'What may remain, and why',
      blocks: [
        {
          type: 'ul',
          items: [
            'Payment transaction records — accounting and tax law require us to keep them for a set period. These records are no longer used to identify you within the service.',
            'Files that other people copied into their own drives before you deleted yours — that copy belongs to them, and we do not delete other people’s data.',
            'System backups and server logs may still contain older data for a short time before being overwritten on their normal cycle.',
          ],
        },
      ],
    },
    {
      heading: 'Only want to delete part of it?',
      blocks: [
        {
          type: 'p',
          text: 'You do not have to delete the whole account: you can delete individual files or folders (to the trash, or permanently right away), revoke individual share links, delete individual AI conversations, and revoke individual sessions in the Profile section. Files in the trash are permanently deleted automatically after 30 days.',
        },
      ],
    },
  ],
};

export default { privacy, terms, dataDeletion };
