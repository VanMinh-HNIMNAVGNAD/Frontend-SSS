import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import cloudLogo from './assets/icon/cloud-acceleration-svgrepo-com.svg'
import { registerServiceWorker } from './utils/serviceWorker'

const favicon = document.querySelector('link[rel="icon"]')
if (favicon) favicon.href = cloudLogo
const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
if (appleTouchIcon) appleTouchIcon.href = cloudLogo

// Chỉ chạy ở bản build thật, và chỉ cache byte thumbnail trên CDN — xem `public/sw.js`.
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
