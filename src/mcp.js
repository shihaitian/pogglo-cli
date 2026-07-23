// pogglo MCP server — D2 的旗舰发布路径：AI 客户端（Claude Code / Cursor 等）里
// 原生调用 publish_game，游戏秒上架并拿回可玩 URL。与 CLI 同包发布（bin: pogglo-mcp），
// 共享 pack.js 与 ~/.pogglo/config.json 登录态（消灭旧 mcp/ 的 pack.js 双副本）。
// v1 协议：POST /v1/submit（Bearer 或配对码）；报错把 ai_fix_prompt 原样透出给调用方 AI。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { packageDirFor, zipDir } from './pack.js';

const DEFAULT_ENDPOINT = process.env.POGGLO_ENDPOINT ?? 'https://pogglo.com';
const CONFIG_PATH = path.join(os.homedir(), '.pogglo', 'config.json');

function config() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

const LOGIN_HINT =
  'No identity. Two ways, both work without a TTY:\n' +
  '  A) pairing code from https://pogglo.com/publish/ — pass it as the `code` parameter (POG-XXXX);\n' +
  '  B) email sign-in once:\n' +
  '     1. npx pogglo login --email you@example.com\n' +
  '     2. npx pogglo login --email you@example.com --code <6-digit>\n' +
  'Then call publish_game again.';

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const errText = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
// v1 错误体：msg + ai_fix_prompt（后者就是写给你——调用方 AI——的修复指引）
const errMsg = (j) => [j.msg ?? j.message, j.ai_fix_prompt].filter(Boolean).join('\n');

const manifestShape = {
  title: z.string().describe('Game title shown everywhere'),
  tagline: z.string().optional().describe('One-line hook shown under the title'),
  description: z.string().optional().describe('2-4 sentences. Becomes the SEO text of the game page.'),
  howToPlay: z.array(z.string()).optional(),
  controls: z.array(z.object({ input: z.string(), action: z.string() })).optional(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  tags: z.array(z.string()).optional().describe('Up to 6 category tags'),
  emoji: z.string().optional().describe('One emoji used as the cover art'),
  model: z.string().optional().describe('Which AI model made this game, e.g. "Claude Opus 4.8"'),
  orientation: z.enum(['landscape', 'portrait']).optional()
    .describe('Screen shape the game is designed for. Use "portrait" for phone-shaped games (taller than wide) — the game page letterboxes them instead of stretching. Default: landscape.'),
};

/** 组装 server（导出以便离线测试注册面，不建立连接）。 */
export function buildServer() {
  const server = new McpServer({ name: 'pogglo', version: '0.3.0' });
  const tools = [];

  tools.push('publish_game');
  server.tool(
    'publish_game',
    'Publish a finished browser game to pogglo.com and get a playable URL back. ' +
      'Point it at the folder containing the BUILT game (index.html) or the project root ' +
      '(dist/build/out auto-detected). Pass metadata — you wrote the game, so write its store page too.',
    {
      dir: z.string().describe('Absolute path to the game project or its build output'),
      metadata: z.object(manifestShape).describe('Game page metadata (title required; written into pogglo.json)'),
      slug: z.string().optional().describe('Wanted URL slug (defaults to slugified title)'),
      code: z.string().optional().describe('Pairing code POG-XXXX from the website — publishes without login'),
    },
    async ({ dir, metadata, slug, code }) => {
      const c = config();
      if (!code && !c?.token) return errText(LOGIN_HINT);
      // 配对码=生产语境委托，与 CLI 同规则：不被本地 config 的 endpoint 劫持
      const endpoint = code ? DEFAULT_ENDPOINT : (c?.endpoint ?? DEFAULT_ENDPOINT);

      const pkgDir = packageDirFor(path.resolve(dir));
      if (!pkgDir) {
        return errText(
          `No index.html found under ${dir} (checked ., dist/, build/, out/, public/, www/). ` +
            'If the project is uncompiled, run its build first (npm install && npm run build), then call publish_game again with the build output.'
        );
      }
      // 元数据随包落盘（平台未来读 pogglo.json 充实游戏页；标题现在就用它）
      const manifestPath = path.join(pkgDir, 'pogglo.json');
      let existing = {};
      try {
        existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {}
      fs.writeFileSync(manifestPath, JSON.stringify({ ...existing, ...metadata }, null, 2));

      const headers = {
        'content-type': 'application/zip',
        'x-title': encodeURIComponent(metadata.title),
        'user-agent': 'pogglo-mcp',
      };
      // 画面方向（协议头 x-orientation）：本次声明 > pogglo.json 里记住的；服务端默认 landscape
      if (metadata.orientation ?? existing.orientation) headers['x-orientation'] = metadata.orientation ?? existing.orientation;
      // Slug: explicit param > slug remembered in pogglo.json from a previous
      // publish — so republishing updates the SAME game even if the title changed.
      if (slug ?? existing.slug) headers['x-slug'] = slug ?? existing.slug;
      if (code) headers['x-pogglo-code'] = code;
      else headers['authorization'] = `Bearer ${c.token}`;

      let res;
      try {
        res = await fetch(endpoint + '/v1/submit', { method: 'POST', headers, body: zipDir(pkgDir) });
      } catch (err) {
        return errText(`Could not reach the pogglo platform at ${endpoint} (${err.cause?.code ?? err.message}).`);
      }
      let body;
      try {
        body = await res.json();
      } catch {
        // 5xx 时 Cloudflare 给 HTML 错误页——如实报服务端故障，别诱导 AI 改游戏（2026-07-23 排障实录）
        return errText(`The pogglo server returned non-JSON (HTTP ${res.status}) — a SERVER-side failure, not a problem with the game. Do not modify the game; retry once, and report this message to Pogglo if it persists.`);
      }
      if (!body.ok) return errText(`Publish rejected (${body.code}): ${errMsg(body)}`);
      // Remember the identity the server confirmed (see CLI publish for rationale).
      if (body.slug && existing.slug !== body.slug) {
        fs.writeFileSync(manifestPath, JSON.stringify({ ...existing, ...metadata, slug: body.slug }, null, 2));
      }
      return text(
        `Published "${metadata.title}" by @${body.handle}\n` +
          `Game page  → ${body.page_url}\n` +
          `Direct play → ${body.play_url}\n` +
          (body.note ? body.note + '\n' : '') +
          'Share the game page link — it is playable right now.'
      );
    }
  );

  tools.push('list_games');
  server.tool('list_games', 'List games on pogglo with play/like stats.', {}, async () => {
    // 公开只读接口，与登录态无关 —— 不读 config（防旧 localhost 配置劫持）
    const endpoint = DEFAULT_ENDPOINT;
    try {
      const j = await fetch(endpoint + '/v1/games').then((r) => r.json());
      const lines = j.games.map(
        (g) =>
          `${g.slug} — "${g.title}" by @${g.handle} [${g.status}] plays:${g.stats?.plays ?? 0} likes:${g.stats?.likes ?? 0} median:${g.stats?.medianSeconds ?? 0}s`
      );
      return text(lines.join('\n') || 'No games yet.');
    } catch {
      return errText(`Platform unreachable at ${endpoint}.`);
    }
  });

  return { server, tools };
}

export async function start() {
  const { server } = buildServer();
  await server.connect(new StdioServerTransport());
}
