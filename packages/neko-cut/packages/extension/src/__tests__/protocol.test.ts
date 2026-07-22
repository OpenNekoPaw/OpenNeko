/**
 * Protocol integration tests for neko-cut extension.
 *
 * Exercises real production code paths:
 * - AIActionHandler posting aiActionStatus via webview.postMessage
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cmdState = vi.hoisted(() => {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return { commands };
});

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }) },
  commands: {
    registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      cmdState.commands.set(id, handler);
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn().mockResolvedValue(null),
  },
  window: { showWarningMessage: vi.fn(), showInformationMessage: vi.fn() },
  EventEmitter: vi.fn(),
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
  l10n: { t: vi.fn((key: string) => key) },
}));

vi.mock('../base', () => ({
  getService: vi.fn(() => null),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  createServiceId: vi.fn((id: string) => id),
  ServiceCollection: vi.fn(),
  getGlobalServices: vi.fn(),
  setGlobalServices: vi.fn(),
  setRootLogger: vi.fn(),
  getRootLogger: vi.fn(),
  setErrorHandler: vi.fn(),
  getErrorHandler: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('../services/TimelineToolExecutor', () => ({
  TimelineToolExecutor: vi.fn().mockImplementation(function () {
    return {
      execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
    };
  }),
}));

vi.mock('../bootstrap/toolsBootstrap', () => ({}));

import { AIActionHandler } from '../services/AIActionHandler';
import { registerTimelineCommands } from '../commands/timeline-commands';

const messageHandlerSource = readFileSync(
  join(__dirname, '../editor/video/messageHandler.ts'),
  'utf-8',
);
const commandSource = readFileSync(join(__dirname, '../commands/index.ts'), 'utf-8');
const exportServiceSource = readFileSync(join(__dirname, '../services/ExportService.ts'), 'utf-8');
const removedGeneratedClipEditorExecutor = ['ensureTimelineEditor', 'ForGeneratedClip('].join('');
const removedGeneratedClipEditorTimeout = [
  'Timeline editor did not ',
  'become ready',
  ' before import.',
].join('');

describe('neko-cut protocol', () => {
  describe('AIActionHandler', () => {
    let mockWebview: { postMessage: ReturnType<typeof vi.fn> };
    let handler: AIActionHandler;

    beforeEach(() => {
      mockWebview = { postMessage: vi.fn() };
      const mockUri = { scheme: 'file', fsPath: '/tmp/test.nkv', path: '/tmp/test.nkv' };
      handler = new AIActionHandler(mockWebview as any, mockUri as any);
    });

    it('sends aiActionStatus with status running on action start', async () => {
      await handler.handleAction('ai-upscale', ['elem-1']);

      expect(mockWebview.postMessage).toHaveBeenCalled();
      const firstCall = mockWebview.postMessage.mock.calls[0]![0];
      expect(firstCall.type).toBe('aiActionStatus');
      expect(firstCall.actionId).toBe('ai-upscale');
      expect(firstCall.status).toBe('running');
    });

    it('fails visibly for a removed local ML action', async () => {
      await handler.handleAction('ai-upscale', ['elem-1']);

      const calls = mockWebview.postMessage.mock.calls;
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall.type).toBe('aiActionStatus');
      expect(lastCall.status).toBe('failed');
      expect(lastCall.error).toBe('Unknown AI action: ai-upscale');
    });

    it('sends failed status for stub actions (ai-auto-edit)', async () => {
      await handler.handleAction('ai-auto-edit', ['elem-1']);

      const calls = mockWebview.postMessage.mock.calls;
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall.status).toBe('failed');
      expect(lastCall.error).toContain('not yet available');
    });
  });
});

// ============================================================================
// Tests: Timeline command registration (NKC-010)
// ============================================================================

describe('timeline command registration (NKC-010)', () => {
  beforeEach(() => {
    cmdState.commands.clear();
  });

  it('registers core timeline commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.timeline.getInfo')).toBe(true);
    expect(cmdState.commands.has('neko.element.add')).toBe(true);
    expect(cmdState.commands.has('neko.element.delete')).toBe(true);
    expect(cmdState.commands.has('neko.timeline.listElements')).toBe(true);
    expect(cmdState.commands.has('neko.cut.authoring.importCanvasDraft')).toBe(true);
  });

  it('routes Canvas draft imports through Cut authoring and returns the sync payload', async () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = {
      getActiveDocumentUri: vi.fn(() => 'file:///workspace/cut.nkv'),
      getActiveWebview: vi.fn(() => null),
      getActiveExportService: vi.fn(),
    };
    const authoringService = {
      importCanvasDraft: vi.fn(async () => ({
        version: 1,
        ok: true,
        documentUri: 'file:///workspace/cut.nkv',
        created: false,
        revealed: false,
        diagnostics: [],
        data: {
          projectName: 'Canvas Route',
          shotCount: 1,
          refs: [{ kind: 'media', shotId: 'unit-a', trackId: 'track-a', elementId: 'element-a' }],
          importedAt: 123,
          syncPayload: {
            source: 'neko-cut',
            reason: 'storyboard-import',
            shots: [{ shotId: 'node-a', selectedInTimeline: true }],
          },
        },
      })),
    };

    registerTimelineCommands(mockContext as any, mockProvider as any, authoringService as any);

    const draft = {
      kind: 'canvas-cut-draft',
      schemaVersion: 1,
      source: { canvasUri: 'file:///workspace/story.nkc', revision: 1 },
      route: {
        id: 'route-main',
        title: 'Main route',
        entryUnitId: 'unit-a',
        unitIds: ['unit-a'],
        sourceKind: 'auto-entry',
      },
      projectName: 'Canvas Route',
      units: [
        {
          id: 'unit-a',
          kind: 'shot',
          renderMode: 'story-preview',
          sourceMapping: {
            routeId: 'route-main',
            canvasUnitId: 'unit-a',
            canvasNodeId: 'node-a',
            canvasUnitKind: 'shot',
          },
          media: [{ role: 'source', assetPath: 'media/shot-a.mp4' }],
        },
      ],
    };

    const handler = cmdState.commands.get('neko.cut.authoring.importCanvasDraft');
    expect(handler).toBeDefined();
    const result = await handler!({
      payload: draft,
      target: { kind: 'file', documentUri: 'file:///workspace/cut.nkv' },
      expectedProjectRevision: 'revision-1',
    });

    expect(authoringService.importCanvasDraft).toHaveBeenCalledWith({
      target: { kind: 'file', documentUri: 'file:///workspace/cut.nkv', reveal: false },
      payload: draft,
      expectedProjectRevision: 'revision-1',
    });
    expect(result).toMatchObject({
      accepted: true,
      status: 'imported',
      projectUri: 'file:///workspace/cut.nkv',
      syncPayload: {
        source: 'neko-cut',
        reason: 'storyboard-import',
      },
    });
  });

  it('rejects Canvas draft import when no explicit target is supplied', async () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = {
      getActiveDocumentUri: vi.fn(() => null),
      getActiveWebview: vi.fn(() => null),
      getActiveExportService: vi.fn(),
    };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    const handler = cmdState.commands.get('neko.cut.authoring.importCanvasDraft');
    expect(handler).toBeDefined();
    await expect(handler!({ route: { title: 'Route' } } as any)).resolves.toMatchObject({
      accepted: false,
      status: 'rejected',
    });
  });

  it('registers element update command', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.element.update')).toBe(true);
    expect(cmdState.commands.has('neko.element.getInfo')).toBe(true);
  });

  it('registers track management commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.track.add')).toBe(true);
    expect(cmdState.commands.has('neko.track.delete')).toBe(true);
    expect(cmdState.commands.has('neko.track.reorder')).toBe(true);
  });

  it('registers effect and transition commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.effect.list')).toBe(true);
    expect(cmdState.commands.has('neko.effect.add')).toBe(true);
    expect(cmdState.commands.has('neko.transition.add')).toBe(true);
    expect(cmdState.commands.has('neko.transition.remove')).toBe(true);
  });

  it('pushes disposables into context.subscriptions', () => {
    const mockContext = { subscriptions: [] as any[], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    // Each registered command pushes a disposable
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    // Every subscription should have a dispose method
    for (const sub of mockContext.subscriptions) {
      expect(sub).toHaveProperty('dispose');
    }
  });
});

describe('locator-first engine and export boundaries', () => {
  it('authorizes engine file range registration through narrow content reads', () => {
    expect(messageHandlerSource).toContain('resolveEngineFileAccessPath');
    expect(messageHandlerSource).toContain("kind: 'workspace-file' as const");
    expect(messageHandlerSource).toContain('this.contentRead.stat(locator)');
    expect(messageHandlerSource).toContain('this.engineClient.registerFile({');
    expect(messageHandlerSource).not.toContain("intent: 'verify'");
    expect(messageHandlerSource).not.toContain("target: 'local-path'");
  });

  it('keeps export source authorization narrow and output preparation domain-owned', () => {
    expect(exportServiceSource).toContain("kind: 'workspace-file' as const");
    expect(exportServiceSource).toContain('contentRead.stat(locator)');
    expect(exportServiceSource).toContain('prepareOutputDirectory');
    expect(exportServiceSource).not.toContain("intent: 'final-export'");
    expect(exportServiceSource).not.toContain("mode: 'stage-export'");
    expect(exportServiceSource).not.toContain('createHostContentAccessRuntime');
  });
});

describe('generated clip import command boundaries', () => {
  it('uses the Cut authoring service before optional editor reveal', () => {
    expect(commandSource).toContain('neko.cut.authoring.importGeneratedClip');
    expect(commandSource).toContain('cutProjectAuthoringService.importGeneratedClip(');
    expect(commandSource).toContain('resolveGeneratedClipAuthoringTarget(');
    expect(commandSource).toContain('revealCutAuthoringResult(');
    expect(commandSource).not.toContain(removedGeneratedClipEditorExecutor);
    expect(commandSource).not.toContain(removedGeneratedClipEditorTimeout);
  });
});
