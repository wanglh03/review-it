import { useEffect, useMemo, useState } from 'react'
import { CalendarHeart, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  WEEKDAY_INITIALS,
  addMonths,
  buildMonthCells,
  compareMonth,
  monthOf,
  parseDate,
  todayStr,
} from '../lib/date'

export default function Calendar({ entries, onJump, className = '' }) {
  const byDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries])
  const latest = entries[0]?.date
  const first = entries[entries.length - 1]?.date
  const today = todayStr()

  const [view, setView] = useState(() => monthOf(latest || today))

  useEffect(() => {
    if (latest) setView(monthOf(latest))
  }, [latest])

  const minMonth = monthOf(first || today)
  const maxMonth = monthOf(latest && latest > today ? latest : today)

  const cells = useMemo(() => buildMonthCells(view.year, view.month), [view])
  const monthEntryCount = useMemo(
    () =>
      entries.filter((entry) => {
        const date = parseDate(entry.date)
        return date.getFullYear() === view.year && date.getMonth() === view.month
      }).length,
    [entries, view],
  )

  const canPrev = compareMonth(view, minMonth) > 0
  const canNext = compareMonth(view, maxMonth) < 0

  return (
    <section
      className={`rounded-[28px] border border-line/70 bg-paper p-4 shadow-card sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-peach/60 text-coral-deep">
            <CalendarHeart size={18} />
          </span>
          <div>
            <div className="text-sm font-black leading-tight">
              {view.year}年{view.month + 1}月
            </div>
            <div className="text-[10px] font-medium text-muted">点击有记录的日子跳转</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="上个月"
            disabled={!canPrev}
            onClick={() => setView((current) => addMonths(current.year, current.month, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition enabled:hover:border-peach enabled:hover:text-coral-deep disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="下个月"
            disabled={!canNext}
            onClick={() => setView((current) => addMonths(current.year, current.month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition enabled:hover:border-peach enabled:hover:text-coral-deep disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_INITIALS.map((day) => (
          <div key={day} className="pb-1 text-[10px] font-bold text-muted/70">
            {day}
          </div>
        ))}

        {cells.map((cell) => {
          if (!cell.inMonth) return <div key={cell.date} aria-hidden="true" className="aspect-square" />

          const entry = byDate.get(cell.date)
          const isToday = cell.date === today
          const isBeforeFirst = first && cell.date < first

          return (
            <button
              key={cell.date}
              type="button"
              disabled={!entry}
              onClick={() => entry && onJump(cell.date)}
              aria-label={`${cell.date}${entry ? '，有记录' : '，无记录'}`}
              title={entry ? '跳到这一天的记录' : '这一天还没有记录'}
              className={`relative flex aspect-square items-center justify-center rounded-full text-[12px] font-bold transition sm:text-[13px] ${
                entry
                  ? 'bg-coral text-white shadow-md shadow-coral/25 hover:scale-110 hover:bg-coral-deep active:scale-95'
                  : isBeforeFirst
                    ? 'cursor-default text-[#e2d5cc]'
                    : 'cursor-default text-[#c9b7ac]'
              } ${!entry && isToday ? 'ring-2 ring-coral/40 ring-offset-2 ring-offset-paper' : ''}`}
            >
              {cell.day}
              {entry && (
                <span className="absolute bottom-[3px] h-[3px] w-[3px] rounded-full bg-white/85" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-dashed border-line pt-3 text-[10px] font-medium text-muted">
        <span>
          {entries.length === 0
            ? '还没有任何记录'
            : monthEntryCount > 0
              ? `本月 ${monthEntryCount} 天有记录`
              : '本月还没有记录'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-coral" />
          有记录
          <span className="ml-1 h-2 w-2 rounded-full bg-[#d9cbc2]" />
          无记录
        </span>
      </div>
    </section>
  )
}
