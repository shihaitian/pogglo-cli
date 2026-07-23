// CLI 端到端（spawn 真实 bin，不打网络）。HOME/USERPROFILE 指到临时目录，
// 保证测试不读写真实 ~/.pogglo。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/pogglo.js', import.meta.url));

function run(args, cwd) {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-home-'));
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: cwd ?? fakeHome,
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
  });
}

test('help exits 0 and documents all commands', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  for (const cmd of ['login', 'publish', 'whoami']) assert.match(r.stdout, new RegExp(cmd));
});

test('unknown command exits non-zero', () => {
  const r = run(['frobnicate']);
  assert.equal(r.status, 1);
});

test('whoami without config points at login', () => {
  const r = run(['whoami']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pogglo login/);
});

// 账号体系（2026-07-23）：login 是两步邮箱验证码流程，缺 --email 时给出可执行指引
test('login without --email explains the two-step email flow', () => {
  const r = run(['login']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /--email/);
  assert.match(r.stdout, /--code/);
});

// 未登录 publish（有产物）→ 报身份错误且指引两步登录（AI 可自纠）
test('publish with a valid package but no sign-in demands login', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-game-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>G</title>');
  const r = run(['publish'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Not signed in/);
  assert.match(r.stderr, /--email/);
});

test('publish in a dir without index.html fails with an actionable AI-readable error', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-empty-'));
  const r = run(['publish'], empty);
  assert.equal(r.status, 1);
  // 报错必须告诉 agent 找什么、去哪找、下一步做什么（SPEC §3 错误契约）
  assert.match(r.stderr, /No index\.html found/);
  assert.match(r.stderr, /npm run build/);
  assert.match(r.stderr, /npx pogglo publish dist/);
});
