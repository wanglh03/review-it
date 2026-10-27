/**
 * 本地接口冒烟测试：node scripts/smoke-api.mjs
 * 需要先启动 `npx wrangler pages dev public --port 8788`。
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
  check('初始数据为空', emptyList.response.ok && Array.isArray(emptyList.data.entries))

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

  console.log('4. 新建记录')
  const entry = {
    date: '2026-10-27',
    title: '第一碗拉面',
    content: '## 好吃！\n\n- 汤头浓郁\n- **面条**很弹\n\n> 下次还来',
    images: [{ key: imageKey, w: 1, h: 1 }],
    tags: ['t_food', 't_cafe'],
    location: { name: '一兰拉面', address: '上海市黄浦区南京东路 100 号' },
  }
  const created = await jsonFetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${addToken}` },
    body: JSON.stringify(entry),
  })
  check('创建成功', created.response.status === 201, JSON.stringify(created.data))

  const duplicate = await jsonFetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${addToken}` },
    body: JSON.stringify(entry),
  })
  check('同日重复创建返回 409', duplicate.response.status === 409)

  const list = await jsonFetch('/api/posts')
  check('列表包含新记录', list.data.entries?.length === 1 && list.data.entries[0].title === '第一碗拉面')
  check('标签已保存', list.data.entries[0].tags.length === 2)

  console.log('5. 修改与标签维护')
  const updated = await jsonFetch('/api/posts/2026-10-27', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${editToken}` },
    body: JSON.stringify({ ...entry, title: '改过的标题', images: [], tags: ['t_food'] }),
  })
  check('修改成功', updated.response.ok && updated.data.entry.title === '改过的标题', JSON.stringify(updated.data))

  const tags = await jsonFetch('/api/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${editToken}` },
    body: JSON.stringify({
      tags: [
        { id: 't_food', name: '美食', emoji: '🍜' },
        { id: 't_spot', name: '景点', emoji: '🏞️' },
      ],
    }),
  })
  check('标签保存成功', tags.response.ok && tags.data.tags.length === 2)

  const afterTags = await jsonFetch('/api/posts')
  check('删除标签后记录同步清理', afterTags.data.entries[0].tags.length === 1)

  console.log('6. 删除记录')
  const removed = await jsonFetch('/api/posts/2026-10-27', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${editToken}` },
  })
  check('删除成功', removed.response.ok)

  const finalList = await jsonFetch('/api/posts')
  check('删除后列表为空', finalList.data.entries.length === 0)

  const missingImage = await fetch(`${BASE}/api/img/${imageKey}`)
  check('图片随记录删除', missingImage.status === 404, String(missingImage.status))

  console.log(`\n完成：${passed} 项通过${process.exitCode ? '，存在失败' : ''}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
