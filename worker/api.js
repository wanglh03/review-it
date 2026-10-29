import {
  verifyProof,
  issueToken,
  verifyToken,
  rateLimitRemaining,
  recordFailure,
  clearFailures,
} from './lib/auth.js'
import { readData, writeData, withWriteLock, IMAGE_PREFIX } from './lib/store.js'
import { gcj02ToWgs84 } from '../src/lib/geo.js'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

const IMAGE_KEY_RE = /^site\/images\/\d{8}\/[a-z0-9]{16}\.(jpg|png|webp|gif|avif)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 12

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } })
}

function fail(message, status = 400, code = 'ERROR', extra = {}) {
  return json({ error: message, code, ...extra }, status)
}

function isConfigured(env) {
  return Boolean(
    env.BUCKET &&
      env.AUTH_SALT &&
      env.AUTH_PEPPER &&
      env.ADD_PROOF_HASH &&
      env.EDIT_PROOF_HASH &&
      env.SESSION_SECRET,
  )
}

function configurationError() {
  return fail('服务尚未配置密钥，请先在 Cloudflare 设置环境变量', 503, 'NOT_CONFIGURED')
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 1_000_000) throw new Error('PAYLOAD_TOO_LARGE')
  try {
    return await request.json()
  } catch {
    throw new Error('INVALID_JSON')
  }
}

async function requireScope(request, env, scopes) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) return null
  const claims = await verifyToken(header.slice(7).trim(), env.SESSION_SECRET)
  if (!claims || !scopes.includes(claims.scope)) return null
  return claims
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function isValidDate(value) {
  if (!DATE_RE.test(String(value))) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * 校验并清洗一条记录。返回 { entry } 或 { error }。
 */
function sanitizeEntry(body, data) {
  const date = String(body?.date || '')
  if (!isValidDate(date)) return { error: '日期格式不正确' }

  const title = cleanText(body?.title, 80).trim()
  const content = typeof body?.content === 'string' ? body.content : ''
  if (content.length > 30000) return { error: '正文太长了（最多 30000 字）' }

  const rawImages = Array.isArray(body?.images) ? body.images : []
  if (rawImages.length > MAX_IMAGES) return { error: `最多上传 ${MAX_IMAGES} 张图片` }

  const images = []
  for (const image of rawImages) {
    if (!image || typeof image.key !== 'string' || !IMAGE_KEY_RE.test(image.key)) {
      return { error: '图片地址不合法' }
    }
    const width = Number(image.w)
    const height = Number(image.h)
    images.push({
      key: image.key,
      w: Number.isFinite(width) && width > 0 && width < 20000 ? Math.round(width) : 0,
      h: Number.isFinite(height) && height > 0 && height < 20000 ? Math.round(height) : 0,
    })
  }

  if (!content.trim() && images.length === 0) {
    return { error: '写点什么，或者至少放一张照片吧' }
  }

  const validTagIds = new Set(data.tags.map((tag) => tag.id))
  const tags = Array.isArray(body?.tags)
    ? [...new Set(body.tags.filter((id) => typeof id === 'string' && validTagIds.has(id)))].slice(0, 8)
    : []

  const rawLocation = body?.location && typeof body.location === 'object' ? body.location : {}
  const name = cleanText(rawLocation.name, 60).trim()
  const address = cleanText(rawLocation.address, 160).trim()
  let mapUrl = cleanText(rawLocation.mapUrl, 500).trim()
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) mapUrl = ''

  // 地图坐标统一存 WGS-84；显示到高德底图时再转换成 GCJ-02
  let lat = Number(rawLocation.lat)
  let lng = Number(rawLocation.lng)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) lat = null
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) lng = null
  if (lat === null || lng === null) {
    lat = null
    lng = null
  }

  const now = new Date().toISOString()
  return {
    entry: {
      date,
      title,
      content,
      images,
      tags,
      location: { name, address, mapUrl, lat, lng },
      createdAt: now,
      updatedAt: now,
    },
  }
}

function imageContentType(key) {
  const ext = key.split('.').pop()
  const found = Object.entries(IMAGE_TYPES).find(([, value]) => value === ext)
  return found ? found[0] : 'application/octet-stream'
}

function detectImageType(bytes) {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(...bytes.slice(8, 12))
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  return null
}

/* ------------------------------- 具体接口 ------------------------------- */

async function handlePostsList(env) {
  const data = await readData(env)
  const entries = data.entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  const photoCount = entries.reduce((sum, entry) => sum + entry.images.length, 0)
  return json({
    entries,
    tags: data.tags,
    meta: {
      firstDate: entries.length ? entries[entries.length - 1].date : null,
      latestDate: entries.length ? entries[0].date : null,
      photoCount,
      updatedAt: data.updatedAt,
    },
  })
}

async function handleAuthSalt(env, url) {
  const scope = url.searchParams.get('scope') === 'edit' ? 'edit' : 'add'
  if (!env.AUTH_SALT) return configurationError()
  return json({ salt: `${env.AUTH_SALT}:${scope}`, scope })
}

async function handleAuth(request, env) {
  if (!isConfigured(env)) return configurationError()

  let body
  try {
    body = await readJson(request)
  } catch {
    return fail('请求格式不正确', 400, 'BAD_REQUEST')
  }

  const scope = body?.scope === 'edit' ? 'edit' : body?.scope === 'add' ? 'add' : null
  if (!scope) return fail('未知的验证类型', 400, 'BAD_SCOPE')

  const proof = typeof body?.proof === 'string' ? body.proof : ''
  if (!proof) return fail('请输入 PIN 码或密码', 400, 'PROOF_REQUIRED')

  const limitKey = `${clientIp(request)}:${scope}`
  const remaining = rateLimitRemaining(limitKey)
  if (remaining > 0) {
    return fail(`尝试次数太多了，请 ${Math.ceil(remaining / 60)} 分钟后再试`, 429, 'RATE_LIMITED', {
      retryAfter: remaining,
    })
  }

  const stored = scope === 'add' ? env.ADD_PROOF_HASH : env.EDIT_PROOF_HASH
  const ok = await verifyProof(proof, stored, env.AUTH_PEPPER)

  if (!ok) {
    recordFailure(limitKey)
    await sleep(380)
    return fail(scope === 'add' ? 'PIN 码不正确' : '密码不正确', 401, 'BAD_SECRET')
  }

  clearFailures(limitKey)
  const issued = await issueToken(env.SESSION_SECRET, scope)
  return json(issued)
}

async function handleUpload(request, env) {
  const claims = await requireScope(request, env, ['add', 'edit'])
  if (!claims) return fail('请先验证 PIN 码或密码', 401, 'AUTH_REQUIRED')

  const length = Number(request.headers.get('content-length') || 0)
  if (length > MAX_UPLOAD_BYTES + 200_000) return fail('图片太大了（最多 8MB）', 413, 'TOO_LARGE')

  let form
  try {
    form = await request.formData()
  } catch {
    return fail('上传格式不正确', 400, 'BAD_FORM')
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') return fail('没有收到图片文件', 400, 'NO_FILE')
  if (typeof file.size !== 'number' || file.size === 0) return fail('图片为空', 400, 'EMPTY_FILE')
  if (file.size > MAX_UPLOAD_BYTES) return fail('图片太大了（最多 8MB）', 413, 'TOO_LARGE')

  const declared = String(file.type || '').toLowerCase()
  const extension = IMAGE_TYPES[declared]
  if (!extension) return fail('只支持 JPG / PNG / WebP / GIF / AVIF 图片', 415, 'BAD_TYPE')

  const buffer = new Uint8Array(await file.arrayBuffer())
  const detected = detectImageType(buffer)
  if (!detected || detected !== declared) {
    return fail('图片内容与格式不匹配', 415, 'BAD_TYPE')
  }

  const now = new Date()
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const key = `${IMAGE_PREFIX}${day}/${random}.${extension}`

  await env.BUCKET.put(key, buffer, {
    httpMetadata: {
      contentType: declared,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  return json({ key, url: `/api/img/${key}` })
}

async function handleImage(request, env, key) {
  if (!IMAGE_KEY_RE.test(key)) return fail('图片不存在', 404, 'NOT_FOUND')

  const object = await env.BUCKET.get(key)
  if (!object) return fail('图片不存在', 404, 'NOT_FOUND')

  const etag = object.httpEtag
  if (etag && request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': 'public, max-age=31536000, immutable' },
    })
  }

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || imageContentType(key),
      'content-length': String(object.size),
      'cache-control': 'public, max-age=31536000, immutable',
      ...(etag ? { etag } : {}),
      'x-content-type-options': 'nosniff',
    },
  })
}

async function handleCreateEntry(request, env) {
  const claims = await requireScope(request, env, ['add'])
  if (!claims) return fail('请先输入 PIN 码', 401, 'AUTH_REQUIRED')

  let body
  try {
    body = await readJson(request)
  } catch {
    return fail('请求格式不正确', 400, 'BAD_REQUEST')
  }

  return withWriteLock(async () => {
    const data = await readData(env)
    if (data.entries.some((entry) => entry.date === body?.date)) {
      return fail('这一天已经有记录啦，可以直接编辑它', 409, 'CONFLICT', { date: body.date })
    }

    const result = sanitizeEntry(body, data)
    if (result.error) return fail(result.error, 400, 'VALIDATION')

    data.entries.push(result.entry)
    data.entries.sort((a, b) => (a.date < b.date ? 1 : -1))
    await writeData(env, data)
    return json({ entry: result.entry }, 201)
  })
}

async function handleUpdateEntry(request, env, date) {
  const claims = await requireScope(request, env, ['edit'])
  if (!claims) return fail('请先输入编辑密码', 401, 'AUTH_REQUIRED')

  let body
  try {
    body = await readJson(request)
  } catch {
    return fail('请求格式不正确', 400, 'BAD_REQUEST')
  }

  return withWriteLock(async () => {
    const data = await readData(env)
    const index = data.entries.findIndex((entry) => entry.date === date)
    if (index === -1) return fail('没有找到这一天的记录', 404, 'NOT_FOUND')

    const result = sanitizeEntry({ ...body, date }, data)
    if (result.error) return fail(result.error, 400, 'VALIDATION')

    const previous = data.entries[index]
    const next = {
      ...result.entry,
      createdAt: previous.createdAt || result.entry.createdAt,
      updatedAt: new Date().toISOString(),
    }

    const keptKeys = new Set(next.images.map((image) => image.key))
    const removed = previous.images.filter((image) => !keptKeys.has(image.key)).map((image) => image.key)

    data.entries[index] = next
    data.entries.sort((a, b) => (a.date < b.date ? 1 : -1))
    await writeData(env, data)

    if (removed.length) {
      try {
        await env.BUCKET.delete(removed)
      } catch (error) {
        console.error('删除旧图片失败', error)
      }
    }

    return json({ entry: next })
  })
}

async function handleDeleteEntry(request, env, date) {
  const claims = await requireScope(request, env, ['edit'])
  if (!claims) return fail('请先输入编辑密码', 401, 'AUTH_REQUIRED')

  return withWriteLock(async () => {
    const data = await readData(env)
    const entry = data.entries.find((item) => item.date === date)
    if (!entry) return fail('没有找到这一天的记录', 404, 'NOT_FOUND')

    data.entries = data.entries.filter((item) => item.date !== date)
    await writeData(env, data)

    const keys = entry.images.map((image) => image.key).filter((key) => IMAGE_KEY_RE.test(key))
    if (keys.length) {
      try {
        await env.BUCKET.delete(keys)
      } catch (error) {
        console.error('删除图片失败', error)
      }
    }

    return json({ ok: true, date })
  })
}

async function handleSaveTags(request, env) {
  const claims = await requireScope(request, env, ['edit'])
  if (!claims) return fail('请先输入编辑密码', 401, 'AUTH_REQUIRED')

  let body
  try {
    body = await readJson(request)
  } catch {
    return fail('请求格式不正确', 400, 'BAD_REQUEST')
  }

  const rawTags = Array.isArray(body?.tags) ? body.tags : null
  if (!rawTags || rawTags.length > 30) return fail('标签数量不合法', 400, 'VALIDATION')

  const sanitized = []
  const names = new Set()
  const ids = new Set()
  for (const tag of rawTags) {
    const name = cleanText(tag?.name, 12).trim()
    if (!name) continue
    if (names.has(name)) continue
    names.add(name)

    let id = typeof tag?.id === 'string' && /^t_[a-z0-9]{3,24}$/.test(tag.id) ? tag.id : ''
    if (!id || ids.has(id)) id = `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    ids.add(id)

    const emoji = Array.from(cleanText(tag?.emoji, 8).trim()).slice(0, 2).join('')
    sanitized.push({ id, name, emoji })
  }

  if (!sanitized.length) return fail('至少要保留一个标签', 400, 'VALIDATION')

  return withWriteLock(async () => {
    const data = await readData(env)
    const validIds = new Set(sanitized.map((tag) => tag.id))
    data.entries = data.entries.map((entry) => ({
      ...entry,
      tags: entry.tags.filter((id) => validIds.has(id)),
    }))
    data.tags = sanitized
    await writeData(env, data)
    return json({ tags: sanitized })
  })
}

/* ------------------------------- 地理编码搜索 ------------------------------- */

const geoCache = new Map()
const geoHits = new Map()

function geoCacheGet(key) {
  const item = geoCache.get(key)
  if (!item) return null
  if (Date.now() - item.at > 10 * 60 * 1000) {
    geoCache.delete(key)
    return null
  }
  return item.results
}

function geoCacheSet(key, results) {
  if (geoCache.size > 200) {
    const oldest = [...geoCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) geoCache.delete(oldest[0])
  }
  geoCache.set(key, { at: Date.now(), results })
}

function geoAllowed(ip) {
  const now = Date.now()
  const record = geoHits.get(ip)
  if (!record || now > record.resetAt) {
    geoHits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return true
  }
  if (record.count >= 40) return false
  record.count += 1
  return true
}

function simplifyNominatim(item) {
  const lat = Number(item.lat)
  const lng = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const display = String(item.display_name || '')
  const name = String(item.name || display.split(',')[0] || '').trim()
  let address = display
  if (name && address.startsWith(name)) {
    address = address.slice(name.length).replace(/^[,，\s]+/, '')
  }
  // 去掉邮编 / 国家，并限制层级，避免地址一长串
  address = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== '中国' && part !== 'China' && !/^\d{5,6}$/.test(part))
    .slice(0, 5)
    .join(', ')
  return {
    id: `n${item.place_id || `${lat},${lng}`}`,
    name: name || display,
    address,
    lat,
    lng,
  }
}

function simplifyPhoton(feature) {
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const properties = feature.properties || {}
  const name = String(properties.name || properties.street || properties.city || '').trim()
  const address = [
    properties.street,
    properties.district,
    properties.city,
    properties.state,
    properties.country,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    id: `p${properties.osm_id || `${lat},${lng}`}`,
    name: name || address,
    address,
    lat,
    lng,
  }
}

let lastNominatimAt = 0

async function throttleNominatim() {
  // Nominatim 使用政策要求每秒最多 1 次，这里留一点余量
  const wait = 1200 - (Date.now() - lastNominatimAt)
  if (wait > 0) await sleep(wait)
  lastNominatimAt = Date.now()
}

async function searchNominatim(query) {
  await throttleNominatim()
  const endpoint =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&dedupe=1&countrycodes=cn' +
    `&accept-language=zh-CN&q=${encodeURIComponent(query)}`
  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'review-it/1.0 (https://review.gtbro.vip)',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
    },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`nominatim ${response.status}`)
  const list = await response.json()
  return (Array.isArray(list) ? list : []).map(simplifyNominatim).filter(Boolean)
}

async function searchPhoton(query) {
  const endpoint = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=zh`
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'review-it/1.0 (https://review.gtbro.vip)' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`photon ${response.status}`)
  const payload = await response.json()
  return (payload?.features || []).map(simplifyPhoton).filter(Boolean)
}

/* 高德 Web 服务：输入提示（全国）+ 当前地图城市优先，中文店名 / 门牌号覆盖最好 */
function simplifyAmapTip(tip, fallbackName) {
  const [lngRaw, latRaw] = String(tip.location || '').split(',')
  const gcjLng = Number(lngRaw)
  const gcjLat = Number(latRaw)
  if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) return null
  const [lng, lat] = gcj02ToWgs84(gcjLng, gcjLat)
  const address = [tip.district, tip.address].filter(Boolean).join(' ').trim()
  return {
    id: `a${tip.id || `${lat},${lng}`}`,
    name: tip.name || fallbackName,
    address,
    lat,
    lng,
  }
}

async function amapTips(key, query, cityCode) {
  const params = [
    `key=${encodeURIComponent(key)}`,
    `keywords=${encodeURIComponent(query)}`,
    'datatype=poi',
    cityCode ? `city=${cityCode}` : '',
    cityCode ? 'citylimit=true' : 'citylimit=false',
  ]
    .filter(Boolean)
    .join('&')
  const response = await fetch(`https://restapi.amap.com/v3/assistant/inputtips?${params}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`amap tips ${response.status}`)
  const payload = await response.json()
  if (payload.status !== '1') throw new Error(`amap tips ${payload.info || 'error'}`)
  return (Array.isArray(payload.tips) ? payload.tips : [])
    .map((tip) => simplifyAmapTip(tip, query))
    .filter(Boolean)
}

async function amapAdcode(key, near) {
  if (!near) return ''
  const [lng, lat] = near.split(',')
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return ''
  const endpoint =
    'https://restapi.amap.com/v3/geocode/regeo?' +
    `key=${encodeURIComponent(key)}&location=${lng},${lat}`
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) return ''
  const payload = await response.json()
  if (payload.status !== '1') return ''
  return payload.regeocode?.addressComponent?.adcode || ''
}

async function searchAmapTips(query, key, near) {
  const cityCode = await amapAdcode(key, near)
  const [localResult, nationalResult] = await Promise.allSettled([
    cityCode ? amapTips(key, query, cityCode) : Promise.resolve([]),
    amapTips(key, query, ''),
  ])

  if (localResult.status === 'rejected' && nationalResult.status === 'rejected') {
    throw localResult.reason || nationalResult.reason
  }

  const local = localResult.status === 'fulfilled' ? localResult.value : []
  const national = nationalResult.status === 'fulfilled' ? nationalResult.value : []

  const merged = []
  const seen = new Set()
  for (const item of [...local, ...national]) {
    const marker = `${item.name}|${item.lat.toFixed(5)}|${item.lng.toFixed(5)}`
    if (seen.has(marker)) continue
    seen.add(marker)
    merged.push(item)
  }

  // 高德的“输入提示”会带出一些模糊匹配（比如搜一兰拉面混进味千），
  // 这里按“名称/地址是否真的包含关键词”做一次轻量排序，把明显不相关的压下去。
  const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, '')
  const keyword = normalize(query)
  const prefix = keyword.slice(0, 2)
  const scored = merged.map((item, index) => {
    const name = normalize(item.name)
    const address = normalize(item.address)
    let score = 2
    if (name.includes(keyword)) score = 0
    else if (name.includes(prefix) || address.includes(keyword)) score = 1
    return { item, score, index }
  })
  const relevant = scored.filter((entry) => entry.score < 2)
  const picked = (relevant.length ? relevant : scored)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 8)
    .map((entry) => entry.item)

  return picked
}

async function handleGeoSearch(request, env, url) {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 60)
  if (query.length < 2) return fail('至少输入两个字再搜索', 400, 'VALIDATION')

  const nearRaw = String(url.searchParams.get('near') || '').trim()
  const near = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(nearRaw) ? nearRaw : ''

  const ip = clientIp(request)
  if (!geoAllowed(ip)) return fail('搜索太频繁了，休息一会儿再试', 429, 'RATE_LIMITED')

  const cacheKey = `${query.toLowerCase()}|${near}`
  const cached = geoCacheGet(cacheKey)
  if (cached) return json({ results: cached })

  let results = []
  let source = 'none'
  let responded = false

  // 1) 配了高德 Key 就优先用高德（当前地图城市优先，再全国）
  if (env.AMAP_KEY) {
    try {
      results = await searchAmapTips(query, env.AMAP_KEY, near)
      responded = true
      if (results.length) source = 'amap'
    } catch (error) {
      console.error('amap tips search failed', error)
    }
  }

  // 2) 没有 Key 或高德没结果时，退回 OSM（地标、城市、道路覆盖还可以）
  if (!results.length) {
    try {
      results = await searchNominatim(query)
      responded = true
      if (results.length) source = 'nominatim'
    } catch (error) {
      console.error('nominatim search failed', error)
      // 3) Nominatim 不可用时才尝试 Photon，避免每次搜索都多等一轮
      try {
        const photon = await searchPhoton(query)
        responded = true
        if (photon.length) {
          results = photon
          source = 'photon'
        }
      } catch (photonError) {
        console.error('photon search failed', photonError)
      }
    }
  }

  if (!responded) {
    return fail('搜索服务暂时不可用，仍可点击地图选点', 502, 'GEO_UPSTREAM')
  }

  geoCacheSet(cacheKey, results)
  return json({ results, source })
}

/* ------------------------------- 路由入口 ------------------------------- */

export async function handleApi(request, env, url) {
  const segments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  try {
    if (segments.length === 0) {
      return json({ ok: true, service: 'review-it' })
    }

    const [head, ...rest] = segments

    if (head === 'health' && request.method === 'GET') {
      return json({
        ok: true,
        configured: isConfigured(env),
        bucket: Boolean(env.BUCKET),
        time: new Date().toISOString(),
      })
    }

    if (head === 'posts') {
      if (rest.length === 0) {
        if (request.method === 'GET') return handlePostsList(env)
        if (request.method === 'POST') return handleCreateEntry(request, env)
        return fail('不支持的方法', 405, 'METHOD_NOT_ALLOWED')
      }
      const date = rest[0]
      if (!isValidDate(date)) return fail('日期格式不正确', 400, 'BAD_DATE')
      if (rest.length > 1) return fail('接口不存在', 404, 'NOT_FOUND')
      if (request.method === 'PUT') return handleUpdateEntry(request, env, date)
      if (request.method === 'DELETE') return handleDeleteEntry(request, env, date)
      return fail('不支持的方法', 405, 'METHOD_NOT_ALLOWED')
    }

    if (head === 'auth') {
      if (rest.length === 0 && request.method === 'POST') return handleAuth(request, env)
      if (rest.length === 0 && request.method === 'GET') return handleAuthSalt(env, url)
      if (rest[0] === 'salt' && request.method === 'GET') return handleAuthSalt(env, url)
      return fail('接口不存在', 404, 'NOT_FOUND')
    }

    if (head === 'upload' && request.method === 'POST') {
      return handleUpload(request, env)
    }

    if (head === 'img' && request.method === 'GET') {
      const key = rest.join('/')
      return handleImage(request, env, key)
    }

    if (head === 'tags' && request.method === 'POST') {
      return handleSaveTags(request, env)
    }

    if (head === 'geo' && rest[0] === 'search' && request.method === 'GET') {
      return handleGeoSearch(request, env, url)
    }

    return fail('接口不存在', 404, 'NOT_FOUND')
  } catch (error) {
    if (error?.message === 'PAYLOAD_TOO_LARGE') return fail('请求内容太大', 413, 'TOO_LARGE')
    console.error('API error', error)
    return fail('服务器开小差了，请稍后再试', 500, 'INTERNAL')
  }
}
