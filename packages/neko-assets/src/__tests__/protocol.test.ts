import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================================
// Mock vscode module
// ============================================================================

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  commands: { executeCommand: vi.fn() },
  EventEmitter: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

const pkgJsonPath = resolve(__dirname, '..', '..', 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
const declaredCommands: string[] =
  (pkgJson.contributes?.commands as Array<{ command: string }> | undefined)?.map(
    (c) => c.command,
  ) ?? [];
const activationEvents: string[] = (pkgJson.activationEvents as string[] | undefined) ?? [];
const assetViews: Array<{ id: string; type?: string }> =
  pkgJson.contributes?.views?.['neko-asset-manager'] ?? [];

const extensionSource = readFileSync(resolve(__dirname, '..', 'extension.ts'), 'utf-8');

// ============================================================================
// Tests: package.json command declarations
// ============================================================================

describe('neko-assets package.json -- removed cloud sync commands', () => {
  const removedCommands = [
    'neko.assets.sync',
    'neko.assets.push',
    'neko.assets.pull',
    'neko.assets.initLfs',
    'neko.assets.trackLfs',
    'neko.assets.triggerRender',
    'neko.assets.disableWorkspaceGitDecorations',
  ];

  it.each(removedCommands)('"%s" is NOT declared in contributes.commands', (cmd) => {
    expect(declaredCommands).not.toContain(cmd);
  });
});

describe('neko-assets package.json -- required commands are present', () => {
  it('does not declare the retired Asset History command', () => {
    expect(declaredCommands).not.toContain('neko.assets.viewHistory');
  });

  it('declares previewMedia command', () => {
    expect(declaredCommands).toContain('neko.assets.previewMedia');
  });

  it('declares structured copy and reveal commands used by Agent', () => {
    expect(declaredCommands).toContain('neko.assets.copyFileReference');
    expect(declaredCommands).toContain('neko.assets.revealMediaLibraryFile');
  });

  it('has a non-trivial number of commands registered', () => {
    expect(declaredCommands.length).toBeGreaterThan(10);
  });
});

// ============================================================================
// Tests: extension.ts source contract -- baseline commands
// ============================================================================

describe('extension.ts -- baseline commands keep only valid commands', () => {
  it('does NOT contain neko.assets.sync command registration', () => {
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.sync['"]/);
  });

  it('does NOT contain neko.assets.push command registration', () => {
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.push['"]/);
  });

  it('does NOT contain neko.assets.pull command registration', () => {
    expect(extensionSource).not.toMatch(/registerCommand\(\s*['"]neko\.assets\.pull['"]/);
  });

  it('does not register the retired Asset History command', () => {
    expect(extensionSource).not.toContain("'neko.assets.viewHistory'");
  });

  it('DOES contain neko.assets.previewMedia command registration', () => {
    expect(extensionSource).toContain("'neko.assets.previewMedia'");
  });

  it('does NOT expose physical media-library roots through a command', () => {
    expect(extensionSource).not.toContain("'neko.assets.getMediaLibraryRoots'");
  });

  it('DOES contain internal media-library query command registration', () => {
    expect(extensionSource).toContain("'neko.assets.queryMediaLibrary'");
    expect(activationEvents).toContain('onCommand:neko.assets.queryMediaLibrary');
  });

  it('reconciles folder-scoped Git compatibility only with linked-library lifecycle state', () => {
    expect(extensionSource).toContain('gitCompatibility.reconcile(libraries.length > 0)');
    expect(extensionSource).toContain('gitCompatibility.reconcile(remainingLibraries.length > 0)');
    expect(extensionSource).toContain('gitCompatibility.reconcile(true)');
    expect(extensionSource).not.toContain('disableWorkspaceGitDecorations');
    expect(extensionSource).not.toContain('decorations.enabled');
  });

  it('contains Agent-facing Media Library reveal and reference copy registrations', () => {
    expect(extensionSource).toContain("'neko.assets.revealMediaLibraryFile'");
    expect(extensionSource).toContain("'neko.assets.copyFileReference'");
    expect(extensionSource).toContain('mediaLibraryTree.reveal');
  });
});

describe('extension.ts -- no cloud sync TreeDataProvider (NKAS-002)', () => {
  it('does NOT register a neko.cloudSync TreeDataProvider', () => {
    expect(extensionSource).not.toContain('neko.cloudSync');
    expect(extensionSource).not.toMatch(/registerTreeDataProvider\(\s*['"].*cloudSync/);
  });
});

describe('extension.ts -- entity integration boundary', () => {
  it('owns the retained Entity host composition without feature-package imports', () => {
    expect(extensionSource).toContain('@neko/entity/host-vscode');
    expect(extensionSource).not.toContain('@neko/dashboard');
    expect(extensionSource).not.toContain('@neko/canvas');
    expect(extensionSource).not.toContain('@neko/agent');
    expect(extensionSource).not.toContain('@neko/story');
  });

  it('registers Entity Browser and bound entity inspection commands', () => {
    expect(declaredCommands).toContain('neko.entityBrowser.inspect');
    expect(declaredCommands).toContain('neko.entityBrowser.createCandidate');
    expect(extensionSource).toContain("'neko.entityBrowser'");
    expect(extensionSource).toContain('ENTITY_FACADE_COMMANDS.inspectEntity');
    expect(extensionSource).toContain('ENTITY_FACADE_COMMANDS.proposeCandidate');
    expect(extensionSource).toContain('registerEntityFacadeCommands');
    expect(extensionSource).not.toContain('DashboardCreativeEntity');
    expect(extensionSource).toContain('EntityInspectorProvider');
  });

  it('injects the shared Host content reader into Entity rebind and Media Library copy', () => {
    expect(extensionSource).toContain('resolveContentRead:');
    expect(extensionSource).toContain('workspaceContentRead');
    expect(extensionSource).toContain('contentRead,\n    new NodeAuthorizedWorkspaceWriter');
  });

  it('activates when the Entity Inspector view is opened', () => {
    expect(activationEvents).toContain('onView:neko.entityInspector');
  });

  it('declares Entity Inspector as a Webview instead of a Tree View', () => {
    expect(assetViews.find((view) => view.id === 'neko.entityInspector')).toMatchObject({
      type: 'webview',
    });
  });
});

describe('extension.ts -- content access cache boundary', () => {
  it('exposes thumbnail bytes without leaking package-local cache paths', () => {
    expect(extensionSource).toContain('generateThumbnail: async');
    expect(extensionSource).toContain('bytes: generated.bytes');
    expect(extensionSource).toContain('createHostDerivedContentRuntime');
    expect(extensionSource).not.toContain('getThumbnailPath: async');
    expect(extensionSource).not.toContain('createThumbnailResourceRef: async');
    expect(extensionSource).not.toContain('getThumbnailVisual: async');
  });
});

describe('extension.ts -- baseline command function exists', () => {
  it('defines registerBaselineCommands as a function', () => {
    expect(extensionSource).toMatch(/function registerBaselineCommands/);
  });

  it('is called during activation', () => {
    expect(extensionSource).toContain('registerBaselineCommands(context)');
  });
});

// ============================================================================
// Tests: extension activation contracts (NKAS-007)
// ============================================================================

describe('extension activation (NKAS-007)', () => {
  it('calls registerBaselineCommands(context) during activation', () => {
    expect(extensionSource).toContain('registerBaselineCommands(context)');
  });

  it('does not register the retired Asset Manager tree view', () => {
    expect(extensionSource).not.toContain("'neko.assetManager'");
  });

  it('does not use the retired Asset Manager or History providers', () => {
    expect(extensionSource).not.toContain('AssetManagerTreeProvider');
    expect(extensionSource).not.toContain('AssetHistoryTreeProvider');
  });

  it('uses MediaLibraryTreeProvider', () => {
    expect(extensionSource).toContain('MediaLibraryTreeProvider');
  });

  it('does NOT use CloudSyncTreeProvider', () => {
    expect(extensionSource).not.toContain('CloudSyncTreeProvider');
  });

  it('registers media library tree view', () => {
    expect(extensionSource).toContain("'neko.mediaLibraries'");
  });

  it('does not gate Media Library activation on the legacy Asset catalog', () => {
    expect(extensionSource).toContain(
      'if (workspaceFolder && workspaceRoot && thumbnailService && workspaceContentRead)',
    );
    expect(extensionSource).not.toContain('if (library && workspaceRoot)');
    expect(extensionSource).not.toContain("'neko.assets.importFromLibrary'");
  });

  it('initializes i18n during activation', () => {
    expect(extensionSource).toContain('initI18n');
  });

  it('sets up error handler during activation', () => {
    expect(extensionSource).toContain('setErrorHandler');
  });
});

describe('extension deactivate lifecycle', () => {
  it('waits for tracked tasks and releases the thumbnail service', () => {
    expect(extensionSource).toContain('await Promise.allSettled([...runningTasks])');
    expect(extensionSource).toContain('thumbnailService = null');
    expect(extensionSource).not.toContain('library?.flush()');
  });
});
