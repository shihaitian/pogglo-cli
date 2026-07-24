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
import { CATEGORY_IDS, normCategory, PLATFORMS, normPlatform } from './categories.js';

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

// 发布元数据（2026-07-24 协议扩展）。必填：title / slug（顶层 slug 参数或 metadata.slug）/ orientation。
// 建议项：description / controls / category / platforms / ai —— 你写了游戏，就顺手把它的商店页也写好。
const manifestShape = {
  title: z.string().describe('REQUIRED. The game\'s real name, shown everywhere.'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase a–z, 0–9 and hyphens only (e.g. "cow-puzzle") — no spaces, uppercase, Chinese or other characters').optional()
    .describe('REQUIRED (here or as the top-level `slug` param). Unique URL id = the url-name after /<handle>/ in the game URL. ASCII only: lowercase a–z, 0–9, hyphens (e.g. "cow-puzzle") — no Chinese/spaces/uppercase; the title may be any language. Reused to UPDATE the same game and saved into pogglo.json.'),
  orientation: z.enum(['landscape', 'portrait']).optional()
    .describe('REQUIRED. Screen shape: "portrait" for phone-shaped games (taller than wide) — the game page letterboxes them instead of stretching — else "landscape".'),
  description: z.string().optional().describe('Suggested. 1-4 sentences; becomes the game page text.'),
  controls: z.string().optional().describe('Suggested. How to play, e.g. "WASD to move, Space to jump".'),
  category: z.string().optional().describe(`Suggested. One CrazyGames category: ${CATEGORY_IDS.join(', ')}.`),
  platforms: z.string().optional()
    .describe('Suggested. Supported input: "keyboard" (mouse/keyboard/gamepad), "touch" (touchscreen), or "both".'),
  ai: z.string().optional()
    .describe('Suggested. AI tool(s) that made the game, format "Tool[,model][;Tool2[,model2]]", e.g. "Claude,claude-opus-4.8;Codex". Naming just the tool ("Claude") is fine if you don\'t know the model.'),
  tagline: z.string().optional().describe('Optional one-line hook (stored locally in pogglo.json).'),
  emoji: z.string().optional().describe('Optional one emoji used as cover art (stored locally).'),
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
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase a–z, 0–9 and hyphens only (e.g. "cow-puzzle")').optional().describe('Wanted URL slug — ASCII only (lowercase a–z, 0–9, hyphens; e.g. "cow-puzzle"). Defaults to slugified title.'),
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
      // 元数据落盘（pogglo.json：平台读它充实游戏页；下次发布复用免重传）
      const manifestPath = path.join(pkgDir, 'pogglo.json');
      let existing = {};
      try {
        existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {}

      // 必填 title/slug/orientation（2026-07-24 拍板）+ 建议项枚举校验。
      // 报错文本 = 写给调用方 AI 的修复提示（本包错误契约），isError 透出。
      const asStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const title = asStr(metadata.title);
      const wantSlug = asStr(slug) ?? asStr(metadata.slug) ?? asStr(existing.slug);
      const orientation = asStr(metadata.orientation) ?? asStr(existing.orientation);
      const missing = [];
      if (!title) missing.push('metadata.title — the game\'s real name');
      if (!wantSlug) missing.push('slug — unique id used to update the same game (the top-level `slug` param or metadata.slug)');
      if (!orientation) missing.push('metadata.orientation — "portrait" or "landscape"');
      if (missing.length) return errText('Missing required publish fields (required on every publish):\n  ' + missing.join('\n  ') + '\nAdd them, then call publish_game again.');
      if (!['portrait', 'landscape'].includes(orientation)) return errText(`Invalid orientation "${orientation}". Use "portrait" (taller than wide) or "landscape", then call publish_game again.`);

      const catRaw = asStr(metadata.category) ?? asStr(existing.category);
      const category = catRaw ? normCategory(catRaw) : null;
      if (catRaw && !category) return errText(`Unknown category "${catRaw}". Pick one of: ${CATEGORY_IDS.join(', ')}. It is a suggested field — fix or omit it, then call publish_game again.`);
      const platRaw = asStr(metadata.platforms) ?? asStr(existing.platforms);
      const platforms = platRaw ? normPlatform(platRaw) : null;
      if (platRaw && !platforms) return errText(`Unknown platforms "${platRaw}". Use one of: ${PLATFORMS.join(', ')} (keyboard = mouse/keyboard/gamepad, touch = touchscreen, both = both). Suggested field — fix or omit, then call publish_game again.`);
      const description = asStr(metadata.description) ?? asStr(existing.description);
      const controls = asStr(metadata.controls) ?? asStr(existing.controls);
      const aiAuthor = asStr(metadata.ai) ?? asStr(existing.ai_author);

      // 落盘：键名与 CLI pogglo.json 对齐（ai → ai_author，orientation/枚举归一化）
      const saved = { ...existing, ...metadata, slug: wantSlug, orientation };
      delete saved.ai;
      if (category) saved.category = category;
      if (platforms) saved.platforms = platforms;
      if (aiAuthor) saved.ai_author = aiAuthor;
      fs.writeFileSync(manifestPath, JSON.stringify(saved, null, 2));

      const headers = {
        'content-type': 'application/zip',
        'x-title': encodeURIComponent(title),
        'x-slug': encodeURIComponent(wantSlug),
        'x-orientation': orientation,
        'user-agent': 'pogglo-mcp',
      };
      if (description) headers['x-description'] = encodeURIComponent(description);
      if (controls) headers['x-controls'] = encodeURIComponent(controls);
      if (category) headers['x-category'] = category;
      if (platforms) headers['x-platforms'] = platforms;
      if (aiAuthor) headers['x-ai-author'] = encodeURIComponent(aiAuthor);
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
      if (body.slug && saved.slug !== body.slug) {
        fs.writeFileSync(manifestPath, JSON.stringify({ ...saved, slug: body.slug }, null, 2));
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
