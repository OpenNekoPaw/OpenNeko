import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AGENT_ENTRY_MODES } from '@neko/agent-contracts';
import { describe, expect, it } from 'vitest';
import { desktopFuseConfig } from '../fuse.config.js';
import desktopRendererConfig, {
  DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
} from '../vite.renderer.config';

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

  it('keeps Desktop Agent composition on the canonical ACP and DSH subprocess path', () => {
    const supervisor = readFileSync(
      path.join(sourceRoot, 'main', 'desktop-dsh-subprocess-supervisor.ts'),
      'utf8',
    );
    const application = readFileSync(
      path.join(
        repositoryRoot,
        'packages/agent/runtime/src/application/conversation-dsh-session-application.ts',
      ),
      'utf8',
    );
    const client = readFileSync(
      path.join(repositoryRoot, 'packages/agent/runtime/src/acp/dsh-acp-application-client.ts'),
      'utf8',
    );

    expect(supervisor).toContain("stdio: ['pipe', 'pipe', 'pipe']");
    expect(supervisor).toContain('import type { DshAcpByteTransport }');
    expect(application).toContain('createConversationDshSessionBindingService');
    expect(application).toContain('createConversationDshSessionBoundClient');
    expect(client).toContain('new ClientSideConnection');
    for (const source of [supervisor, application, client]) {
      expect(source).not.toContain('@neko/agent-runtime/pi');
      expect(source).not.toContain('createAgentAppHost');
      expect(source).not.toContain('createAgentControllerComposition');
      expect(source).not.toContain('ctx.agents');
    }
  });

  it('keeps the DSH Session bridge as the only Renderer Agent path', () => {
    const preload = readFileSync(path.join(sourceRoot, 'preload', 'index.ts'), 'utf8');
    const renderer = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopAgentSurface.tsx'), 'utf8');

    expect(preload).toContain('dshSessions: {');
    expect(preload).toContain('dshPermissions: {');
    expect(preload).toContain('dshRuntime: {');
    expect(renderer).toContain('window.openNekoDesktop.dshSessions.submit');
    expect(renderer).toContain('window.openNekoDesktop.dshPermissions.decide');
    expect(renderer).toContain('window.openNekoDesktop.dshRuntime.restart');
    expect(renderer).toContain('requireReadyState');
    expect(renderer).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    expect(renderer).not.toMatch(/rawSession|piHistory|PiConversation/u);
    expect(preload).not.toContain('DESKTOP_AGENT_CHANNELS');
    expect(preload).not.toContain('agentLaunch: {');
    expect(preload).not.toContain('assistantResources: {');
    expect(existsSync(path.join(sourceRoot, 'shared', 'agent-contract.ts'))).toBe(false);
    expect(existsSync(path.join(sourceRoot, 'shared', 'agent-automation-contract.ts'))).toBe(false);
  });

  it('keeps one canonical Agent Entry mode and submit path', () => {
    const agentRuntimeRoot = path.join(repositoryRoot, 'packages/agent/runtime/src/application');
    const agentWebviewRoot = path.join(repositoryRoot, 'packages/agent/webview/src');
    const charaLaunchContract = readFileSync(
      path.join(repositoryRoot, 'packages/chara/domain/src/contracts/character-conversation-launch.ts'),
      'utf8',
    );
    const retiredEntryTargetService = path.join(agentRuntimeRoot, 'agent-entry-target-service.ts');
    const retiredAgentWebviewRoot = path.join(agentWebviewRoot, 'root.tsx');
    const retiredAgentAppShell = path.join(agentWebviewRoot, 'components', 'AppShell.tsx');
    const retiredConversationController = path.join(
      agentWebviewRoot,
      'components',
      'ConversationController.tsx',
    );
    const sources = [
      readFileSync(path.join(sourceRoot, 'main', 'app-host.ts'), 'utf8'),
      readFileSync(path.join(sourceRoot, 'main', 'ipc.ts'), 'utf8'),
      readFileSync(path.join(sourceRoot, 'preload', 'index.ts'), 'utf8'),
      readFileSync(path.join(sourceRoot, 'shared', 'global.d.ts'), 'utf8'),
      charaLaunchContract,
    ];

    expect(AGENT_ENTRY_MODES).toEqual([
      'assistant',
      'authoring',
      'character-dialogue',
      'world-experience',
    ]);
    expect(existsSync(path.join(agentWebviewRoot, 'entry-experience-mode.ts'))).toBe(false);
    expect(existsSync(retiredEntryTargetService)).toBe(false);
    expect(existsSync(retiredAgentWebviewRoot)).toBe(false);
    expect(existsSync(retiredAgentAppShell)).toBe(false);
    expect(existsSync(retiredConversationController)).toBe(false);
    for (const source of sources) {
      expect(source).not.toContain('CHARACTER_CONVERSATION_LAUNCH_HOST_CHANNEL');
      expect(source).not.toContain('OpenNekoDesktopCharacterConversationBridge');
      expect(source).not.toContain('executeCharacterConversationLaunchRequest');
      expect(source).not.toContain('onSubmitCharacterLaunch');
      expect(source).not.toMatch(/\b(?:active|current|recent|first)(?:Workspace|Target)\b/u);
    }
  });

  it('keeps retired Character and World capability providers out of Desktop composition', () => {
    const application = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');

    expect(application).not.toContain('createCharacterAuthoringCapabilityProvider');
    expect(application).not.toContain('createWorldAuthoringCapabilityProvider');
  });

  it('keeps domain management routing in the application sidebar only', () => {
    const shell = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'), 'utf8');

    expect(shell).not.toContain('CreativeManagementShell');
    expect(shell).not.toContain('creative-management__catalog-switcher');
    expect(shell).not.toContain('parseCreativeManagementCatalog');
    expect(shell).not.toContain('<WorldFoundationRoot');
    expect(shell).toContain('<WorldManagementCatalogRoot');
    expect(shell).toContain('<WorldManagementDetailRoot');
  });

  it('composes Content, Character, and World authoring through one Workbench Main path', () => {
    const shell = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'), 'utf8');

    expect(shell).toContain('<ProjectAuthoringTargetSwitchRoot');
    expect(shell).toContain('renderTarget={(item) =>');
    expect(shell).toContain('return renderWorkbenchMainView({');
    expect(shell).toContain('<DesktopTextEditorSurface');
    expect(shell).toContain('<CharacterAuthoringSurface');
    expect(shell).toContain('<WorldAuthoringStudioRoot');
    expect(shell.match(/<ControlledWorkbenchShell/gu)).toHaveLength(1);
  });

  it('keeps provider credentials in the Host authority and Desktop safeStorage boundary', () => {
    const mainRoot = path.join(sourceRoot, 'main');
    const application = readFileSync(path.join(mainRoot, 'index.ts'), 'utf8');
    const credentialAuthority = readFileSync(
      path.join(sourceRoot, '../../../packages/host/src/settings/provider-credential-authority.ts'),
      'utf8',
    );

    expect(application).toContain('safeStorage.encryptString');
    expect(application).toContain('createEncryptedDesktopSecretPort');
    expect(application).toContain("'provider-credentials.json'");
    expect(application).not.toContain("'agent-credentials.json'");
    expect(application).not.toContain('createAgentCredentialRuntime');
    expect(application).not.toContain('createMacOSProtectedAuthPrompt');
    expect(credentialAuthority).toContain('HostSecretPort');
    expect(credentialAuthority).toContain("'openneko.provider.credential:'");
    expect(credentialAuthority).not.toContain('openneko.agent.pi.credential');
    expect(credentialAuthority).not.toContain('BrowserWindow');
    expect(credentialAuthority).not.toContain('ipcRenderer');
    expect(credentialAuthority).not.toContain('postMessage');
    expect(existsSync(path.join(mainRoot, 'macos-protected-auth-prompt.ts'))).toBe(false);
  });

  it('keeps direct Canvas Generation on owning services without an Agent turn', () => {
    const application = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');
    const canvasHost = readFileSync(
      path.join(
        repositoryRoot,
        'packages/canvas/webview/src/host-runtime/canvas-webview-host.ts',
      ),
      'utf8',
    );
    const canvasSurface = readFileSync(
      path.join(sourceRoot, 'renderer', 'DesktopCanvasSurface.tsx'),
      'utf8',
    );
    const canvasRuntime = readFileSync(
      path.join(sourceRoot, 'renderer', 'desktop-canvas-host-runtime.ts'),
      'utf8',
    );

    expect(application).toContain('new CanvasGenerationNodeRuntime');
    expect(application).toContain('generationRuntime.getJobs({');
    expect(canvasHost).toContain("type: 'run-generation-node'");
    expect(canvasHost).toContain("type: 'cancel-generation-node'");
    for (const source of [canvasHost, canvasSurface, canvasRuntime]) {
      expect(source).not.toContain('dshSessions.prompt');
      expect(source).not.toContain('openneko.generation');
      expect(source).not.toContain('openneko.canvas');
    }
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
    const managedLinks = readFileSync(
      path.join(assetsNodeRoot, 'workspace-linked-media-libraries.ts'),
      'utf8',
    );
    const locator = readFileSync(
      path.join(repositoryRoot, 'packages/assets/node/src/workspace-content-locator.ts'),
      'utf8',
    );
    const bridgeContract = readFileSync(
      path.join(sourceRoot, 'shared', 'resource-browser-bridge-contract.ts'),
      'utf8',
    );
    const contentLocatorContract = readFileSync(
      path.join(repositoryRoot, 'packages/content/domain/src/contracts/content-locator.ts'),
      'utf8',
    );

    expect(runtime).toContain('assertResourceBrowserIdentity');
    expect(runtime).toContain('resolveAgentWorkspace');
    expect(locator).toContain('realpath');
    expect(source).toContain('resolveWorkspaceContentLocator');
    expect(source).toContain('ProjectMediaLibraryBindingService');
    expect(source).toContain('initializeProjectMediaLibraryBindings');
    expect(source).toContain('resolveProjectMediaLibraryContentPath');
    expect(source).not.toContain('WorkspaceMediaLibrarySyncService');
    expect(managedLinks).toContain('materializeWorkspaceLinkedMediaLibrary');
    expect(managedLinks).toContain('restoreWorkspaceLinkedMediaLibrary');
    expect(managedLinks).toContain('removeExactWorkspaceLinkedMediaLibrary');
    expect(existsSync(path.join(assetsNodeRoot, 'workspace-media-library-sync.ts'))).toBe(false);
    expect(existsSync(path.join(assetsNodeRoot, 'workspace-linked-media-libraries.ts'))).toBe(true);
    expect(existsSync(path.join(assetsNodeRoot, 'project-media-library-binding-service.ts'))).toBe(
      true,
    );
    expect(existsSync(path.join(assetsNodeRoot, 'project-media-library-content-handler.ts'))).toBe(
      true,
    );
    expect(contentLocatorContract).not.toContain('MediaLibraryContentLocator');
    expect(contentLocatorContract).toContain('readonly file: ContentFileLocator');
    expect(contentLocatorContract).toContain('readonly selector?: ContentSelector');
    expect(contentLocatorContract).not.toContain('media-library');
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
    const shell = readFileSync(path.join(sourceRoot, 'renderer', 'DesktopShell.tsx'), 'utf8');

    expect(surface).toContain("import('@neko/canvas-webview/root')");
    expect(surface).not.toContain("from '@neko/canvas-webview/root'");
    expect(surface).toContain('const CanvasWebviewRoot = lazy(');
    expect(surface).toContain('<Suspense');
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
    expect(cutSurface).not.toContain('timelineVisible');
    expect(cutSurface).not.toContain('timelineTarget');
    expect(shell).toContain('data-workbench-cut-panel="true"');
    expect(shell).toContain("portalDeck('bottomPanel'");
    expect(previewSurface).toContain("import('@neko/preview-webview/root')");
    expect(previewSurface).toContain('<PreviewRoot');
    expect(previewSurface).toContain('bootstrap={bootstrap}');
    expect(previewSurface).toContain('bootstrap.prepare()');
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

  it('keeps Desktop media on the authorized OpenNeko resource path', () => {
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
    const canvasRuntime = readFileSync(path.join(mainRoot, 'desktop-canvas-runtime.ts'), 'utf8');

    expect(openNekoProtocol).toContain('protocol.handle(');
    expect(openNekoProtocol).toContain('OPENNEKO_SCHEME');
    expect(openNekoProtocol.match(/protocol\.handle\(/gu)).toHaveLength(1);
    expect(openNekoProtocol).toContain('DESKTOP_RESOURCE_HOST');
    expect(resourceRegistry).not.toMatch(/\bcreateServer\s*\(/u);
    expect(resourceRegistry).not.toMatch(/\bupstream\b/iu);
    expect(resourceRegistry).not.toContain('ContentLocator');
    expect(resourceRegistry).not.toContain('ResourceRef');
    expect(resourceRegistry).not.toMatch(/\b(?:MediaStream|RTCPeerConnection|getUserMedia)\b/u);

    expect(existsSync(path.join(mainRoot, 'desktop-canvas-media-runtime.ts'))).toBe(false);
    expect(canvasRuntime).not.toMatch(/\.(?:startPcm|prepareAudio|prepareVideo)\s*\(/u);
    expect(canvasRuntime).toContain("'viewer-source'");
    expect(canvasRuntime).toContain('resolvePreviewResource');
    expect(canvasRuntime).not.toContain('resolvePreviewVariant');
    expect(canvasRuntime).not.toContain("'inline-variant'");
    expect(
      existsSync(
        path.join(repositoryRoot, 'packages/canvas/webview/src/preview/previewResolver.ts'),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(repositoryRoot, 'packages/canvas/webview/src/preview/previewRuntime.ts'),
      ),
    ).toBe(false);
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
      '../../packages/model/webview/src/**/*.{ts,tsx}',
      '../../packages/preview/webview/src/**/*.{ts,tsx}',
    ]) {
      expect(tailwindConfig).toContain(sourcePattern);
    }
    expect(canvasRoot).toContain('data-canvas-webview-root="true"');
  });

  it('deduplicates shared runtimes and resolves embedded package Roots through public exports', () => {
    const rendererConfigSource = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.renderer.config.ts'),
      'utf8',
    );

    expect(rendererConfigSource).toContain("'zustand'");
    expect(rendererConfigSource).toContain("'three'");
    expect(rendererConfigSource).toContain("'three/addons/loaders/GLTFLoader.js'");
    expect(rendererConfigSource).toContain("'use-sync-external-store/shim/with-selector.js'");
    expect(rendererConfigSource).toMatch(/dedupe:\s*\[[^\]]*'react'[^\]]*'zustand'/s);
    expect(rendererConfigSource).not.toContain('find: /^@neko');
    expect(rendererConfigSource).not.toContain("'../../packages/");
    const publicRoots = [
      ['packages/canvas/webview/package.json', './root'],
      ['packages/cut/webview/package.json', './root'],
      ['packages/model/webview/package.json', './root'],
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
    expect(desktopRendererConfig.optimizeDeps?.exclude).toEqual([
      ...DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
    ]);
    expect(
      desktopRendererConfig.optimizeDeps?.include?.filter((entry) => entry.startsWith('@neko/')),
    ).toEqual([]);
    expect(desktopRendererConfig.optimizeDeps?.include).toContain('three');
    expect(desktopRendererConfig.optimizeDeps?.include).toContain('zustand');
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

  it('keeps the Asset Center move picker as a sender-owned native adapter', () => {
    const application = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');
    const appHost = readFileSync(path.join(sourceRoot, 'main', 'app-host.ts'), 'utf8');
    const pickerStart = application.indexOf('selectGlobalLibraryMoveDestination: async');
    const pickerEnd = application.indexOf('\n    },\n  });', pickerStart);
    const picker = application.slice(pickerStart, pickerEnd);

    expect(pickerStart).toBeGreaterThan(-1);
    expect(picker).toContain('requireOwnerWindow(windowId)');
    expect(picker).toContain('dialog.showOpenDialog(desktopWindow');
    expect(picker).toContain("properties: ['openDirectory', 'createDirectory']");
    expect(picker).toContain('defaultPath');
    expect(appHost).toContain("case 'assets.remove':");
    expect(appHost).toContain("case 'items.move':");
    expect(appHost).not.toContain("case 'asset.remove':");
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
    const sessionContract = readFileSync(
      path.join(repositoryRoot, 'packages/agent/contracts/src/dsh-session-host.ts'),
      'utf8',
    );
    const runtimeContract = readFileSync(
      path.join(repositoryRoot, 'packages/agent/contracts/src/dsh-runtime-host.ts'),
      'utf8',
    );
    expect(preload).toContain('dshSessions: {');
    expect(preload).toContain('DSH_SESSION_HOST_CHANNEL');
    expect(preload).toContain('DSH_RUNTIME_HOST_CHANNEL');
    expect(preload).toContain('createDesktopWorkbenchMutationRequest');
    expect(preload).toContain('workbench: {');
    expect(preload).toContain('resources: {');
    expect(preload).toContain('parseResourceBrowserSnapshotRequest');
    expect(preload).not.toContain('ipcRenderer.send');
    expect(preload).not.toContain('executeCommand');
    expect(preload).not.toContain('executeRuntime');
    expect(preload).not.toContain('arbitraryChannel');
    expect(preload).not.toContain('channel: string');
    expect(sessionContract).not.toContain('workspacePath');
    expect(sessionContract).not.toContain('resolvedPath');
    expect(sessionContract).not.toContain('credential');
    expect(sessionContract).not.toContain('runId');
    expect(runtimeContract).not.toContain('generation');
    expect(runtimeContract).not.toContain('fallback');
    expect(runtimeContract).not.toContain('processPath');
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
