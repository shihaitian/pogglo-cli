#!/usr/bin/env node
/**
 * pogglo CLI（未来发 npm: npx pogglo <cmd>）
 *   pogglo register --handle x --password y     注册开发者账号(handle 全局唯一)
 *   pogglo login    --handle x --password y     登录，token 存 ~/.pogglo.json
 *   pogglo publish [--dir .] [--title T] [--slug s] [--code POG-XXXX]
 *      身份优先级: --code(配对码) > 本地已登录 token
 *   pogglo whoami / pogglo games                我是谁 / 我的游戏
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

const API = process.env.POGGLO_API || 'https://pogglo-api.shihaitian2021.workers.dev';
const CONF = path.join(os.homedir(), '.pogglo.json');
const args = process.argv.slice(2);
const cmd = args[0];
const val = f => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : null; };
const conf = () => { try { return JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch { return {}; } };
const die = (msg, aiFix) => { console.error(`\n[pogglo] ${msg}`); if (aiFix) { console.error('\n----- 把下面这段发给你的 AI 助手，它会帮你修 -----'); console.error(aiFix); } process.exit(1); };

async function api(pathname, opts = {}) {
  const res = await fetch(API + pathname, opts);
  return res.json();
}

if (cmd === 'login') {
  const token = val('--token');
  if (!token) die('用法: pogglo login --token pog_xxxx
（token 在 https://pogglo.pages.dev/publish/ 登录后可复制）');
  const out = await api('/v1/me', { headers: { authorization: `Bearer ${token}` } });
  if (!out.ok) die('token 无效，请到 https://pogglo.pages.dev/publish/ 重新获取');
  fs.writeFileSync(CONF, JSON.stringify({ handle: out.handle, token }, null, 2));
  console.log(`✅ 登录成功: @${out.handle}（token 已存 ${CONF}）`);
  process.exit(0);
}

if (cmd === 'whoami') {
  const { token } = conf();
  if (!token) die('未登录。先执行 pogglo login');
  const out = await api('/v1/me', { headers: { authorization: `Bearer ${token}` } });
  if (!out.ok) die('token 失效，请重新 login');
  console.log(`@${out.handle} · ${out.games.length} 款游戏`);
  process.exit(0);
}

if (cmd === 'games') {
  const { token } = conf();
  if (!token) die('未登录。先执行 pogglo login');
  const out = await api('/v1/me', { headers: { authorization: `Bearer ${token}` } });
  if (!out.ok) die('token 失效，请重新 login');
  for (const g of out.games) console.log(`  ${g.slug}  ${g.title}  (${g.status}, via ${g.via}, ${g.added.slice(0, 10)})`);
  if (!out.games.length) console.log('  （还没有游戏——去发布一个！）');
  process.exit(0);
}

if (cmd !== 'publish') {
  console.log('用法: pogglo login|whoami|games|publish [参数]');
  process.exit(2);
}

// ---- publish ----
const code = val('--code');
const { token, handle } = conf();
if (!code && !token) die('发布需要身份：\n  方式A: pogglo login --token pog_xxx（token 在 pogglo 网站 publish 页复制）\n  方式B: 加 --code POG-XXXX（到 https://pogglo.pages.dev/publish/ 领码）');

let dir = path.resolve(val('--dir') || '.');
if (!fs.existsSync(path.join(dir, 'index.html'))) {
  const cand = ['dist', 'build', 'out', 'docs', 'public'].find(d => fs.existsSync(path.join(dir, d, 'index.html')));
  if (cand) dir = path.join(dir, cand);
  else if (fs.existsSync(path.join(dir, 'package.json')))
    die('检测到未构建的工程。请先执行:\n  npm install && npm run build\n确认产物目录(dist/build)里有 index.html 后，再次运行本命令。');
  else die('当前目录没有 index.html。请在游戏产物目录里运行本命令。');
}
console.log(`[pogglo] 产物目录: ${dir}${token && !code ? `  · 身份: @${handle}` : ''}`);

const zip = new AdmZip();
zip.addLocalFolder(dir, '', p => !/(^|[\\/])(node_modules|\.git|__MACOSX|\.DS_Store)([\\/]|$)/.test(p));
const buf = zip.toBuffer();
console.log(`[pogglo] 打包完成: ${(buf.length / 1024).toFixed(0)}KB，上传中…`);

const headers = { 'content-type': 'application/zip', 'x-title': encodeURIComponent(val('--title') || path.basename(dir)), 'x-slug': val('--slug') || '', 'user-agent': 'pogglo-cli/0.2' };
if (code) headers['x-pogglo-code'] = code; else headers['authorization'] = `Bearer ${token}`;

const out = await api('/v1/submit', { method: 'POST', headers, body: buf });
if (!out.ok) die(`发布失败 (${out.code}): ${out.msg}`, out.ai_fix_prompt);
console.log('\n✅ 发布成功!');
console.log(`   游戏:   ${out.title}  by @${out.handle}`);
console.log(`   试玩:   ${out.play_url}`);
console.log(`   页面:   ${out.page_url}`);
console.log(`   ${out.note}`);
