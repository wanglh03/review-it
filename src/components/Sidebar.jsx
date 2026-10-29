import { useMemo } from 'react'
import { CalendarHeart, Sparkles } from 'lucide-react'
import { dateParts } from '../lib/date'
import { hasCoords } from '../lib/geo'
import Calendar from './Calendar'

export default function Sidebar({ entries, activeDate, onJump }) {
  const stats = useMemo(() => {
    const photos = entries.reduce((sum, entry) => sum + (entry.images?.length || 0), 0)
    const places = entries.filter((entry) => hasCoords(entry.location)).length
    return { photos, places, days: entries.length }
  }, [entries])

  return (
    <aside className="hidden w-[330px] shrink-0 flex-col gap-4 lg:flex">
      <div className="sticky top-24 flex flex-col gap-4">
        <div className="overflow-hidden rounded-[30px] border border-line/70 bg-gradient-to-br from-[#fff3e6] via-paper to-[#ffeff1] p-5 shadow-card">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-coral-deep">
            <Sparkles size={14} />
            我们的小账本
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={stats.days} label="天有记录" />
            <Stat value={stats.photos} label="张照片" />
            <Stat value={stats.places} label="个地点" />
          </div>
        </div>

        <Calendar entries={entries} onJump={onJump} />

        <div className="rounded-[28px] border border-line/70 bg-paper p-4 shadow-card">
          <div className="mb-2 flex items-center gap-1.5 px-1.5 text-sm font-black text-ink/80">
            <CalendarHeart size={15} className="text-coral" />
            全部记录
          </div>
          <div className="no-scrollbar max-h-[38vh] space-y-0.5 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const parts = dateParts(entry.date)
              const active = entry.date === activeDate
              return (
                <button
                  key={entry.date}
                  type="button"
                  onClick={() => onJump(entry.date)}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition ${
                    active ? 'bg-peach/60' : 'hover:bg-cream'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-black leading-none ${
                      active ? 'bg-coral text-white' : 'bg-cream text-ink/70'
                    }`}
                  >
                    <span>{parts.month}</span>
                    <span className="text-xs">{parts.day}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {entry.title || (entry.content ? entry.content.slice(0, 18) : '照片记录')}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {parts.weekday}
                      {entry.location?.name ? ` · ${entry.location.name}` : ''}
                      {entry.images?.length ? ` · ${entry.images.length} 图` : ''}
                    </span>
                  </span>
                </button>
              )
            })}
            {!entries.length && (
              <p className="px-2 py-4 text-center text-xs text-muted">还没有记录</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="text-2xl font-black leading-none text-coral-deep">{value}</div>
      <div className="mt-1.5 text-xs font-bold text-muted">{label}</div>
    </div>
  )
}
