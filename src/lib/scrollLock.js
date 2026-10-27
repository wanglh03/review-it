/**
 * 全局滚动锁。
 *
 * 弹窗的 effect 会因为 onClose 每次渲染都是新函数而反复执行，
 * 如果各自记录 / 还原 body.overflow，就会把 "hidden" 当成原始值记下来，
 * 关掉弹窗后页面再也滚不动。这里用计数 + 只记录一次原始值来避免。
 */
let lockCount = 0
let previousOverflow = ''

export function lockScroll() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
  return () => {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow
      previousOverflow = ''
    }
  }
}
