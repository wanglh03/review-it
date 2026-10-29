import { BookHeart, Plus } from 'lucide-react'
import EntryCard from './EntryCard'
import { EmptyState } from './ui'

export default function Timeline({ entries, tagMap, onEdit, onDelete, onImageClick, onAdd }) {
  if (!entries.length) {
    return (
      <EmptyState
        icon={<BookHeart size={28} />}
        title="时间轴还是空白的"
        description="从今天开始，把吃到的、看到的、住过的都记下来吧。"
        action={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep"
          >
            <Plus size={18} />
            写下第一篇
          </button>
        }
      />
    )
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 left-[66px] top-3 w-[2px] bg-gradient-to-b from-peach via-line to-line/40 sm:left-[92px]"
      />
      <div className="space-y-7 sm:space-y-9">
        {entries.map((entry) => (
          <EntryCard
            key={entry.date}
            entry={entry}
            tagMap={tagMap}
            onEdit={onEdit}
            onDelete={onDelete}
            onImageClick={onImageClick}
          />
        ))}
      </div>
    </div>
  )
}
