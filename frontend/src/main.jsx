import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './app/App.jsx'
import { AppErrorBoundary } from './components/common/AppErrorBoundary.jsx'
import { safeSessionStorage } from './utils/safeStorage.js'

const DEVELOPMENT_WORKER_RELOAD_KEY = 'hts:development-worker-reload'

const clearDevelopmentAppShellCache = async () => {
  if (!import.meta.env.DEV || !('caches' in window)) return

  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith('hts-pwa-'))
      .map((cacheName) => caches.delete(cacheName)),
  )
}

const isDevelopmentServiceWorker = (worker) =>
  Boolean(worker?.scriptURL && new URL(worker.scriptURL).searchParams.get('mode') === 'development')

const waitForDevelopmentServiceWorker = () => {
  if (isDevelopmentServiceWorker(navigator.serviceWorker.controller)) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId
    const finish = () => {
      window.clearTimeout(timeoutId)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      resolve()
    }
    const handleControllerChange = () => {
      if (!isDevelopmentServiceWorker(navigator.serviceWorker.controller)) return
      finish()
    }
    timeoutId = window.setTimeout(finish, 3_000)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
  })
}

const registerDevelopmentServiceWorker = async () => {
  const previousController = navigator.serviceWorker.controller
  const hasLegacyController = Boolean(previousController) && !isDevelopmentServiceWorker(previousController)

  if (hasLegacyController) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  await clearDevelopmentAppShellCache()
  await navigator.serviceWorker.register('/sw.js?mode=development')

  if (!hasLegacyController) {
    safeSessionStorage.removeItem(DEVELOPMENT_WORKER_RELOAD_KEY)
    return
  }

  await waitForDevelopmentServiceWorker()
  if (safeSessionStorage.getItem(DEVELOPMENT_WORKER_RELOAD_KEY)) return
  safeSessionStorage.setItem(DEVELOPMENT_WORKER_RELOAD_KEY, '1')
  window.location.reload()
}

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      registerDevelopmentServiceWorker().catch(() => {})
      return
    }

    safeSessionStorage.removeItem(DEVELOPMENT_WORKER_RELOAD_KEY)
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

registerServiceWorker()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Error Boundary ngoài cùng: lỗi ở provider/router/khởi tạo phiên vẫn có màn hình lỗi thay vì trắng trang. */}
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
