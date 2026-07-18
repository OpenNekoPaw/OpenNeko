import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticSourceAnalysisResult, SemanticSourceDescriptor } from '@neko/shared';
import { SemanticSourceDiscoveryService } from './SemanticSourceDiscoveryService';

const temporaryDirectories: string[] = [];
const settingsChange = vi.hoisted(() => ({ listener: undefined as (() => void) | undefined }));
const projection = vi.hoisted(() => ({
  sources: new Map<string, SemanticSourceDescriptor>(),
  results: new Map<string, SemanticSourceAnalysisResult>(),
  candidates: [] as unknown[],
}));
const factWrites = vi.hoisted(() => ({ importAsset: vi.fn(), confirmEntity: vi.fn() }));

vi.mock('vscode', () => ({
  RelativePattern: vi.fn(function RelativePattern(base: string, pattern: string) {
    return { base, pattern };
  }),
  workspace: {
    isTrusted: true,
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
  },
  window: {
    onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

vi.mock('../utils/logger', () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@neko/shared/local-metadata/node', () => ({
  createNodeWorkspaceSemanticEntityMetadataBinding: vi.fn(async () => ({
    workspaceId: 'workspace-test',
    getSource: vi.fn(async (sourceId: string) => {
      const source = projection.sources.get(sourceId);
      return source ? { sourceId, sourceFingerprint: source.fingerprint } : null;
    }),
    listSources: vi.fn(async (rootId?: string) =>
      [...projection.sources.values()].filter((source) => !rootId || source.rootId === rootId),
    ),
    replaceSource: vi.fn(
      async (input: {
        readonly source: SemanticSourceDescriptor;
        readonly result: SemanticSourceAnalysisResult;
      }) => {
        projection.sources.set(input.source.sourceId, input.source);
        projection.results.set(input.source.sourceId, input.result);
      },
    ),
    deleteSource: vi.fn(async (sourceId: string) => projection.sources.delete(sourceId)),
    markSourceStale: vi.fn(async () => undefined),
    listAutomaticCandidates: vi.fn(async () => projection.candidates),
    findOccurrencesByEntity: vi.fn(async () => []),
    findEntityLinksByOccurrence: vi.fn(async () => null),
    findEntityLinksByLocator: vi.fn(async () => []),
    readSemanticRevision: vi.fn(async () => ({ revision: 0, freshness: 'fresh' })),
    readEntityRevision: vi.fn(async () => ({ revision: 0, freshness: 'fresh' })),
    dispose: vi.fn(async () => undefined),
  })),
}));

describe('SemanticSourceDiscoveryService integration path', () => {
  beforeEach(() => {
    projection.sources.clear();
    projection.results.clear();
    projection.candidates.length = 0;
    settingsChange.listener = undefined;
    factWrites.importAsset.mockReset();
    factWrites.confirmEntity.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
    );
  });

  it('reconciles workspace and external roots without importing assets or confirming entities', async () => {
    const root = await createFixtureRoot();
    const workspace = join(root, 'workspace');
    const library = join(root, 'library');
    await mkdir(workspace, { recursive: true });
    await mkdir(library, { recursive: true });
    await writeFile(join(workspace, 'copied.md'), '# Rin\n', 'utf8');
    await writeFile(join(library, 'scene.fountain'), 'INT. ROOM - DAY\n\nNOVA\nHello.\n', 'utf8');

    const settings = createSettings([
      {
        name: 'Library',
        variable: 'LIBRARY',
        resolvedPath: library,
        enabled: true,
        accessible: true,
      },
    ]);
    const service = new SemanticSourceDiscoveryService({
      workspaceRoot: workspace,
      settingsService: settings,
      entityService: createEntityService(),
      homedir: root,
    });

    await service.start();
    expect([...projection.sources.keys()]).toEqual(
      expect.arrayContaining(['workspace:copied.md', 'media-library:LIBRARY:scene.fountain']),
    );
    expect(factWrites.importAsset).not.toHaveBeenCalled();
    expect(factWrites.confirmEntity).not.toHaveBeenCalled();

    await writeFile(join(workspace, 'finder-copy.txt'), 'NOVA\n', 'utf8');
    await service.refresh();
    expect(projection.sources.has('workspace:finder-copy.txt')).toBe(true);

    await rm(join(workspace, 'copied.md'));
    await service.refresh();
    expect(projection.sources.has('workspace:copied.md')).toBe(false);

    service.dispose();
  });

  it('removes stale external roots after settings remap and ignores inaccessible roots', async () => {
    const root = await createFixtureRoot();
    const workspace = join(root, 'workspace');
    const firstLibrary = join(root, 'library-a');
    const secondLibrary = join(root, 'library-b');
    await mkdir(workspace, { recursive: true });
    await mkdir(firstLibrary, { recursive: true });
    await mkdir(secondLibrary, { recursive: true });
    await writeFile(join(firstLibrary, 'old.md'), '# Old', 'utf8');
    await writeFile(join(secondLibrary, 'new.md'), '# New', 'utf8');

    const settings = createSettings([
      {
        name: 'Library',
        variable: 'LIBRARY',
        resolvedPath: firstLibrary,
        enabled: true,
        accessible: true,
      },
    ]);
    const service = new SemanticSourceDiscoveryService({
      workspaceRoot: workspace,
      settingsService: settings,
      entityService: createEntityService(),
      homedir: root,
    });
    await service.start();
    expect(projection.sources.has('media-library:LIBRARY:old.md')).toBe(true);

    settings.libraries = [
      {
        name: 'Library',
        variable: 'LIBRARY',
        resolvedPath: secondLibrary,
        enabled: true,
        accessible: true,
      },
      {
        name: 'Missing',
        variable: 'MISSING',
        resolvedPath: join(root, 'missing'),
        enabled: true,
        accessible: false,
      },
    ];
    settingsChange.listener?.();
    await waitFor(() => projection.sources.has('media-library:LIBRARY:new.md'));
    expect(projection.sources.has('media-library:LIBRARY:old.md')).toBe(false);
    expect(projection.sources.has('media-library:LIBRARY:new.md')).toBe(true);
    expect([...projection.sources.keys()]).not.toContain('media-library:MISSING:any.json');

    service.dispose();
  });

  it('analyzes JSON only through an explicitly registered creative schema', async () => {
    const root = await createFixtureRoot();
    const workspace = join(root, 'workspace');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, 'story.json'), '{"characters":[{"name":"Nova"}]}', 'utf8');
    await writeFile(join(workspace, 'config.json'), '{"name":"Do not index"}', 'utf8');
    const schema = { schemaId: 'openneko.story', schemaVersion: '1' };
    const service = new SemanticSourceDiscoveryService({
      workspaceRoot: workspace,
      settingsService: createSettings([]),
      entityService: createEntityService(),
      homedir: root,
      creativeSchemaAdapters: [
        {
          schema,
          formats: ['json'],
          selectField: ({ path, value }) =>
            path[0] === 'characters' && path.at(-1) === 'name'
              ? { explicitEntityKind: 'character', explicitEntityName: value }
              : false,
        },
      ],
      resolveCreativeSchema: ({ relativePath }) =>
        relativePath === 'story.json' ? schema : undefined,
    });

    await service.start();
    expect(projection.sources.has('workspace:story.json')).toBe(true);
    expect(projection.sources.has('workspace:config.json')).toBe(false);
    service.dispose();
  });
});

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'neko-semantic-discovery-'));
  temporaryDirectories.push(root);
  return root;
}

function createSettings(
  initial: readonly {
    readonly name: string;
    readonly variable: string;
    readonly resolvedPath: string;
    readonly enabled: boolean;
    readonly accessible: boolean;
  }[],
) {
  const settings = {
    libraries: [...initial],
    onDidChange(listener: () => void) {
      settingsChange.listener = listener;
      return { dispose: vi.fn() };
    },
    async getResolvedLibraries() {
      return settings.libraries;
    },
  };
  return settings;
}

function createEntityService() {
  return {
    list: vi.fn(async () => []),
    proposeCandidate: factWrites.importAsset,
    confirmCandidate: factWrites.confirmEntity,
    dismissCandidate: vi.fn(),
    rejectCandidate: vi.fn(),
    mergeCandidateIntoExisting: vi.fn(),
  } as never;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for semantic source reconciliation.');
}
