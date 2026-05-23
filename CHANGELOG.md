# Changelog

本项目所有显著变更均记录于此文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [v1.0.1] - 2026-05-23

### Added

- **探测组件 / 请求体模板选择器**：编辑器上方一键填入 `Chat 对话` / `图片生成` / `Embeddings` 三种 JSON 骨架，覆盖最常见的 OpenAI 兼容端点形态。
- **请求头 / 请求体启用开关**：分别可关闭；关闭时该字段不进入 FormData，服务端按 `null` 落库，探测时完全不发送（适配 `GET /models` 等无需自定义头/体的端点）。

### Changed

- **默认请求体改用 `{{model}}` 占位符**：运行时由 probe 替换为该组件绑定的真实模型名，编辑器中不再硬编码模型字面量。
- **探测超时上限放宽至 600000 ms（10 分钟）**：服务端 `clamp` 与表单 `max` 同步调整，适配图片生成、长上下文推理等慢端点；之前是 120000 ms。

### Fixed

- **新建探测组件时请求体永远显示第一个模型名的 bug** —— `body` 的 `useState` 初始化时绑定了 `models[0]`，切换模型下拉框不会更新（`apps/web/components/admin/configs-table.tsx`）。改用 `{{model}}` 模板后从根上消除该问题。

## [v1.0.0] - 2026-05-19

Initial public release of Fast AI Uptime — 面向 AI Provider 的主动探测状态页。

### Highlights

#### 公开页
- Hero 状态总览 / Group 分组 / 90 天可用率热力图 / 90 天事件时间线
- 计划维护与历史事件分月翻页 (`/maintenance`, `/incidents`)
- 官方上游状态镜像 (`/official-status`)
- 多语言 UI（zh / en），跟随 admin 设置切换
- 站点时区感知的时间显示 (例如 `2026-05-19 19:20 HKT`)
- 移动端响应式布局

#### 管理后台
- 探测组件（HTTP 自定义方法 / headers / body / `{{API_KEY}}` `{{model}}` `{{timestamp}}` 模板）
- Providers / 模型 / 分组管理（API Key AES-256-GCM 加密落库）
- 事件、维护、公告、Webhook 订阅 CRUD（带审计日志）
- 上游官方状态镜像配置
- 日志管理（分类清除、按设置时区每日自动清理）
- 系统设置：站点、品牌、公开页、用户 Tweaks、探测默认值、日志保留 / 转发

#### 平台 / 工程
- Next.js 15 App Router + React 19 + TypeScript
- Drizzle ORM + PostgreSQL 16
- pnpm + Turborepo monorepo（`@fau/web`, `@fau/core`, `@fau/db`, `@fau/providers`）
- Tailwind CSS + 自研设计 token
- HTTP 探测 5 分钟桶聚合 + 保留期回收 + 多实例 lease
- Webhook 投递带 HMAC-SHA256（signature 含 timestamp 防重放）+ retry/backoff
- 公开 JSON API (`/api/v1/*`) + ETag + 共享缓存

#### 安全
- AES-256-GCM 加密 Provider API Key
- Session 鉴权 + 登录 brute-force rate-limit + CSRF middleware
- SSRF 防护：私网/loopback/link-local/multicast IPv4 与 IPv6（含 hex-form 4-in-6）拦截、undici per-request DNS pinning、redirect 手动重验
- 安全响应头：CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- docker-compose 必填 secret 校验，runtime 非 root 用户

[Unreleased]: https://github.com/L1ulee/fast-ai-uptime/compare/v1.0.1...HEAD
[v1.0.1]: https://github.com/L1ulee/fast-ai-uptime/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/L1ulee/fast-ai-uptime/releases/tag/v1.0.0
