import { useMemo } from 'react'
import { Camera, Images, MapPin } from 'lucide-react'
import { dateParts } from '../lib/date'
import { imageUrl } from '../lib/image'
import { EmptyState } from './ui'

export default function Album({ entries, onOpen, onAdd }) {
  // 每条测评只出现一次，用第一张图片做封面
  const photos = useMemo(
    () =>
      entries
        .filter((entry) => entry.images?.length)
        .map((entry) => ({ entry, image: entry.images[0], index: 0 })),
    [entries],
  )

  const totalPhotos = photos.length

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose/60 text-[#b4453a]">
              <Images size={20} />
            </span>
            相册
          </h2>
          <p className="mt-1.5 text-sm font-medium text-muted sm:text-[15px]">
            共 {totalPhotos} 篇测评 · 每条展示第一张照片
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-2 text-xs font-bold text-muted shadow-sm sm:flex">
          <Camera size={14} className="text-coral" />
          {entries.length} 篇记录
        </span>
      </div>

      {totalPhotos === 0 ? (
        <EmptyState
          icon={<Camera size={28} />}
          title="相册里还没有照片"
          description="添加记录时上传照片，它们会乖乖地出现在这里。"
          action={
            onAdd ? (
              <button
                type="button"
                onClick={onAdd}
                className="rounded-full bg-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep"
              >
                去添加记录
              </button>
            ) : null
          }
        />
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 sm:gap-4">
          {photos.map((photo) => {
            const parts = dateParts(photo.entry.date)
            const location = photo.entry.location || {}
            const aspect =
              photo.image.w && photo.image.h ? `${photo.image.w} / ${photo.image.h}` : '4 / 3'
            return (
              <button
                key={`${photo.entry.id || photo.entry.date}-${photo.image.key}`}
                type="button"
                onClick={() => onOpen(photo.entry, photo.index)}
                className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-line/60 bg-white text-left shadow-sm transition hover:shadow-soft sm:mb-4"
              >
                <img
                  src={imageUrl(photo.image.key)}
                  alt=""
                  loading="lazy"
                  style={{ aspectRatio: aspect }}
                  className="w-full bg-line/40 object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent px-3 pb-2.5 pt-10 text-white">
                  <span className="text-[13px] font-black tracking-wide sm:text-sm">
                    {parts.month}月{parts.day}日
                    <span className="ml-1.5 font-medium text-white/70">{parts.weekday}</span>
                  </span>
                  {location.name && (
                    <span className="flex items-center gap-1 truncate text-xs text-white/80">
                      <MapPin size={11} />
                      {location.name}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
