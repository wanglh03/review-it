/**
 * 鉴权与令牌工具。
 *
 * 安全设计：
 * - PIN / 密码从不在网络上明文传输：前端用 PBKDF2-SHA256（210000 次迭代）在浏览器里
 *   派生出 proof，服务端只保存 HMAC(pepper, proof) 摘要。
 * - 服务端比较使用恒定时间算法，失败做限流与延迟。
 * - 写操作使用短期 HMAC 签名令牌（scope 限定 + 过期时间），放在 Authorization 头里，
 *   不依赖 Cookie，天然免疫 CSRF。
 */

const encoder = new TextEncoder()

export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return base64ToBytes(padded)
}

/** 恒定时间字符串比较：长度不同也走完整循环，避免计时侧信道 */
export function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a))
  const right = encoder.encode(String(b))
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] || 0) ^ (right[i] || 0)
  }
  return diff === 0
}

export async function hmacBase64(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToBase64(new Uint8Array(signature))
}

/**
 * 校验前端送来的 proof 是否与预存的摘要匹配。
 * 摘要格式：v1$<base64 hmac>
 */
export async function verifyProof(proof, storedDigest, pepper) {
  if (!proof || typeof proof !== 'string' || proof.length > 200) return false
  if (!storedDigest || typeof storedDigest !== 'string') return false
  const [version, digest] = storedDigest.split('$')
  if (version !== 'v1' || !digest) return false
  const actual = await hmacBase64(pepper, proof)
  return timingSafeEqual(actual, digest)
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000

export async function issueToken(sessionSecret, scope) {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = `${scope}.${expiresAt}`
  const signature = await hmacBase64(sessionSecret, payload)
  return {
    token: `${bytesToBase64Url(encoder.encode(payload))}.${bytesToBase64Url(base64ToBytes(signature))}`,
    expiresAt,
    scope,
  }
}

export async function verifyToken(token, sessionSecret) {
  if (!token || typeof token !== 'string') return null
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart) return null

  let payload
  try {
    payload = new TextDecoder().decode(base64UrlToBytes(payloadPart))
  } catch {
    return null
  }

  const [scope, expiresRaw] = payload.split('.')
  const expiresAt = Number(expiresRaw)
  if (!scope || !Number.isFinite(expiresAt)) return null
  if (expiresAt < Date.now()) return null

  const expected = await hmacBase64(sessionSecret, payload)
  let actual
  try {
    actual = bytesToBase64(base64UrlToBytes(signaturePart))
  } catch {
    return null
  }
  if (!timingSafeEqual(expected, actual)) return null
  return { scope, expiresAt }
}

/* ---------------- 登录失败限流（单 isolate 内存级，配合固定延迟） ---------------- */

const FAILURE_WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 6
const failures = new Map()

function pruneFailures(now) {
  if (failures.size < 5000) return
  for (const [key, record] of failures) {
    if (record.resetAt < now) failures.delete(key)
  }
}

export function rateLimitRemaining(key) {
  const record = failures.get(key)
  if (!record) return 0
  if (Date.now() > record.resetAt) {
    failures.delete(key)
    return 0
  }
  return record.count >= MAX_FAILURES ? Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000)) : 0
}

export function recordFailure(key) {
  const now = Date.now()
  pruneFailures(now)
  const record = failures.get(key)
  if (!record || now > record.resetAt) {
    failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS })
    return
  }
  record.count += 1
}

export function clearFailures(key) {
  failures.delete(key)
}
