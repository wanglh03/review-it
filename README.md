# 我们的测评！

一个用来记录「探店测评」的时间轴小站：美食、景点、酒店……按日期排好，配图和文字一起收进来。

- 前端：Vite + React 19 + Tailwind CSS 4
- 后端：Cloudflare Pages Functions（`functions/` 目录）
- 存储：Cloudflare R2 存储桶 `review-it`（记录 JSON + 原图）

## 功能

- **时间轴**：左侧一长条时间轴，日期最新的置顶；每条记录包含日期、标题、Markdown 正文、照片、标签、地点与地址。
- **地址锚点**：滚动时地址栏实时变成 `#26-10-27`；把这个链接发给对方，打开就会定位到那一天。
- **相册**：切换成只看图片的瀑布流，点开任意照片会显示当天整篇记录，并可一键跳回时间轴。
- **可爱风日历**：有记录的日子是珊瑚色圆点，点一下就跳转；没有记录的日期是灰色且不可点；月份翻页最远只到第一篇记录的月份。
- **添加记录**：选日期、写 Markdown（带工具栏与预览）、传照片（浏览器端自动压缩）、选标签（可多选）、填地点与地址；需要输入 **PIN 码**。
- **修改 / 删除**：每条记录右上角的编辑、删除按钮，需要输入 **编辑密码**。
- **标签维护**：改名、换 emoji、增删标签；删除标签会同步从记录上移除。
- **手机适配**：移动端底部抽屉式弹窗、安全区适配、禁止双指/双击缩放。

## 安全设计

PIN 码与编辑密码都不以明文形式经网络传输或存储：

1. 前端用 `PBKDF2-SHA256`（210000 次迭代 + 服务端下发的盐）派生出 `proof`，密码本身不离开设备；
2. 服务端只保存 `HMAC-SHA256(AUTH_PEPPER, proof)` 摘要，用恒定时间比较；
3. 校验通过后签发 2 小时有效的 HMAC 令牌（`add` / `edit` 两种 scope），放在 `Authorization: Bearer` 头里，不用 Cookie，天然免疫 CSRF；
4. 失败次数按 IP + scope 限流（10 分钟 6 次），并附加固定延迟；
5. 上传接口会校验文件头魔数与声明类型是否一致，图片 key 也做了白名单格式校验。

## 本地开发

```bash
npm install
node scripts/generate-secrets.mjs <你的PIN或密码>   # 生成 .dev.vars（含盐、pepper、摘要）
npx wrangler pages dev dist --port 8788            # 本地跑 Pages + Functions
npm run dev                                        # 另开一个终端跑 Vite（/api 代理到 8788）
```

本地接口冒烟测试（18 项断言）：

```bash
node scripts/smoke-api.mjs
```

## 部署

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 首次创建 Pages 项目（之后只需 deploy）
npx wrangler pages project create review-it --production-branch main

# 3. 写入 5 个密钥（值在 .secrets.json 里，脚本已生成）
node scripts/put-secrets.mjs review-it

# 4. 构建并发布
npm run deploy
```

`wrangler.toml` 里已经声明了 R2 绑定：

```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "review-it"
```

首次部署后如果绑定没生效，在 Cloudflare 控制台 **Workers & Pages → review-it → Settings → Bindings** 里补一条
`R2 bucket`，变量名 `BUCKET`，选择存储桶 `review-it` 即可。

## 数据结构

R2 里只有两类对象：

| key | 内容 |
| --- | --- |
| `site/data.json` | 全部记录与标签（一个 JSON 文件） |
| `site/images/YYYYMMDD/<16位随机>.<ext>` | 上传的图片，通过 `/api/img/<key>` 读取 |

```jsonc
{
  "version": 1,
  "updatedAt": "2026-10-27T15:00:00.000Z",
  "tags": [{ "id": "t_food", "name": "美食", "emoji": "🍜" }],
  "entries": [
    {
      "date": "2026-10-27",
      "title": "巷子里的那家拉面",
      "content": "## 好吃到转圈\n\n汤头浓郁……",
      "images": [{ "key": "site/images/20261027/ab12cd34ef56gh78.jpg", "w": 1800, "h": 1200 }],
      "tags": ["t_food"],
      "location": { "name": "一兰拉面", "address": "上海市黄浦区南京东路 100 号", "mapUrl": "" },
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/posts` | 拉取全部记录与标签 |
| GET | `/api/auth/salt?scope=add\|edit` | 取前端派生用的盐 |
| POST | `/api/auth` | 提交 proof，换取令牌 |
| POST | `/api/upload` | 上传图片（需 add 或 edit 令牌） |
| POST | `/api/posts` | 新建记录（需 add 令牌） |
| PUT | `/api/posts/:date` | 修改当天记录（需 edit 令牌） |
| DELETE | `/api/posts/:date` | 删除当天记录（需 edit 令牌） |
| POST | `/api/tags` | 保存标签（需 edit 令牌） |
| GET | `/api/img/*` | 读取图片 |

## 密钥

| 变量 | 说明 |
| --- | --- |
| `AUTH_SALT` | PBKDF2 的盐 |
| `AUTH_PEPPER` | 计算摘要用的 pepper |
| `ADD_PROOF_HASH` | PIN 对应的摘要 |
| `EDIT_PROOF_HASH` | 编辑密码对应的摘要 |
| `SESSION_SECRET` | 签发令牌的密钥 |

`.dev.vars` 与 `.secrets.json` 已在 `.gitignore` 中，不会进仓库。**换 PIN 或密码**只需重新运行
`node scripts/generate-secrets.mjs <新密码>`，再把新值推送到 Cloudflare（`node scripts/put-secrets.mjs review-it`）。
