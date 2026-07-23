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
  for (const cmd of ['login', 'publish', 'link', 'whoami']) assert.match(r.stdout, new RegExp(cmd));
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

// MCP server（2026-07-23）：与 CLI 同包（bin: pogglo-mcp），共享 pack.js。离线只验注册面。
test('mcp: buildServer registers publish_game + list_games', async () => {
  const { buildServer } = await import('../src/mcp.js');
  const { server, tools } = buildServer();
  assert.ok(server);
  assert.deepEqual(tools.sort(), ['list_games', 'publish_game']);
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

// link（2026-07-23）：把文件夹绑定到已发布游戏（pogglo.json 记 slug）。离线只测错误路径与解析。
test('link without a game reference explains usage and exits non-zero', () => {
  const r = run(['link']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /npx pogglo link <handle>\/<slug>/);
});

test('link with an unparseable reference fails with an actionable error', () => {
  const r = run(['link', 'https://pogglo.com/a/b/c/d']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not parse a game reference/);
  assert.match(r.stderr, /npx pogglo link/);
});

test('parseGameRef accepts slug, handle/slug, and every game URL shape', async () => {
  const { parseGameRef } = await import('../src/index.js');
  assert.deepEqual(parseGameRef('cow-puzzle'), { slug: 'cow-puzzle', handle: null });
  assert.deepEqual(parseGameRef('shihaitian/cow-puzzle'), { slug: 'cow-puzzle', handle: 'shihaitian' });
  assert.deepEqual(parseGameRef('https://pogglo.com/shihaitian/cow-puzzle/'), { slug: 'cow-puzzle', handle: 'shihaitian' });
  assert.deepEqual(parseGameRef('https://pogglo.net/play/cow-puzzle/'), { slug: 'cow-puzzle', handle: null });
  assert.deepEqual(parseGameRef('https://pogglo.com/p/?slug=cow-puzzle'), { slug: 'cow-puzzle', handle: null });
  assert.equal(parseGameRef('https://pogglo.com/a/b/c'), null);
  assert.equal(parseGameRef(''), null);
});

// slug 语义整治（2026-07-23）：引擎样板标题剥壳，剥完无真名 = null（上游据此拒发要真名）
test('cleanEngineTitle strips engine boilerplate and rejects generic leftovers', async () => {
  const { cleanEngineTitle } = await import('../src/index.js');
  assert.equal(cleanEngineTitle('Unity WebGL Player | Space Miner'), 'Space Miner');
  assert.equal(cleanEngineTitle('团结引擎 | 太空矿工'), '太空矿工');
  assert.equal(cleanEngineTitle('Cocos Creator | web-mobile'), null); // 剥完剩构建目录名 → 无效
  assert.equal(cleanEngineTitle('Unity WebGL Player'), null);
  assert.equal(cleanEngineTitle('webgl'), null);
  assert.equal(cleanEngineTitle('Orbit Dodger'), 'Orbit Dodger'); // 正常标题原样通过
  assert.equal(cleanEngineTitle(''), null);
});

test('publish with engine-default title proceeds (soft warning only, no gate)', () => {
  // 2026-07-23 拍板放开：命名不设卡点，只温和提醒（引导在发布页魔法提示词的 --slug）。
  // endpoint 指向不通的端口 → 走到上传即证明未被标题拦截。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-unity-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Unity WebGL Player | webgl</title>');
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-home-'));
  fs.mkdirSync(path.join(fakeHome, '.pogglo'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.pogglo', 'config.json'), JSON.stringify({ token: 'pog_x', author: 'x', endpoint: 'http://127.0.0.1:1' }));
  const r = spawnSync(process.execPath, [BIN, 'publish'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome } });
  assert.match(r.stdout, /publishing as-is/); // 提醒了
  assert.match(r.stderr, /Could not reach/); // 但没拦——已走到网络层
});

test('projectRootFor keeps pogglo.json out of build output folders', async () => {
  const { projectRootFor } = await import('../src/index.js');
  const root = path.join(os.tmpdir(), 'proj');
  const dist = path.join(root, 'dist');
  assert.equal(projectRootFor(root, dist), root); // publish <root>, package in dist/
  assert.equal(projectRootFor(dist, dist), root); // publish dist directly → climb out
  assert.equal(projectRootFor(root, root), root); // index.html at root
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
