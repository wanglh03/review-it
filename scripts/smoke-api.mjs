/**
 * 本地接口冒烟测试：node scripts/smoke-api.mjs
 * 需要先启动 `npm run build && npm run dev:worker`（Worker + 本地 R2）。
 */
import { pbkdf2Sync } from 'node:crypto'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788'
const PIN = process.env.PIN || '261023'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let passed = 0
function check(name, condition, extra = '') {
  if (condition) {
    passed += 1
    console.log(`  PASS ${name}`)
  } else {
    console.error(`  FAIL ${name} ${extra}`)
    process.exitCode = 1
  }
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options)
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { response, data }
}

async function auth(scope) {
  const { data: saltData } = await jsonFetch(`/api/auth/salt?scope=${scope}`)
  const proof = pbkdf2Sync(PIN, saltData.salt, 210000, 32, 'sha256').toString('base64')
  const { response, data } = await jsonFetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope, proof }),
  })
  check(`${scope} 验证成功`, response.ok && data.token, JSON.stringify(data))
  return data.token
}

async function main() {
  console.log('1. 基础接口')
  const health = await jsonFetch('/api/health')
  check('health 正常', health.response.ok && health.data.configured === true)

  const emptyList = await jsonFetch('/api/posts')
  check('列表接口正常', emptyList.response.ok && Array.isArray(emptyList.data.entries))

  console.log('2. 鉴权')
  const wrong = await jsonFetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'add', proof: 'bm90LWEtcmVhbC1wcm9vZg==' }),
  })
  check('错误 proof 被拒绝', wrong.response.status === 401, String(wrong.response.status))

  const addToken = await auth('add')
  const editToken = await auth('edit')
  check('add / edit 令牌不同', addToken !== editToken)

  const noToken = await jsonFetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date: '2026-10-27', content: 'x' }),
  })
  check('无令牌不能写入', noToken.response.status === 401)

  console.log('3. 上传图片')
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png')
  const upload = await jsonFetch('/api/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${addToken}` },
    body: form,
  })
  check('上传成功', upload.response.ok && upload.data.key, JSON.stringify(upload.data))
  const imageKey = upload.data?.key

  const image = await fetch(`${BASE}${upload.data.url}`)
  check('图片可访问', image.ok && image.headers.get('content-type') === 'image/png')

  console.log('4. 同一天创建多条记录')
  const testDate = '2030-12-31'
  const entry = {
    date: testDate,
    title: '第一碗拉面',
    content: '## 好吃！\n\n- 汤头浓郁\n- **面条**很弹\n\n> 下次还来',
    images: [{ key: imageKey, w: 1, h: 1 }],
    tags: [],
    location: {
      name: '一兰拉面',
      address: '上海市黄浦区南京东路 100 号',
      lat: 31.2304,
      lng: 121.4737,
    },
  }
  const created = await jsonFetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${addToken}` },
    body: JSON.stringify(entry),
  })
  check('创建成功', created.response.status === 201, JSON.stringify(created.data))
  const firstId = created.data?.entry?.id
  check('返回记录 id', Boolean(firstId))

  const second = await jsonFetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${addToken}` },
    body: JSON.stringify({ ...entry, title: '同一天的第二篇' }),
  })
  check('同一天可以再创建', second.response.status === 201, JSON.stringify(second.data))
  const secondId = second.data?.entry?.id
  check('两条记录 id 不同', Boolean(secondId) && secondId !== firstId)

  const list = await jsonFetch('/api/posts')
  const sameDay = list.data.entries?.filter((item) => item.date === testDate) || []
  check('列表里同一天有两条', sameDay.length === 2)
  check(
    '坐标已保存',
    sameDay.some((item) => Math.abs(item.location.lat - 31.2304) < 1e-6),
  )

  console.log('5. 按 id 修改（含改日期）与删除')
  const movedDate = '2031-01-01'
  const updated = await jsonFetch(`/api/posts/${firstId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${editToken}` },
    body: JSON.stringify({
      ...entry,
      date: movedDate,
      title: '改过的标题',
      images: [],
      tags: [],
    }),
  })
  check(
    '修改成功且 id 不变',
    updated.response.ok &&
      updated.data.entry.id === firstId &&
      updated.data.entry.title === '改过的标题',
    JSON.stringify(updated.data),
  )
  check('可以把记录改到别的日期', updated.data.entry.date === movedDate)

  const missingImage = await fetch(`${BASE}/api/img/${imageKey}`)
  check('移除图片后原图被删除', missingImage.status === 404, String(missingImage.status))

  const removedSecond = await jsonFetch(`/api/posts/${secondId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${editToken}` },
  })
  check('删除第二条成功', removedSecond.response.ok)

  const afterDelete = await jsonFetch('/api/posts')
  const moved = afterDelete.data.entries.find((item) => item.id === firstId)
  check('同一天的另一条还在（已改到新日期）', Boolean(moved) && moved.date === movedDate)

  const removedFirst = await jsonFetch(`/api/posts/${firstId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${editToken}` },
  })
  check('删除第一条成功', removedFirst.response.ok)

  const finalList = await jsonFetch('/api/posts')
  check(
    '测试数据已清理',
    finalList.data.entries.every(
      (item) => item.date !== testDate && item.date !== movedDate,
    ),
  )

  console.log(`\n完成：${passed} 项通过${process.exitCode ? '，存在失败' : ''}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
