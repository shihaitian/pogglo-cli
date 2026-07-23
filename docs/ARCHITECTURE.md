# ARCHITECTURE — pogglo CLI 架构设计

> 最后更新：2026-07-23。改架构/协议必须同步更新本文档（铁律二）。

## 1. 定位：自动纠错循环的客户端一半

整个发布系统是一个**"平台校验器 ↔ 创作者 AI"的自动纠错循环**：

```
创作者贴"魔法指令"进任意 AI 客户端（Claude Code / Codex / Kimi / …）
        │
        ▼
AI 在本地构建出游戏产物（唯一职责：build 出静态文件）
        │
        ▼
AI 执行  npx pogglo@latest publish [--code ABC123]     ← 本仓库
        │  定位产物 → 打 zip → POST /api/publish
        ▼
平台流水线校验（解压/找 index.html/静态扫描/…）        ← ../pogglo/platform
        │
   ┌────┴────┐
   ▼         ▼
 通过：     拒绝：返回 AI 可读报错文本（本质是提示词）
 可玩 URL      │
              ▼
        CLI 把报错原样打到 stderr → AI 读报错 → 自己修 → 重新 publish
```

**为什么是 npx CLI 而不是逐家做插件**：所有 agent 客户端都会跑 shell 命令，
一个 CLI 通吃全部客户端。适配工作留给服务端流水线，CLI 保持最薄。

## 2. 设计原则（改代码前对照）

| # | 原则 | 落地 |
|---|---|---|
| P1 | **零交互** | 无 prompt、无确认、无进度条动画；首次 publish 自动 login。agent 环境里任何交互都是卡死 |
| P2 | **报错即提示词** | 平台拒绝文本原样透传 stderr，永不截断/改写（bin/pogglo.js 的 catch）；CLI 自身报错也按 SPEC §3 三要素写 |
| P3 | **npx 冷启动极简** | 依赖白名单只有 adm-zip；零构建、零 postinstall 副作用（prepare 仅本地 git 配置）。加依赖 = 待拍板决策 |
| P4 | **契约稳定** | CLI↔平台协议（§4）按 semver 管理；魔法指令写 `pogglo@latest`，所以 minor/patch 必须永远向后兼容 |

## 3. 模块图

```
bin/pogglo.js     入口：调 main()，catch 后 stderr 原样输出 + exit 1（P2 的守门员）
src/index.js      命令层：parseArgs / login / publish / whoami / 配置读写(~/.pogglo/config.json)
src/pack.js       产物层：packageDirFor（. dist build out public www 顺序找 index.html）+ zipDir（跳过 dev 垃圾）
```

依赖方向：bin → index → pack。pack 不 import index（保持纯函数可单测）。

## 4. 协议契约（跨仓库，改动必须与 ../pogglo/platform 同步拍板）

### 认证（v1，2026-07-23 转正）

```
POST {endpoint}/v1/auth/send-code    { "email" }              → 邮箱收 6 位码（本地平台回显 dev_code）
POST {endpoint}/v1/auth/verify       { "email", "code" }      → { ok, token, handle, is_new }
```

两步、零 TTY——AI agent 分两次调用即可完成登录，token 存 `~/.pogglo/config.json`。

### 发布

```
POST {endpoint}/v1/submit
content-type: application/zip
authorization: Bearer <token>        # 登录路径
x-pogglo-code: POG-XXXX              # 或：配对码路径（网页签发，免登录）
x-title: <encodeURIComponent(title)> # --title > pogglo.json > index.html <title>
x-slug:  <slug>                      # --slug > pogglo.json 的 slug（项目身份，见下）
x-orientation: portrait|landscape    # 可选：--orientation > pogglo.json；竖屏（手机形）游戏声明后游戏页 letterbox 而非拉宽；不带=服务端默认 landscape
body: zip buffer
```

**项目身份 `pogglo.json`（2026-07-23）**：发布成功后 CLI 把服务端确认的 slug 写进
项目根的 `pogglo.json`（`{ "title", "slug" }`，产物目录如 dist/ 会被重建清掉，所以写
根目录；建议提交 git）。之后每次 publish 自动带 `x-slug` → 改标题/换机器都精确更新同
一款游戏。`link` 命令（`npx pogglo link <slug | handle/slug | 游戏URL>`）消费公开接口
`GET /v1/games/:slug` 反向恢复该文件——fresh clone 像认领一样一条命令绑回自己的游戏。
服务端配套：配对码首次成功发布后绑定 slug（KV `code:` 记录），同码重发=覆盖更新。

endpoint 解析：`--endpoint` flag → config.json → `POGGLO_ENDPOINT` → 生产默认
`https://pogglo.com`（/v1/* 同域路由到 Worker；旧 workers.dev 子域已停用）。**例外**：走配对码时忽略 config 里的
endpoint（配对码是生产语境的委托，防止旧 localhost 配置劫持）；显式 `--endpoint` 仍最高优先（联调用）。

### 响应（平台侧定义，CLI 侧消费）

```jsonc
// 成功
{ "ok": true, "slug", "handle", "page_url", "play_url", "status", "warnings": [] }
// 拒绝 —— msg / ai_fix_prompt 是写给 AI 的提示词，CLI 原样透传
{ "ok": false, "code": "bad_zip | not_compiled | bad_code | …", "msg": "…", "ai_fix_prompt": "…" }
```

### 错误契约（系统灵魂，红线）

1. 平台 `message` 一字不改打到 stderr（`Publish rejected (${code}):\n${message}`）。
2. 任何失败路径 exit code 非 0 —— agent 靠 exit code 判断要不要进入修复循环。
3. CLI 自身报错遵守 SPEC §3 三要素（出了什么事/在哪/下一步命令）。

## 5. v1 范围与非目标

**范围**：`login`（两步邮箱验证码）/ `publish [dir] [--code POG-XXXX] [--title] [--slug]` / `link <game>` / `whoami` + 上述协议。
**非目标**（明确不做，别顺手加）：

- ❌ 逐客户端插件（VS Code 扩展等）— CLI 通吃是决策 D2
- ❌ CLI 里做构建/校验 — 校验全部在服务端流水线，CLI 只定位+打包+透传
- ❌ 交互式向导 — 违反 P1
- ❌ 上传进度条/彩色 UI 库 — 违反 P3，输出是给 agent 读的

## 6. 路线图挂钩（详见 docs/PROGRESS.md）

- **M1 `--code` 配对码流**（✅ 2026-07-23 落地）：`publish --code POG-XXXX` 免登录，发 `x-pogglo-code` 头。
  语义：码在**成功发布前可重试**（纠错循环需要），成功后绑定游戏 slug，同码重发=覆盖更新。发码/验码在服务端实现。
- **M2 npm 首发**（✅ 0.1.0 抢注 2026-07-23）+ 生产端点切换（✅ 0.2.0）。
- 剩余：魔法指令文案跨客户端实测（见 PROGRESS 待办）。

## 7. 版本策略

- semver：patch=修 bug/文案，minor=新命令/新 flag（向后兼容），major=协议不兼容（尽量永不发生）。
- 每次 `npm publish` 同时打 git tag `v<version>`。
- 魔法指令引用 `pogglo@latest` → 发版即全量生效，发版前必须全测试绿 + 对本地平台跑一次真实 publish 冒烟。
