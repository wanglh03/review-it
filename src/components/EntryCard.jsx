import { ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react'
import { dateParts, relativeDay, todayStr } from '../lib/date'
import { imageUrl } from '../lib/image'
import { amapMarkerUrl, amapSearchUrl, hasCoords } from '../lib/geo'
import Markdown from './Markdown'
import { TagPill } from './ui'

function mapHrefOf(location) {
  if (hasCoords(location)) return amapMarkerUrl(location)
  if (location.mapUrl) return location.mapUrl
  return amapSearchUrl([location.name, location.address].filter(Boolean).join(' '))
}

export default function EntryCard({ entry, tagMap, onEdit, onDelete, onImageClick }) {
  const date = dateParts(entry.date)
  const isToday = entry.date === todayStr()
  const relative = relativeDay(entry.date)
  const images = entry.images || []
  const location = entry.location || {}
  const href = mapHrefOf(location)
  const tags = (entry.tags || []).map((id) => tagMap.get(id)).filter(Boolean)
  const hasMapPin = hasCoords(location)

  const visibleImages = images.slice(0, 9)
  const hiddenCount = images.length - visibleImages.length

  return (
    <article
      id={`entry-${entry.date}`}
      data-entry={entry.date}
      className="group relative grid scroll-mt-24 grid-cols-[56px_22px_minmax(0,1fr)] sm:scroll-mt-28 sm:grid-cols-[80px_26px_minmax(0,1fr)]"
    >
      <div className="pt-1 pr-1 text-right sm:pt-2">
        <div className="text-xs font-black tracking-wide text-coral sm:text-[13px]">
          {date.month}月
        </div>
        <div className="text-[26px] font-black leading-none tracking-tight text-ink sm:text-[34px]">
          {date.day}
        </div>
        <div className="mt-1 text-xs font-bold text-muted sm:text-[13px]">{date.weekday}</div>
        {relative && (
          <div className="mt-1 inline-flex rounded-full bg-butter/70 px-2 py-0.5 text-xs font-bold text-[#9a6b1f]">
            {relative}
          </div>
        )}
      </div>

      <div className="relative flex justify-center pt-3 sm:pt-4">
        <span
          className={`relative z-10 mt-1 block h-[16px] w-[16px] rounded-full border-[3px] border-cream bg-coral sm:h-[17px] sm:w-[17px] ${
            isToday ? 'animate-pulse-dot' : ''
          }`}
        />
      </div>

      <div className="min-w-0 pb-1">
        <div className="rounded-[24px] border border-line/80 bg-paper p-4 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-soft sm:rounded-[28px] sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} className="text-[13px]" />
            ))}
            {!tags.length && (
              <span className="text-xs font-medium text-muted/60">未分类</span>
            )}

            <div className="ml-auto flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(entry)}
                aria-label="编辑这一天的记录"
                title="编辑"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-peach/60 hover:text-coral-deep"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry)}
                aria-label="删除这一天的记录"
                title="删除"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-rose/50 hover:text-[#b4453a]"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {entry.title && (
            <h2 className="mt-2.5 text-xl font-black leading-snug text-ink sm:text-2xl">
              {entry.title}
            </h2>
          )}

          {(location.name || location.address || hasMapPin) && (
            <a
              href={href || undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex max-w-full items-start gap-2 rounded-2xl border border-line/60 bg-[#fdf4ec] px-3.5 py-2.5 text-sm font-medium text-ink transition hover:border-peach hover:bg-peach/30"
            >
              <MapPin size={17} className="mt-0.5 shrink-0 text-coral" />
              <span className="min-w-0">
                {location.name && <span className="font-bold">{location.name}</span>}
                {location.name && location.address && <span className="text-muted"> · </span>}
                {location.address && <span className="text-muted">{location.address}</span>}
                {!location.name && !location.address && hasMapPin && (
                  <span className="font-bold">已标记地点</span>
                )}
              </span>
              {href && <ExternalLink size={13} className="mt-1 shrink-0 text-muted/70" />}
            </a>
          )}

          {entry.content && <Markdown source={entry.content} className="mt-3.5" />}

          {images.length > 0 && (
            <div
              className={`mt-4 grid gap-2 ${
                images.length === 1
                  ? 'grid-cols-1'
                  : images.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {visibleImages.map((image, index) => (
                <button
                  key={image.key}
                  type="button"
                  onClick={() => onImageClick(entry, index)}
                  aria-label="查看大图"
                  className={`group/img relative overflow-hidden rounded-2xl bg-line/50 ${
                    images.length === 1 ? 'aspect-[4/3] sm:aspect-[16/9]' : 'aspect-square'
                  }`}
                >
                  <img
                    src={imageUrl(image.key)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover/img:scale-105"
                  />
                  {index === visibleImages.length - 1 && hiddenCount > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-xl font-black text-white backdrop-blur-[1px]">
                      +{hiddenCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
