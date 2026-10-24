type BackButton = {
  show: () => void
  hide: () => void
  onClick: (callback: () => void) => void
  offClick: (callback: () => void) => void
}

type HapticFeedback = {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  selectionChanged: () => void
}

export type TelegramWebApp = {
  initData: string
  initDataUnsafe?: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
  }
  platform: string
  colorScheme: 'light' | 'dark'
  isExpanded: boolean
  BackButton: BackButton
  HapticFeedback?: HapticFeedback
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  enableClosingConfirmation?: () => void
  disableClosingConfirmation?: () => void
  disableVerticalSwipes?: () => void
  requestFullscreen?: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export function getTelegramWebApp() {
  const webApp = window.Telegram?.WebApp
  return webApp?.initData ? webApp : null
}

export function getTelegramUserName() {
  const user = getTelegramWebApp()?.initDataUnsafe?.user
  if (!user) return ''
  return [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 24)
}

export function initializeTelegram() {
  const webApp = getTelegramWebApp()
  if (!webApp) return null

  document.documentElement.classList.add('telegram-app')
  document.documentElement.dataset.telegramPlatform = webApp.platform
  webApp.setHeaderColor('#080b0d')
  webApp.setBackgroundColor('#07090a')
  webApp.expand()
  webApp.disableVerticalSwipes?.()
  return webApp
}

export function haptic(kind: 'selection' | 'success' | 'warning' | 'light' = 'light') {
  const feedback = getTelegramWebApp()?.HapticFeedback
  if (!feedback) return
  if (kind === 'selection') feedback.selectionChanged()
  else if (kind === 'success' || kind === 'warning') feedback.notificationOccurred(kind)
  else feedback.impactOccurred('light')
}
