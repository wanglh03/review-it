/**
 * 生成鉴权所需的盐、pepper 与摘要，写入 .dev.vars（本地）和 .secrets.json（部署用）。
 *
 * 用法：node scripts/generate-secrets.mjs 261023
 *
 * 前端会在浏览器里用 PBKDF2-SHA256(210000) 把 PIN 派生成 proof，
 * 服务端保存的只是 HMAC(AUTH_PEPPER, proof)，不保存 PIN 本身，也不保存可逆密文。
 */
import { pbkdf2Sync, createHmac, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const secret = process.argv[2]
if (!secret) {
  console.error('用法: node scripts/generate-secrets.mjs <PIN或密码>')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const salt = randomBytes(18).toString('base64url')
const pepper = randomBytes(32).toString('base64url')
const sessionSecret = randomBytes(32).toString('base64url')

const deriveProof = (scope) =>
  pbkdf2Sync(secret, `${salt}:${scope}`, 210000, 32, 'sha256').toString('base64')

const digest = (proof) => `v1$${createHmac('sha256', pepper).update(proof).digest('base64')}`

const values = {
  AUTH_SALT: salt,
  AUTH_PEPPER: pepper,
  ADD_PROOF_HASH: digest(deriveProof('add')),
  EDIT_PROOF_HASH: digest(deriveProof('edit')),
  SESSION_SECRET: sessionSecret,
}

const devVars = Object.entries(values)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')

writeFileSync(join(root, '.dev.vars'), `${devVars}\n`, 'utf8')
writeFileSync(join(root, '.secrets.json'), `${JSON.stringify(values, null, 2)}\n`, 'utf8')

console.log('已生成 .dev.vars 与 .secrets.json（两者都已在 .gitignore 中）')
console.log(`校验值预览: ADD=${values.ADD_PROOF_HASH.slice(0, 12)}… EDIT=${values.EDIT_PROOF_HASH.slice(0, 12)}…`)
