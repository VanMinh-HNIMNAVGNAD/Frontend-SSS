import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import cloudLogo from './assets/icon/cloud-acceleration-svgrepo-com.svg'

const favicon = document.querySelector('link[rel="icon"]')
if (favicon) favicon.href = cloudLogo
const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
if (appleTouchIcon) appleTouchIcon.href = cloudLogo

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
