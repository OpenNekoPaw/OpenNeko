import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
);

if (manifest.publisher !== 'neko' || manifest.name !== 'neko-suite') {
  throw new Error('OpenNeko for VSCode must preserve the neko.neko-suite product identity.');
}
if (!Array.isArray(manifest.extensionPack) || manifest.extensionPack.length === 0) {
  throw new Error('OpenNeko for VSCode must declare a non-empty extensionPack.');
}
if (manifest.main || manifest.browser || manifest.activationEvents || manifest.contributes) {
  throw new Error('OpenNeko for VSCode must remain a pure Extension Pack without runtime behavior.');
}
