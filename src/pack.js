// Locate the built game package and zip it.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const OUTPUT_DIRS = ['.', 'dist', 'build', 'out', 'public', 'www'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.astro', '.next', '.cache', 'src']);

/** Find the directory that holds index.html, preferring build-output folders. */
export function packageDirFor(startDir) {
  for (const d of OUTPUT_DIRS) {
    const dir = path.join(startDir, d);
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

/** Zip a directory (recursively), skipping dev junk. Returns a Buffer. */
export function zipDir(dir) {
  const zip = new AdmZip();
  addDir(zip, dir, '');
  return zip.toBuffer();
}

function addDir(zip, abs, rel) {
  for (const name of fs.readdirSync(abs)) {
    if (SKIP_DIRS.has(name) || name === '.DS_Store' || name === 'Thumbs.db') continue;
    const absChild = path.join(abs, name);
    const relChild = rel ? `${rel}/${name}` : name;
    const stat = fs.statSync(absChild);
    if (stat.isDirectory()) addDir(zip, absChild, relChild);
    else zip.addFile(relChild, fs.readFileSync(absChild));
  }
}
