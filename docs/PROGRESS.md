# PROGRESS — 开发进度（每次代码提交前必更新本文档，git 钩子强制）

> 更新纪律：完成项打勾+日期；新问题进"遗留/风险"；规范未覆盖的决策进"待拍板"。
> 动手前先读：`ARCHITECTURE.md` → `SPEC.md` → 本文档。
> 最后更新：**2026-07-23**

## ✅ M0 · 拆库独立（2026-07-23 达成）

- [x] 从主工程 `pogglo/cli` 拆出独立仓库，git 版本管理（2026-07-23）
- [x] 文档体系：CLAUDE.md（会话入口）+ ARCHITECTURE.md（架构/协议/错误契约）+ SPEC.md（v1 规范）+ 本文档（2026-07-23）
- [x] 测试从零到有：pack.js 单测 4 条 + CLI 端到端 4 条（伪 HOME，无网络）（2026-07-23）
- [x] pre-commit 钩子：改代码必须同 commit 更新本文档 + 测试全绿，否则拒绝提交（2026-07-23）
- [x] npm 包名 `pogglo` 查证未被占用（registry 404，2026-07-23）——尽快抢注，见 M2

## ✅ 账号体系协议同步（2026-07-23，跨仓库契约随主工程 D13 拍板）

- [x] `login` 改两步邮箱验证码流程：`--email` 发码（本地平台回显 dev_code）→ `--email --code` 换 token 存 config；零 TTY，AI 分两次调用可完成（2026-07-23）
- [x] `publish` 废除随机 token 自举与 `x-pogglo-author` 自报：未登录报 AI 可自纠的两步指引；报错优先级=先产物问题后身份问题（2026-07-23）
- [x] `whoami` 显示邮箱；config 增 email 字段（2026-07-23）
- [x] 测试 8→10 条（login 缺参指引 / 未登录 publish 指引）；与 ../pogglo/platform 真 HTTP 联调冒烟通过（2026-07-23）

## ✅ v1 协议切换（2026-07-23，实验版转正为平台后的跨仓库契约同步）

- [x] 端点默认生产 `https://pogglo-api.txqy0831.workers.dev`（POGGLO_ENDPOINT/--endpoint 可覆盖）（2026-07-23）
- [x] login 打 `/v1/auth/send-code|verify`；错误体适配 v1 `{code,msg,ai_fix_prompt}`（ai_fix_prompt 透出给调用方 AI）（2026-07-23）
- [x] **publish --code POG-XXXX 配对码路径**（M1 主打项落地）：发 `x-pogglo-code` 头免登录；配对码=网页签发的生产语境委托，**无视本地 config 的 endpoint**（防旧 localhost 配置劫持）（2026-07-23）
- [x] publish 打 `/v1/submit`：Bearer 鉴权 + `x-title`（--title > pogglo.json > index.html \<title\>）+ `x-slug`；输出 page_url（创作者优先 URL）/play_url（2026-07-23）
- [x] 测试 10/10 绿；生产真发布冒烟通过（配对码 POG-4P34 → e2e-smoke-game → 已清理）（2026-07-23）

## 🔨 进行中

（空 — 领任务时移入本区并写上名字/会话与开始日期）

## ⬜ 待办

### M1 收尾 · 魔法指令实测

- [ ] 魔法指令文案初稿（贴进 AI 客户端的那段话），放 docs/ 下并在 Claude Code / Codex / Kimi 实测各 ≥1 轮
  （--code 配对码路径本体已落地，见上方"v1 协议切换"）

### M3 · 后续

- [ ] 配对码失败重试语义端到端验证：码成功前可重试、成功后同码重发=覆盖（服务端为准，CLI 侧补集成说明进 ARCHITECTURE §6）
- [ ] MCP 改为依赖本 npm 包，消灭 pack.js 双副本

## ❓ 待拍板

| 日期 | 事项 | 状态 |
|---|---|---|
| 2026-07-23 | 码的具体格式/长度/TTL（建议：6 位大写字母数字，24h）— 跨仓库契约 | ✅ 已拍板并实现：`POG-XXXX` 配对码（2026-07-23） |

## ⚠️ 遗留 / 风险

| 日期 | 问题 | 状态 |
|---|---|---|
| 2026-07-23 | 主工程 `pogglo/cli` 已移除，README 等引用已指到本仓库；MCP 的 pack.js 是独立副本，两边改产物定位逻辑要人工同步 | 长期：考虑 MCP 依赖本包（进 M3） |
| 2026-07-23 | 包名未抢注，被占则魔法指令品牌受影响 | ✅ 已解决：0.1.0 于 2026-07-23 02:59 UTC 发布抢注成功 |
| 2026-07-23 | 线上 0.1.0 是旧协议（localhost 默认端点 + 老 /api/publish），对生产不可用；魔法指令依赖 `@latest` | 🔥 0.2.0 发布后消除（本次发版） |

## 📦 版本历史

| 版本 | 日期 | 内容 |
|---|---|---|
| 0.1.0 | 2026-07-23 | npm 首发抢注包名（旧协议，随后被 0.2.0 取代） |
| 0.2.0 | 2026-07-23 | v1 生产协议：邮箱验证码登录（两步零 TTY）、`publish --code POG-XXXX` 配对码免登录、默认生产端点、`/v1/submit` Bearer 鉴权、`ai_fix_prompt` 透传、README 面向创作者重写；测试 10/10 |
