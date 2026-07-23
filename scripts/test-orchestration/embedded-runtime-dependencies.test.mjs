import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('embedded runtime dependency closure', () => {
  it('loads Engine native code from its scoped packaged path', async () => {
    const [manifest, bindingSource, extensionSource] = await Promise.all([
      readJson('packages/neko-engine/package.json'),
      readFile(
        'packages/neko-engine/packages/extension/src/mediaEngine/nativeEngineBinding.ts',
        'utf8',
      ),
      readFile('packages/neko-engine/packages/extension/src/extension.ts', 'utf8'),
    ]);

    assert.equal(manifest.scripts['vscode:prepublish'], 'pnpm run compile');
    assert.doesNotMatch(manifest.scripts.compile, /external:@neko-engine\/host-napi/u);
    assert.doesNotMatch(bindingSource, /import\(['"]@neko-engine\/host-napi['"]\)/u);
    assert.match(extensionSource, /packages\/host-napi\/loader\.js/u);
  });

  it('uses literal Content-owned loaders for every supported document module', async () => {
    const [contentNodeSource, agentRuntimeSource] = await Promise.all([
      readFile('packages/neko-content/src/document/node.ts', 'utf8'),
      readFile(
        'packages/neko-agent/packages/extension/src/services/agentContentAccessRuntime.ts',
        'utf8',
      ),
    ]);

    assert.doesNotMatch(contentNodeSource, /import\(packageName\)/u);
    assert.doesNotMatch(agentRuntimeSource, /import\(packageName\)/u);
    for (const packageName of [
      'adm-zip',
      'pdf-parse',
      'mammoth',
      'officeparser',
      'epub2',
      'node-unrar-js',
      'node-fetch',
      'cheerio',
      'xlsx',
      'fast-xml-parser',
    ]) {
      assert.match(contentNodeSource, new RegExp(`import\\(['"]${packageName}['"]\\)`, 'u'));
    }
    assert.match(agentRuntimeSource, /loadNodeDocumentModule/u);
  });

  it('stages Agent Sharp runtime packages during prepublish', async () => {
    const [manifest, vscodeIgnore] = await Promise.all([
      readJson('packages/neko-agent/package.json'),
      readFile('packages/neko-agent/.vscodeignore', 'utf8'),
    ]);

    assert.match(manifest.scripts['vscode:prepublish'], /stage:sharp-runtime/u);
    assert.match(manifest.scripts['stage:sharp-runtime'], /stage-sharp-runtime\.mjs/u);
    assert.match(vscodeIgnore, /^scripts\/\*\*$/mu);
    assert.match(vscodeIgnore, /^!dist\/\*\*$/mu);
  });

  it('validates every embedded runtime closure before final packaging', async () => {
    const assemblerSource = await readFile('scripts/package-openneko-platform.mjs', 'utf8');

    assert.match(assemblerSource, /assertEmbeddedRuntimeClosure\(stageRoot, target\)/u);
  });
});

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
