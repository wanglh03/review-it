import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** 高德瓦片（国内访问快、中文标注全），无需 Key */
export const GAODE_TILES =
  'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'

/** 默认中心：上海（WGS-84） */
export const DEFAULT_CENTER = { lat: 31.2304, lng: 121.4737 }

export function addGaodeTiles(map) {
  return L.tileLayer(GAODE_TILES, {
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
    attribution: '&copy; 高德地图',
  }).addTo(map)
}

export function badgeIcon(emoji = '📍', active = false) {
  return L.divIcon({
    className: 'review-pin',
    html: `<span class="review-pin__badge${active ? ' is-active' : ''}">${emoji}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export function dotIcon() {
  return L.divIcon({
    className: 'review-pin',
    html: '<span class="review-pin__dot"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}
