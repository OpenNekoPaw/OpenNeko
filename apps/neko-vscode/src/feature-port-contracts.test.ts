import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const extensionSource = readFileSync(new URL('./extension.ts', import.meta.url), 'utf8');
const agentSource = readFileSync(new URL('./features/agent/index.ts', import.meta.url), 'utf8');
const canvasSource = readFileSync(
  new URL('./features/canvas/extension.ts', import.meta.url),
  'utf8',
);
const cutSource = readFileSync(new URL('./features/cut/extension.ts', import.meta.url), 'utf8');
const previewApiSource = readFileSync(
  new URL('./features/preview/types/api.ts', import.meta.url),
  'utf8',
);
const assetsSource = readFileSync(
  new URL('./features/assets/extension.ts', import.meta.url),
  'utf8',
);
const toolsSource = readFileSync(
  new URL('./features/tools/bootstrap/bootstrapExtension.ts', import.meta.url),
  'utf8',
);

test('defines feature-owned ports without a universal Host or exported services container', () => {
  assert.match(agentSource, /export interface NekoAgentAiHostPort/u);
  assert.match(agentSource, /export interface NekoAgentHostServices/u);
  assert.match(canvasSource, /export interface NekoCanvasHostServices/u);
  assert.match(canvasSource, /export interface NekoCanvasFeatureExports/u);
  assert.match(cutSource, /export interface NekoCutHostServices/u);
  assert.match(previewApiSource, /export interface NekoPreviewAPI/u);
  assert.match(assetsSource, /export interface NekoAssetsFeatureExports/u);
  assert.match(toolsSource, /export interface NekoToolsFeatureActivation/u);

  for (const source of [
    agentSource,
    canvasSource,
    cutSource,
    previewApiSource,
    assetsSource,
    toolsSource,
  ]) {
    assert.doesNotMatch(source, /UniversalHost|OpenNekoAiHostServices/u);
  }
  assert.doesNotMatch(toolsSource, /ServiceCollection|services:/u);
  assert.doesNotMatch(toolsSource, /from ['"]vscode['"]/u);
});

test('injects every cross-feature port explicitly at the composition root', () => {
  assert.match(
    extensionSource,
    /dependencies:\s*\{\s*preview:\s*previewRef,\s*assets:\s*assetsRef,\s*cut:\s*cutRef/u,
  );
  assert.match(extensionSource, /mediaRepresentation:\s*assets\.mediaRepresentation/u);
  assert.match(extensionSource, /previewVariants:\s*preview/u);
  assert.match(extensionSource, /cut,\s*\}\);/u);
  assert.match(extensionSource, /dependencies:\s*\{\s*assets:\s*assetsRef,\s*canvas:\s*canvasRef/u);
  assert.match(extensionSource, /canvas:\s*canvas\.api/u);
  assert.match(
    extensionSource,
    /internalCapabilityProviders:\s*\[\.\.\.assets\.agentCapabilities,\s*canvas\.agentCapability\]/u,
  );
  assert.doesNotMatch(extensionSource, /getCapability\s*\(|ServiceCollection/u);
});

test('binds each feature lifecycle to its registration or capability owner', () => {
  assert.match(
    extensionSource,
    /const activation = bootstrapNekoToolsExtension\(scoped\.context\);\s*owner\.add\(activation\);/u,
  );
  for (const deactivator of [
    'deactivatePreview',
    'deactivateAssets',
    'deactivateCut',
    'deactivateCanvas',
  ]) {
    assert.match(extensionSource, new RegExp(`owner\\.add\\(\\{ dispose: ${deactivator} \\}\\)`));
  }
  assert.match(
    extensionSource,
    /const hostRuntime = await createOpenNekoAiHostRuntime\(\);\s*owner\.add\(hostRuntime\);/u,
  );
  assert.match(extensionSource, /owner\.add\(\{ dispose: deactivateAgent \}\)/u);
});
