import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Service Worker chạy trong ngữ cảnh riêng: có `self`, `caches`, `clients`,
    // không có `window` lẫn `document`. Không khai ở đây thì `no-undef` báo đỏ
    // mọi API của nó — và tệ hơn, nó sẽ KHÔNG báo khi ta lỡ dùng `window`.
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
