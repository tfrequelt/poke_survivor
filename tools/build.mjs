// Copy the playable site into dist/ for Cloudflare Pages.
//
// usage: node tools/build.mjs
//
// Pages refuses a deployment of more than 20,000 files, and the repo holds far more than that,
// almost all of them source frames the game never requests: the Explorers of Sky rip one PNG per
// frame (packed into assets/pmd/eos_strips by tools/packeos.py) and the particle sprites (packed
// into assets/pmd/particles.png by tools/packparticles.mjs). This copies the page, its styles,
// src/ and assets/ minus those source folders. Pages settings: build command
// `node tools/build.mjs`, output directory `dist`.
import { cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'dist');
const INCLUDE = ['index.html', 'style.css', 'src', 'assets'];
const EXCLUDE = ['assets/pmd/explores_of_sky_moves', 'assets/pmd/particles_sprites'];
const LIMIT = 20000;

const excluded = (abs) => {
  const rel = relative(ROOT, abs).split(sep).join('/');
  return EXCLUDE.some((e) => rel === e || rel.startsWith(e + '/'));
};

rmSync(OUT, { recursive: true, force: true });
for (const name of INCLUDE) {
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true, filter: (src) => !excluded(src) });
}

const count = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = join(dir, f);
  return n + (statSync(p).isDirectory() ? count(p) : 1);
}, 0);
const files = count(OUT);
console.log(`dist/: ${files} files`);
if (files > LIMIT) {
  console.error(`over the Pages limit of ${LIMIT}; add the offending folder to EXCLUDE`);
  process.exit(1);
}
