// pogglo CLI — the D2 primary publish path: one command in the terminal (or
// called by an AI agent), playable URL back. Zero interaction after `login`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { packageDirFor, zipDir } from './pack.js';
import { CATEGORY_IDS, normCategory, PLATFORMS, normPlatform } from './categories.js';

const CONFIG_DIR = path.join(os.homedir(), '.pogglo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
// v1 协议（2026-07-23 转正）：默认打正式域（/v1/* Worker 路由），本地联调用 POGGLO_ENDPOINT 覆盖
const DEFAULT_ENDPOINT = process.env.POGGLO_ENDPOINT ?? 'https://pogglo.com';

const HELP = `pogglo — publish AI-made browser games

Usage:
  npx pogglo login --email <you@example.com>            request a sign-in code
  npx pogglo login --email <you@example.com> --code <6-digit>   finish sign-in
  npx pogglo login --email <you@example.com> --handle <username> pick a username (new accounts)
  npx pogglo publish [dir] --title <t> --slug <s> --orientation portrait|landscape [suggested…] [--endpoint <url>]
  npx pogglo publish [dir] --code POG-XXXX              publish with a pairing code
  npx pogglo link <game>                                bind this folder to a published game
  npx pogglo whoami

login is a two-step email flow (no password): the first call emails you a
6-digit code, the second call (add --code) saves your token. First sign-in
asks you to pick a username (3-16 chars: a-z, 0-9, _ or -) — it is UNIQUE and
PERMANENT (it can never be changed) and is the author of everything you
publish. Pass --handle together with --code, or in a follow-up call.

publish with --code POG-XXXX needs no login at all: get a pairing code from
the website (Publish page) and the upload is attributed to that account.

publish finds your built game automatically (./dist, ./build, ./out, ./public
or the current folder — whichever contains index.html), zips it and uploads.

REQUIRED on every publish (also accepted from pogglo.json):
  --title <t>                    the game's real name
  --slug <s>                     unique URL id; reused to UPDATE the same game.
                                 Saved into pogglo.json on first publish — commit it.
  --orientation portrait|landscape   portrait = phone-shaped (taller than wide);
                                 the game page letterboxes it instead of stretching.

SUGGESTED (fill these in — you wrote the game, so write its store page too):
  --description <text>           1-4 sentences; becomes the game page text.
  --controls <text>             how to play, e.g. "WASD to move, Space to jump".
  --category <id>                one of: ${CATEGORY_IDS.join(', ')}.
  --platforms keyboard|touch|both   which inputs it supports (keyboard = mouse/
                                 keyboard/gamepad, touch = touchscreen).
  --ai <tools>                   the AI tool(s) that made it, format
                                 "Tool[,model][;Tool2[,model2]]", e.g.
                                 "Claude,claude-opus-4.8;Codex". Naming just the
                                 tool ("Claude") is fine if you don't know the model.

Every value above is remembered in pogglo.json, so later publishes reuse them
(and update the SAME game even if the title changed). Commit pogglo.json.

link restores that identity in a fresh clone (or adopts an existing game):
  npx pogglo link shihaitian/cow-puzzle
  npx pogglo link https://pogglo.com/shihaitian/cow-puzzle/
It looks the game up on the platform and writes { "slug": ... } into
pogglo.json in the current folder.
`;

export async function main(argv) {
  const { cmd, args, flags } = parseArgs(argv);
  // -h / -help / --help must behave exactly like `help`: print usage, exit 0.
  // Exiting 1 here would send a calling AI agent into its self-repair loop
  // over a command that did exactly what was asked.
  if (flags.help === true || cmd === '-h' || cmd === '-help') {
    console.log(HELP);
    return;
  }
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
// 分多次调用完成登录，不需要 TTY。新邮箱多一步自选用户名（唯一且不可更改，
// 2026-07-23 起不再自动截邮箱前缀）：verify 发 15 分钟注册票据，存 pending 文件续步。
const PENDING_PATH = path.join(CONFIG_DIR, 'pending-signup.json');

function saveAuth(endpoint, email, j) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token: j.token, author: j.handle, email, endpoint }, null, 2));
  console.log(`${j.is_new ? 'Account created' : 'Signed in'}: @${j.handle} (endpoint: ${endpoint})`);
  if (j.is_new) console.log(`Your username @${j.handle} is permanent — it can never be changed.`);
  console.log(`Config saved to ${CONFIG_PATH}. You can now run: npx pogglo publish`);
}

async function register(endpoint, email, handle) {
  let pending = null;
  try { pending = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8')); } catch {}
  if (!pending || pending.email !== email) {
    throw new Error(`No pending registration for ${email}. Start over:\n  npx pogglo login --email ${email}`);
  }
  const j = await api(pending.endpoint ?? endpoint, '/v1/auth/register', { email, reg_token: pending.reg_token, handle: String(handle) });
  if (!j.ok) throw new Error(`Could not create the account (${j.code}):\n${errMsg(j)}`);
  try { fs.rmSync(PENDING_PATH); } catch {}
  saveAuth(pending.endpoint ?? endpoint, email, j);
}

async function login(flags) {
  const endpoint = flags.endpoint ?? readConfig()?.endpoint ?? DEFAULT_ENDPOINT;
  const email = flags.email;
  if (!email || email === true) {
    console.log('Sign-in is a two-step email flow:\n  1. npx pogglo login --email you@example.com   (emails you a 6-digit code)\n  2. npx pogglo login --email you@example.com --code 123456\nNew accounts add a third step (pick a permanent username):\n  3. npx pogglo login --email you@example.com --handle your-name');
    process.exitCode = 1;
    return;
  }

  // 第三步：只带 --handle → 用 pending 票据收尾注册
  if (flags.handle && !flags.code) return register(endpoint, email, flags.handle);

  if (!flags.code) {
    const j = await api(endpoint, '/v1/auth/send-code', { email });
    if (!j.ok) throw new Error(`Could not send code (${j.code}):\n${errMsg(j)}`);
    if (j.dev_code) console.log(`[dev] Your code: ${j.dev_code} (dev echo — production emails it)`);
    console.log(`Code sent to ${email}. Finish sign-in with:\n  npx pogglo login --email ${email} --code <6-digit>`);
    return;
  }

  const j = await api(endpoint, '/v1/auth/verify', { email, code: String(flags.code) });
  if (!j.ok) throw new Error(`Sign-in failed (${j.code}):\n${errMsg(j)}`);
  if (j.need_handle) {
    // 新账号：写 pending（15 分钟内有效），--handle 同行给了就一气呵成
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(PENDING_PATH, JSON.stringify({ email, reg_token: j.reg_token, endpoint }, null, 2));
    if (flags.handle) return register(endpoint, email, flags.handle);
    console.log('Email verified. New accounts pick a username: 3-16 chars, lowercase a-z, 0-9, _ or -.');
    console.log('IMPORTANT: usernames are unique and PERMANENT — they can never be changed. Choose carefully.');
    console.log(`Finish with:\n  npx pogglo login --email ${email} --handle <username>`);
    return;
  }
  saveAuth(endpoint, email, j);
}

// 服务端 5xx 时 Cloudflare 返回 HTML 错误页；直接 res.json() 会把它掩盖成
// 误导性的 "Unexpected token '<' … is not valid JSON"（2026-07-23 排障实录）。
// 这里先验明正身：非 JSON = 服务端故障，如实报状态码 + 正文开头，别让 AI 去改游戏。
async function readJson(res) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `The pogglo server returned non-JSON (HTTP ${res.status}) — a SERVER-side failure, not a problem with your game or command.\n` +
        `Response starts with: ${raw.slice(0, 200).replace(/\s+/g, ' ').trim()}\n` +
        'Do not modify the game. Retry once; if it persists, report this exact message to Pogglo and try again later.'
    );
  }
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
  return readJson(res);
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
    j = await readJson(await fetch(`${endpoint}/v1/games/${encodeURIComponent(parsed.slug)}`, { headers }));
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

  // 发布字段解析（必填 title/slug/orientation + 建议项）：--flag > pogglo.json > (title 兜底剥 <title>)。
  // title/slug/orientation 现为必填（2026-07-24 用户拍板，取代旧「命名不设卡点」）：缺失或枚举非法 →
  // 抛 AI 可读错误当场停下（错误文本即喂回 AI 的修复提示）。建议项缺省只提醒不拦。
  const rawHtmlTitle = fs.readFileSync(path.join(pkgDir, 'index.html'), 'utf8').match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
  const resolved = resolvePublish(manifest, flags, rawHtmlTitle);
  if (resolved.error) throw new Error(resolved.error);
  const { title, slug: slugWanted, orientation, meta, warnings } = resolved;
  if (warnings.length) {
    console.log(`⚠ Suggested fields not set: ${warnings.join(', ')} — they fill in the game page. Pass them (npx pogglo help) or add to pogglo.json.`);
  }

  console.log(`Packaging ${pkgDir} …`);
  const zip = zipDir(pkgDir);
  console.log(`Uploading ${(zip.length / 1024).toFixed(1)} KB to ${endpoint} …`);

  // 协议头：必填三项恒带；建议项仅在有值时带。自由文本百分号编码（HTTP 头不能带非 Latin-1，CJK 必编）。
  const headers = {
    'content-type': 'application/zip',
    'x-title': encodeURIComponent(title),
    'x-slug': encodeURIComponent(slugWanted),
    'x-orientation': orientation,
  };
  if (meta.description) headers['x-description'] = encodeURIComponent(meta.description);
  if (meta.controls) headers['x-controls'] = encodeURIComponent(meta.controls);
  if (meta.category) headers['x-category'] = meta.category;
  if (meta.platforms) headers['x-platforms'] = meta.platforms;
  if (meta.ai_author) headers['x-ai-author'] = encodeURIComponent(meta.ai_author);
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

  const body = await readJson(res);
  if (!body.ok) {
    // AI-readable rejection — print verbatim so an agent can self-correct.
    throw new Error(`Publish rejected (${body.code}):\n${errMsg(body)}`);
  }

  console.log('');
  console.log(`✔ Published: ${body.slug} by @${body.handle}`);
  console.log(`  Game page  →  ${body.page_url}`);
  console.log(`  Direct play →  ${body.play_url}`);
  if (body.note) console.log(`  ${body.note}`);

  // Remember the identity the server confirmed + this run's declared metadata:
  // the next publish (even after a title change or on another machine via git)
  // updates this same game and reuses every field without re-passing flags.
  const rootManifest = readManifest(projectRoot);
  const patch = { title, slug: body.slug, orientation };
  for (const [k, v] of Object.entries(meta)) if (v) patch[k] = v; // 只写有值的建议项，不覆成空
  if (body.slug && (!rootManifest || Object.entries(patch).some(([k, v]) => rootManifest[k] !== v))) {
    const file = writeManifest(projectRoot, patch);
    if (rootManifest?.slug !== body.slug) console.log(`  Saved ${file} (slug: ${body.slug}) — future publishes update this game. Commit it.`);
  }
  return body;
}

// 发布字段解析（纯函数，离线可测）：必填 title/slug/orientation + 建议项。
// 优先级：--flag（flags）> pogglo.json（manifest）>（仅 title）剥 index.html <title> 取真名。
// 返回 { error: <AI 可读文案> }（调用方 throw），或 { title, slug, orientation, meta, warnings }。
export function resolvePublish(manifest, flags, rawHtmlTitle) {
  const m = manifest ?? {};
  const s = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

  const title = s(flags.title) ?? s(m.title) ?? cleanEngineTitle(rawHtmlTitle);
  const slug = s(flags.slug) ?? s(m.slug);
  let orientation = s(flags.orientation) ?? s(m.orientation);
  orientation = orientation ? orientation.toLowerCase() : null;

  const missing = [];
  if (!title) missing.push('--title "Your Game Name"   (a real name — the engine-default <title> does not count)');
  if (!slug) missing.push('--slug your-game            (unique id; reused to update the SAME game later)');
  if (!orientation) missing.push('--orientation portrait|landscape   (portrait = taller than wide)');
  if (missing.length) {
    return { error:
      'Missing required publish fields (title, slug and orientation are required on every publish):\n  ' +
      missing.join('\n  ') +
      '\nPass them as flags, or set them in pogglo.json, then run publish again. Full field list: npx pogglo help' };
  }
  if (!['portrait', 'landscape'].includes(orientation)) {
    return { error:
      `Invalid orientation "${orientation}".\n` +
      'Use --orientation portrait for phone-shaped games (taller than wide), or --orientation landscape.\n' +
      'Fix the flag (or the "orientation" field in pogglo.json), then run publish again.' };
  }

  // 建议项：缺省只警告；category/platforms 给了但非法则报错（枚举，AI 可自纠）
  const description = s(flags.description) ?? s(m.description);
  const controls = s(flags.controls) ?? s(m.controls);
  const aiAuthor = s(flags.ai) ?? s(m.ai_author);
  const catRaw = s(flags.category) ?? s(m.category);
  const category = catRaw ? normCategory(catRaw) : null;
  if (catRaw && !category) {
    return { error:
      `Unknown --category "${catRaw}".\n` +
      `Pick one of: ${CATEGORY_IDS.join(', ')}.\n` +
      'Category is a suggested field — fix it, or drop it if unsure, then run publish again.' };
  }
  const platRaw = s(flags.platforms) ?? s(m.platforms);
  const platforms = platRaw ? normPlatform(platRaw) : null;
  if (platRaw && !platforms) {
    return { error:
      `Unknown --platforms "${platRaw}".\n` +
      `Use one of: ${PLATFORMS.join(', ')} (keyboard = mouse/keyboard/gamepad, touch = touchscreen, both = both).\n` +
      'This is a suggested field — fix it, or drop it if unsure, then run publish again.' };
  }

  const warnings = [];
  if (!description) warnings.push('description');
  if (!controls) warnings.push('controls');
  if (!category) warnings.push('category');
  if (!platforms) warnings.push('platforms');
  if (!aiAuthor) warnings.push('ai');

  return { title, slug, orientation, meta: { description, controls, category, platforms, ai_author: aiAuthor }, warnings };
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
