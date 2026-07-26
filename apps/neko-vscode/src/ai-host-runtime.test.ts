import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const extensionSource = readFileSync(new URL('./extension.ts', import.meta.url), 'utf8');
const hostRuntimeSource = readFileSync(new URL('./ai-host-runtime.ts', import.meta.url), 'utf8');

test('composes one AI Host runtime and injects the same services identity into features', () => {
  assert.equal(count(extensionSource, 'createOpenNekoAiHostRuntime()'), 1);
  assert.match(
    extensionSource,
    /featureModule\.activate\(scopedContext\.context,\s*aiHostRuntime\?\.services\)/u,
  );
  assert.doesNotMatch(extensionSource, /createPlatform\s*\(/u);
  assert.match(extensionSource, /await disposeActivationState\(\)/u);
});

test('does not create or register a Generation Job runtime without a workspace', () => {
  const noWorkspaceBranch = hostRuntimeSource.match(
    /if \(!workspaceRoot\) \{([\s\S]*?)\n  \}/u,
  )?.[1];
  assert.ok(noWorkspaceBranch);
  assert.doesNotMatch(noWorkspaceBranch, /GenerationJobCoordinator/u);
  assert.doesNotMatch(noWorkspaceBranch, /registerMediaAgentTools/u);
  assert.match(hostRuntimeSource, /resolveGenerationBinding:\s*\(purpose\)\s*=>/u);
  assert.match(hostRuntimeSource, /platform\.config\.resolveModelRefForPurpose\(purpose\)/u);
});

test('composes the generated output index from the Host-owned metadata binding', () => {
  assert.doesNotMatch(hostRuntimeSource, /createResourceCacheGeneratedAssetIndex/u);
  assert.equal(count(hostRuntimeSource, 'createNodeWorkspaceResourceCacheMetadataBinding({'), 1);
  assert.match(
    hostRuntimeSource,
    /new LocalMetadataGeneratedOutputProjectionStore\(\{\s*manifestStore: metadata\.manifestStore,/u,
  );
  assert.match(hostRuntimeSource, /new GeneratedAssetIndex\(generatedAssetStore\)/u);
  assert.doesNotMatch(hostRuntimeSource, /generatedAssetStore\.update\(\(assets\) => assets\)/u);
});

test('isolates rejected generated output projections without blocking Host activation', () => {
  assert.match(
    hostRuntimeSource,
    /rejectedProjectionPolicy:\s*\{\s*mode:\s*'preserve-and-report',\s*report:/u,
  );
  assert.match(hostRuntimeSource, /vscode\.window\.showWarningMessage\(/u);
  assert.match(hostRuntimeSource, /generated files? (?:was|were) preserved/iu);
  assert.match(hostRuntimeSource, /rejected\.slice\(0,\s*3\)/u);
  assert.match(hostRuntimeSource, /and \$\{hiddenCount\} more/u);
});

test('shares the Host-owned generated asset catalog with embedded features', () => {
  assert.match(hostRuntimeSource, /readonly generatedAssets\?: GeneratedAssetCatalog;/u);
  assert.match(hostRuntimeSource, /generatedAssets:\s*generatedAssetIndex,/u);
});

function count(source: string, value: string): number {
  return source.split(value).length - 1;
}
