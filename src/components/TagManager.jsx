import { useEffect, useRef, useState } from 'react'
import { GripVertical, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from './ui'

export default function TagManager({ open, tags, token, onClose, onSaved }) {
  const [draft, setDraft] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const dragRef = useRef({ index: null })
  const rowRefs = useRef([])

  useEffect(() => {
    if (!open) return
    setDraft(tags.map((tag) => ({ ...tag })))
    setBusy(false)
    setError('')
  }, [open, tags])

  const update = (index, patch) =>
    setDraft((list) => list.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)))
  const remove = (index) => setDraft((list) => list.filter((_, i) => i !== index))
  const add = () => setDraft((list) => [...list, { id: '', name: '', emoji: '🍽️' }])

  /** 鼠标 / 手指按住左侧手柄上下滑动排序 */
  const startDrag = (event, index) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    dragRef.current.index = index
    setDragIndex(index)

    const onMove = (moveEvent) => {
      const from = dragRef.current.index
      if (from === null) return
      let target = from
      rowRefs.current.forEach((node, rowIndex) => {
        if (!node) return
        const rect = node.getBoundingClientRect()
        if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) target = rowIndex
      })
      if (target === from) return
      setDraft((list) => {
        const next = [...list]
        const [item] = next.splice(from, 1)
        next.splice(target, 0, item)
        return next
      })
      dragRef.current.index = target
      setDragIndex(target)
    }

    const stop = () => {
      dragRef.current.index = null
      setDragIndex(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const save = async () => {
    if (busy) return
    const cleaned = draft
      .map((tag) => ({
        id: tag.id,
        name: tag.name.trim(),
        emoji: tag.emoji.trim(),
      }))
      .filter((tag) => tag.name)

    if (!cleaned.length) {
      setError('至少保留一个标签')
      return
    }
    if (cleaned.length > 30) {
      setError('最多 30 个标签')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await api.saveTags(cleaned, token)
      onSaved(result.tags)
    } catch (err) {
      setError(err.message || '保存失败，请重试')
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="维护标签"
      subtitle="拖动左侧手柄可以调整顺序，也可以改名、换 emoji、增删标签"
      icon={<Settings2 size={20} />}
      maxWidth="max-w-md"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm font-bold text-ink transition hover:bg-cream disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-full bg-coral px-4 py-3 text-base font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            保存标签
          </button>
        </div>
      }
    >
      <div className="space-y-2.5">
        {draft.map((tag, index) => (
          <div
            key={tag.id || `new-${index}`}
            ref={(node) => {
              rowRefs.current[index] = node
            }}
            className={`flex items-center gap-1.5 rounded-2xl border bg-white p-2 transition ${
              dragIndex === index
                ? 'border-coral shadow-soft ring-2 ring-coral/10'
                : 'border-line'
            }`}
          >
            <button
              type="button"
              onPointerDown={(event) => startDrag(event, index)}
              aria-label="拖动排序"
              title="按住拖动排序"
              className="flex h-10 w-7 shrink-0 touch-none items-center justify-center rounded-lg text-muted/60 transition hover:bg-cream hover:text-ink active:cursor-grabbing"
            >
              <GripVertical size={17} />
            </button>
            <input
              value={tag.emoji}
              onChange={(event) => update(index, { emoji: event.target.value })}
              maxLength={4}
              aria-label="标签 emoji"
              className="h-10 w-12 shrink-0 rounded-xl bg-cream text-center text-lg outline-none transition focus:ring-2 focus:ring-coral/25"
            />
            <input
              value={tag.name}
              onChange={(event) => update(index, { name: event.target.value })}
              maxLength={12}
              placeholder="标签名，比如 美食"
              aria-label="标签名"
              className="min-w-0 flex-1 rounded-xl bg-cream px-3 py-2.5 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-muted/50 focus:ring-2 focus:ring-coral/25"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="删除标签"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-rose/40 hover:text-[#b4453a]"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-bold text-muted transition hover:border-peach hover:text-coral-deep"
        >
          <Plus size={15} />
          添加标签
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-rose/30 px-3.5 py-2.5 text-sm font-semibold text-[#a53f35]">
          {error}
        </p>
      )}

      <p className="mt-4 rounded-2xl bg-cream px-3.5 py-3 text-xs leading-relaxed text-muted">
        删除一个标签时，所有记录里对应的标签也会一起移除；改名不会影响已有记录。
      </p>
    </Modal>
  )
}
