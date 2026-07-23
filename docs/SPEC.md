# SPEC — v1 开发规范（写代码必读）

> 最后更新：2026-07-23。约束本仓库全部代码。架构与协议见 `ARCHITECTURE.md`，进度见 `PROGRESS.md`。

## 1. 代码规范

- Node ≥ 18（`engines` 已声明），原生 ESM，零构建、零打包器。
- **依赖白名单：`adm-zip`，仅此一个。** 新增任何依赖（含 devDependencies）= 待拍板决策，
  先写进 PROGRESS.md"待拍板"区并说明为什么标准库不够。npx 冷启动速度是产品体验的一部分。
- 模块依赖方向固定 bin → index → pack；pack 保持纯函数（除 fs 读取），不 import 上层。
- 注释用英文（与现有代码一致），文档用中文。
- 用户可见输出全部英文（创作者与 agent 是国际受众）。

## 2. 兼容红线

- 魔法指令写死 `npx pogglo@latest ...`，因此**已发布的命令名、flag 名、退出码语义、
  协议头永不做不兼容变更**（弃用可以，删除不行；真要 break 走 major 并全链路评估）。
- Windows / macOS / Linux 三平台都要能跑：路径一律 `node:path` 拼接；
  写文件一律 Node `fs`（无 BOM UTF-8），禁止 PowerShell Set-Content（主工程踩过 BOM 坑）。

## 3. 报错文案规范（错误契约的实现细则，改报错必读）

每条 CLI 自身报错必须包含**三要素**，因为读者是 AI agent，它要靠这段文本自我修复：

1. **出了什么事**：具体、可判定（"No index.html found" 而不是 "invalid project"）；
2. **在哪/为什么**：给出实际查找过的路径、实际收到的值；
3. **下一步**：一条可直接执行的命令或可直接做的动作（"run npm run build, then: npx pogglo publish dist"）。

硬性规则：

- 平台返回的 `message` **一字不改**透传 stderr，禁止截断、换行重排、加前缀色彩。
- 所有失败路径 `process.exit(1)`（或非 0）；成功路径 exit 0。agent 靠退出码决定是否进入修复循环。
- 报错写完后自测：把报错文本单独贴给一个不知上下文的 AI，问"接下来该跑什么命令"——答不出来就是文案不合格。
- 每条新报错/改动的报错，测试里必须断言其关键内容（见 test/cli.test.js 的 publish 用例）。

## 4. 测试规范

- 跑法：`npm test`（`node --test`，自动发现 test/ 目录），**禁止网络依赖**——平台交互的联调是发版冒烟的事，不进单测。
- CLI 级测试 spawn 真实 `bin/pogglo.js`，且必须伪造 `HOME`/`USERPROFILE` 到临时目录，
  绝不读写真实 `~/.pogglo`（test/cli.test.js 的 `run()` 已封装，新用例复用它）。
- 覆盖底线：每个命令 ≥1 条测试；每条错误路径断言报错关键内容；pack.js 纯函数直接单测。

## 5. 工作流铁律（git 钩子强制执行）

1. **先调研后动手**：按 CLAUDE.md 的必读顺序读完文档，再看 PROGRESS.md 确认没人做过。
2. **提交必更新进度**：改了 `bin/ src/ test/ package.json` 的 commit 必须同时 stage
   `docs/PROGRESS.md`（做了什么+日期+遗留问题）。`.githooks/pre-commit` 强制拦截，
   `--no-verify` 绕过视为违规提交。改了架构/协议还要同步 `ARCHITECTURE.md`。
3. **测试全绿才能提交**：钩子会跑 `npm test`。
4. 克隆后跑一次 `npm install` 激活钩子（prepare 脚本配置 `core.hooksPath`）。

## 6. 发版流程（M2 起执行）

```bash
npm test                          # 1. 全绿
POGGLO_ENDPOINT=<本地或生产> node bin/pogglo.js publish <真实游戏产物目录>
                                  # 2. 真实 publish 冒烟（成功 + 至少一种拒绝路径）
npm version patch|minor           # 3. 提版本号（自动打 git tag）
npm publish                       # 4. 发布（@latest 立即全量生效，慎重）
git push --follow-tags            # 5. 推 tag
```

- 版本语义见 ARCHITECTURE §7。发版后在 PROGRESS.md 的"版本历史"区记一行。
- `@latest` 即生产：发出去就是所有创作者的下一次运行，回滚手段是再发一个 patch，所以第 2 步冒烟不可省。
