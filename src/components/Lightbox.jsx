import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react'
import { dateParts } from '../lib/date'
import { imageUrl } from '../lib/image'
import { lockScroll } from '../lib/scrollLock'
import Markdown from './Markdown'
import { TagPill } from './ui'

export default function Lightbox({ state, tagMap, onClose, onNavigate, onJump }) {
  const entry = state?.entry
  const index = state?.index ?? 0
  const images = entry?.images || []
  const total = images.length
  const image = images[index]

  const handlers = useRef({ onClose, onNavigate })
  handlers.current = { onClose, onNavigate }

  useEffect(() => {
    if (!state) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') handlers.current.onClose()
      if (event.key === 'ArrowLeft') handlers.current.onNavigate(-1)
      if (event.key === 'ArrowRight') handlers.current.onNavigate(1)
    }
    document.addEventListener('keydown', onKey)
    const unlock = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [state])

  if (!state || !entry || !image) return null

  const parts = dateParts(entry.date)
  const location = entry.location || {}
  const tags = (entry.tags || []).map((id) => tagMap.get(id)).filter(Boolean)

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-ink/95 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3 text-white/90 sm:px-6">
        <div className="min-w-0">
          <div className="text-sm font-black sm:text-base">
            {parts.month}月{parts.day}日
            <span className="ml-2 text-xs font-medium text-white/60">{parts.weekday}</span>
          </div>
          <div className="truncate text-[11px] text-white/50">{parts.year} 年</div>
        </div>
        <div className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80">
          {index + 1} / {total}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3 sm:px-6 sm:pb-6">
          <img
            key={image.key}
            src={imageUrl(image.key)}
            alt=""
            className="max-h-[46dvh] max-w-full animate-fade-in rounded-2xl object-contain shadow-2xl lg:max-h-[82vh]"
          />

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                aria-label="上一张"
                className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:left-4"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(1)}
                aria-label="下一张"
                className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:right-4"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>

        <aside className="max-h-[44dvh] shrink-0 overflow-y-auto rounded-t-[26px] bg-paper px-5 pb-safe pt-5 sm:px-6 lg:max-h-none lg:w-[380px] lg:rounded-none lg:rounded-l-[26px]">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
            <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-muted">
              {index + 1} / {total}
            </span>
          </div>

          <h3 className="mt-2.5 text-lg font-black leading-snug sm:text-xl">
            {entry.title || `${parts.short}的探店`}
          </h3>

          {(location.name || location.address) && (
            <div className="mt-2.5 flex items-start gap-1.5 text-xs text-muted">
              <MapPin size={14} className="mt-0.5 shrink-0 text-coral" />
              <span>
                {location.name}
                {location.name && location.address ? ' · ' : ''}
                {location.address}
              </span>
            </div>
          )}

          {entry.content && <Markdown source={entry.content} className="mt-3.5" />}

          <button
            type="button"
            onClick={() => onJump(entry.date)}
            className="mt-5 w-full rounded-full bg-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-ink/85"
          >
            在时间轴中查看这一天
          </button>
        </aside>
      </div>
    </div>
  )
}
