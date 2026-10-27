/**
 * 把 .secrets.json 里的 5 个变量推送到 Cloudflare Pages 项目（加密存储）。
 *
 * 用法：node scripts/put-secrets.mjs <pages 项目名>
 * 依赖：本机已 `npx wrangler login`
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const project = process.argv[2]
if (!project) {
  console.error('用法: node scripts/put-secrets.mjs <pages 项目名>')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const secretsPath = join(root, '.secrets.json')
if (!existsSync(secretsPath)) {
  console.error('找不到 .secrets.json，请先运行 node scripts/generate-secrets.mjs <PIN>')
  process.exit(1)
}

const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'))
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

for (const [name, value] of Object.entries(secrets)) {
  process.stdout.write(`写入 ${name} … `)
  execFileSync(npx, ['wrangler', 'pages', 'secret', 'put', name, '--project-name', project], {
    cwd: root,
    input: `${value}\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
  console.log('ok')
}

console.log('\n全部密钥已写入 Cloudflare Pages 项目:', project)
