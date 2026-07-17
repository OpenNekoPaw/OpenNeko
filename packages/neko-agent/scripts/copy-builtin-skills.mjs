import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, '../neko-skills/skills');
const target = resolve(packageRoot, 'dist/skills');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
