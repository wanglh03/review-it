import { CalendarDays, Images, List, Plus, Sparkles } from 'lucide-react'

export default function Header({ mode, onModeChange, onAdd, onOpenCalendar }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="回到顶部">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-coral to-[#ff9d7e] text-xl shadow-lg shadow-coral/25 sm:h-12 sm:w-12">
            <span className="absolute -right-1 -top-1 text-sm">✨</span>
            🍜
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-xl font-black leading-tight tracking-tight text-ink lg:text-2xl">
              我们的测评！
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-muted">
              <Sparkles size={11} className="text-coral" />
              把好吃的、好玩的、好住的都记下来
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center rounded-full border border-line bg-white/90 p-1 shadow-sm">
            <ModeButton
              active={mode === 'timeline'}
              onClick={() => onModeChange('timeline')}
              icon={<List size={15} />}
              label="时间轴"
            />
            <ModeButton
              active={mode === 'album'}
              onClick={() => onModeChange('album')}
              icon={<Images size={15} />}
              label="相册"
            />
          </div>

          <button
            type="button"
            onClick={onOpenCalendar}
            aria-label="打开日历"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/90 text-ink shadow-sm transition hover:border-peach hover:text-coral-deep lg:hidden"
          >
            <CalendarDays size={18} />
          </button>

          <button
            type="button"
            onClick={onAdd}
            className="group flex h-10 items-center gap-1.5 rounded-full bg-coral px-3.5 text-sm font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep active:scale-95 sm:h-11 sm:px-5"
          >
            <Plus size={18} className="transition group-hover:rotate-90" />
            <span className="hidden sm:inline">添加记录</span>
            <span className="sm:hidden">记录</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function ModeButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold transition sm:px-3.5 sm:text-[13px] ${
        active ? 'bg-ink text-white shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
