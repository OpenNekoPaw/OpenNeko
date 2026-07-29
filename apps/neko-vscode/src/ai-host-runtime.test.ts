import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const extensionSource = readFileSync(new URL('./extension.ts', import.meta.url), 'utf8');
const hostRuntimeSource = readFileSync(new URL('./ai-host-runtime.ts', import.meta.url), 'utf8');

test('starts the Agent Host only through the production lazy capability', () => {
  assert.equal(count(extensionSource, 'createOpenNekoAiHostRuntime()'), 1);
  assert.match(
    extensionSource,
    /const agentRuntimeCapability = createLazyCapability\(\{[\s\S]*?id: 'neko\.capability\.agent-runtime',[\s\S]*?const hostRuntime = await createOpenNekoAiHostRuntime\(\);[\s\S]*?startNekoAgentRuntime/u,
  );
  assert.match(extensionSource, /new HostKernel\(definitions, \{\s*capabilities:/u);
  assert.equal(count(extensionSource, 'hostRuntime.agent'), 1);
  assert.match(extensionSource, /registerLazyNekoAgentSurface\(/u);
  assert.match(extensionSource, /createVSCodeCapabilityContribution\(/u);
  assert.match(extensionSource, /createOpenNekoCutHostRuntime\(\)/u);
  assert.doesNotMatch(extensionSource, /hostRuntime\.cut/u);
  assert.match(extensionSource, /mediaRepresentation:\s*assets\.mediaRepresentation/u);
  assert.match(extensionSource, /canvas:\s*canvas\.api/u);
  assert.doesNotMatch(extensionSource, /EmbeddedFeatureRegistry/u);
  assert.doesNotMatch(extensionSource, /featureModule\.activate/u);
  assert.doesNotMatch(extensionSource, /createPlatform\s*\(/u);
  assert.match(extensionSource, /await activeKernel\?\.dispose\(\)/u);
});

test('does not create or register a Generation Job runtime without a workspace', () => {
  const agentRuntimeSource = section(
    hostRuntimeSource,
    'export async function createOpenNekoAiHostRuntime',
    'function reportRejectedGeneratedOutputProjections',
  );
  const noWorkspaceBranch = agentRuntimeSource.match(
    /if \(!workspaceRoot\) \{([\s\S]*?)\n {2}\}/u,
  )?.[1];
  assert.ok(noWorkspaceBranch);
  assert.doesNotMatch(noWorkspaceBranch, /GenerationJobCoordinator/u);
  assert.doesNotMatch(noWorkspaceBranch, /registerMediaAgentTools/u);
  assert.match(hostRuntimeSource, /agent:\s*\{\s*platform,\s*toolRegistry\s*\}/u);
  assert.doesNotMatch(agentRuntimeSource, /cut:/u);
});

test('composes the generated output index from the Host-owned metadata binding', () => {
  assert.doesNotMatch(hostRuntimeSource, /createResourceCacheGeneratedAssetIndex/u);
  assert.equal(count(hostRuntimeSource, 'createNodeWorkspaceResourceCacheMetadataBinding({'), 2);
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

test('shares the Host-owned generated asset catalog with composed features', () => {
  assert.match(hostRuntimeSource, /readonly agent: NekoAgentAiHostPort;/u);
  assert.match(hostRuntimeSource, /generatedAssets:\s*generatedAssetIndex,/u);
});

test('does not expose unused purpose, path-only, or universal service ports', () => {
  assert.doesNotMatch(hostRuntimeSource, /purposeGenerationJobs/u);
  assert.doesNotMatch(hostRuntimeSource, /resolveGenerationResultPath/u);
  assert.doesNotMatch(hostRuntimeSource, /OpenNekoAiHostServices/u);
  assert.match(hostRuntimeSource, /readonly services: NekoCutHostServices;/u);
  assert.doesNotMatch(hostRuntimeSource, /readonly cut: NekoCutHostServices;/u);
});

function count(source: string, value: string): number {
  return source.split(value).length - 1;
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
}
