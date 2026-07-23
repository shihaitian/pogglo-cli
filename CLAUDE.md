# pogglo CLI 工程协作约定（AI 会话必读）

这是 `pogglo` npm 包（`npx pogglo publish`）的独立仓库，从 pogglo 主工程拆出单独做版本管理。
主工程（平台/主站/MCP）在 `../pogglo`，协作总纲同源：**先调研后动手，提交必更新进度文档**。

## 动手前（必读，按顺序）

1. `docs/ARCHITECTURE.md` — 架构设计：这个包在整个系统里是什么、协议契约、设计原则
2. `docs/SPEC.md` — v1 开发规范：代码/报错文案/测试/发版规则
3. `docs/PROGRESS.md` — 当前进度：先看"进行中/待办"，别重复造轮子

规范未覆盖的决策（如新增依赖、改协议契约）：记入 PROGRESS.md"待拍板"区，问用户，**不要自行拍板**。

## 动手时

- 本包的灵魂是**错误契约**（ARCHITECTURE §4）：所有报错文本是写给调用方 AI 看的提示词。
  改任何报错文案前先读 SPEC §3 的三要素规则。
- 协议（请求头/响应 JSON）是跨仓库契约，改动必须与 `../pogglo/platform` 同步拍板。
- 新增/修改命令必须带测试（`npm test`，不打网络）。

## 提交前（git 钩子强制执行）

- **每次代码提交必须同 commit 更新 `docs/PROGRESS.md`**（做了什么+日期+遗留问题）。
  `.githooks/pre-commit` 会拦截：改了 bin/src/test/package.json 但没 stage PROGRESS.md 的提交直接拒绝。
- 提交前测试必须全绿（钩子也会跑）。
- 克隆后钩子生效需要一次 `npm install`（prepare 脚本自动配置 core.hooksPath）。

## 常用命令

```bash
npm test                        # 全部测试（无网络依赖）
node bin/pogglo.js help         # 本地跑 CLI
POGGLO_ENDPOINT=http://localhost:8788 node bin/pogglo.js publish <dir>   # 对本地平台联调
```
