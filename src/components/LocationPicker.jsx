import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Crosshair, Loader2, MapPin, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { DEFAULT_CENTER, addGaodeTiles, dotIcon } from '../lib/map'
import { gcj02ToWgs84, hasCoords, wgs84ToGcj02 } from '../lib/geo'

/**
 * 编辑器里的地图选点：
 * - 顶部搜索店名 / 地址，选中结果自动标点并回填名称、地址
 * - 也可以直接点击地图或拖动标记
 * value 为 WGS-84 的 { lat, lng }。
 */
export default function LocationPicker({ value, onChange, onPick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const [gcjLng, gcjLat] = wgs84ToGcj02(DEFAULT_CENTER.lng, DEFAULT_CENTER.lat)
    const map = L.map(containerRef.current, {
      center: [gcjLat, gcjLng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    })
    addGaodeTiles(map)

    map.on('click', (event) => {
      const [wLng, wLat] = gcj02ToWgs84(event.latlng.lng, event.latlng.lat)
      setResults(null)
      onChangeRef.current({ lat: wLat, lng: wLng })
    })

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
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!hasCoords(value)) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    const [gcjLng, gcjLat] = wgs84ToGcj02(Number(value.lng), Number(value.lat))

    if (!markerRef.current) {
      const marker = L.marker([gcjLat, gcjLng], { icon: dotIcon(), draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const position = marker.getLatLng()
        const [wLng, wLat] = gcj02ToWgs84(position.lng, position.lat)
        onChangeRef.current({ lat: wLat, lng: wLng })
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng([gcjLat, gcjLng])
    }
    map.panTo([gcjLat, gcjLng])
  }, [value?.lat, value?.lng])

  const runSearch = async (event) => {
    event?.preventDefault()
    const keyword = query.trim()
    if (keyword.length < 2) {
      setSearchError('至少输入两个字，比如店名或路名')
      return
    }
    setSearching(true)
    setSearchError('')
    setResults(null)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    try {
      const center = mapRef.current?.getCenter()
      const near = center ? `${center.lng.toFixed(6)},${center.lat.toFixed(6)}` : ''
      const data = await api.geoSearch(keyword, { near, signal: controller.signal })
      const list = data.results || []
      setResults(list)
      if (!list.length) setSearchError('没有找到匹配的地点，换个关键词试试，或直接点地图选点')
    } catch (err) {
      if (err.name === 'AbortError') {
        setSearchError('搜索超时了，换个小一点的地名试试，或直接点地图选点')
      } else {
        setSearchError(err.message || '搜索失败，请稍后再试')
      }
    } finally {
      window.clearTimeout(timeout)
      setSearching(false)
    }
  }

  const pickResult = (place) => {
    if (onPick) onPick(place)
    else onChange({ lat: place.lat, lng: place.lng })
    setResults(null)
    setSearchError('')
    setQuery(place.name || query)
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoError('当前浏览器不支持定位，手动点地图选一个吧')
      return
    }
    setLocating(true)
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      (geoLocationError) => {
        setLocating(false)
        setGeoError(
          geoLocationError.code === 1
            ? '定位权限被拒绝了，可以直接点地图选点'
            : '定位失败，请手动点地图选点',
        )
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="border-b border-line bg-white p-2.5">
          <form onSubmit={runSearch} className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={60}
                placeholder="搜索店名或地址，比如：一兰拉面 南京东路"
                className="w-full rounded-xl border border-line bg-cream/40 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-coral focus:ring-2 focus:ring-coral/15"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-bold text-white transition hover:bg-ink/85 disabled:opacity-60"
            >
              {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              搜索
            </button>
          </form>

          {searchError && (
            <p className="mt-2 px-1 text-xs font-medium leading-relaxed text-[#a53f35]">
              {searchError}
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="mt-2 max-h-48 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line/70 bg-paper">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => pickResult(place)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-cream"
                  >
                    <MapPin size={15} className="mt-0.5 shrink-0 text-coral" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-ink">
                        {place.name}
                      </span>
                      {place.address && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {place.address}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <div ref={containerRef} className="h-[240px] w-full sm:h-[260px]" />
          <div className="absolute right-2 top-2 z-[1000] flex gap-1.5">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-2 text-xs font-bold text-ink shadow-md backdrop-blur transition hover:text-coral-deep disabled:opacity-60"
            >
              {locating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
              定位到我
            </button>
            {hasCoords(value) && (
              <button
                type="button"
                onClick={() => onChange({ lat: null, lng: null })}
                className="flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-2 text-xs font-bold text-muted shadow-md backdrop-blur transition hover:text-[#b4453a]"
              >
                <Trash2 size={14} />
                清除
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-t border-line bg-cream/70 px-3 py-2 text-xs font-medium text-muted">
          <MapPin size={13} className="shrink-0 text-coral" />
          {hasCoords(value)
            ? `已选点：${Number(value.lat).toFixed(5)}, ${Number(value.lng).toFixed(5)}`
            : '搜索后点选结果，或直接在地图上点一下'}
        </div>
      </div>
      {geoError && <p className="mt-2 text-xs font-semibold text-[#a53f35]">{geoError}</p>}
    </div>
  )
}
