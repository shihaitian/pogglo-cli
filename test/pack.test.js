// pack.js — 产物定位与打包（纯函数，直接单测）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { packageDirFor, zipDir } from '../src/pack.js';

function tmpProject(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pogglo-test-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

test('packageDirFor prefers the project root when it holds index.html', () => {
  const dir = tmpProject({ 'index.html': '<html>', 'dist/index.html': '<html>' });
  assert.equal(packageDirFor(dir), dir);
});

test('packageDirFor falls back to dist/ when root has no index.html', () => {
  const dir = tmpProject({ 'dist/index.html': '<html>', 'README.md': 'x' });
  assert.equal(packageDirFor(dir), path.join(dir, 'dist'));
});

test('packageDirFor returns null when nothing contains index.html', () => {
  const dir = tmpProject({ 'main.js': 'x' });
  assert.equal(packageDirFor(dir), null);
});

test('zipDir includes game files but skips dev junk', () => {
  const dir = tmpProject({
    'index.html': '<html>',
    'game.js': 'x',
    'assets/sprite.png': 'x',
    'node_modules/leftpad/index.js': 'x',
    '.git/HEAD': 'x',
    'src/main.ts': 'x',
  });
  const zip = new AdmZip(zipDir(dir));
  const names = zip.getEntries().map((e) => e.entryName).sort();
  assert.deepEqual(names, ['assets/sprite.png', 'game.js', 'index.html']);
});
