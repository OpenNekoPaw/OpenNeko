import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { desktopFuseConfig } from '../fuse.config.js';

const sourceRoot = path.resolve(import.meta.dirname);

describe('Desktop architecture boundaries', () => {
  it('uses explicit CommonJS extensions for Electron main and preload bundles', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(sourceRoot, '..', 'package.json'), 'utf8'),
    ) as { readonly main?: unknown };
    const mainConfig = readFileSync(path.resolve(sourceRoot, '..', 'vite.main.config.ts'), 'utf8');
    const preloadConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.preload.config.ts'),
      'utf8',
    );
    const main = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');

    expect(packageJson.main).toBe('.vite/build/main.cjs');
    expect(mainConfig).toContain("entryFileNames: 'main.cjs'");
    expect(preloadConfig).toContain("entryFileNames: 'preload.cjs'");
    expect(main).toContain("path.join(__dirname, 'preload.cjs')");
  });

  it('pins the Electron archive checksum for the Phase 1 reference target', () => {
    const forgeConfig = readFileSync(path.resolve(sourceRoot, '..', 'forge.config.ts'), 'utf8');

    expect(forgeConfig).toContain('electron-v43.2.0-darwin-arm64.zip');
    expect(forgeConfig).toContain(
      'ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28',
    );
  });

  it('strictly configures every Electron V1 fuse', () => {
    expect(desktopFuseConfig).toEqual({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: true,
    });
  });

  it('keeps React and DOM imports out of main', () => {
    const violations = findForbiddenImports(path.join(sourceRoot, 'main'), ['react', 'react-dom']);
    expect(violations).toEqual([]);
  });

  it('keeps Desktop Agent composition on the canonical host-neutral Pi path', () => {
    const mainRoot = path.join(sourceRoot, 'main');
    const violations = findForbiddenImports(mainRoot, [
      '@neko-agent/extension',
      '@neko/extension',
      'vscode',
    ]);
    const composition = readFileSync(
      path.join(mainRoot, 'desktop-agent-app-host-composition.ts'),
      'utf8',
    );

    expect(violations).toEqual([]);
    expect(composition).toContain('PiConversationRuntime.open');
    expect(composition).toContain('NodePiConversationAuthority.create');
    expect(composition).toContain('createConversationProjectionStore');
    expect(composition).toContain('createPiTimelineProjector');
    expect(composition).not.toContain('AgentSession');
    expect(composition).not.toContain('activeConversation');
  });

  it('keeps provider credentials in Host secret and protected native UI boundaries', () => {
    const mainRoot = path.join(sourceRoot, 'main');
    const application = readFileSync(path.join(mainRoot, 'index.ts'), 'utf8');
    const credentialRuntime = readFileSync(
      path.join(mainRoot, 'desktop-agent-credential-runtime.ts'),
      'utf8',
    );
    const authPrompt = readFileSync(path.join(mainRoot, 'macos-protected-auth-prompt.ts'), 'utf8');

    expect(application).toContain('safeStorage.encryptString');
    expect(application).toContain('createEncryptedDesktopSecretPort');
    expect(credentialRuntime).toContain('HostSecretPort');
    expect(authPrompt).toContain('with hidden answer');
    for (const source of [credentialRuntime, authPrompt]) {
      expect(source).not.toContain('BrowserWindow');
      expect(source).not.toContain('ipcRenderer');
      expect(source).not.toContain('postMessage');
    }
  });

  it('keeps Desktop Agent content effects sender-bound and locator-authorized', () => {
    const source = readFileSync(
      path.join(sourceRoot, 'main', 'desktop-agent-content-effects.ts'),
      'utf8',
    );

    expect(source).toContain('assertWorkspaceGrant');
    expect(source).toContain('validateContentLocator');
    expect(source).toContain('realpath');
    expect(source).not.toContain('activeWorkspace');
    expect(source).not.toContain('ChatViewProvider');
    expect(source).not.toContain('vscode.commands');
  });

  it('keeps Resource Browser effects owner-bound, portable and outside the renderer', () => {
    const mainRoot = path.join(sourceRoot, 'main');
    const runtime = readFileSync(
      path.join(mainRoot, 'desktop-resource-browser-runtime.ts'),
      'utf8',
    );
    const source = readFileSync(
      path.join(mainRoot, 'desktop-resource-browser-source.ts'),
      'utf8',
    );
    const locator = readFileSync(
      path.join(mainRoot, 'desktop-content-locator.ts'),
      'utf8',
    );
    const bridgeContract = readFileSync(
      path.join(sourceRoot, 'shared', 'resource-browser-bridge-contract.ts'),
      'utf8',
    );

    expect(runtime).toContain('assertResourceBrowserIdentity');
    expect(runtime).toContain('resolveAgentWorkspace');
    expect(source).toContain('listWorkspaceLinkedMediaLibraries');
    expect(locator).toContain('realpath');
    expect(source).toContain('resolveDesktopWorkspaceContentLocator');
    expect(source).toContain('createWorkspaceLinkedMediaLibrary');
    expect(bridgeContract).not.toContain('absolutePath');
    expect(bridgeContract).not.toContain('selectedDirectory');
  });

  it('keeps Node, Electron and VS Code imports out of renderer', () => {
    const violations = findForbiddenImports(path.join(sourceRoot, 'renderer'), [
      'node:',
      'electron',
      'vscode',
    ]);
    expect(violations).toEqual([]);
  });

  it('mounts the package-owned Canvas Root without the demo Host adapter', () => {
    const surface = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopCanvasSurface.tsx'),
      'utf8',
    );
    const shell = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'),
      'utf8',
    );

    expect(surface).toContain("from '@neko-canvas/webview/root'");
    expect(surface).toContain('<CanvasWebviewRoot');
    expect(surface).not.toContain('@neko-canvas/webview/host-adapter');
    expect(surface).not.toContain('CanvasHostAdapterSurface');
    expect(shell).toContain('<DesktopCanvasSurface');
    expect(shell).not.toContain('CanvasHostAdapterSurface');
  });

  it('mounts package-owned Cut and Preview Roots without demo adapters or renderer media transport', () => {
    const cutSurface = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopCutSurface.tsx'),
      'utf8',
    );
    const previewSurface = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopPreviewSurface.tsx'),
      'utf8',
    );
    const shell = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'),
      'utf8',
    );

    expect(cutSurface).toContain("import('@neko/webview/root')");
    expect(cutSurface).toMatch(/<CutWebviewRoot[\s\S]*bridge=\{bridge\}/u);
    expect(cutSurface).toContain('timelineTarget={timelineTarget}');
    expect(previewSurface).toContain("import('@neko/preview-webview/root')");
    expect(previewSurface).toContain('<PreviewRoot runtime={runtime}');
    for (const source of [cutSurface, previewSurface, shell]) {
      expect(source).not.toContain('/host-adapter');
      expect(source).not.toContain('CutHostAdapterSurface');
      expect(source).not.toContain('PreviewHostAdapterSurface');
      expect(source).not.toContain('URL.createObjectURL');
      expect(source).not.toContain('FileReader');
      expect(source).not.toContain('new Blob');
      expect(source).not.toContain('localhost');
      expect(source).not.toContain('127.0.0.1');
    }
  });

  it('compiles every embedded package Root utility class in the Desktop renderer', () => {
    const tailwindConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'tailwind.config.js'),
      'utf8',
    );
    const canvasRoot = readFileSync(
      path.resolve(
        sourceRoot,
        '../../../packages/neko-canvas/packages/webview/src/root.tsx',
      ),
      'utf8',
    );

    for (const sourcePattern of [
      '../../packages/neko-agent/packages/webview/src/**/*.{ts,tsx}',
      '../../packages/neko-assets/src/resource-browser/**/*.{ts,tsx}',
      '../../packages/neko-canvas/packages/webview/src/**/*.{ts,tsx}',
      '../../packages/neko-cut/packages/webview/src/**/*.{ts,tsx}',
      '../../packages/neko-preview/packages/webview/src/**/*.{ts,tsx}',
    ]) {
      expect(tailwindConfig).toContain(sourcePattern);
    }
    expect(canvasRoot).toContain('data-canvas-webview-root="true"');
  });

  it('deduplicates shared runtimes and resolves embedded package Roots from source in Vite development', () => {
    const rendererConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.renderer.config.ts'),
      'utf8',
    );

    expect(rendererConfig).toContain("'zustand'");
    expect(rendererConfig).toContain("'three'");
    expect(rendererConfig).toContain("'three/addons/loaders/GLTFLoader.js'");
    expect(rendererConfig).toContain("'use-sync-external-store/shim/with-selector.js'");
    expect(rendererConfig).toMatch(/dedupe:\s*\[[^\]]*'react'[^\]]*'zustand'/s);
    expect(rendererConfig).toContain("find: /^@neko-canvas\\/webview\\/root$/");
    expect(rendererConfig).toContain(
      "'../../packages/neko-canvas/packages/webview/src/root.tsx'",
    );
    expect(rendererConfig).toContain("find: /^@neko\\/webview\\/root$/");
    expect(rendererConfig).toContain(
      "'../../packages/neko-cut/packages/webview/src/root.tsx'",
    );
    expect(rendererConfig).toContain("find: /^@neko\\/preview-webview\\/root$/");
    expect(rendererConfig).toContain(
      "'../../packages/neko-preview/packages/webview/src/root/index.tsx'",
    );
    expect(rendererConfig).toContain("find: /^neko-assets\\/resource-browser\\/root$/");
    expect(rendererConfig).toContain(
      "'../../packages/neko-assets/src/resource-browser/root.tsx'",
    );
    expect(rendererConfig).toContain(
      "find: /^neko-assets\\/resource-browser\\/contract$/",
    );
    expect(rendererConfig).toContain(
      "'../../packages/neko-assets/src/resource-browser/contract.ts'",
    );
    expect(rendererConfig).toMatch(
      /exclude:\s*\[[^\]]*'@neko-canvas\/domain'[^\]]*'@neko-canvas\/webview\/root'/s,
    );
  });

  it('releases window resources through the registered sender identity after Electron closes', () => {
    const application = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');

    expect(application).toContain(
      'appHost.detachWindowResources(registration.windowId, registration.webContentsId);',
    );
    expect(application).toContain(
      'appHost.detachRendererSubscriptions(registration.webContentsId);',
    );
    expect(application).not.toContain(
      'appHost.detachWindowResources(registration.windowId, createdWindow.webContents.id);',
    );
  });

  it('keeps Workspace Board delivery and candidate acceptance out of renderer ownership', () => {
    const rendererRoot = path.join(sourceRoot, 'renderer');
    const forbiddenOwnerTokens = [
      'WorkspaceBoardDeliveryLedger',
      'WorkspaceBoardDeliveryCoordinator',
      'candidateAcceptanceStore',
      'deliveryLedger',
      'acceptCandidateLocally',
    ];
    const violations = walkTypeScript(rendererRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return forbiddenOwnerTokens
        .filter((token) => content.includes(token))
        .map((token) => `${path.relative(sourceRoot, file)} -> ${token}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not expose raw IPC or an arbitrary command bridge', () => {
    const preload = readFileSync(path.join(sourceRoot, 'preload', 'index.ts'), 'utf8');
    const contract = readFileSync(
      path.join(sourceRoot, 'shared', 'agent-contract.ts'),
      'utf8',
    );
    expect(preload).toContain('agent: {');
    expect(preload).toContain('getBootstrap(projectId, viewId, viewEpoch)');
    expect(preload).toContain('createDesktopAgentMessageRequest');
    expect(preload).toContain('createDesktopWorkbenchMutationRequest');
    expect(preload).toContain('workbench: {');
    expect(preload).toContain('resources: {');
    expect(preload).toContain('parseResourceBrowserSnapshotRequest');
    expect(preload).not.toContain('ipcRenderer.send');
    expect(preload).not.toContain('executeCommand');
    expect(preload).not.toContain('channel: string');
    expect(contract).not.toContain('workspacePath');
    expect(contract).not.toContain('resolvedPath');
    expect(contract).not.toContain('credential');
  });
});

function findForbiddenImports(directory: string, forbidden: readonly string[]): string[] {
  const violations: string[] = [];
  for (const file of walkTypeScript(directory)) {
    const content = readFileSync(file, 'utf8');
    for (const specifier of forbidden) {
      if (containsModuleSpecifier(content, specifier)) {
        violations.push(`${path.relative(sourceRoot, file)} -> ${specifier}`);
      }
    }
  }
  return violations;
}

function walkTypeScript(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const file = path.join(directory, entry);
      return statSync(file).isDirectory() ? walkTypeScript(file) : [file];
    })
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
}

function containsModuleSpecifier(content: string, specifier: string): boolean {
  return [
    `from '${specifier}`,
    `from "${specifier}`,
    `import '${specifier}`,
    `import "${specifier}`,
    `export '${specifier}`,
    `export "${specifier}`,
  ].some((token) => content.includes(token));
}
