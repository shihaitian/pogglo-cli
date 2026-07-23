// pogglo CLI — the D2 primary publish path: one command in the terminal (or
// called by an AI agent), playable URL back. Zero interaction after `login`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { packageDirFor, zipDir } from './pack.js';

const CONFIG_DIR = path.join(os.homedir(), '.pogglo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
// v1 协议（2026-07-23 转正）：默认打生产 API，本地联调用 POGGLO_ENDPOINT 覆盖
const DEFAULT_ENDPOINT = process.env.POGGLO_ENDPOINT ?? 'https://pogglo-api.txqy0831.workers.dev';

const HELP = `pogglo — publish AI-made browser games

Usage:
  npx pogglo login --email <you@example.com>            request a sign-in code
  npx pogglo login --email <you@example.com> --code <6-digit>   finish sign-in
  npx pogglo publish [dir] [--title <t>] [--slug <s>] [--endpoint <url>]
  npx pogglo publish [dir] --code POG-XXXX              publish with a pairing code
  npx pogglo whoami

login is a two-step email flow (no password): the first call emails you a
6-digit code, the second call (add --code) saves your token. Your account
handle (from your email prefix) is the author of everything you publish.

publish with --code POG-XXXX needs no login at all: get a pairing code from
the website (Publish page) and the upload is attributed to that account.

publish finds your built game automatically (./dist, ./build, ./out, ./public
or the current folder — whichever contains index.html), zips it and uploads.
A pogglo.json next to index.html supplies the title ({ "title": "..." }).
`;

export async function main(argv) {
  const { cmd, args, flags } = parseArgs(argv);
  switch (cmd) {
    case 'login':
      return login(flags);
    case 'publish':
      return publish(args[0], flags);
    case 'whoami':
      return whoami();
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

export function parseArgs(argv) {
  const args = [];
  const flags = {};
  let cmd = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? true;
    else if (!cmd) cmd = a;
    else args.push(a);
  }
  return { cmd, args, flags };
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// Email-OTP sign-in (账号体系 2026-07-23)：两步、零交互提示符 —— AI agent 可以
// 分两次调用完成登录，不需要 TTY。
async function login(flags) {
  const endpoint = flags.endpoint ?? readConfig()?.endpoint ?? DEFAULT_ENDPOINT;
  const email = flags.email;
  if (!email || email === true) {
    console.log('Sign-in is a two-step email flow:\n  1. npx pogglo login --email you@example.com   (emails you a 6-digit code)\n  2. npx pogglo login --email you@example.com --code 123456');
    process.exitCode = 1;
    return;
  }

  if (!flags.code) {
    const j = await api(endpoint, '/v1/auth/send-code', { email });
    if (!j.ok) throw new Error(`Could not send code (${j.code}):\n${errMsg(j)}`);
    if (j.dev_code) console.log(`[dev] Your code: ${j.dev_code} (dev echo — production emails it)`);
    console.log(`Code sent to ${email}. Finish sign-in with:\n  npx pogglo login --email ${email} --code <6-digit>`);
    return;
  }

  const j = await api(endpoint, '/v1/auth/verify', { email, code: String(flags.code) });
  if (!j.ok) throw new Error(`Sign-in failed (${j.code}):\n${errMsg(j)}`);
  const config = { token: j.token, author: j.handle, email, endpoint };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`${j.is_new ? 'Account created' : 'Signed in'}: @${j.handle} (endpoint: ${endpoint})`);
  console.log(`Config saved to ${CONFIG_PATH}. You can now run: npx pogglo publish`);
}

async function api(endpoint, path, body) {
  let res;
  try {
    res = await fetch(endpoint + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the pogglo platform at ${endpoint} (${err.cause?.code ?? err.message}).\n` +
        'If you are developing locally, start it first:  npm --prefix platform run dev'
    );
  }
  return res.json();
}

function whoami() {
  const c = readConfig();
  if (!c) return console.log('Not logged in. Run: npx pogglo login --email you@example.com');
  console.log(`@${c.author}${c.email ? ` (${c.email})` : ''} → ${c.endpoint}`);
}

async function publish(dirArg, flags) {
  // 报错优先级：先产物问题（当场可修），后身份问题。
  const startDir = path.resolve(dirArg ?? '.');
  const pkgDir = packageDirFor(startDir);
  if (!pkgDir) {
    throw new Error(
      `No index.html found in ${startDir} (looked in ., dist/, build/, out/, public/, www/).\n` +
        'If this is an uncompiled project, run your build first (npm run build) and publish the output folder:\n' +
        '  npx pogglo publish dist'
    );
  }

  // 身份（v1 协议）：--code 配对码（网页发的短时委托，无需登录）优先，其次本地 token。
  const config = readConfig();
  const pairCode = typeof flags.code === 'string' ? flags.code : null;
  if (!pairCode && !config?.token) {
    // AI-readable: the agent can complete either path without a TTY.
    throw new Error(
      'Not signed in. Publishing needs an identity, either way works:\n' +
        '  A) pairing code from the website Publish page:  npx pogglo publish --code POG-XXXX\n' +
        '  B) email sign-in:\n' +
        '     1. npx pogglo login --email you@example.com   (emails you a 6-digit code)\n' +
        '     2. npx pogglo login --email you@example.com --code <6-digit>\n' +
        'Then run publish again.'
    );
  }
  // 配对码来自网页（生产语境），不受本地 config 里的 endpoint 影响 —— 否则旧的
  // localhost 配置会把 --code 发布劫持到本地。显式 --endpoint 仍可覆盖（联调用）。
  const endpoint = flags.endpoint ?? (pairCode ? DEFAULT_ENDPOINT : config?.endpoint ?? DEFAULT_ENDPOINT);

  // 标题：--title > pogglo.json title > index.html <title>
  let title = typeof flags.title === 'string' ? flags.title : null;
  if (!title) {
    try {
      title = JSON.parse(fs.readFileSync(path.join(pkgDir, 'pogglo.json'), 'utf8')).title ?? null;
    } catch {}
  }
  if (!title) {
    const m = fs.readFileSync(path.join(pkgDir, 'index.html'), 'utf8').match(/<title[^>]*>([^<]+)<\/title>/i);
    title = m ? m[1].trim().slice(0, 80) : 'Untitled Game';
  }

  console.log(`Packaging ${pkgDir} …`);
  const zip = zipDir(pkgDir);
  console.log(`Uploading ${(zip.length / 1024).toFixed(1)} KB to ${endpoint} …`);

  const headers = { 'content-type': 'application/zip', 'x-title': encodeURIComponent(title) };
  if (typeof flags.slug === 'string') headers['x-slug'] = flags.slug;
  if (pairCode) headers['x-pogglo-code'] = pairCode;
  else headers['authorization'] = `Bearer ${config.token}`;

  let res;
  try {
    res = await fetch(endpoint + '/v1/submit', { method: 'POST', headers, body: zip });
  } catch (err) {
    throw new Error(
      `Could not reach the pogglo platform at ${endpoint} (${err.cause?.code ?? err.message}).\n` +
        'Check your network, or point at another endpoint with POGGLO_ENDPOINT / --endpoint.'
    );
  }

  const body = await res.json();
  if (!body.ok) {
    // AI-readable rejection — print verbatim so an agent can self-correct.
    throw new Error(`Publish rejected (${body.code}):\n${errMsg(body)}`);
  }

  console.log('');
  console.log(`✔ Published: ${body.slug} by @${body.handle}`);
  console.log(`  Game page  →  ${body.page_url}`);
  console.log(`  Direct play →  ${body.play_url}`);
  if (body.note) console.log(`  ${body.note}`);
  return body;
}

// v1 错误体：{code, msg, ai_fix_prompt}——ai_fix_prompt 是写给 AI 的修复提示，一并透出
function errMsg(j) {
  return [j.msg ?? j.message, j.ai_fix_prompt].filter(Boolean).join('\n');
}
