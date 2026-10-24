import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initializeTelegram } from './telegram'

function isTelegramLaunch() {
  return window.location.hash.includes('tgWebAppData=') || new URLSearchParams(window.location.search).has('tgWebAppData')
}

function loadTelegramSdk() {
  if (!isTelegramLaunch() || window.Telegram?.WebApp) return Promise.resolve()
  return new Promise<void>(resolve => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js?59'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

async function bootstrap() {
  await loadTelegramSdk()
  initializeTelegram()

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
    })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>,
  )
}

void bootstrap()
