/**
 * 把 .secrets.json 里的 5 个变量推送到 Cloudflare Worker（加密存储为 Secret）。
 *
 * 用法：node scripts/put-secrets.mjs
 * 依赖：本机已 `npx wrangler login`，且 Worker 已经至少部署过一次
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const secretsPath = join(root, '.secrets.json')
if (!existsSync(secretsPath)) {
  console.error('找不到 .secrets.json，请先运行 node scripts/generate-secrets.mjs <PIN>')
  process.exit(1)
}

const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'))
// 直接调用本地安装的 wrangler 入口，避免 Windows 上 spawn npx.cmd 的 EINVAL
const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
if (!existsSync(wranglerBin)) {
  console.error('找不到本地 wrangler，请先 npm install')
  process.exit(1)
}

for (const [name, value] of Object.entries(secrets)) {
  process.stdout.write(`写入 ${name} … `)
  execFileSync(process.execPath, [wranglerBin, 'secret', 'put', name], {
    cwd: root,
    input: `${value}\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
  console.log('ok')
}

console.log('\n全部密钥已写入 Cloudflare Worker: review-it')
