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

### 请求

```
POST {endpoint}/api/publish
content-type: application/zip
x-pogglo-token:  <login 生成的 token>        # v1 现状
x-pogglo-author: <handle>
x-pogglo-code:   <ABC123>                    # M1 规划：发码流，替代 login（见 §6）
body: zip buffer
```

endpoint 解析顺序：`--endpoint` flag → config.json → `POGGLO_ENDPOINT` 环境变量 → `http://localhost:8788`（生产端点定域名后改默认值，属 minor 版本）。

### 响应（平台侧定义，CLI 侧消费）

```jsonc
// 成功
{ "ok": true, "slug", "url", "status", "files", "bytes", "warnings": [] }
// 拒绝 —— message 是写给 AI 的提示词，CLI 原样透传
{ "ok": false, "code": "no_token | bad_zip | not_compiled | …", "message": "…" }
```

### 错误契约（系统灵魂，红线）

1. 平台 `message` 一字不改打到 stderr（`Publish rejected (${code}):\n${message}`）。
2. 任何失败路径 exit code 非 0 —— agent 靠 exit code 判断要不要进入修复循环。
3. CLI 自身报错遵守 SPEC §3 三要素（出了什么事/在哪/下一步命令）。

## 5. v1 范围与非目标

**范围**：`login` / `publish [dir]` / `whoami` 三命令 + 上述协议。
**非目标**（明确不做，别顺手加）：

- ❌ 逐客户端插件（VS Code 扩展等）— CLI 通吃是决策 D2
- ❌ CLI 里做构建/校验 — 校验全部在服务端流水线，CLI 只定位+打包+透传
- ❌ 交互式向导 — 违反 P1
- ❌ 上传进度条/彩色 UI 库 — 违反 P3，输出是给 agent 读的

## 6. 路线图挂钩（详见 docs/PROGRESS.md）

- **M1 `--code` 发码流**：`publish --code ABC123` 跳过 login，改发 `x-pogglo-code` 头。
  关键设计：码在**成功发布前可无限重试**（纠错循环需要），成功后绑定游戏 slug，同码重发=覆盖更新，24h TTL 兜底。服务端发码/验码在 ../pogglo/platform 实现，本仓库只加 flag 分支。
- **M2 npm 首发**：抢注 `pogglo`（2026-07-23 查证 registry 404 未被占用）+ 生产端点切换。

## 7. 版本策略

- semver：patch=修 bug/文案，minor=新命令/新 flag（向后兼容），major=协议不兼容（尽量永不发生）。
- 每次 `npm publish` 同时打 git tag `v<version>`。
- 魔法指令引用 `pogglo@latest` → 发版即全量生效，发版前必须全测试绿 + 对本地平台跑一次真实 publish 冒烟。
