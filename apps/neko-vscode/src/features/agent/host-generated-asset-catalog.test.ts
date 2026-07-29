import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const extensionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const chatProviderSource = readFileSync(new URL('./chat/chatProvider.ts', import.meta.url), 'utf8');

test('embedded Agent reuses the Host-owned generated asset catalog', () => {
  expect(extensionSource).toMatch(
    /!hostServices\.generatedAssets\s*&&\s*localMetadata\s*&&\s*workspaceRoot/u,
  );
  expect(extensionSource).toMatch(
    /const standaloneGeneratedAssetIndex\s*=\s*generatedAssetIndexBinding\?\.index;\s*const generatedAssetCatalog\s*=\s*hostServices\.generatedAssets\s*\?\?\s*standaloneGeneratedAssetIndex/u,
  );
  expect(chatProviderSource).not.toMatch(/_generatedAssetCatalog\?\.dispose\(\)/u);
});

test('standalone Agent reports rejected generated output projections without blocking activation', () => {
  expect(extensionSource).toMatch(
    /reportRejectedGeneratedOutputProjections\(generatedAssetIndexBinding\.rejectedProjections\)/u,
  );
  expect(extensionSource).toMatch(/void vscode\.window\.showWarningMessage\(message\)/u);
  expect(extensionSource).toMatch(/The generated files were preserved/u);
});
