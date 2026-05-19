<div align="center">

<img src="apps/web/public/icon.png" alt="Fast AI Uptime" width="120" />

# Fast AI Uptime

📡 **自托管 AI Provider 主动探测状态页 **

<p align="center">
  <a href="https://github.com/L1ulee/fast-ai-uptime/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/L1ulee/fast-ai-uptime?color=brightgreen" alt="license" />
  </a>
  <a href="https://github.com/L1ulee/fast-ai-uptime/releases/latest">
    <img src="https://img.shields.io/github/v/release/L1ulee/fast-ai-uptime?color=brightgreen&include_prereleases" alt="release" />
  </a>
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Postgres-16-336791?logo=postgresql&logoColor=white" alt="Postgres" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心功能">核心功能</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#%EF%B8%8F-环境变量">环境变量</a> •
  <a href="#-安全加固">安全</a> •
  <a href="#-贡献">贡献</a>
</p>

</div>

---

## 📝 项目介绍

> [!IMPORTANT]
> Fast AI Uptime 是一个面向 **AI Provider 接口可用性监控**的自托管状态页系统。
> - 主动周期探测 OpenAI / Anthropic / Gemini / 自定义 endpoint,实时呈现可用性热力图与事件时间线。
> - 镜像各家**官方 statuspage**,在同一界面把「我观察到的故障」与「上游声明的故障」并列展示。
> - 内置事件管理 / 计划维护 / 公告 / Webhook 投递,作为团队的**统一可观测入口**。
> - 单进程部署:**无外部 MQ / Redis / Cron 容器**,探测 Worker 直接内嵌在 Next.js 进程。

---

## 🚀 快速开始

### 使用 Docker Compose(推荐)

```bash
# 1. 克隆并进入仓库
git clone https://github.com/L1ulee/fast-ai-uptime.git
cd fast-ai-uptime

# 2. 复制环境变量模板,按里面提示生成 ENCRYPTION_KEY / SESSION_SECRET / ADMIN_PASSWORD
cp .env.example .env

# 3. 一键启动:Postgres → 自动迁移 → Web,全程无需手动干预
docker compose up -d
```

`up` 会按依赖顺序自动跑完:`postgres`(等健康)→ `migrate`(应用 drizzle 迁移后退出)→ `web`。

🎉 打开 <http://localhost:3000>(或 `.env` 里设的 `WEB_PORT`)即可登录管理后台开始配置探测。

<details>
<summary><strong>🐳 调试时暴露 Postgres 到主机</strong></summary>

```bash
# 默认 Postgres 仅在 Docker 网络内可达; 调试时启用 debug profile:
docker compose --profile debug up -d
# 现在 localhost:5433 可以连上 (psql / Drizzle Studio / DBeaver 等)
```

</details>

<details>
<summary><strong>💻 本地开发</strong></summary>

```bash
# 依赖: Node 20+, pnpm 9+, Docker
pnpm install

# 1. 配置环境
cp .env.example .env
# 生成 32 字节 hex:openssl rand -hex 32

# 2. 启动数据库
pnpm db:up

# 3. 应用迁移
pnpm --filter @fau/db db:migrate

# 4. 启动 dev server(含探测 Worker)
pnpm dev
```

</details>

> [!WARNING]
> `.env.example` 中三个 secret 默认是占位符,**必须自行生成新值**并写入 `.env`。
> 启动检查会拒绝已知的历史 demo 值,避免误把弱密钥推上生产。

---

## ✨ 核心功能

### 📊 公开状态页

| | 说明 |
|---|---|
| 🎯 **实时总览** | 整体状态 Hero + 按 Provider 分组的组件列表 |
| 🔥 **90 天热力图** | Apple Dock 风格放大,hover 显示当日可用率 + 事件 |
| 📅 **事件 / 维护** | 分月翻页 (`/maintenance`, `/incidents`),状态机时间线 |
| 🌐 **官方状态镜像** | `/official-status` 同步上游 statuspage / RSS / Atom,展示上游事件 |
| 🌗 **主题** | 浅色 / 深色 / 跟随系统,管理员可锁定 |
| 🌏 **多语言** | 中文 / English,跟随 admin 系统设置切换 |
| ⏰ **时区感知** | 时间统一带 IANA 时区缩写 (`HKT`/`CST`/`EDT`),admin 可配置 |
| 📱 **响应式** | 桌面三栏 / 移动单列,sidebar 在窄屏自动收起 |

### 🛠️ 管理后台

| | 说明 |
|---|---|
| 🔌 **探测组件** | 自定义 HTTP method / headers / body,支持 `{{API_KEY}}` `{{model}}` `{{timestamp}}` 模板 |
| 🏷️ **Providers** | API Key **AES-256-GCM 加密落库**,自动发现模型,baseUrl 继承 |
| 📦 **模型 / 分组** | 集中管理,公开页分组顺序自由编排 |
| 🚨 **事件管理** | 调查中 → 已定位 → 观察中 → 已解决 状态机,影响组件联动 |
| 🔧 **计划维护** | 维护窗口自动联动组件状态,提前/收尾自动广播 |
| 📢 **公告** | 站顶横幅,info / warning / error 三级,时间窗口 |
| 🪝 **Webhook 订阅** | HMAC-SHA256 + timestamp 签名,失败指数退避重试至多 5 次,reveal-once secret |
| 🪞 **官方镜像** | statuspage.io v2 (`/api/v2/summary.json`) 与 RSS / Atom 双协议 |
| 📜 **日志管理** | 分类查看、按设置时区每日自动清理,可手动一键清空 |
| ⚙️ **系统设置** | 品牌 / 公开页 / 默认 Tweaks / 探测默认值 / 保留期 / 语言 |
| 🔍 **审计日志** | 所有写操作有迹可循,含 actor IP + payload |

### 🔌 公开 API

| | 说明 |
|---|---|
| `GET /api/v1/status` | 全站快照 (groups / components / 90d daily / events) |
| `GET /api/v1/components/[id]/history` | 单组件桶聚合历史 (24h / 7d / 30d) |
| `GET /api/healthz` | 健康检查 |
| ETag + CORS `*` | 内置共享缓存与跨域 |

---

## 🔒 安全加固

> [!IMPORTANT]
> v1.0.0 起项目内置**生产级安全防护**,无需额外组件:

| 类别 | 实现 |
|---|---|
| 🛡️ **SSRF 防护** | 私网/loopback/link-local/multicast IPv4 与 IPv6 (含 hex-form 4-in-6) 拦截;undici per-request DNS pinning;redirect 手动重验 |
| 🔐 **凭据加密** | Provider API Key、Webhook secret 全部 AES-256-GCM 加密落库;前端**永不接触明文** |
| 🚪 **登录加固** | Session HMAC-SHA256;失败 5 次 IP 自动锁定 15 分钟;不信任 XFF/Real-IP/CF-Connecting-IP,需 env opt-in |
| 🚨 **CSRF** | middleware 校验 `Sec-Fetch-Site` 与 `Origin`,所有 `/admin/**` 状态变更走同源验证 |
| 🧹 **输入校验** | brandColor 严格 regex;logo/favicon 仅接受 `data:image/...`/`https://`/站内相对路径;sql.identifier 拒绝表名拼接 |
| 🪪 **响应头** | CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy 默认开启 |
| 🐳 **Docker 强化** | 三个 secret 必填(缺失拒启动);Postgres 端口默认不出网;容器以 non-root user 10001 运行 |

---

## 🧰 技术栈

<table>
<tr>
<td>

**前端 / 渲染**
- Next.js 15 (App Router + Server Actions)
- React 19
- Tailwind CSS + 自研 design tokens
- lucide-react 图标
- react-markdown + remark-gfm

</td>
<td>

**后端 / 数据**
- Drizzle ORM
- PostgreSQL 16
- AES-256-GCM (`@fau/core`)
- undici 自定义 dispatcher (SSRF)
- p-map 并发控制

</td>
</tr>
<tr>
<td>

**工程化**
- pnpm 9 + Turborepo monorepo
- TypeScript 5 strict mode
- ESLint + Prettier + Husky
- node:test (运行时原生测试)
- Drizzle Kit 迁移

</td>
<td>

**部署**
- Docker (multi-stage) + standalone
- docker compose (postgres + migrate + web)
- 内嵌 Worker (probe / aggregator / webhook / official-status / log-cleanup)
- 多实例 lease (`probe_leases`)

</td>
</tr>
</table>

---

## ⚙️ 环境变量

`.env` 必填(参见 [`.env.example`](.env.example)):

| 变量 | 必填 | 说明 |
|---|:--:|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | ✅ | docker compose 自动组装 `DATABASE_URL` |
| `DATABASE_URL` | ✅ | 非 docker 部署时直接给完整连接串 |
| `ENCRYPTION_KEY` | ✅ | API Key 加密用,**32 字节 hex**:`openssl rand -hex 32` |
| `SESSION_SECRET` | ✅ | Cookie 签名密钥,**32 字节 hex** |
| `ADMIN_PASSWORD` | ✅ | 后台登录密码 |
| `BASE_URL` |  | 公开访问 URL,用于邮件 / Webhook 回链 |
| `TRUSTED_PROXY_HOPS` |  | 反代跳数(默认 0,不信任 XFF);1=单层 nginx/Caddy 后 |
| `TRUSTED_CLOUDFLARE` |  | `=1` 才信任 `cf-connecting-ip`,反之忽略 |
| `TRUSTED_REAL_IP` |  | `=1` 才信任 `x-real-ip` |
| `SAFE_FETCH_EXTRA_ALLOWED_CIDRS` |  | 本地代理场景(Clash/Surge 在 `198.18.0.0/15`)opt-in 放行 |
| `POLL_INTERVAL_SECONDS` |  | 默认探测间隔(默认 60) |
| `CHECK_CONCURRENCY` |  | 同时并行探测数(默认 5) |
| `OFFICIAL_STATUS_INTERVAL_SECONDS` |  | 官方镜像同步间隔(默认 300) |
| `HISTORY_RETENTION_DAYS` |  | 原始 check_results 保留天数(默认 30) |
| `PROBE_DISABLED` |  | `=1` 关闭内嵌 Worker(仅 UI 模式) |
| `WEB_PORT` |  | 映射宿主机端口(默认 3000) |

---

## 🌍 多语言

界面已内置 **简体中文 / English** 两套字典。

- 切换:`/admin/settings` → 站点 → 界面语言
- 已双语标记的业务文案(事件状态、status badge 等)保持原样;未标记的导航/页脚/卡片标签自动跟随设置
- `<html lang>` 与 `Intl` locale 同步切换

如需新增语言,扩展 [`apps/web/lib/i18n.ts`](apps/web/lib/i18n.ts) 的 catalog 即可。

---

## 📚 文档与帮助

| 主题 | 链接 |
|---|---|
| 🚀 部署指引 | 本文「快速开始」 |
| ⚙️ 环境变量 | 本文「环境变量」 / [`.env.example`](.env.example) |
| 📜 变更日志 | [`CHANGELOG.md`](./CHANGELOG.md) |
| 🤝 协作规范 | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| 🐛 提 Issue | <https://github.com/L1ulee/fast-ai-uptime/issues> |
| 💬 讨论 | <https://github.com/L1ulee/fast-ai-uptime/discussions> |

---

## 🤝 贡献

欢迎 PR / Issue / Discussion!提交规范遵循 [Conventional Commits](https://www.conventionalcommits.org/),pre-commit hook 会自动格式化与校验。详情见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

```bash
pnpm dev                              # 启动开发服务器
pnpm typecheck                        # 整个 monorepo 类型检查
pnpm lint                             # ESLint
pnpm --filter @fau/providers test     # Provider 适配器单元测试
pnpm --filter @fau/db db:generate     # schema 改动后生成迁移
pnpm --filter @fau/db db:studio       # Drizzle Studio
```

---

## 📜 License

[MIT](./LICENSE) © L1ulee

<div align="center">

⭐ 如果对你有帮助,欢迎 [Star](https://github.com/L1ulee/fast-ai-uptime) 支持

</div>
