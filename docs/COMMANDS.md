# COMMANDS — pogglo CLI 命令手册

> 最后更新：2026-07-23。命令行为以本文档为准；架构/协议见 `ARCHITECTURE.md`。
> 注意：**0.4.0（link + pogglo.json 身份）尚未发 npm**，线上 `npx pogglo@latest` 仍是 0.2.1。
> 发版前想真跑新版：`npx github:shihaitian/pogglo-cli <命令>` 或本地 `node bin/pogglo.js <命令>`。

## 一览

| 命令 | 作用 | 需要身份 |
|---|---|---|
| `pogglo login --email <邮箱>` | 第一步：发 6 位验证码到邮箱 | 无 |
| `pogglo login --email <邮箱> --code <6位码>` | 第二步：换 token 存本地，完成登录 | 无 |
| `pogglo publish [dir]` | 打包并发布/更新游戏 | token 或 `--code` |
| `pogglo link <game>` | 把当前文件夹绑定到已发布的游戏 | 无（私有游戏需 token） |
| `pogglo whoami` | 显示当前登录账号与端点 | 无 |
| `pogglo help` | 帮助 | 无 |

所有命令零交互（无提示符、无确认），AI agent 可直接调用；失败路径退出码非 0，
报错文本本身是写给 AI 的修复指引（错误契约，见 SPEC §3）。

## login — 邮箱验证码登录（无密码）

```bash
npx pogglo login --email you@example.com            # 发码
npx pogglo login --email you@example.com --code 123456   # 换 token
```

成功后 token/handle/email/endpoint 存 `~/.pogglo/config.json`。handle 取邮箱前缀，
撞名自动加 `-2`、`-3` 后缀。之后 `publish` 不需要任何参数。

## publish — 发布 / 更新（同一条命令）

```bash
npx pogglo publish [dir] --title <t> --slug <s> --orientation portrait|landscape \
  [--description <text>] [--controls <text>] [--category <id>] \
  [--platforms keyboard|touch|both] [--ai "<tools>"] [--code POG-XXXX] [--endpoint <url>]
```

- **产物定位**：`dir` 缺省为当前目录；在 `.`、`dist/`、`build/`、`out/`、`public/`、`www/`
  中找第一个含 `index.html` 的目录，打 zip 上传（跳过 node_modules/.git 等垃圾）。
- **身份**：`--code POG-XXXX`（网页 Publish 页领的 24h 配对码，免登录）优先，
  否则用本地 token。配对码固定打生产端点，不受本地 config 影响（防 localhost 劫持）。

### 发布字段（2026-07-24 协议扩展）

每个字段取值一律 `--flag > pogglo.json > (仅 title 兜底剥 <title>)`，并写回 pogglo.json 供下次复用。

**必填**（缺失或非法在打包前报 AI 可读错误，当场停下）：

| flag | 说明 |
|---|---|
| `--title <t>` | 游戏真名；引擎样板 `<title>`（Unity WebGL Player 等）不算真名 |
| `--slug <s>` | 唯一 URL id，用作**更新同一款游戏**；首发写进 pogglo.json，提交进 git |
| `--orientation portrait\|landscape` | portrait = 手机形（高>宽），游戏页做等比 letterbox |

**建议填写**（缺省只 `⚠` 提醒不拦；`--category`/`--platforms` 给了非法值则报错）：

| flag | 说明 |
|---|---|
| `--description <text>` | 1–4 句，成为游戏页正文 |
| `--controls <text>` | 玩法/操作说明，如 `"WASD to move, Space to jump"` |
| `--category <id>` | CrazyGames 16 类目之一：action, adventure, arcade, board, card, clicker, driving, io, puzzle, shooting, simulation, sports, strategy, thinky, trivia, word |
| `--platforms keyboard\|touch\|both` | 支持输入：keyboard=键鼠/手柄，touch=触摸，both=两者 |
| `--ai "<tools>"` | 制作该游戏的 AI 工具/模型，多值格式 `Tool[,model][;Tool2[,model2]]`，如 `"Claude,claude-opus-4.8;Codex"`；不知道模型只写工具名也行 |

### 发布即绑定：pogglo.json 是项目身份

首次发布成功后，CLI 把服务端确认的 slug 写进**项目根目录**的 `pogglo.json`：

```json
{
  "title": "Cow Puzzle",
  "slug": "cow-puzzle",
  "orientation": "landscape",
  "description": "Push the cows onto the matching pens.",
  "controls": "Arrow keys to push",
  "category": "puzzle",
  "platforms": "both",
  "ai_author": "Claude,claude-opus-4.8"
}
```

- 之后在这个文件夹里再跑 `publish`（参数都不用带）就是**更新同一款游戏**：
  URL 不变、玩家统计保留、改标题也不会跑偏。
- 写在项目根而不是产物目录：`pogglo publish dist` 时自动写到 dist 的父目录，
  rebuild 清空 dist 不会丢身份。
- **把 pogglo.json 提交进 git**：换机器、协作者 clone 下来，发布的还是同一款。
- 服务端还有一层保险：配对码首次成功发布后绑定 slug（同码重发=覆盖更新，
  每次使用有效期顺延 24h），纯魔法指令用户不依赖本地文件也能正确更新。

## link — 把文件夹绑定到已发布的游戏（像 clone 一样恢复身份）

```bash
npx pogglo link cow-puzzle                                # 只给 slug（全站唯一）
npx pogglo link shihaitian/cow-puzzle                     # handle/slug（会校验归属）
npx pogglo link https://pogglo.com/shihaitian/cow-puzzle/ # 游戏页 URL 直接贴
```

也认 `/p/?slug=…` 和 `pogglo.net/play/<slug>/` 形态的 URL。命令向平台查
`GET /v1/games/:slug`，把 `{ title, slug }` 写进当前目录的 `pogglo.json`
（已有文件则合并，不覆盖其它字段）。

- 用途：fresh clone / pogglo.json 丢了 / 想把旧项目认领回来。
- `handle/slug` 形式下如果游戏实际属于别人，会报错并给出正确写法。
- 已登录且账号与游戏作者不一致时会提示：绑了也更新不了别人的游戏
  （发布时服务端会判为新游戏加后缀，不会覆盖别人）。

## whoami

```bash
npx pogglo whoami
# @shihaitian (txqy0831@gmail.com) → https://pogglo.com
```

## 端点解析（联调用）

`--endpoint` > `~/.pogglo/config.json` 的 endpoint > 环境变量 `POGGLO_ENDPOINT` >
生产默认 `https://pogglo.com`。例外：配对码路径忽略 config 的 endpoint（见 publish）。

## 游戏更新速查（三种场景）

| 场景 | 怎么做 | 靠什么认出是哪款 |
|---|---|---|
| 同一个文件夹迭代 | 原命令再跑一次 | pogglo.json 的 slug（首发自动写入） |
| 魔法指令用户（无本地文件） | 同一条含 `--code` 的命令再跑 | 配对码绑定的 slug（24h 滚动续期） |
| 换机器 / fresh clone | `pogglo link <游戏URL>` 后照常 publish | link 恢复的 pogglo.json |
