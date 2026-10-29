import { useEffect, useRef } from 'react'
import { CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react'
import { lockScroll } from '../lib/scrollLock'

/* 通用弹层：桌面居中卡片，手机底部抽屉 */
export function Modal({ open, onClose, title, subtitle, icon, children, footer, maxWidth = 'max-w-lg' }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    const unlock = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || '对话框'}
        className={`relative flex max-h-[93dvh] w-full ${maxWidth} animate-pop flex-col overflow-hidden rounded-t-[30px] border border-line/60 bg-paper shadow-soft sm:max-h-[88dvh] sm:rounded-[30px]`}
      >
        {(title || onClose) && (
          <div className="flex items-start gap-3 border-b border-line/60 px-5 py-4 sm:px-7 sm:py-5">
            {icon && (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-peach/60 text-coral-deep">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-lg font-black sm:text-xl">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/50 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          {children}
        </div>
        {footer && (
          <div className="border-t border-line/60 bg-paper px-5 py-4 pb-safe sm:px-7">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, description, confirmText = '确认', danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      maxWidth="max-w-sm"
      icon={<AlertCircle size={20} />}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-full border border-line bg-white px-4 py-3 text-[15px] font-bold text-ink transition hover:bg-cream disabled:opacity-60"
          >
            再想想
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white transition disabled:opacity-60 ${
              danger ? 'bg-coral-deep hover:bg-[#c8462f]' : 'bg-coral hover:bg-coral-deep'
            }`}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {confirmText}
          </button>
        </div>
      }
    >
      <p className="text-[15px] leading-relaxed text-muted">{description}</p>
    </Modal>
  )
}

export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function Toast({ toast }) {
  if (!toast) return null
  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4 pb-safe">
      <div
        className={`flex animate-pop items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-semibold text-white shadow-soft ${
          toast.type === 'error' ? 'bg-[#b4453a]' : 'bg-ink'
        }`}
      >
        <Icon size={16} />
        {toast.message}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-line bg-paper/70 px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 animate-floaty items-center justify-center rounded-3xl bg-peach/60 text-coral-deep">
        {icon}
      </div>
      <h3 className="text-lg font-black text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function TagPill({ tag, selected, onClick, className = '' }) {
  const Component = onClick ? 'button' : 'span'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-bold transition ${
        selected
          ? 'border-coral bg-coral text-white shadow-sm shadow-coral/30'
          : 'border-line bg-white/80 text-muted hover:border-peach hover:text-coral-deep'
      } ${className}`}
    >
      {tag.emoji && <span className="text-sm leading-none">{tag.emoji}</span>}
      <span>#{tag.name}</span>
    </Component>
  )
}
