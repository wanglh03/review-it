import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Crosshair, Loader2, MapPin, Trash2 } from 'lucide-react'
import { DEFAULT_CENTER, addGaodeTiles, dotIcon } from '../lib/map'
import { gcj02ToWgs84, hasCoords, wgs84ToGcj02 } from '../lib/geo'

/**
 * 编辑器里的地图选点：点击地图或拖动标记即可选择坐标。
 * value 为 WGS-84 的 { lat, lng }。
 */
export default function LocationPicker({ value, onChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

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

  const locate = () => {
    if (!navigator.geolocation) {
      setError('当前浏览器不支持定位，手动点地图选一个吧')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      (geoError) => {
        setLocating(false)
        setError(
          geoError.code === 1
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
            : '点击地图放置标记，也可以拖动标记微调'}
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-[#a53f35]">{error}</p>}
    </div>
  )
}
