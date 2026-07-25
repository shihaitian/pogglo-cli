#!/usr/bin/env node
// MCP stdio server 入口：AI 客户端配置里指向这里（npx -y pogglo pogglo-mcp 或全局安装后 pogglo-mcp）
import { start } from '../src/mcp.js';

start().catch((err) => {
  console.error('[pogglo-mcp] ' + (err?.message ?? err));
  process.exit(1);
});
