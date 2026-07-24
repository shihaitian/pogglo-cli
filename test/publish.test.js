// resolvePublish + categories —— 纯逻辑单测（不打网络）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublish } from '../src/index.js';
import { normCategory, normPlatform, CATEGORY_IDS, PLATFORMS } from '../src/categories.js';

// title/slug/orientation 齐全的基线 flags
const ok = { title: 'Cow Puzzle', slug: 'cow-puzzle', orientation: 'landscape' };

test('required: missing title/slug/orientation → AI-readable error naming all three', () => {
  const r = resolvePublish(null, {}, null);
  assert.ok(r.error, 'should error');
  assert.match(r.error, /--title/);
  assert.match(r.error, /--slug/);
  assert.match(r.error, /--orientation/);
});

test('required: title falls back to a real <title>, but not to engine boilerplate', () => {
  // 真名 <title> 可满足 title（其余仍需 slug/orientation）
  const good = resolvePublish(null, { slug: 'x', orientation: 'portrait' }, 'Space Miner');
  assert.equal(good.error, undefined);
  assert.equal(good.title, 'Space Miner');
  // 引擎样板 <title> 不算真名 → title 仍缺失
  const bad = resolvePublish(null, { slug: 'x', orientation: 'portrait' }, 'Unity WebGL Player | webgl');
  assert.ok(bad.error);
  assert.match(bad.error, /--title/);
});

test('flags override pogglo.json; manifest supplies when flag absent', () => {
  const r = resolvePublish({ title: 'Old', slug: 'old', orientation: 'portrait' }, { title: 'New' }, null);
  assert.equal(r.error, undefined);
  assert.equal(r.title, 'New');        // flag 覆盖
  assert.equal(r.slug, 'old');         // manifest 兜底
  assert.equal(r.orientation, 'portrait');
});

test('invalid orientation → error', () => {
  const r = resolvePublish(null, { ...ok, orientation: 'sideways' }, null);
  assert.ok(r.error);
  assert.match(r.error, /orientation/i);
});

test('category: invalid → error listing valid ids; valid (any case) → normalized lowercase', () => {
  const bad = resolvePublish(null, { ...ok, category: 'roguelike' }, null);
  assert.ok(bad.error);
  assert.match(bad.error, /puzzle/); // 错误里带合法清单
  const good = resolvePublish(null, { ...ok, category: 'PUZZLE' }, null);
  assert.equal(good.error, undefined);
  assert.equal(good.meta.category, 'puzzle');
});

test('platforms: invalid → error; valid → normalized', () => {
  const bad = resolvePublish(null, { ...ok, platforms: 'vr' }, null);
  assert.ok(bad.error);
  const good = resolvePublish(null, { ...ok, platforms: 'Both' }, null);
  assert.equal(good.error, undefined);
  assert.equal(good.meta.platforms, 'both');
});

test('suggested fields: absent → warnings; present → no warnings + meta populated', () => {
  const bare = resolvePublish(null, ok, null);
  assert.deepEqual(bare.warnings.sort(), ['ai', 'category', 'controls', 'description', 'platforms'].sort());
  const full = resolvePublish(null, {
    ...ok, description: 'A cozy cow puzzle', controls: 'Arrow keys to push',
    category: 'puzzle', platforms: 'both', ai: 'Claude,claude-opus-4.8;Codex',
  }, null);
  assert.deepEqual(full.warnings, []);
  assert.equal(full.meta.description, 'A cozy cow puzzle');
  assert.equal(full.meta.ai_author, 'Claude,claude-opus-4.8;Codex');
});

test('categories module: normalizers accept catalog values, reject others', () => {
  assert.equal(normCategory('Arcade'), 'arcade');
  assert.equal(normCategory('io'), 'io');
  assert.equal(normCategory('nope'), null);
  assert.equal(normPlatform('touch'), 'touch');
  assert.equal(normPlatform('gamepad'), null);
  assert.equal(CATEGORY_IDS.length, 16);
  assert.deepEqual(PLATFORMS, ['keyboard', 'touch', 'both']);
});
