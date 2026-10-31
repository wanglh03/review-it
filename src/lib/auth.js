const ITERATIONS = 210000

/**
 * 在浏览器里把 PIN / 密码派生成 proof。
 * PIN 本身不会离开设备，服务端只看到 PBKDF2 的输出。
 */
export async function deriveProof(secret, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前浏览器不支持安全验证，请使用最新版 Chrome / Safari / Edge')
  }
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  )
  const bytes = new Uint8Array(bits)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
