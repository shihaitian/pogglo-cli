// pogglo CLI — the D2 primary publish path: one command in the terminal (or
// called by an AI agent), playable URL back. Zero interaction after `login`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { packageDirFor, zipDir } from './pack.js';

const CONFIG_DIR = path.join(os.homedir(), '.pogglo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
// v1 协议（2026-07-23 转正）：默认打正式域（/v1/* Worker 路由），本地联调用 POGGLO_ENDPOINT 覆盖
const DEFAULT_ENDPOINT = process.env.POGGLO_ENDPOINT ?? 'https://pogglo.com';

const HELP = `pogglo — publish AI-made browser games

Usage:
  npx pogglo login --email <you@example.com>            request a sign-in code
  npx pogglo login --email <you@example.com> --code <6-digit>   finish sign-in
  npx pogglo publish [dir] [--title <t>] [--slug <s>] [--endpoint <url>]
  npx pogglo publish [dir] --code POG-XXXX              publish with a pairing code
  npx pogglo link <game>                                bind this folder to a published game
  npx pogglo whoami

login is a two-step email flow (no password): the first call emails you a
6-digit code, the second call (add --code) saves your token. Your account
handle (from your email prefix) is the author of everything you publish.

publish with --code POG-XXXX needs no login at all: get a pairing code from
the website (Publish page) and the upload is attributed to that account.

publish finds your built game automatically (./dist, ./build, ./out, ./public
or the current folder — whichever contains index.html), zips it and uploads.
The project's pogglo.json supplies the title and the game slug; after a
successful publish the CLI writes the slug back into pogglo.json, so the next
publish updates the SAME game even if the title changed. Commit pogglo.json.

link restores that identity in a fresh clone (or adopts an existing game):
  npx pogglo link shihaitian/cow-puzzle
  npx pogglo link https://pogglo.com/shihaitian/cow-puzzle/
It looks the game up on the platform and writes { "slug": ... } into
pogglo.json in the current folder.
`;

export async function main(argv) {
  const { cmd, args, flags } = parseArgs(argv);
  switch (cmd) {
    case 'login':
      return login(flags);
    case 'publish':
      return publish(args[0], flags);
    case 'link':
      return link(args[0], flags);
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

// ---- pogglo.json: the project's durable game identity (title + slug) ----
// Lives in the project root (NOT the build output — a rebuild would wipe it)
// and should be committed: a fresh clone then publishes to the same game.

const OUTPUT_DIR_NAMES = new Set(['dist', 'build', 'out', 'public', 'www']);

/** Where pogglo.json belongs. Publishing a bare build folder ("pogglo publish
 * dist") must not bury the identity inside dist/, so climb to its parent. */
export function projectRootFor(startDir, pkgDir) {
  if (pkgDir !== startDir) return startDir; // user pointed at the project root
  return OUTPUT_DIR_NAMES.has(path.basename(startDir)) ? path.dirname(startDir) : startDir;
}

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'pogglo.json'), 'utf8'));
  } catch {
    return null;
  }
}

function writeManifest(dir, patch) {
  const file = path.join(dir, 'pogglo.json');
  fs.writeFileSync(file, JSON.stringify({ ...(readManifest(dir) ?? {}), ...patch }, null, 2) + '\n');
  return file;
}

/** Parse a game reference: "cow-puzzle", "handle/cow-puzzle", or any pogglo
 * game URL (/handle/slug/, /p/?slug=…, /play/slug/). Null when unparseable. */
export function parseGameRef(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const q = s.match(/[?&]slug=([^&#]+)/);
  if (q) return { slug: decodeURIComponent(q[1]), handle: null };
  s = s.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length === 1) return { slug: parts[0], handle: null };
  if (parts.length === 2) {
    if (['play', 'p', 'g'].includes(parts[0])) return { slug: parts[1], handle: null };
    return { slug: parts[1], handle: parts[0] };
  }
  return null;
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

// `link` = adopt an already-published game into this folder (like `vercel link`):
// look the game up on the platform, write its slug into pogglo.json, and every
// later `publish` from here updates that game instead of matching by title.
async function link(ref, flags) {
  if (!ref || ref === true) {
    console.log(
      'Bind this folder to a published game so `publish` updates it:\n' +
        '  npx pogglo link <handle>/<slug>\n' +
        '  npx pogglo link https://pogglo.com/<handle>/<slug>/\n' +
        'The URL is your game page on pogglo.com.'
    );
    process.exitCode = 1;
    return;
  }
  const parsed = parseGameRef(ref);
  if (!parsed || !/^[a-z0-9一-龥-]{1,64}$/.test(parsed.slug)) {
    throw new Error(
      `Could not parse a game reference from "${ref}".\n` +
        'Expected a slug (cow-puzzle), handle/slug (shihaitian/cow-puzzle), or a game URL (https://pogglo.com/shihaitian/cow-puzzle/).\n' +
        'Copy it from your game page, then run: npx pogglo link <that>'
    );
  }
  const config = readConfig();
  const endpoint = flags.endpoint ?? config?.endpoint ?? DEFAULT_ENDPOINT;
  const headers = config?.token ? { authorization: `Bearer ${config.token}` } : {};
  let j;
  try {
    j = await (await fetch(`${endpoint}/v1/games/${encodeURIComponent(parsed.slug)}`, { headers })).json();
  } catch (err) {
    throw new Error(
      `Could not reach the pogglo platform at ${endpoint} (${err.cause?.code ?? err.message}).\n` +
        'Check your network, or point at another endpoint with POGGLO_ENDPOINT / --endpoint.'
    );
  }
  if (!j.ok) {
    throw new Error(
      `Game "${parsed.slug}" was not found on ${endpoint}.\n` +
        'Check the spelling against the game page URL, then run: npx pogglo link <handle>/<slug>'
    );
  }
  if (parsed.handle && parsed.handle !== j.handle) {
    throw new Error(
      `Slug "${parsed.slug}" exists but belongs to @${j.handle}, not @${parsed.handle}.\n` +
        `Double-check the game URL, then run: npx pogglo link ${j.handle}/${j.slug}`
    );
  }
  const file = writeManifest(path.resolve('.'), { title: j.title, slug: j.slug });
  console.log(`Linked → @${j.handle}/${j.slug} ("${j.title}")`);
  console.log(`Saved ${file}. Publishing from this folder now updates that game — commit pogglo.json to keep the link.`);
  if (config?.author && config.author !== j.handle) {
    console.log(`Note: you are signed in as @${config.author} but the game belongs to @${j.handle} — publishing here will NOT update it unless you publish as @${j.handle}.`);
  }
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

  // Project identity: pogglo.json at the project root (see projectRootFor),
  // falling back to one next to index.html (the MCP server writes it there).
  const projectRoot = projectRootFor(startDir, pkgDir);
  const manifest = readManifest(projectRoot) ?? readManifest(pkgDir);

  // 标题：--title > pogglo.json title > index.html <title>（剥引擎样板前缀取真名）。
  // 命名不设卡点（2026-07-23 拍板：slug 有创作者命名空间兜底，取名引导放在发布页魔法提示词的 --slug 里）；
  // 剥完没真名就按原始 <title>（或 Untitled Game）上传，只温和提醒一句。
  let title = typeof flags.title === 'string' ? flags.title : (manifest?.title ?? null);
  if (!title) {
    const raw = fs.readFileSync(path.join(pkgDir, 'index.html'), 'utf8').match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
    title = cleanEngineTitle(raw) ?? raw?.trim().slice(0, 80) ?? null;
    if (!title || !cleanEngineTitle(raw)) {
      console.log('⚠ No real game name found (engine-default title) — publishing as-is. Consider --title "Name" / --slug my-game for a meaningful URL.');
    }
    title ??= 'Untitled Game';
  }

  console.log(`Packaging ${pkgDir} …`);
  const zip = zipDir(pkgDir);
  console.log(`Uploading ${(zip.length / 1024).toFixed(1)} KB to ${endpoint} …`);

  // Slug: explicit --slug > the slug remembered in pogglo.json (added by a
  // previous publish or `pogglo link`) > none (server derives it from title).
  const slugWanted = typeof flags.slug === 'string' ? flags.slug : manifest?.slug;
  const headers = { 'content-type': 'application/zip', 'x-title': encodeURIComponent(title) };
  if (typeof slugWanted === 'string' && slugWanted) headers['x-slug'] = slugWanted;
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

  // Remember the identity the server confirmed: next publish (even after a
  // title change or on another machine, via git) updates this same game.
  const rootManifest = readManifest(projectRoot);
  if (body.slug && (rootManifest?.slug !== body.slug || rootManifest?.title !== title)) {
    const file = writeManifest(projectRoot, { title, slug: body.slug });
    if (rootManifest?.slug !== body.slug) console.log(`  Saved ${file} (slug: ${body.slug}) — future publishes update this game. Commit it.`);
  }
  return body;
}

// v1 错误体：{code, msg, ai_fix_prompt}——ai_fix_prompt 是写给 AI 的修复提示，一并透出
function errMsg(j) {
  return [j.msg ?? j.message, j.ai_fix_prompt].filter(Boolean).join('\n');
}

// index.html <title> 常是引擎样板（"Unity WebGL Player | webgl"、"Cocos Creator | game"…）。
// 剥掉样板前缀取真名；剥完只剩构建目录名/引擎词这类无信息量残渣 → 返回 null（触发要真名的报错）。
// 黑名单与服务端 GENERIC_SLUGS（../pogglo/api）同步维护。
const ENGINE_BOILERPLATE = /^\s*(unity\s*webgl\s*player|团结引擎|tuanjie|cocos\s*creator|godot|phaser|made with \w+)\s*[|:\-–—]\s*/i;
const GENERIC_TITLES = new Set([
  'game', 'games', 'webgl', 'web-mobile', 'web-desktop', 'dist', 'build', 'out', 'output', 'public', 'www',
  'index', 'html', 'html5', 'wasm', 'release', 'debug', 'app', 'main', 'src', 'export', 'exports',
  'untitled', 'untitled game', 'untitled-game', 'new-project', 'new project', 'my-game', 'my game',
  'test', 'demo', 'sample', 'example', 'unity', 'unity webgl player', 'tuanjie', 'cocos', 'godot', 'phaser', 'template',
]);
export function cleanEngineTitle(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  for (let i = 0; i < 3 && ENGINE_BOILERPLATE.test(t); i++) t = t.replace(ENGINE_BOILERPLATE, '').trim();
  t = t.slice(0, 80).trim();
  if (!t || GENERIC_TITLES.has(t.toLowerCase())) return null;
  return t;
}
