import { Sparkles, Tags } from 'lucide-react'
import { TagPill } from './ui'

export default function TagFilter({ tags, activeTag, onChange }) {
  if (!tags.length) return null

  return (
    <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      <span className="flex shrink-0 items-center gap-1 text-xs font-black text-muted">
        <Tags size={14} className="text-coral" />
        筛选
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={!activeTag}
        className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition ${
          !activeTag
            ? 'border-ink bg-ink text-white'
            : 'border-line bg-white/80 text-muted hover:border-peach hover:text-coral-deep'
        }`}
      >
        全部
      </button>
      {tags.map((tag) => (
        <TagPill
          key={tag.id}
          tag={tag}
          selected={activeTag === tag.id}
          onClick={() => onChange(activeTag === tag.id ? null : tag.id)}
          className="shrink-0 px-3.5 py-1.5 text-[13px]"
        />
      ))}
      <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs font-bold text-muted/70 sm:flex">
        <Sparkles size={12} />
        点标签看某一类
      </span>
    </div>
  )
}
