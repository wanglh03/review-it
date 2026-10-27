/**
 * R2 数据层：整站数据（标签 + 所有记录）保存在一个 JSON 对象里，
 * 图片保存在 site/images/ 下。数据量小、写入频率低，适合这种单文件存储。
 */

export const DATA_KEY = 'site/data.json'
export const IMAGE_PREFIX = 'site/images/'

export const DEFAULT_TAGS = [
  { id: 't_food', name: '美食', emoji: '🍜' },
  { id: 't_spot', name: '景点', emoji: '🏞️' },
  { id: 't_hotel', name: '酒店', emoji: '🏨' },
  { id: 't_cafe', name: '咖啡', emoji: '☕' },
  { id: 't_dessert', name: '甜品', emoji: '🍰' },
]

export function emptyData() {
  return {
    version: 1,
    updatedAt: null,
    tags: DEFAULT_TAGS.map((tag) => ({ ...tag })),
    entries: [],
  }
}

export function normalizeData(raw) {
  const data = emptyData()
  if (!raw || typeof raw !== 'object') return data

  if (Array.isArray(raw.tags) && raw.tags.length) {
    const seen = new Set()
    data.tags = raw.tags
      .filter((tag) => tag && typeof tag.id === 'string' && typeof tag.name === 'string')
      .map((tag) => ({
        id: tag.id,
        name: String(tag.name).slice(0, 12),
        emoji: String(tag.emoji || '').slice(0, 8),
      }))
      .filter((tag) => {
        if (seen.has(tag.id)) return false
        seen.add(tag.id)
        return true
      })
  }

  if (Array.isArray(raw.entries)) {
    const validTagIds = new Set(data.tags.map((tag) => tag.id))
    data.entries = raw.entries
      .filter((entry) => entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || ''))
      .map((entry) => ({
        date: entry.date,
        title: String(entry.title || '').slice(0, 80),
        content: String(entry.content || '').slice(0, 30000),
        images: Array.isArray(entry.images)
          ? entry.images
              .filter((image) => image && typeof image.key === 'string')
              .map((image) => ({
                key: image.key,
                w: Number(image.w) || 0,
                h: Number(image.h) || 0,
              }))
              .slice(0, 12)
          : [],
        tags: Array.isArray(entry.tags)
          ? [...new Set(entry.tags.filter((id) => validTagIds.has(id)))].slice(0, 8)
          : [],
        location:
          entry.location && typeof entry.location === 'object'
            ? {
                name: String(entry.location.name || '').slice(0, 60),
                address: String(entry.location.address || '').slice(0, 160),
                mapUrl: String(entry.location.mapUrl || '').slice(0, 500),
              }
            : { name: '', address: '', mapUrl: '' },
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  data.updatedAt = raw.updatedAt || null
  return data
}

export async function readData(env) {
  const object = await env.BUCKET.get(DATA_KEY)
  if (!object) return emptyData()
  try {
    return normalizeData(await object.json())
  } catch {
    return emptyData()
  }
}

export async function writeData(env, data) {
  data.updatedAt = new Date().toISOString()
  data.version = 1
  await env.BUCKET.put(DATA_KEY, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  })
  return data
}

/* 写入串行化：同一 isolate 内避免并发读改写互相覆盖 */
let chain = Promise.resolve()

export function withWriteLock(task) {
  const result = chain.then(task, task)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
