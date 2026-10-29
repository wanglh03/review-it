import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CalendarDays, MapPin, MapPinned, Plus, X } from 'lucide-react'
import { DEFAULT_CENTER, addGaodeTiles, badgeIcon } from '../lib/map'
import { hasCoords, wgs84ToGcj02 } from '../lib/geo'
import { dateParts } from '../lib/date'
import { imageUrl } from '../lib/image'
import { TagPill } from './ui'

/** 大地图：把所有记录过的地点标在一张地图上 */
export default function EntryMap({ entries, tagMap, onOpenEntry, onAdd }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)

  const located = useMemo(
    () => entries.filter((entry) => hasCoords(entry.location)),
    [entries],
  )
  const unlocated = useMemo(
    () =>
      entries.filter(
        (entry) =>
          !hasCoords(entry.location) &&
          (entry.location?.name || entry.location?.address),
      ),
    [entries],
  )
  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) || null : null

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const [gcjLng, gcjLat] = wgs84ToGcj02(DEFAULT_CENTER.lng, DEFAULT_CENTER.lat)
    const map = L.map(containerRef.current, {
      center: [gcjLat, gcjLng],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    })
    addGaodeTiles(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const resize = () => map.invalidateSize()
    const observer = new ResizeObserver(resize)
    observer.observe(containerRef.current)
    const timer = window.setTimeout(resize, 220)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    const points = []

    entries.forEach((entry) => {
      if (!hasCoords(entry.location)) return
      const [gcjLng, gcjLat] = wgs84ToGcj02(
        Number(entry.location.lng),
        Number(entry.location.lat),
      )
      const emoji = tagMap.get(entry.tags?.[0])?.emoji || '📍'
      const marker = L.marker([gcjLat, gcjLng], { icon: badgeIcon(emoji) })
      marker.on('click', () => setSelectedId(entry.id))
      marker.addTo(layer)
      points.push([gcjLat, gcjLng])
    })

    if (points.length) {
      map.fitBounds(points, { padding: [56, 56], maxZoom: 15 })
    }
  }, [entries, tagMap])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sage/40 text-[#3f6b58]">
              <MapPinned size={20} />
            </span>
            我们的地图
          </h2>
          <p className="mt-1.5 text-sm font-medium text-muted">
            已经标记了 {located.length} 个地点
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-coral px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep"
        >
          <Plus size={16} />
          添加地点
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-line/80 bg-paper shadow-card">
        <div ref={containerRef} className="h-[60vh] min-h-[420px] w-full sm:h-[66vh]" />

        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-line/60 bg-paper/90 px-3 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur">
          {located.length} 个地点
        </div>

        {!located.length && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5">
            <div className="pointer-events-auto max-w-sm rounded-[26px] border border-line/70 bg-paper/95 p-6 text-center shadow-soft backdrop-blur">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-peach/60 text-2xl">
                🗺️
              </div>
              <h3 className="text-base font-black">地图还是空的</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                添加记录时，在地图上点一下就能把地点标出来。
              </p>
              <button
                type="button"
                onClick={onAdd}
                className="mt-4 rounded-full bg-coral px-4 py-2.5 text-sm font-bold text-white"
              >
                添加第一篇带地点的记录
              </button>
            </div>
          </div>
        )}

        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-30 animate-pop rounded-[24px] border border-line/70 bg-paper/97 p-3 shadow-soft backdrop-blur sm:inset-x-auto sm:left-4 sm:w-[360px]">
            <div className="flex items-start gap-3">
              {selected.images?.[0] ? (
                <img
                  src={imageUrl(selected.images[0].key)}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-cream text-2xl">
                  📍
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-black text-coral-deep">
                  <CalendarDays size={13} />
                  {dateParts(selected.date).short}
                  <span className="font-bold text-muted">{dateParts(selected.date).weekday}</span>
                </div>
                <div className="mt-0.5 truncate text-base font-black">
                  {selected.title || '这一天的记录'}
                </div>
                {selected.location?.name && (
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-muted">
                    <MapPin size={11} className="shrink-0" />
                    {selected.location.name}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {(selected.tags || []).map((id) => {
                    const tag = tagMap.get(id)
                    return tag ? <TagPill key={id} tag={tag} /> : null
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="关闭"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/50 hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onOpenEntry(selected)}
              className="mt-3 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink/85"
            >
              查看这一天的记录
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        高德地图
      </p>

      {unlocated.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-dashed border-line bg-paper px-4 py-3 text-sm leading-relaxed text-muted">
          <MapPin size={15} className="mt-0.5 shrink-0 text-coral" />
          <span>
            还有 {unlocated.length} 个地点只写了名字，没有在地图上标点。编辑那天的记录时，
            在地图上点一下就能补上。
          </span>
        </div>
      )}
    </div>
  )
}
