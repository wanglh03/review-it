import { CalendarDays, Images, List, Map as MapIcon, Plus, Sparkles } from 'lucide-react'

const MODES = [
  { id: 'timeline', label: '时间轴', icon: List },
  { id: 'album', label: '相册', icon: Images },
  { id: 'map', label: '地图', icon: MapIcon },
]

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
            <span className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-muted">
              <Sparkles size={12} className="text-coral" />
              把好吃的、好玩的、好住的都记下来
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center rounded-full border border-line bg-white/90 p-1 shadow-sm">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onModeChange(id)}
                aria-pressed={mode === id}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-bold transition sm:px-3.5 sm:text-sm ${
                  mode === id ? 'bg-ink text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenCalendar}
            aria-label="打开日历"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/90 text-ink shadow-sm transition hover:border-peach hover:text-coral-deep lg:hidden"
          >
            <CalendarDays size={19} />
          </button>

          <button
            type="button"
            onClick={onAdd}
            className="group flex h-10 items-center gap-1.5 rounded-full bg-coral px-3.5 text-sm font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep active:scale-95 sm:h-11 sm:px-5 sm:text-[15px]"
          >
            <Plus size={19} className="transition group-hover:rotate-90" />
            <span className="hidden sm:inline">添加记录</span>
            <span className="sm:hidden">记录</span>
          </button>
        </div>
      </div>
    </header>
  )
}
