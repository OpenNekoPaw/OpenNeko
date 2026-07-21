import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
);

if (manifest.publisher !== 'neko' || manifest.name !== 'neko-suite') {
  throw new Error('OpenNeko for VSCode must preserve the neko.neko-suite product identity.');
}
if (manifest.main !== './dist/extension.js') {
  throw new Error('OpenNeko for VSCode must own the single Extension Host runtime entry.');
}
if (manifest.extensionPack || manifest.extensionDependencies) {
  throw new Error('OpenNeko for VSCode must not depend on separately installed Neko extensions.');
}
