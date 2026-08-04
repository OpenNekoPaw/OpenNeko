import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { desktopFuseConfig } from '../fuse.config.js';

const sourceRoot = path.resolve(import.meta.dirname);
const repositoryRoot = path.resolve(sourceRoot, '../../..');

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

  it('pins Electron archives for the supported Desktop targets only', () => {
    const forgeConfig = readFileSync(path.resolve(sourceRoot, '..', 'forge.config.ts'), 'utf8');

    expect(forgeConfig).toContain('electron-v43.2.0-darwin-arm64.zip');
    expect(forgeConfig).toContain(
      'ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28',
    );
    expect(forgeConfig).not.toContain('electron-v43.2.0-win32-');
    expect(forgeConfig).not.toContain('electron-v43.2.0-linux-');
    expect(forgeConfig).toContain("new MakerDMG({}, ['darwin'])");
    expect(forgeConfig).not.toContain('MakerZIP');
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
      path.join(sourceRoot, '../../../packages/agent/runtime/src/application/agent-app-host.ts'),
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
      path.join(sourceRoot, '../../../packages/agent/runtime/src/pi/credential-runtime.ts'),
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
      path.join(
        repositoryRoot,
        'packages/agent/runtime/src/runtime/host-controller/agent-content-effects.ts',
      ),
      'utf8',
    );

    expect(source).toContain('assertWorkspaceGrant');
    expect(source).toContain('validateContentLocator');
    expect(source).toContain('realpath');
    expect(source).not.toContain('activeWorkspace');
    expect(source).not.toContain('ChatViewProvider');
    expect(source).not.toContain('vscode.commands');
    expect(existsSync(path.join(sourceRoot, 'main', 'desktop-agent-content-effects.ts'))).toBe(
      false,
    );
  });

  it('keeps Resource Browser effects owner-bound, portable and outside the renderer', () => {
    const assetsNodeRoot = path.join(repositoryRoot, 'packages/assets/node/src');
    const runtime = readFileSync(
      path.join(assetsNodeRoot, 'resource-browser-node-runtime.ts'),
      'utf8',
    );
    const source = readFileSync(
      path.join(assetsNodeRoot, 'resource-browser-node-source.ts'),
      'utf8',
    );
    const sync = readFileSync(path.join(assetsNodeRoot, 'workspace-media-library-sync.ts'), 'utf8');
    const locator = readFileSync(
      path.join(repositoryRoot, 'packages/assets/node/src/workspace-content-locator.ts'),
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
    expect(source).toContain('resolveWorkspaceContentLocator');
    expect(source).toContain('WorkspaceMediaLibrarySyncService');
    expect(source).not.toContain('createWorkspaceLinkedMediaLibrary');
    expect(sync).toContain('createWorkspaceLinkedMediaLibrary');
    expect(sync).toContain('planRecovery');
    expect(sync).toContain('applyRecovery');
    expect(bridgeContract).not.toContain('absolutePath');
    expect(bridgeContract).not.toContain('selectedDirectory');
    for (const retired of [
      'desktop-resource-browser-runtime.ts',
      'desktop-resource-browser-source.ts',
      'desktop-workspace-media-library-sync.ts',
    ]) {
      expect(existsSync(path.join(sourceRoot, 'main', retired))).toBe(false);
    }
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
    const shell = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'), 'utf8');

    expect(surface).toContain("from '@neko/canvas-webview/root'");
    expect(surface).toContain('<CanvasWebviewRoot');
    expect(surface).not.toContain('@neko/canvas-webview/host-adapter');
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
    const shell = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'), 'utf8');

    expect(cutSurface).toContain("import('@neko/cut-webview/root')");
    expect(cutSurface).toMatch(/<CutWebviewRoot[\s\S]*bridge=\{bridge\}/u);
    expect(cutSurface).toContain('timelineTarget={timelineTarget}');
    expect(previewSurface).toContain("import('@neko/preview-webview/root')");
    expect(previewSurface).toContain('<PreviewRoot');
    expect(previewSurface).toContain('runtime={runtime}');
    expect(previewSurface).toContain('chrome="content-only"');
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

  it('poisons retired Desktop media transports and path-derived resource identity', () => {
    const mainRoot = path.join(sourceRoot, 'main');
    const repositoryRoot = path.resolve(sourceRoot, '../../..');
    const openNekoProtocol = readFileSync(
      path.join(mainRoot, 'desktop-openneko-protocol.ts'),
      'utf8',
    );
    const resourceRegistry = readFileSync(
      path.join(mainRoot, 'desktop-resource-registry.ts'),
      'utf8',
    );
    const canvasMediaRuntime = readFileSync(
      path.join(mainRoot, 'desktop-canvas-media-runtime.ts'),
      'utf8',
    );
    const canvasPreviewResolver = readFileSync(
      path.join(repositoryRoot, 'packages/canvas/webview/src/preview/previewResolver.ts'),
      'utf8',
    );

    for (const retiredFile of [
      'app-protocol.ts',
      'app-protocol.test.ts',
      'desktop-media-protocol.ts',
      'desktop-media-protocol.test.ts',
      'desktop-media-descriptor-registry.ts',
      'desktop-media-descriptor-registry.test.ts',
      'desktop-http-resource-gateway.ts',
      'desktop-http-resource-gateway.test.ts',
    ]) {
      expect(existsSync(path.join(mainRoot, retiredFile))).toBe(false);
    }
    expect(
      existsSync(
        path.join(repositoryRoot, 'packages/media/src/node/NodeMediaLoopbackServer.ts'),
      ),
    ).toBe(false);

    expect(openNekoProtocol).toContain('protocol.handle(');
    expect(openNekoProtocol).toContain('OPENNEKO_SCHEME');
    expect(openNekoProtocol.match(/protocol\.handle\(/gu)).toHaveLength(1);
    expect(openNekoProtocol).toContain('DESKTOP_RESOURCE_HOST');
    expect(openNekoProtocol).not.toContain('neko-app');
    expect(openNekoProtocol).not.toContain('neko-media');
    expect(resourceRegistry).not.toMatch(/\bcreateServer\s*\(/u);
    expect(resourceRegistry).not.toMatch(/\bupstream\b/iu);
    expect(resourceRegistry).not.toContain('ContentLocator');
    expect(resourceRegistry).not.toContain('ResourceRef');
    expect(resourceRegistry).not.toMatch(/\b(?:MediaStream|RTCPeerConnection|getUserMedia)\b/u);

    const resourceRefDeclarations = [
      ...walkProductionTypeScript(path.join(repositoryRoot, 'apps')),
      ...walkProductionTypeScript(path.join(repositoryRoot, 'packages')),
    ].flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return /\b(?:interface|type|class)\s+\w*ResourceRef\b|\bimport\s+type\b[^;]*\bResourceRef\b/gu.test(
        content,
      )
        ? [path.relative(repositoryRoot, file)]
        : [];
    });
    expect(resourceRefDeclarations).toEqual([]);

    expect(canvasMediaRuntime).toContain(
      'Desktop Canvas PCM is not available for ordinary node playback.',
    );
    expect(canvasMediaRuntime).not.toMatch(/\.(?:startPcm|prepareAudio)\s*\(/u);
    expect(canvasPreviewResolver).not.toContain('assetPath:');
    expect(canvasPreviewResolver).not.toContain('activeCanvas');
    expect(canvasPreviewResolver).not.toContain('recentCanvas');
  });

  it('compiles every embedded package Root utility class in the Desktop renderer', () => {
    const tailwindConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'tailwind.config.js'),
      'utf8',
    );
    const canvasRoot = readFileSync(
      path.resolve(sourceRoot, '../../../packages/canvas/webview/src/root.tsx'),
      'utf8',
    );

    for (const sourcePattern of [
      '../../packages/agent/webview/src/**/*.{ts,tsx}',
      '../../packages/assets/domain/src/resource-browser/**/*.{ts,tsx}',
      '../../packages/canvas/webview/src/**/*.{ts,tsx}',
      '../../packages/cut/webview/src/**/*.{ts,tsx}',
      '../../packages/preview/webview/src/**/*.{ts,tsx}',
    ]) {
      expect(tailwindConfig).toContain(sourcePattern);
    }
    expect(canvasRoot).toContain('data-canvas-webview-root="true"');
  });

  it('deduplicates shared runtimes and resolves embedded package Roots through public exports', () => {
    const rendererConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.renderer.config.ts'),
      'utf8',
    );

    expect(rendererConfig).toContain("'zustand'");
    expect(rendererConfig).toContain("'three'");
    expect(rendererConfig).toContain("'three/addons/loaders/GLTFLoader.js'");
    expect(rendererConfig).toContain("'use-sync-external-store/shim/with-selector.js'");
    expect(rendererConfig).toMatch(/dedupe:\s*\[[^\]]*'react'[^\]]*'zustand'/s);
    expect(rendererConfig).not.toContain('find: /^@neko');
    expect(rendererConfig).not.toContain("'../../packages/");
    const publicRoots = [
      ['packages/canvas/webview/package.json', './root'],
      ['packages/cut/webview/package.json', './root'],
      ['packages/preview/webview/package.json', './root'],
      ['packages/assets/webview/package.json', './resource-browser/root'],
      ['packages/assets/webview/package.json', './asset-management/root'],
    ] as const;
    for (const [manifestPath, exportName] of publicRoots) {
      const manifest = JSON.parse(
        readFileSync(path.join(repositoryRoot, manifestPath), 'utf8'),
      ) as { readonly exports?: Readonly<Record<string, string>> };
      expect(manifest.exports?.[exportName]).toMatch(/^\.\/src\//u);
    }
    expect(rendererConfig).toMatch(
      /exclude:\s*\[[^\]]*'@neko\/canvas-domain'[^\]]*'@neko\/canvas-webview\/root'/s,
    );
    const optimizeDepsExclude = rendererConfig.match(/exclude:\s*\[([^\]]*)\]/s)?.[1];
    const optimizeDepsInclude = rendererConfig.match(/include:\s*\[([^\]]*)\]/s)?.[1];
    expect(optimizeDepsExclude).toContain("'@neko/agent-contracts'");
    expect(optimizeDepsExclude).toContain("'@neko/agent-contracts/host-message-event'");
    expect(optimizeDepsInclude).not.toContain("'@neko/agent-contracts'");
  });

  it('releases window resources through the registered sender identity after Electron closes', () => {
    const application = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');
    const appHost = readFileSync(path.join(sourceRoot, 'main', 'app-host.ts'), 'utf8');

    expect(application).toContain(
      'appHost.detachWindowResources(registration.windowId, registration.webContentsId);',
    );
    expect(appHost).toContain('this.detachRendererSubscriptions(webContentsId);');
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
    const contract = readFileSync(path.join(sourceRoot, 'shared', 'agent-contract.ts'), 'utf8');
    expect(preload).toContain('agent: {');
    expect(preload).toContain('getBootstrap(projectId, viewId, viewEpoch)');
    expect(preload).toContain('createDesktopAgentMessageRequest');
    expect(preload).toContain('createDesktopWorkbenchMutationRequest');
    expect(preload).toContain('workbench: {');
    expect(preload).toContain('resources: {');
    expect(preload).toContain('parseResourceBrowserSnapshotRequest');
    expect(preload).toContain(
      'process.argv.includes(DESKTOP_AGENT_AUTOMATION_RENDERER_ARGUMENT)',
    );
    expect(preload).toContain('createDesktopAgentAutomationRequest');
    expect(preload).toContain('DESKTOP_AGENT_AUTOMATION_CHANNEL');
    expect(preload).not.toContain('ipcRenderer.send');
    expect(preload).not.toContain('executeCommand');
    expect(preload).not.toContain('executeRuntime');
    expect(preload).not.toContain('arbitraryChannel');
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
    .filter(
      (entry) =>
        entry !== 'node_modules' && entry !== 'dist' && entry !== 'coverage' && entry !== '.turbo',
    )
    .flatMap((entry) => {
      const file = path.join(directory, entry);
      return statSync(file).isDirectory() ? walkTypeScript(file) : [file];
    })
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
}

function walkProductionTypeScript(directory: string): string[] {
  return walkTypeScript(directory).filter(
    (file) =>
      !file.includes(`${path.sep}__tests__${path.sep}`) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file),
  );
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
