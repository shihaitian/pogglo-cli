# PROGRESS — 开发进度（每次代码提交前必更新本文档，git 钩子强制）

> 更新纪律：完成项打勾+日期；新问题进"遗留/风险"；规范未覆盖的决策进"待拍板"。
> 动手前先读：`ARCHITECTURE.md` → `SPEC.md` → 本文档。
> 最后更新：**2026-07-23**

## ✅ 注册自选用户名（2026-07-23，跨仓库契约随主工程同步：verify 不再自动截邮箱前缀建号）

- [x] login 适配 `/v1/auth/verify` 新语义：老用户原样拿 token；新邮箱收 `{need_handle, reg_token}`（15 分钟票据）→ 存 `~/.pogglo/pending-signup.json`，`--handle <name>` 收尾注册（可与 --code 同行一气呵成）（2026-07-23）
- [x] 输出明示红线文案：用户名唯一且注册后**不可更改**（HELP、need_handle 指引、注册成功回执三处都提）（2026-07-23）
- [x] 服务端配套（主工程 api）：`/v1/auth/register`（422 E_HANDLE / 409 E_HANDLE_TAKEN / 401 E_REG_EXPIRED）；规则 3-16 位小写字母/数字/_/-（2026-07-23）
- [x] 测试 19/19 绿（无网络路径不受影响）；遗留：未与生产真流程冒烟（等 worker 部署后补）（2026-07-23）

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

## ✅ MCP server 并包（2026-07-23，legacy mcp/ 复活 + M3"消灭 pack.js 双副本"提前达成）

- [x] `src/mcp.js` + bin `pogglo-mcp`（同 npm 包第二入口）：publish_game（Bearer 或 `code` 配对码参数；元数据落 pogglo.json；ai_fix_prompt 透传给调用方 AI）+ list_games（2026-07-23）
- [x] 与 CLI 共享 pack.js / ~/.pogglo 登录态；配对码路径与 list_games 不读本地 config endpoint（防 localhost 劫持，与 CLI 同规则）（2026-07-23）
- [x] 测试 11 条（新增 buildServer 注册面）；真 MCP 客户端生产冒烟：stdio 起服 → tools/list → 配对码 publish_game 上线双域 URL → 清理，全通（2026-07-23）
- [x] 依赖新增 @modelcontextprotocol/sdk + zod（2026-07-23）

## ✅ 项目身份闭环（2026-07-23，用户拍板：pogglo.json 记 slug + link 命令）

- [x] publish 成功后把服务端确认的 slug 写进项目根 `pogglo.json`（产物目录会被 rebuild 清掉，故写根目录；`pogglo publish dist` 场景自动爬到父目录）；后续 publish 自动带 `x-slug` → 改标题/换机器都精确更新同一款（2026-07-23）
- [x] 新命令 `link <slug | handle/slug | 游戏URL>`：消费 `GET /v1/games/:slug` 反向恢复 pogglo.json（fresh clone 一条命令绑回）；支持 /handle/slug/、/p/?slug=、/play/slug/ 三种 URL 形态；错主人/查无此游戏都有三要素报错（2026-07-23）
- [x] MCP publish_game 同步：读 pogglo.json 已存 slug 自动带 x-slug，成功后写回 body.slug（2026-07-23）
- [x] 服务端配套（主工程 api/src/index.mjs）：配对码首次成功发布后绑定 slug（KV `code:`），同码重发=覆盖更新，每次使用 TTL 顺延 24h——落实 ARCHITECTURE §6 M1 拍板语义（2026-07-23）
- [x] 测试 10→15 条全绿；link 生产冒烟通过（URL 解析/写文件/错主人报错）（2026-07-23）
- [x] 遗留：发版（minor：新命令+新行为）——0.3.0 已发布；后续改动进 0.4.0（2026-07-23）

## ✅ slug 语义整治（2026-07-23，最终拍板：全放开 + 提示词引导）

- [x] `cleanEngineTitle`：index.html \<title\> 剥引擎样板前缀（Unity WebGL Player/团结引擎/Cocos Creator…）取真名（2026-07-23）
- [x] **命名不设卡点**（用户拍板：slug 有创作者命名空间兜底）：剥不出真名 → 按原样上传 + 一句温和提醒；取名引导放在发布页魔法提示词（加 `--slug`/`--title` 示范）；服务端 E_BAD_SLUG 硬拒收同步撤销（2026-07-23）
- [x] 测试 17/17：剥壳矩阵 + 引擎默认标题"提醒但不拦"（2026-07-23）

## ✅ 竖屏游戏声明（2026-07-23，跨仓协议新增 `x-orientation`，与主工程 api/site 同步落地）

- [x] publish 新 flag `--orientation portrait|landscape`：--orientation > pogglo.json `orientation` 字段 > 不带头（服务端默认 landscape）；非法值在打包前三要素报错（AI 可自纠）（2026-07-23）
- [x] 发布成功且有声明时把 orientation 写回项目根 pogglo.json——下次 publish 不带 flag 也不丢竖屏声明（2026-07-23）
- [x] MCP publish_game 同步：manifestShape 加 `orientation` 枚举（optional），metadata 声明或 pogglo.json 已存值 → 带 `x-orientation` 头（2026-07-23）
- [x] 测试 +1（非法值打包前拦截 / portrait 走到网络层 / pogglo.json 非法值同样拦截）（2026-07-23）
- [x] 服务端配套（主工程）：D1 games 加 `orientation` 列（migrations/2026-07-23-orientation.sql）；/v1/submit 读头、/v1/submit-github 读 body、PATCH 可改；覆盖更新不带头沿用已存值；站点游戏页对 portrait 做 9:16 等比 letterbox（2026-07-23）

## ✅ help 别名修正（2026-07-23）

- [x] `-h` / `-help` / `--help` 一律等价 `help`：打印用法且退出 0——此前 `-help` 打印帮助却退出 1，会把调用方 agent 误导进自我修复循环；测试 +1（三种写法断言退出码）（2026-07-23）

## ✅ 服务端非 JSON 响应如实报错（2026-07-23，1101 排障产物）

- [x] `readJson(res)`：所有 `res.json()` 调用点（api()/link/publish + MCP publish_game）先验明正身——服务端 5xx 时 Cloudflare 返回 HTML 错误页，旧代码把它掩盖成误导性的 "Unexpected token '<' … is not valid JSON"；现在如实报 HTTP 状态码 + 正文前 200 字节，并明确"服务端故障，不要改游戏"（2026-07-23）
- [x] 背景：生产 1101 事故（orientation 迁移欠账 + 新 worker 上线撞缺列库）排障时，CLI 报错方向性误导；服务端同步加了入口 try/catch → `E_INTERNAL` JSON 兜底（主工程 api/src/index.mjs）（2026-07-23）
- [x] 测试 18/18 绿（无新增用例：readJson 属报错文案层，端到端路径已覆盖）（2026-07-23）

## ✅ 发布元数据扩展（2026-07-24，用户拍板：AI 发布带完整商店页字段，跨仓协议 + 三仓同步）

- [x] 8 字段协议：必填 `--title` / `--slug` / `--orientation`（取代旧「命名不设卡点」）；建议项 `--description` / `--controls`（玩法说明自由文本）/ `--category`（CrazyGames 16 类目枚举）/ `--platforms`（keyboard\|touch\|both 输入枚举）/ `--ai`（AI 作者多值 `Tool[,model][;…]`，如 `Claude,claude-opus-4.8;Codex`）（2026-07-24）
- [x] `src/categories.js`：16 类目 + 平台枚举 + 归一化器，三仓单一来源（与 api CATEGORIES / site categories.mjs 同步）（2026-07-24）
- [x] `resolvePublish()` 纯函数（离线可测）：必填缺失/枚举非法 → AI 可读三要素报错当场停；建议项缺省只提醒；引擎样板 `<title>` 不算真名（2026-07-24）
- [x] 协议头：必填三项恒带，建议项有值才带；自由文本百分号编码（CJK 经 HTTP 头必编）。全字段写回 pogglo.json，下次 publish 复用（2026-07-24）
- [x] MCP publish_game 同步：manifestShape 加 slug/category/platforms/ai + controls 改自由文本；必填校验 + 枚举校验；落盘键名与 CLI 对齐（ai→ai_author）（2026-07-24）
- [x] 测试 19→27：resolvePublish/categories 纯逻辑 9 条 + 更新 2 条旧用例（必填闸门 / orientation 带 title+slug）（2026-07-24）
- [x] 服务端配套（主工程 api）：games 加 5 列（migrations/2026-07-24-game-meta.sql）；/v1/submit 读头、/v1/submit-github 读 body、PATCH 可改；枚举非法 E_BAD_CATEGORY/E_BAD_PLATFORMS；覆盖更新不带字段沿用历史；GAME_COLS 透出；api 测试 33/33（2026-07-24）
- [x] 站点配套：categories.mjs + 首页类目导航（空类目不显示）+ 游戏页 controls/AI 作者行 + 设备由 platforms 推导 + 发布页魔法指令带全字段 + cat.\<id> i18n × 8 语言（build 186 页绿）（2026-07-24）
- [ ] 遗留：发版 0.4.1 尚未 npm publish（npm 上 0.4.0 已是 orientation 版；本次发布元数据 8 字段改动并入 0.4.1）；生产真发布冒烟待 worker 部署 + D1 迁移后补

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
| 2026-07-23 | 线上 0.1.0 是旧协议（localhost 默认端点 + 老 /api/publish），对生产不可用；魔法指令依赖 `@latest` | ✅ 已解决：0.2.1 已发布为 @latest（shasum 与仓库 HEAD 核对一致） |
| 2026-07-23 | 生产探测：`pogglo.com/v1/me` 正常返回 v1 错误体，但 `GET /v1/games` 连续 3 次连接失败（000）；旧 workers.dev 端点已停用（error 1042） | 平台侧疑点，已报主工程排查（不影响 CLI publish 主链路） |

## 📦 版本历史

| 版本 | 日期 | 内容 |
|---|---|---|
| 0.1.0 | 2026-07-23 | npm 首发抢注包名（旧协议，随后被 0.2.0 取代） |
| 0.2.0 | 2026-07-23 | v1 生产协议：邮箱验证码登录（两步零 TTY）、`publish --code POG-XXXX` 配对码免登录、默认生产端点、`/v1/submit` Bearer 鉴权、`ai_fix_prompt` 透传、README 面向创作者重写；测试 10/10 |
| 0.2.1 | 2026-07-23 | 默认端点切正式域 `https://pogglo.com`（/v1/* Worker 路由已生效）；git tag v0.2.1 = `13749d9`（shasum 与 npm 线上核对一致） |
| 0.3.0 | 2026-07-23 | MCP server 并包（bin: pogglo-mcp）+ `link` 命令 + pogglo.json slug 记忆 + 引擎标题剥壳；已发布（npm 线上确认） |
| 0.4.0 | 2026-07-23 | `--orientation` 竖屏声明 + readJson 非 JSON 如实报错 + `-h/-help/--help` 退出 0；已发布（npm 线上 = 0.4.0） |
| 0.4.1 | 未发布 | **发布元数据扩展**（title/slug/orientation 必填；description/controls/category/platforms/ai 建议项，跨仓协议 8 字段）；测试 27/27——**待 npm publish**（0.4.0 已被 orientation 版占用，故进 0.4.1） |
