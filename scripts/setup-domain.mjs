/**
 * 为 Pages 项目配置自定义域名：
 *   1. 在 zone 里建一条显式 CNAME（避免被 *.gtbro.vip 通配记录接管）
 *   2. 轮询 Pages 自定义域名状态，直到 active
 *   3. 用 HTTPS 实测一次
 *
 * 用法：
 *   $env:CF_API_TOKEN="..."; node scripts/setup-domain.mjs [域名] [目标]
 */

const API = 'https://api.cloudflare.com/client/v4'
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'b8d89f47a5e4867bef49cd1c51265dd3'
const PROJECT = process.env.PAGES_PROJECT || 'review-it'
const TOKEN = process.env.CF_API_TOKEN
const DOMAIN = process.argv[2] || 'review.gtbro.vip'
const TARGET = process.argv[3] || `${PROJECT}-cy0.pages.dev`

if (!TOKEN) {
  console.error('缺少 CF_API_TOKEN')
  process.exit(1)
}

const headers = {
  authorization: `Bearer ${TOKEN}`,
  'content-type': 'application/json',
}

async function call(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers, ...options })
  const payload = await response.json()
  if (!payload.success) {
    const detail = (payload.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ')
    throw new Error(`${options.method || 'GET'} ${path} -> ${detail || response.status}`)
  }
  return payload.result
}

const zoneName = DOMAIN.split('.').slice(-2).join('.')
const recordName = DOMAIN.slice(0, DOMAIN.length - zoneName.length - 1)

async function main() {
  const zones = await call(`/zones?name=${zoneName}`)
  if (!zones.length) throw new Error(`账号里没有 ${zoneName} 这个 zone`)
  const zoneId = zones[0].id
  console.log(`zone ${zoneName} = ${zoneId}`)

  const existing = await call(`/zones/${zoneId}/dns_records?name=${DOMAIN}`)
  const record = {
    type: 'CNAME',
    name: recordName,
    content: TARGET,
    proxied: true,
    ttl: 1,
    comment: 'Cloudflare Pages: review-it',
  }

  if (existing.length) {
    const current = existing[0]
    if (current.type === 'CNAME' && current.content === TARGET) {
      console.log(`DNS 记录已正确：CNAME ${DOMAIN} -> ${TARGET}（proxied=${current.proxied}）`)
    } else {
      console.log(`更新 DNS：${current.type} ${current.content} -> CNAME ${TARGET}`)
      await call(`/zones/${zoneId}/dns_records/${current.id}`, {
        method: 'PUT',
        body: JSON.stringify(record),
      })
    }
  } else {
    console.log(`新建 DNS：CNAME ${DOMAIN} -> ${TARGET}`)
    await call(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(record) })
  }

  // 把域名挂到 Pages 项目（已存在时接口会返回已有记录）
  try {
    await call(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`, {
      method: 'POST',
      body: JSON.stringify({ name: DOMAIN }),
    })
    console.log(`已挂载到 Pages 项目 ${PROJECT}`)
  } catch (error) {
    console.log(`挂载返回：${error.message}（如果已存在可以忽略）`)
  }

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const domains = await call(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`)
    const current = domains.find((item) => item.name === DOMAIN)
    console.log(`第 ${attempt} 次检查：status=${current?.status} validation=${current?.validation_data?.status}`)
    if (current?.status === 'active') break
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`https://${DOMAIN}/api/health`, { redirect: 'follow' })
      const body = await response.text()
      console.log(`HTTPS 实测：${response.status} ${body.slice(0, 120)}`)
      if (response.ok) return
    } catch (error) {
      console.log(`HTTPS 暂不可用：${error.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }
  console.log('域名还在签发证书，稍后再访问即可。')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
