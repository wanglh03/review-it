/**
 * 把 Cloudflare 部署需要的两个值写入 GitHub Actions Secrets。
 *
 * 用法：
 *   $env:GH_TOKEN="..."; $env:CF_API_TOKEN="..."; $env:CF_ACCOUNT_ID="..."; node scripts/set-gh-secrets.mjs
 *
 * 说明：GitHub 要求用仓库公钥做 libsodium sealed box 加密后再提交，
 * 这里用 tweetnacl 实现，密钥不会以明文形式留在仓库里。
 */
import nacl from 'tweetnacl'
import { readFileSync } from 'node:fs'

const REPO = process.env.GH_REPO || 'wanglh03/review-it'
const GH_TOKEN = process.env.GH_TOKEN
const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'b8d89f47a5e4867bef49cd1c51265dd3'

if (!GH_TOKEN) {
  console.error('缺少 GH_TOKEN')
  process.exit(1)
}
if (!CF_API_TOKEN) {
  console.error('缺少 CF_API_TOKEN')
  process.exit(1)
}

const headers = {
  authorization: `token ${GH_TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'review-it-setup',
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, { headers, ...options })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

/** GitHub 的 sealed box 要求：base64(ephemeralPk || box) */
function encryptSecret(publicKeyBase64, value) {
  const publicKey = Uint8Array.from(Buffer.from(publicKeyBase64, 'base64'))
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const boxed = nacl.box(Buffer.from(value, 'utf8'), nonce, publicKey, ephemeral.secretKey)
  const sealed = Buffer.concat([Buffer.from(ephemeral.publicKey), Buffer.from(boxed)])
  return sealed.toString('base64')
}

async function putSecret(name, value) {
  const { key, key_id: keyId } = await github(`/repos/${REPO}/actions/secrets/public-key`)
  const encrypted_value = encryptSecret(key, value)
  await github(`/repos/${REPO}/actions/secrets/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value, key_id: keyId }),
    headers: { ...headers, 'content-type': 'application/json' },
  })
  console.log(`已写入 secret: ${name}`)
}

/** 顺手校验一下 token 本身是否可用（拿不到 token 明文，只验证身份） */
async function verifyToken() {
  const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { authorization: `Bearer ${CF_API_TOKEN}` },
  })
  const payload = await response.json()
  if (!payload.success) {
    throw new Error(`Cloudflare token 校验失败: ${JSON.stringify(payload.errors)}`)
  }
  console.log(`Cloudflare token 有效，状态：${payload.result?.status}`)
}

// 便于排查：如果给了 .github-secret-source.json 就从文件读（本地用，已 gitignore）
let token = CF_API_TOKEN
if (token === 'FROM_FILE') {
  token = JSON.parse(readFileSync('.github-secret-source.json', 'utf8')).CF_API_TOKEN
}

const main = async () => {
  await verifyToken()
  await putSecret('CLOUDFLARE_API_TOKEN', token)
  await putSecret('CLOUDFLARE_ACCOUNT_ID', CF_ACCOUNT_ID)
  const list = await github(`/repos/${REPO}/actions/secrets`)
  console.log('仓库现有 secrets:', list.secrets.map((item) => item.name).join(', '))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
