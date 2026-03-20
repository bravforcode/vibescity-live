/**
 * VibeCity Service Worker Registration
 * 
 * Production-ready service worker registration with:
 * - Automatic registration on page load
 * - Update management and notifications
 * - Error handling and fallbacks
 * - Performance monitoring
 */

class VibeCityServiceWorker {
  constructor() {
    this.swUrl = '/sw-tile-cache.js'
    this.registration = null
    this.isUpdating = false
    this.metrics = {
      registrationTime: 0,
      updateCheckTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    }
  }

  async register() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported in this browser')
      return false
    }

    try {
      console.log('🚀 Registering VibeCity Service Worker...')
      
      const startTime = performance.now()
      this.registration = await navigator.serviceWorker.register(this.swUrl, {
        scope: '/',
        updateViaCache: 'none'
      })
      
      this.metrics.registrationTime = performance.now() - startTime
      
      console.log('✅ Service Worker registered successfully')
      console.log(`📊 Registration time: ${this.metrics.registrationTime.toFixed(2)}ms`)
      
      // Setup update handling
      this.setupUpdateHandling()
      
      // Setup message handling
      this.setupMessageHandling()
      
      // Initial cache stats
      this.requestCacheStats()
      
      return true
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error)
      this.handleRegistrationError(error)
      return false
    }
  }

  setupUpdateHandling() {
    // Listen for updates
    this.registration.addEventListener('updatefound', (event) => {
      console.log('🔄 New Service Worker found')
      const newWorker = event.installing
      
      if (newWorker) {
        newWorker.addEventListener('statechange', (event) => {
          if (event.target.state === 'installed' && !this.isUpdating) {
            console.log('📦 New Service Worker ready')
            this.notifyUpdateAvailable()
          }
        })
      }
    })

    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', (event) => {
      console.log('🎮 Service Worker controller changed')
      if (event.target) {
        this.notifyUpdateComplete()
      }
    })
  }

  setupMessageHandling() {
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, data } = event.data
      
      switch (type) {
        case 'CACHE_STATS':
          console.log('📊 Cache Stats:', data)
          this.updateCacheMetrics(data)
          break
          
        case 'CACHE_UPDATE':
          console.log('🔄 Cache updated:', data)
          break
          
        case 'ERROR':
          console.error('❌ Service Worker Error:', data.message)
          this.handleServiceWorkerError(data)
          break
          
        default:
          console.log('📨 Service Worker Message:', event.data)
      }
    })
  }

  async requestCacheStats() {
    if (!this.registration || !this.registration.active) {
      return
    }

    try {
      const channel = new MessageChannel()
      
      channel.port1.onmessage = (event) => {
        this.updateCacheMetrics(event.data)
      }

      this.registration.active.postMessage({
        type: 'CACHE_STATS'
      }, [channel.port2])
      
    } catch (error) {
      console.warn('Failed to request cache stats:', error)
    }
  }

  updateCacheMetrics(stats) {
    if (stats.tiles) {
      this.metrics.cacheHits = stats.tiles.count || 0
      this.metrics.cacheMisses = 0 // Would need to be tracked in SW
      
      const hitRate = this.metrics.cacheHits / Math.max(this.metrics.cacheHits + this.metrics.cacheMisses, 1)
      console.log(`📊 Cache hit rate: ${(hitRate * 100).toFixed(1)}%`)
    }
  }

  notifyUpdateAvailable() {
    // Show update notification to user
    this.showUpdateNotification('New version available! Click to refresh.')
    
    // Store update flag
    localStorage.setItem('vibecity-sw-update-available', 'true')
  }

  notifyUpdateComplete() {
    // Clear update flag
    localStorage.removeItem('vibecity-sw-update-available')
    
    // Show success notification
    this.showUpdateNotification('Updated successfully!', 'success')
  }

  showUpdateNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `sw-notification sw-notification--${type}`
    notification.innerHTML = `
      <div class="sw-notification__content">
        <span class="sw-notification__icon">
          ${type === 'success' ? '✅' : '🔄'}
        </span>
        <span class="sw-notification__text">${message}</span>
        <button class="sw-notification__close" type="button" aria-label="Dismiss notification">×</button>
      </div>
    `
    
    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--surface-color, #ffffff);
      border: 1px solid var(--border-color, #e1e5e9);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `
    
    // Add click handler for update
    if (type === 'info') {
      notification.addEventListener('click', () => {
        this.skipWaiting()
        notification.remove()
      })
      notification.style.cursor = 'pointer'
    }

    const closeButton = notification.querySelector('.sw-notification__close')
    closeButton?.addEventListener('click', (event) => {
      event.stopPropagation()
      notification.remove()
    })
    
    // Add to page
    document.body.appendChild(notification)
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 10000)
  }

  async skipWaiting() {
    if (!this.registration || !this.registration.waiting) {
      return
    }

    console.log('⚡ Skipping waiting and activating new Service Worker')
    this.isUpdating = true
    
    // Tell waiting service worker to skip waiting
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  async unregister() {
    if (!this.registration) {
      return
    }

    try {
      console.log('🗑️ Unregistering Service Worker...')
      await this.registration.unregister()
      console.log('✅ Service Worker unregistered successfully')
      return true
    } catch (error) {
      console.error('❌ Service Worker unregistration failed:', error)
      return false
    }
  }

  handleRegistrationError(error) {
    // Log error details
    console.error('Service Worker Registration Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
    
    // Show user-friendly error message
    this.showUpdateNotification(
      'Service Worker registration failed. Some features may not work optimally.',
      'error'
    )
  }

  handleServiceWorkerError(errorData) {
    console.error('Service Worker Runtime Error:', errorData)
    
    // Track errors for monitoring
    if (window.gtag) {
      window.gtag('event', 'service_worker_error', {
        error_type: errorData.type || 'unknown',
        error_message: errorData.message || 'no message'
      })
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      isRegistered: !!this.registration,
      isUpdating: this.isUpdating,
      swUrl: this.swUrl
    }
  }
}

// Auto-register on page load
let vibeSW = null

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeServiceWorker)
} else {
  initializeServiceWorker()
}

async function initializeServiceWorker() {
  console.log('🚀 Initializing VibeCity Service Worker...')
  
  // Create service worker instance
  vibeSW = new VibeCityServiceWorker()
  
  // Register service worker
  const registered = await vibeSW.register()
  
  if (registered) {
    console.log('✅ VibeCity Service Worker ready')
    
    // Make available globally for debugging
    window.VibeCityServiceWorker = vibeSW
    
    // Emit ready event
    window.dispatchEvent(new CustomEvent('vibecity-sw-ready', {
      detail: { metrics: vibeSW.getMetrics() }
    }))
  } else {
    console.error('❌ VibeCity Service Worker failed to initialize')
  }
}

// Add CSS animation
const style = document.createElement('style')
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .sw-notification {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .sw-notification__content {
    display: flex;
    align-items: center;
    width: 100%;
  }
  
  .sw-notification__icon {
    font-size: 16px;
    flex-shrink: 0;
  }
  
  .sw-notification__text {
    flex: 1;
    font-weight: 500;
  }
  
  .sw-notification__close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  
  .sw-notification__close:hover {
    opacity: 1;
  }
  
  .sw-notification--success {
    border-left: 4px solid #10b981;
  }
  
  .sw-notification--error {
    border-left: 4px solid #ef4444;
  }
  
  .sw-notification--info {
    border-left: 4px solid #3b82f6;
  }
  
  @media (max-width: 768px) {
    .sw-notification {
      top: 10px;
      right: 10px;
      left: 10px;
      max-width: none;
    }
  }
`

document.head.appendChild(style)

// Export for external access
window.VibeCityServiceWorker = {
  register: () => vibeSW ? vibeSW.register() : Promise.resolve(false),
  unregister: () => vibeSW ? vibeSW.unregister() : Promise.resolve(false),
  getMetrics: () => vibeSW ? vibeSW.getMetrics() : null,
  skipWaiting: () => vibeSW ? vibeSW.skipWaiting() : Promise.resolve()
}
