// pogglo CLI — the D2 primary publish path: one command in the terminal (or
// called by an AI agent), playable URL back. Zero interaction after `login`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { packageDirFor, zipDir } from './pack.js';

const CONFIG_DIR = path.join(os.homedir(), '.pogglo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_ENDPOINT = process.env.POGGLO_ENDPOINT ?? 'http://localhost:8788';

const HELP = `pogglo — publish AI-made browser games

Usage:
  npx pogglo login [--author <handle>] [--endpoint <url>]
  npx pogglo publish [dir] [--author <handle>] [--endpoint <url>]
  npx pogglo whoami

publish finds your built game automatically (./dist, ./build, ./out, ./public
or the current folder — whichever contains index.html), zips it and uploads.
Add a pogglo.json next to index.html to control the game page copy:
  { "title", "tagline", "description", "howToPlay": [], "controls": [{"input","action"}],
    "faq": [{"q","a"}], "tags": [], "emoji", "model", "author", "orientation", "platforms": [] }
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

function login(flags) {
  // Dev-phase auth: a locally generated token the platform accepts as identity.
  // The Cloudflare phase swaps this for issued tokens; the CLI contract is stable.
  const config = {
    token: readConfig()?.token ?? crypto.randomBytes(24).toString('hex'),
    author: flags.author ?? readConfig()?.author ?? os.userInfo().username,
    endpoint: flags.endpoint ?? readConfig()?.endpoint ?? DEFAULT_ENDPOINT,
  };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Logged in as @${config.author} (endpoint: ${config.endpoint})`);
  console.log(`Config saved to ${CONFIG_PATH}. You can now run: npx pogglo publish`);
}

function whoami() {
  const c = readConfig();
  if (!c) return console.log('Not logged in. Run: npx pogglo login');
  console.log(`@${c.author} → ${c.endpoint}`);
}

async function publish(dirArg, flags) {
  let config = readConfig();
  if (!config) {
    // Keep the promise of zero interaction: auto-login on first publish.
    login(flags);
    config = readConfig();
  }
  const endpoint = flags.endpoint ?? config.endpoint ?? DEFAULT_ENDPOINT;
  const author = flags.author ?? config.author;

  const startDir = path.resolve(dirArg ?? '.');
  const pkgDir = packageDirFor(startDir);
  if (!pkgDir) {
    throw new Error(
      `No index.html found in ${startDir} (looked in ., dist/, build/, out/, public/, www/).\n` +
        'If this is an uncompiled project, run your build first (npm run build) and publish the output folder:\n' +
        '  npx pogglo publish dist'
    );
  }

  console.log(`Packaging ${pkgDir} …`);
  const zip = zipDir(pkgDir);
  console.log(`Uploading ${(zip.length / 1024).toFixed(1)} KB to ${endpoint} …`);

  let res;
  try {
    res = await fetch(endpoint + '/api/publish', {
      method: 'POST',
      headers: {
        'content-type': 'application/zip',
        'x-pogglo-token': config.token,
        'x-pogglo-author': author,
      },
      body: zip,
    });
  } catch (err) {
    throw new Error(
      `Could not reach the pogglo platform at ${endpoint} (${err.cause?.code ?? err.message}).\n` +
        'If you are developing locally, start it first:  npm --prefix platform run dev'
    );
  }

  const body = await res.json();
  if (!body.ok) {
    // AI-readable rejection — print verbatim so an agent can self-correct.
    throw new Error(`Publish rejected (${body.code}):\n${body.message}`);
  }

  console.log('');
  console.log(`✔ Published: ${body.slug} (${body.files} files, ${(body.bytes / 1024).toFixed(1)} KB)`);
  console.log(`  Play it now →  ${body.url}`);
  console.log(`  Status: ${body.status} — playtest games graduate to the main feed once players stick around.`);
  for (const w of body.warnings ?? []) console.log(`  ⚠ ${w}`);
  return body;
}
