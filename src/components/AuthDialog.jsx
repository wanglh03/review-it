import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react'
import { Modal } from './ui'

export default function AuthDialog({ open, scope, onClose, onVerify }) {
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setSecret('')
    setError('')
    setBusy(false)
    setShow(false)
    const timer = setTimeout(() => inputRef.current?.focus(), 180)
    return () => clearTimeout(timer)
  }, [open, scope])

  const isAdd = scope === 'add'

  const submit = async (event) => {
    event.preventDefault()
    if (busy || !secret.trim()) return
    setBusy(true)
    setError('')
    try {
      await onVerify(secret.trim())
    } catch (err) {
      setError(err?.message || '验证失败，请重试')
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isAdd ? '输入 PIN 码' : '输入编辑密码'}
      subtitle={isAdd ? '验证通过后才可以添加新的记录' : '修改、删除记录和标签都需要它'}
      icon={<Lock size={20} />}
      maxWidth="max-w-sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="relative">
          <KeyRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            inputMode={isAdd ? 'numeric' : 'text'}
            autoComplete="off"
            maxLength={32}
            placeholder={isAdd ? '请输入 PIN 码' : '请输入编辑密码'}
            className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-11 text-base font-semibold tracking-wide outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-muted/60 focus:border-coral focus:ring-4 focus:ring-coral/10"
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? '隐藏密码' : '显示密码'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {error && (
          <p className="rounded-2xl bg-rose/30 px-3.5 py-2.5 text-sm font-semibold text-[#a53f35]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !secret.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-coral px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              正在验证…
            </>
          ) : (
            <>
              <Lock size={17} />
              解锁
            </>
          )}
        </button>

        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <span className="mt-0.5 shrink-0">🔒</span>
          码只会在你的设备上经过 PBKDF2 加密后再发送，服务端保存的是不可逆摘要，不会明文保存或下发。
        </p>
      </form>
    </Modal>
  )
}
