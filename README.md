# 我们的测评！

记录「探店测评」的时间轴小站：美食、景点、酒店……按日期排好，配图、地点和文字一起收进来。

- 前端：Vite + React 19 + Tailwind CSS 4
- 后端：Cloudflare **Worker**（`worker/`）+ Workers Static Assets
- 存储：Cloudflare R2 存储桶 `review-it`（记录 JSON + 原图）
- 地图：Leaflet + 高德瓦片（无需 Key），坐标统一存 WGS-84，展示时转 GCJ-02

线上地址：**https://review.gtbro.vip**

## 功能

- **时间轴**：左侧一条长的时间轴，最新的日期置顶；每条记录包含日期、标题、Markdown 正文、照片、标签、地点与地址。**同一天可以写多条测评**，日期栏会显示年份和这条记录的时间。
- **地址锚点**：滚动时地址栏实时变成 `#26-10-27`；把这个链接发给对方，打开就会定位到那一天。
- **相册**：只看图片的瀑布流，点开照片能看到当天整篇记录，并可一键跳回时间轴。
- **大地图**：把所有记录过的地点标在同一张地图上，点标记看当天记录。
- **地图选点**：添加 / 编辑记录时，直接在地图上点击或拖动标记来选位置，也可以「定位到我」。
- **地图搜索**：输入店名或地址搜索，点结果自动标点并回填名称、地址。配置高德 Key 后使用高德数据，否则用 OpenStreetMap 兜底。
- **可爱风日历**：有记录的日子是珊瑚色圆点，点一下跳转；没记录的日期灰色且不可点；翻页最远只到第一篇记录的月份。
- **添加记录**：选日期、写 Markdown（工具栏 + 预览）、传照片（浏览器端自动压缩）、选标签、地图选点；需要 **PIN 码**。
- **修改 / 删除**：每条记录右上角，需要 **编辑密码**；编辑时可以修改日期，把记录挪到别的日子。
- **标签维护**：改名、换 emoji、增删；删除标签会同步从记录上移除。
- **手机适配**：底部抽屉弹窗、安全区适配、禁止双指 / 双击缩放。

## 地图搜索（可选接高德）

搜索接口 `/api/geo/search` 默认使用 OpenStreetMap（Nominatim / Photon），不需要 Key，
适合搜地标、路名、城市；但 OSM 缺少大量餐厅类 POI。

要搜到「一兰拉面」这种店名，建议配置一个高德 **Web 服务** Key：

1. 打开 <https://console.amap.com/dev/key/app>，创建应用并添加 Key；
2. 服务平台选择 **Web 服务**（不是 Web 端 JS API）；
3. 把 Key 写入 Worker Secret：

```bash
npx wrangler secret put AMAP_KEY
```

配置后搜索会优先走高德（含门牌号 / 店名），失败时自动回退 OSM。

## 安全设计

PIN 码与编辑密码都不以明文经网络传输或存储：

1. 前端用 `PBKDF2-SHA256`（210000 次迭代 + 服务端下发的盐）派生 `proof`，密码本身不离开设备；
2. 服务端只保存 `HMAC-SHA256(AUTH_PEPPER, proof)` 摘要，恒定时间比较；
3. 校验通过后签发 2 小时有效的 HMAC 令牌（`add` / `edit` 两种 scope），放在 `Authorization: Bearer` 头里，天然免疫 CSRF；
4. 登录失败按 IP + scope 限流（10 分钟 6 次）并附加固定延迟；
5. 上传校验文件头魔数与声明类型，图片 key 走白名单格式校验。

## 目录结构

```
worker/
  index.js          # Worker 入口：/api/* 走后端，其余交给静态资源
  api.js            # 所有 API 路由
  lib/auth.js       # PBKDF2 / HMAC / 令牌 / 限流
  lib/store.js      # R2 读写与数据规范化
src/
  App.jsx           # 页面状态、滚动定位、弹窗编排
  components/       # 时间轴、日历、相册、地图、编辑器等
  lib/              # 日期、Markdown、坐标转换、Leaflet 封装
public/_headers     # CSP 等安全响应头
wrangler.toml       # Worker + 静态资源 + R2 + 自定义域名
```

## 本地开发

```bash
npm install
node scripts/generate-secrets.mjs <PIN>   # 生成 .dev.vars（盐 / pepper / 摘要）
npm run build                            # 先产出 dist，Worker 才能服务静态资源
npm run dev:worker                       # 8788：Worker + 本地 R2
npm run dev                              # 5173：Vite，/api 代理到 8788
```

接口冒烟测试（22 项断言）：

```bash
node scripts/smoke-api.mjs
```

## 部署

```bash
npx wrangler login
npm run deploy                 # 构建并部署 Worker（含自定义域名 / R2 绑定）
node scripts/put-secrets.mjs   # 首次部署后写入 5 个 Secret
```

`wrangler.toml` 已声明：

```toml
[assets]
directory = "./dist"
binding = "ASSETS"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "review-it"

[[routes]]
pattern = "review.gtbro.vip"
custom_domain = true
```

### 自动部署（GitHub Actions）

`.github/workflows/deploy.yml` 会在 push 到 `main` 时构建并部署。需要在仓库
**Settings → Secrets and variables → Actions** 里加两个 Secret：

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API Token，权限：Account → Workers Scripts: Edit、Workers Routes: Edit；Zone → DNS: Edit（自定义域名需要） |
| `CLOUDFLARE_ACCOUNT_ID` | `b8d89f47a5e4867bef49cd1c51265dd3` |

也可以用脚本写入（需要 GitHub token）：

```bash
$env:GH_TOKEN="..."; $env:CF_API_TOKEN="..."; node scripts/set-gh-secrets.mjs
```

未配置 token 时工作流会跳过部署并给出警告，不会失败。

## 数据结构

R2 只有两类对象：

| key | 内容 |
| --- | --- |
| `site/data.json` | 全部记录与标签 |
| `site/images/YYYYMMDD/<16位随机>.<ext>` | 图片，通过 `/api/img/<key>` 读取 |

```jsonc
{
  "version": 1,
  "updatedAt": "2026-10-27T15:00:00.000Z",
  "tags": [{ "id": "t_food", "name": "美食", "emoji": "🍜" }],
  "entries": [
    {
      "id": "e_a018becd6b27",
      "date": "2026-10-27",
      "title": "巷子里的那家拉面",
      "content": "## 好吃到转圈\n\n汤头浓郁……",
      "images": [{ "key": "site/images/20261027/ab12cd34ef56gh78.jpg", "w": 1800, "h": 1200 }],
      "tags": ["t_food"],
      "location": {
        "name": "一兰拉面",
        "address": "上海市黄浦区南京东路 100 号",
        "mapUrl": "",
        "lat": 31.2304,
        "lng": 121.4737
      },
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
| POST | `/api/upload` | 上传图片（需 add / edit 令牌） |
| POST | `/api/posts` | 新建记录（需 add 令牌） |
| PUT | `/api/posts/:id` | 修改这条记录（需 edit 令牌） |
| DELETE | `/api/posts/:id` | 删除这条记录（需 edit 令牌） |
| POST | `/api/tags` | 保存标签（需 edit 令牌） |
| GET | `/api/geo/search?q=` | 店名 / 地址搜索（公开） |
| GET | `/api/img/*` | 读取图片 |

## 密钥

| 变量 | 说明 |
| --- | --- |
| `AUTH_SALT` | PBKDF2 的盐 |
| `AUTH_PEPPER` | 计算摘要用的 pepper |
| `ADD_PROOF_HASH` | PIN 对应的摘要 |
| `EDIT_PROOF_HASH` | 编辑密码对应的摘要 |
| `SESSION_SECRET` | 签发令牌的密钥 |
| `AMAP_KEY` | 可选，高德 Web 服务 Key（用于店名搜索） |

`.dev.vars` 与 `.secrets.json` 已在 `.gitignore` 中。**换 PIN 或密码**：重新运行
`node scripts/generate-secrets.mjs <新密码>`，再执行 `node scripts/put-secrets.mjs`。
