import { mkdir, readdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = join(root, '.checkpoints');
const temp = join(base, `${stamp}.partial`), target = join(base, stamp);
const excluded = new Set(['node_modules','.npm-cache','.next','.data','.checkpoints','.git','test-results']);
const files = [];
async function walk(dir) { for (const item of await readdir(dir, { withFileTypes: true })) {
  if (excluded.has(item.name) || (item.name.startsWith('.env') && item.name !== '.env.example') || /\.(log|tsbuildinfo)$/.test(item.name)) continue;
  const path = join(dir,item.name);
  if (item.isDirectory()) await walk(path); else if (item.isFile()) files.push(path);
} }
await walk(root); await mkdir(temp, { recursive: true });
const manifest = [];
for (const path of files) {
  const name = relative(root,path), dest = join(temp,name);
  await mkdir(resolve(dest,'..'), { recursive: true });
  await copyFile(path,dest);
  manifest.push({ file:name, sha256:createHash('sha256').update(await readFile(dest)).digest('hex') });
}
await writeFile(join(temp,'MANIFEST.json'),JSON.stringify({ createdAt:stamp,files:manifest },null,2));
await rename(temp,target);
await writeFile(join(base,'LATEST.json.tmp'),JSON.stringify({ directory:target, files:files.length, createdAt:stamp },null,2));
await rename(join(base,'LATEST.json.tmp'),join(base,'LATEST.json'));
console.log(`Checkpoint saved: ${files.length} source files. Secrets and runtime data excluded.`);
