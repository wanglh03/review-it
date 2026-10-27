import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 手机端禁止缩放：iOS Safari 对 user-scalable=no 支持不完整，
// 这里再拦截双指捏合（gesturestart）与双击放大。
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false })
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false })

let lastTouchEnd = 0
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 280) event.preventDefault()
    lastTouchEnd = now
  },
  { passive: false },
)

// 阻止 iOS 在输入框聚焦时自动放大（配合 CSS 中 16px 字号）。
document.addEventListener('focusin', (event) => {
  const target = event.target
  if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
    if (window.visualViewport && window.visualViewport.scale > 1) {
      window.visualViewport.offsetTop // 仅读取，避免页面横向位移
    }
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
