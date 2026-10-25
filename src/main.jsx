import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import cloudLogo from './assets/icon/cloud-acceleration-svgrepo-com.svg'
import { registerServiceWorker } from './utils/serviceWorker'
import { installChunkErrorRecovery } from './utils/chunkReload'
import { preconnectRememberedCdn } from './utils/preconnect'
import ErrorBoundary from './components/common/ErrorBoundary'

const favicon = document.querySelector('link[rel="icon"]')
if (favicon) favicon.href = cloudLogo
const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
if (appleTouchIcon) appleTouchIcon.href = cloudLogo

// Chỉ chạy ở bản build thật, và chỉ cache byte thumbnail trên CDN — xem `public/sw.js`.
registerServiceWorker()

// Tab đang chạy bản build cũ sau một lần deploy: chunk lazy không còn trên server → tự
// tải lại một lần thay vì để trắng trang (ledger ##64).
installChunkErrorRecovery()

// Mở sẵn kết nối tới CDN thumbnail trong lúc chờ đăng nhập + danh sách tệp (##85).
preconnectRememberedCdn()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
