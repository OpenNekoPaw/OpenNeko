import { describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '../../types/project';
import {
  ProjectFileStore,
  ProjectFormatCodecRegistry,
  PROJECT_FILE_SNAPSHOT_REQUEST,
  PROJECT_FILE_SNAPSHOT_RESPONSE,
  InMemoryProjectDocumentHost,
  applyPortableSourcePathPolicy,
  createDefaultProjectFormatCodecRegistry,
  createProjectFileDiagnostic,
  detectRuntimeOrCacheSourceHandle,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  nkcSourcePathPolicy,
  nkvSourcePathPolicy,
  resolveProjectSourceDiagnostics,
  toContentIngestRequest,
  isProjectFileSnapshotRequestMessage,
  isProjectFileSnapshotResponseMessage,
  type PortableSourcePathPolicy,
  type ProjectFileOps,
  type ProjectFormatCodec,
} from '../index';

describe('ProjectFormatCodecRegistry', () => {
  it('registers codecs by format id and extension', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('demo', '.ndemo'));

    expect(registry.get('demo')?.formatId).toBe('demo');
    expect(registry.getByExtension('/workspace/file.ndemo')?.formatId).toBe('demo');
  });

  it('rejects duplicate extensions', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('left', '.nkt'));

    expect(() => registry.register(createJsonCodec('right', '.nkt'))).toThrow('already registered');
  });
});

describe('project file webview snapshot protocol', () => {
  it('identifies snapshot request and response messages', () => {
    expect(
      isProjectFileSnapshotRequestMessage({
        type: PROJECT_FILE_SNAPSHOT_REQUEST,
        requestId: 'snapshot-1',
        formatId: 'nkc',
      }),
    ).toBe(true);
    expect(
      isProjectFileSnapshotResponseMessage({
        type: PROJECT_FILE_SNAPSHOT_RESPONSE,
        requestId: 'snapshot-1',
        ok: true,
        document: { name: 'Canvas' },
      }),
    ).toBe(true);
    expect(isProjectFileSnapshotRequestMessage({ type: PROJECT_FILE_SNAPSHOT_REQUEST })).toBe(
      false,
    );
  });
});

describe('ProjectFileStore', () => {
  it('loads invalid JSON as diagnostics without replacing the file', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({ '/project/edit.nkv': '{bad json' }),
    });

    const result = await store.load<ProjectData>({ filePath: '/project/edit.nkv' });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-json')).toBe(true);
    expect(result.document?.tracks).toEqual([]);
  });

  it('saves file-backed project content to injected file ops', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    const project: ProjectData = {
      version: '2.0',
      name: 'Cut',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [],
    };
    const result = await store.save({ filePath: '/project/edit.nkv', document: project });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(result.document).toEqual(project);
    expect(files.readText('/project/edit.nkv')).toContain('"name": "Cut"');
  });

  it('writes project files in-place by default even when rename is available', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    await store.save({ filePath: '/project/edit.nkv', document: createProject('in-place') });

    expect(files.renames).toEqual([]);
    expect(files.readText('/project/edit.nkv')).toContain('"name": "in-place"');
  });

  it('uses atomic rename only when explicitly requested', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    await store.save({
      filePath: '/project/edit.nkv',
      document: createProject('atomic'),
      atomic: true,
    });

    expect(files.renames).toHaveLength(1);
    expect(files.renames[0]?.toPath).toBe('/project/edit.nkv');
    expect(files.readText('/project/edit.nkv')).toContain('"name": "atomic"');
  });

  it('logs save diagnostics with the explicit save reason', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
      logger,
    });

    const result = await store.save({
      filePath: '/project/edit.nkv',
      document: createProject('autosaved'),
      saveReason: 'autosave',
    });

    expect(result.ok).toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      'projectFile.save',
      expect.objectContaining({
        phase: 'start',
        saveReason: 'autosave',
        filePath: '/project/edit.nkv',
        formatId: 'nkv',
      }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'projectFile.save',
      expect.objectContaining({
        phase: 'written',
        saveReason: 'autosave',
        filePath: '/project/edit.nkv',
        formatId: 'nkv',
      }),
    );
  });

  it('logs distinct save reasons for manual, VS Code, import, migration, and add-source writes', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
      logger,
    });

    for (const saveReason of [
      'manual',
      'vscode-save',
      'import',
      'migration',
      'add-source',
    ] as const) {
      await store.save({
        filePath: `/project/${saveReason}.nkv`,
        document: createProject(saveReason),
        saveReason,
      });
    }

    const writtenReasons = logger.debug.mock.calls
      .filter((call) => call[0] === 'projectFile.save' && call[1]?.phase === 'written')
      .map((call) => call[1]?.saveReason);

    expect(writtenReasons).toEqual(['manual', 'vscode-save', 'import', 'migration', 'add-source']);
  });

  it('supports save-as and revert through the shared store', async () => {
    const files = createMemoryFileOps({
      '/project/source.nkv': JSON.stringify(createProject('source')),
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    const saveAs = await store.saveAs({
      filePath: '/project/copy.nkv',
      document: createProject('copy'),
    });
    const reverted = await store.revert<ProjectData>({ filePath: '/project/source.nkv' });

    expect(saveAs.ok).toBe(true);
    expect(files.readText('/project/copy.nkv')).toContain('"name": "copy"');
    expect(reverted.ok).toBe(true);
    expect(reverted.document?.name).toBe('source');
  });

  it('reports backup failure diagnostics', async () => {
    const fileOps = createMemoryFileOps();
    fileOps.writeFile = vi.fn(async () => {
      throw new Error('disk full');
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps,
    });

    const result = await store.backup({
      filePath: '/project/edit.nkv',
      backupPath: '/backup/edit.nkv',
      document: createProject('backup'),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('backup-failed');
  });

  it('serializes concurrent saves for the same document', async () => {
    const writes: string[] = [];
    const fileOps = createMemoryFileOps();
    fileOps.writeFile = vi.fn(async (filePath, content) => {
      await Promise.resolve();
      writes.push(`${filePath}:${new TextDecoder().decode(content)}`);
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps,
    });

    const first = createProject('first');
    const second = createProject('second');
    await Promise.all([
      store.save({ filePath: '/project/edit.nkv', document: first, atomic: false }),
      store.save({ filePath: '/project/edit.nkv', document: second, atomic: false }),
    ]);

    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('"name": "first"');
    expect(writes[1]).toContain('"name": "second"');
  });
});

describe('default project format codecs', () => {
  it('registers only retained nkv and nkc formats', () => {
    const registry = createDefaultProjectFormatCodecRegistry();

    expect(registry.list().map((codec) => codec.formatId)).toEqual(['nkv', 'nkc']);
    for (const extension of ['nka', 'nks', 'nkm', 'nkp']) {
      expect(registry.getByExtension(`removed.${extension}`)).toBeUndefined();
    }
  });

  it.each(['nka', 'nks', 'nkm', 'nkp'])(
    'rejects removed .%s formats before reading or writing user data',
    async (extension) => {
      const filePath = `/workspace/project/source.${extension}`;
      const files = createMemoryFileOps({ [filePath]: '{"preserve":true}' });
      const readFile = vi.fn(files.readFile);
      const writeFile = vi.fn(files.writeFile);
      const store = new ProjectFileStore({
        registry: createDefaultProjectFormatCodecRegistry(),
        fileOps: { ...files, readFile, writeFile },
      });

      const loaded = await store.load({ filePath });
      const saved = await store.save({ filePath, document: { replacement: true } });

      expect(loaded).toMatchObject({ ok: false, readOnly: true });
      expect(saved).toMatchObject({ ok: false, written: false });
      expect(loaded.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['invalid-format']);
      expect(saved.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['invalid-format']);
      expect(readFile).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(files.readText(filePath)).toBe('{"preserve":true}');
    },
  );
});

describe('portable source path policy', () => {
  it('contracts workspace sources before save', () => {
    const policy = createNkvSourcePolicy();
    const project = createProject('portable', '/workspace/project/media/clip.mp4');

    const result = applyPortableSourcePathPolicy(project, policy, {
      context: {
        owningWorkspaceRoot: '/workspace/project',
        workspaceRoots: ['/workspace/project'],
        pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
      },
    });

    const element = result.document.tracks[0]?.elements[0];
    expect(element?.type === 'media' ? element.src : undefined).toBe('media/clip.mp4');
    expect(result.diagnostics).toEqual([]);
  });

  it('diagnoses non-portable absolute paths', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('external', '/Volumes/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
      },
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('non-portable-path');
  });

  it('contracts configured variable root sources', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('variable', '/Volumes/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([
            ['WORKSPACE', '/workspace/project'],
            ['MEDIA', '/Volumes/media'],
          ]),
        },
      },
    );

    const element = result.document.tracks[0]?.elements[0];
    expect(element?.type === 'media' ? element.src : undefined).toBe('${MEDIA}/clip.mp4');
  });

  it('keeps already portable relative sources during save', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('relative', 'media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
      },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.replacements).toEqual([]);
  });

  it('rejects parent-relative sources before save', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('parent', '../Downloads/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
      },
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('non-portable-path');
    expect(result.replacements).toEqual([]);
  });

  it('reports missing variables, missing sources, and unauthorized roots during resolution', () => {
    const missingVariable = resolveProjectSourceDiagnostics(
      createProject('missing-var', '${MEDIA}/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => true,
      },
    );
    const missingSource = resolveProjectSourceDiagnostics(
      createProject('missing-source', 'media/missing.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => false,
      },
    );
    const unauthorized = resolveProjectSourceDiagnostics(
      createProject('unauthorized', '/workspace/project/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => true,
        isPathAuthorized: () => false,
      },
    );

    expect(missingVariable.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unresolved-variable',
    );
    expect(missingSource.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-source',
    );
    expect(unauthorized.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unauthorized-root',
    );
  });

  it('loads projects after cache deletion when durable sources remain valid', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({
        '/workspace/project/edit.nkv': JSON.stringify(createProject('cached', 'media/clip.mp4')),
      }),
    });

    const result = await store.load<ProjectData>({
      filePath: '/workspace/project/edit.nkv',
      sourcePolicy: createNkvSourcePolicy(),
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: (filePath) => filePath === '/workspace/project/media/clip.mp4',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.document?.name).toBe('cached');
    expect(result.diagnostics).toEqual([]);
  });

  it('diagnoses runtime and cache handles', () => {
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'runtime',
        role: 'media',
        path: 'blob:vscode-runtime',
        fieldPath: ['tracks', 0, 'elements', 0, 'src'],
      })?.code,
    ).toBe('runtime-handle-persisted');
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'cache',
        role: 'media',
        path: '/workspace/project/.neko/.cache/proxy/clip.mp4',
        fieldPath: ['tracks', 0, 'elements', 0, 'src'],
      })?.code,
    ).toBe('cache-source-persisted');
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'relative-cache',
        role: 'media',
        path: '.neko/.cache/generated/image/out.png',
        fieldPath: ['nodes', 0, 'data', 'assetPath'],
      })?.code,
    ).toBe('cache-source-persisted');
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'relative-proxy',
        role: 'media',
        path: 'media/proxy/clip.mp4',
        fieldPath: ['nodes', 0, 'data', 'assetPath'],
      })?.code,
    ).toBe('cache-source-persisted');
  });
});

describe('source descriptor helpers', () => {
  it('lists and replaces nkv timeline sources', () => {
    const project = createProject('timeline', '/workspace/project/media/clip.mp4');
    const descriptors = nkvSourcePathPolicy.listSources(project);
    const replaced = nkvSourcePathPolicy.replaceSources(project, [
      { descriptor: descriptors[0]!, path: 'media/clip.mp4' },
    ]);

    expect(descriptors[0]?.fieldPath).toEqual(['tracks', 0, 'elements', 0, 'src']);
    expect(
      replaced.tracks[0]?.elements[0]?.type === 'media' ? replaced.tracks[0].elements[0].src : '',
    ).toBe('media/clip.mp4');
  });

  it('ignores nkc FieldBinding JSON pointer paths while saving media node sources', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });
    const canvas = {
      version: '2.1',
      name: 'Canvas',
      nodes: [
        {
          id: 'media-1',
          type: 'media',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 0,
          data: {
            assetPath: '/workspace/project/media/hero.png',
            mediaType: 'image',
          },
          content: {
            id: 'media-root',
            layout: 'stack',
            sections: [
              {
                id: 'media-preview',
                layout: 'stack',
                blocks: [
                  {
                    id: 'media-asset-preview',
                    kind: 'asset-preview',
                    binding: { path: '/runtimeAssetPath', valueType: 'asset' },
                    capabilities: [
                      {
                        kind: 'delegate',
                        actions: [
                          {
                            id: 'open-media',
                            target: 'preview',
                            assetBinding: { path: '/runtimeAssetPath', valueType: 'asset' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
      connections: [],
    };

    const descriptors = nkcSourcePathPolicy.listSources(canvas);
    const result = await store.save({
      filePath: '/workspace/project/canvas.nkc',
      formatId: 'nkc',
      document: canvas,
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
        },
      },
    });

    expect(descriptors.map((descriptor) => descriptor.id)).toContain(
      'canvas.nodes.0.data.assetPath',
    );
    expect(descriptors.map((descriptor) => descriptor.id)).not.toContain(
      'canvas.nodes.0.content.sections.0.blocks.0.binding.path',
    );
    expect(descriptors.map((descriptor) => descriptor.id)).not.toContain(
      'canvas.nodes.0.content.sections.0.blocks.0.capabilities.0.actions.0.assetBinding.path',
    );
    expect(result.ok).toBe(true);
    expect(result.document?.nodes[0]?.data.assetPath).toBe('media/hero.png');
    expect(files.readText('/workspace/project/canvas.nkc')).toContain(
      '"assetPath": "media/hero.png"',
    );
  });

  it('keeps nkc source policy typed to durable Canvas fields instead of generic path-shaped UI data', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });
    const canvas = {
      version: '2.1',
      name: 'Typed Canvas sources',
      linkedProject: '/workspace/project/timeline/edit.nkv',
      nodes: [
        {
          id: 'media-1',
          type: 'media',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 0,
          data: {
            assetPath: '/workspace/project/media/clip.mp4',
            runtimeAssetPath: 'vscode-webview-resource://panel/media/clip.mp4',
            thumbnailPath: '/workspace/project/thumbs/clip.jpg',
            runtimeThumbnailPath: 'blob:thumb',
            mediaType: 'video',
          },
          content: {
            id: 'media-root',
            layout: 'stack',
            sections: [
              {
                id: 'media-preview',
                layout: 'stack',
                blocks: [
                  {
                    id: 'media-asset-preview',
                    kind: 'asset-preview',
                    binding: { path: '/workspace/project/media/clip.mp4' },
                    capabilities: [
                      {
                        kind: 'delegate',
                        actions: [
                          {
                            id: 'open-media',
                            assetBinding: { path: '/workspace/project/media/clip.mp4' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'script-1',
          type: 'script',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 1,
          data: {
            scriptPath: '/workspace/project/story/main.fountain',
            scriptTitle: 'Main',
            scenes: [],
          },
        },
        {
          id: 'document-1',
          type: 'document',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 2,
          data: {
            docPath: '/workspace/project/docs/ref.pdf',
            docType: 'pdf',
            title: 'Reference',
            thumbnailData: 'data:image/png;base64,inline',
          },
        },
        {
          id: 'model-1',
          type: 'model',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 3,
          data: {
            modelPath: '/workspace/project/models/style.safetensors',
            modelName: 'Style',
            modelType: 'lora',
            role: 'reference',
          },
        },
        {
          id: 'canvas-1',
          type: 'canvas-embed',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 4,
          data: {
            canvasPath: '/workspace/project/boards/scene.nkc',
            canvasTitle: 'Scene',
            thumbnailData: 'data:image/png;base64,inline',
          },
        },
        {
          id: 'project-1',
          type: 'project',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 5,
          data: {
            projectPath: '/workspace/project/projects/cut.nkv',
            projectTitle: 'Cut',
            projectType: 'nkv',
          },
          content: {
            id: 'project-root',
            layout: 'stack',
            sections: [
              {
                id: 'project-preview',
                layout: 'stack',
                blocks: [
                  {
                    id: 'project-preview',
                    kind: 'asset-preview',
                    binding: { path: '/workspace/project/projects/cut.nkv' },
                    capabilities: [
                      {
                        kind: 'delegate',
                        actions: [
                          {
                            id: 'open-project',
                            assetBinding: { path: '/workspace/project/projects/cut.nkv' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          id: 'shot-1',
          type: 'shot',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 6,
          data: {
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Shot',
            characters: [],
            shotScale: 'medium',
            characterAction: '',
            emotion: [],
            sceneTags: [],
            generationStatus: 'idle',
            generationHistory: [],
            referenceImagePath: '/workspace/project/refs/shot.png',
            runtimeReferenceImagePath: 'blob:reference',
            sourceMediaRefs: [
              {
                refId: 'source-1',
                role: 'source',
                locator: { type: 'workspace-path', path: '/workspace/project/refs/source.png' },
              },
            ],
            generatedMediaRefs: [
              {
                refId: 'generated-1',
                role: 'generated',
                locator: { type: 'workspace-path', path: '/workspace/project/generated/shot.png' },
              },
            ],
          },
        },
        {
          id: 'memory-1',
          type: 'memory',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 7,
          data: {
            content: 'plain text',
            binding: { path: '/workspace/project/not-an-asset.png' },
            assetPath: '/workspace/project/assets/memory.png',
            runtimeAssetPath: 'blob:memory-preview',
          },
        },
      ],
      connections: [],
      relatedBoards: [
        {
          role: 'source',
          ref: { kind: 'workspace-path', path: '/workspace/project/boards/source.nkc' },
        },
      ],
    };

    const descriptors = nkcSourcePathPolicy.listSources(canvas as never);
    const result = await store.save({
      filePath: '/workspace/project/canvas.nkc',
      formatId: 'nkc',
      document: canvas,
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
        },
      },
    });

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([
      'canvas.linkedProject',
      'canvas.nodes.0.data.assetPath',
      'canvas.nodes.0.data.thumbnailPath',
      'canvas.nodes.1.data.scriptPath',
      'canvas.nodes.2.data.docPath',
      'canvas.nodes.3.data.modelPath',
      'canvas.nodes.4.data.canvasPath',
      'canvas.nodes.5.data.projectPath',
      'canvas.nodes.6.data.referenceImagePath',
      'canvas.nodes.6.data.sourceMediaRefs.0.locator.path',
      'canvas.nodes.6.data.generatedMediaRefs.0.locator.path',
      'canvas.nodes.7.data.assetPath',
      'canvas.relatedBoards.0.ref.path',
    ]);
    expect(result.ok).toBe(true);
    const saved = files.readText('/workspace/project/canvas.nkc');
    expect(saved).toContain('"assetPath": "media/clip.mp4"');
    expect(saved).toContain('"thumbnailPath": "thumbs/clip.jpg"');
    expect(saved).toContain('"scriptPath": "story/main.fountain"');
    expect(saved).toContain('"docPath": "docs/ref.pdf"');
    expect(saved).toContain('"modelPath": "models/style.safetensors"');
    expect(saved).toContain('"canvasPath": "boards/scene.nkc"');
    expect(saved).toContain('"projectPath": "projects/cut.nkv"');
    expect(saved).toContain('"referenceImagePath": "refs/shot.png"');
    expect(saved).toContain('"path": "refs/source.png"');
    expect(saved).toContain('"path": "generated/shot.png"');
    expect(saved).toContain('"path": "boards/source.nkc"');
    expect(saved).toContain('"path": "/workspace/project/media/clip.mp4"');
    expect(saved).toContain('"path": "/workspace/project/projects/cut.nkv"');
    expect(saved).toContain('blob:memory-preview');
  });

  it('rejects nkc runtime preview, thumbnail, proxy, blob, Webview URI, and cache paths as durable sources', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });
    const canvas = {
      version: '2.1',
      name: 'Canvas runtime source guard',
      nodes: [
        {
          id: 'blob-node',
          type: 'media',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 0,
          data: { assetPath: 'blob:vscode-runtime-video', mediaType: 'video' },
        },
        {
          id: 'script-node',
          type: 'script',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 1,
          data: {
            scriptPath: 'vscode-webview-resource://panel/scripts/main.fountain',
            scriptTitle: 'Main',
            scenes: [],
          },
        },
        {
          id: 'document-node',
          type: 'document',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 2,
          data: {
            docPath: '/workspace/project/.neko/.cache/proxy/ref.pdf',
            docType: 'pdf',
            title: 'Reference',
          },
        },
        {
          id: 'thumbnail-node',
          type: 'media',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 3,
          data: { thumbnailPath: 'media/thumbnail/hero.jpg' },
        },
        {
          id: 'project-node',
          type: 'project',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 4,
          data: {
            projectPath: 'media/proxy/hero.nkv',
            projectTitle: 'Proxy',
            projectType: 'nkv',
          },
        },
      ],
      connections: [],
    };

    const result = await store.save({
      filePath: '/workspace/project/canvas.nkc',
      formatId: 'nkc',
      document: canvas,
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.written).toBe(false);
    expect(files.readText('/workspace/project/canvas.nkc')).toBe('');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['runtime-handle-persisted', 'cache-source-persisted']),
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.sourceId)).toEqual(
      expect.arrayContaining([
        'canvas.nodes.0.data.assetPath',
        'canvas.nodes.1.data.scriptPath',
        'canvas.nodes.2.data.docPath',
        'canvas.nodes.3.data.thumbnailPath',
        'canvas.nodes.4.data.projectPath',
      ]),
    );
  });
});

describe('InMemoryProjectDocumentHost', () => {
  it('tracks dirty, clean, readonly, and error states', () => {
    const host = new InMemoryProjectDocumentHost({
      formatId: 'nkv',
      document: createProject('draft'),
      diagnostics: [],
    });

    host.applyEdit({
      apply: (document) => ({ ...document, name: 'edited' }),
    });
    expect(host.snapshot.state).toBe('dirty');
    expect(host.snapshot.version).toBe(1);
    host.markClean();
    expect(host.snapshot.state).toBe('clean');
    host.markReadonly([
      createProjectFileDiagnostic({ code: 'unsupported-version', message: 'future' }),
    ]);
    expect(host.snapshot.state).toBe('readonly');
    host.markError([createProjectFileDiagnostic({ code: 'write-failed', message: 'nope' })]);
    expect(host.snapshot.state).toBe('error');
  });
});

describe('project source add DTOs', () => {
  it('projects add-source intent to content ingest request', () => {
    const request = toContentIngestRequest({
      requestId: 'add-1',
      kind: 'drag-drop',
      formatId: 'nkv',
      documentUri: 'file:///workspace/project/edit.nkv',
      sourcePath: '/workspace/project/media/clip.mp4',
      browserFile: {
        name: 'clip.mp4',
        type: 'video/mp4',
      },
      destination: {
        kind: 'project',
        projectRoot: '/workspace/project',
        copyMode: 'register',
      },
      caller: 'neko-cut',
    });

    expect(request.mode).toBe('link');
    expect(request.sourcePath).toBe('/workspace/project/media/clip.mp4');
    expect(request.fileName).toBe('clip.mp4');
    expect(request.metadata?.['projectFormatId']).toBe('nkv');
  });

  it('projects byte-only source add as Create Asset', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const request = toContentIngestRequest({
      requestId: 'add-bytes',
      kind: 'paste',
      formatId: 'nkc',
      browserFile: { name: 'paste.png', type: 'image/png', size: bytes.byteLength },
      bytes,
      destination: {
        kind: 'project',
        projectRoot: '/workspace/project',
        directory: 'media',
        copyMode: 'copy',
      },
      caller: 'neko-canvas',
    });

    expect(request.mode).toBe('create-asset');
    expect(request.bytes).toBe(bytes);
    expect(request.fileName).toBe('paste.png');
  });

  it('handles source add through injected ingest port', async () => {
    const result = await handleProjectSourceAddRequest(
      {
        requestId: 'add-2',
        kind: 'file-picker',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: {
          kind: 'project',
          projectRoot: '/workspace/project',
          copyMode: 'register',
        },
      },
      {
        ingest: async (request) => ({
          status: 'ready',
          request,
          source: { kind: 'file', path: 'media/clip.mp4' },
          contractedPath: 'media/clip.mp4',
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.durablePath).toBe('media/clip.mp4');
  });

  it('diagnoses Webview-only file names and blob URLs before ingest', async () => {
    const fileNameOnly = await handleProjectSourceAddRequest(
      {
        requestId: 'add-3',
        kind: 'drag-drop',
        formatId: 'nkv',
        browserFile: { name: 'clip.mp4' },
        destination: { kind: 'project', projectRoot: '/workspace/project' },
      },
      { ingest: vi.fn() },
    );
    const blobUrl = await handleProjectSourceAddRequest(
      {
        requestId: 'add-4',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: 'blob:runtime',
        destination: { kind: 'project', projectRoot: '/workspace/project' },
      },
      { ingest: vi.fn() },
    );

    expect(fileNameOnly.ok).toBe(false);
    expect(fileNameOnly.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-source',
    );
    expect(blobUrl.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'runtime-handle-persisted',
    );
  });
});

describe('project source add host helper', () => {
  it('links durable workspace sources without copying them', async () => {
    const files = createAssetFileOps();

    const result = await ingestProjectSourceAddRequest(
      {
        mode: 'link',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        fileName: 'clip.mp4',
      },
      {
        documentPath: '/workspace/project/edit.nkv',
        assetDirectory: 'media',
        workspaceContext: {
          owningWorkspaceRoot: '/workspace/project',
          documentDir: '/workspace/project',
          allowedRoots: ['/workspace/project'],
        },
        fileOps: files,
      },
    );

    expect(result.status).toBe('ready');
    expect(result.contractedPath).toBe('media/clip.mp4');
    expect(files.writes).toEqual([]);
  });

  it('links configured variable sources without copying them', async () => {
    const files = createAssetFileOps();

    const result = await ingestProjectSourceAddRequest(
      {
        mode: 'link',
        sourcePath: '/Volumes/media/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        fileName: 'clip.mp4',
      },
      {
        documentPath: '/workspace/project/edit.nkv',
        assetDirectory: 'media',
        workspaceContext: {
          owningWorkspaceRoot: '/workspace/project',
          documentDir: '/workspace/project',
          allowedRoots: ['/workspace/project', '/Volumes/media'],
          pathVariables: new Map([['MEDIA', '/Volumes/media']]),
        },
        fileOps: files,
      },
    );

    expect(result.status).toBe('ready');
    expect(result.contractedPath).toBe('${MEDIA}/clip.mp4');
    expect(files.writes).toEqual([]);
  });

  it('links asset-library contracted sources through an injected path contractor', async () => {
    const files = createAssetFileOps();

    const result = await ingestProjectSourceAddRequest(
      {
        mode: 'link',
        sourcePath: '/Volumes/assets/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        fileName: 'clip.mp4',
      },
      {
        documentPath: '/workspace/project/edit.nkv',
        assetDirectory: 'media',
        workspaceContext: {
          owningWorkspaceRoot: '/workspace/project',
          documentDir: '/workspace/project',
          allowedRoots: ['/workspace/project'],
        },
        fileOps: files,
        contractPath: (absolutePath) =>
          absolutePath === '/Volumes/assets/clip.mp4' ? '${ASSETS}/clip.mp4' : undefined,
      },
    );

    expect(result.status).toBe('ready');
    expect(result.contractedPath).toBe('${ASSETS}/clip.mp4');
    expect(files.writes).toEqual([]);
  });

  it('rejects unmanaged absolute source paths instead of copying them', async () => {
    const files = createAssetFileOps();

    const result = await ingestProjectSourceAddRequest(
      {
        mode: 'link',
        sourcePath: '/downloads/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        fileName: 'clip.mp4',
      },
      {
        documentPath: '/workspace/project/edit.nkv',
        assetDirectory: 'media',
        workspaceContext: {
          owningWorkspaceRoot: '/workspace/project',
          documentDir: '/workspace/project',
          allowedRoots: ['/workspace/project'],
        },
        fileOps: files,
      },
    );

    expect(result.status).toBe('non-portable');
    expect(result.error).toContain('must be moved into the project');
    expect(files.writes).toEqual([]);
  });

  it('creates project assets from bytes with a collision-safe name', async () => {
    const existing = new Set(['/workspace/project/media/clip.mp4']);
    const files = createAssetFileOps(existing);
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await ingestProjectSourceAddRequest(
      {
        mode: 'create-asset',
        bytes,
        destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
        fileName: 'clip.mp4',
      },
      {
        documentPath: '/workspace/project/edit.nkv',
        assetDirectory: 'media',
        workspaceContext: {
          owningWorkspaceRoot: '/workspace/project',
          documentDir: '/workspace/project',
          allowedRoots: ['/workspace/project'],
        },
        fileOps: files,
      },
    );

    expect(result.status).toBe('ready');
    expect(result.contractedPath).toBe('media/clip-1.mp4');
    expect(files.writes).toEqual([{ filePath: '/workspace/project/media/clip-1.mp4', bytes }]);
  });
});

function createJsonCodec(formatId: string, extension: string): ProjectFormatCodec<unknown> {
  return {
    formatId,
    fileExtensions: [extension],
    currentVersion: '1',
    load(json) {
      return { document: JSON.parse(json) as unknown, diagnostics: [] };
    },
    save(document) {
      return { content: JSON.stringify(document, null, 2), diagnostics: [] };
    },
  };
}

function createMemoryFileOps(initial: Record<string, string> = {}): ProjectFileOps & {
  renames: Array<{ readonly fromPath: string; readonly toPath: string }>;
  readText(filePath: string): string;
} {
  const files = new Map(Object.entries(initial));
  const renames: Array<{ readonly fromPath: string; readonly toPath: string }> = [];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    renames,
    async readFile(filePath) {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`missing ${filePath}`);
      return encoder.encode(content);
    },
    async writeFile(filePath, content) {
      files.set(filePath, decoder.decode(content));
    },
    async renameFile(fromPath, toPath) {
      const content = files.get(fromPath);
      if (content === undefined) throw new Error(`missing ${fromPath}`);
      renames.push({ fromPath, toPath });
      files.set(toPath, content);
      files.delete(fromPath);
    },
    async deleteFile(filePath) {
      files.delete(filePath);
    },
    readText(filePath) {
      return files.get(filePath) ?? '';
    },
  };
}

function createAssetFileOps(existing = new Set<string>()): {
  readonly writes: Array<{ readonly filePath: string; readonly bytes: Uint8Array }>;
  createDirectory(dirPath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  writeFile(filePath: string, bytes: Uint8Array): Promise<void>;
} {
  const writes: Array<{ readonly filePath: string; readonly bytes: Uint8Array }> = [];
  return {
    writes,
    async createDirectory(_dirPath) {
      return undefined;
    },
    async fileExists(filePath) {
      return existing.has(filePath) || writes.some((write) => write.filePath === filePath);
    },
    async writeFile(filePath, bytes) {
      writes.push({ filePath, bytes });
    },
  };
}

function createProject(name: string, src?: string): ProjectData {
  return {
    version: '2.0',
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: src
      ? [
          {
            id: 'track-1',
            name: 'Main',
            type: 'media',
            muted: false,
            locked: false,
            hidden: false,
            isMain: true,
            elements: [
              {
                id: 'element-1',
                type: 'media',
                name: 'Clip',
                src,
                duration: 1,
                startTime: 0,
                trimStart: 0,
                trimEnd: 0,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                },
                opacity: 1,
                blendMode: 'normal',
                effects: [],
                muted: false,
                hidden: false,
                locked: false,
              },
            ],
          },
        ]
      : [],
  };
}

function createNkvSourcePolicy(): PortableSourcePathPolicy<ProjectData> {
  return {
    listSources(document) {
      return document.tracks.flatMap((track, trackIndex) =>
        track.elements.flatMap((element, elementIndex) => {
          if (
            (element.type === 'media' ||
              element.type === 'audio' ||
              element.type === 'scene3d' ||
              element.type === 'puppet') &&
            element.src
          ) {
            return [
              {
                id: element.id,
                role: element.type,
                path: element.src,
                fieldPath: ['tracks', trackIndex, 'elements', elementIndex, 'src'],
                allowRemote: element.type === 'media',
              },
            ];
          }
          return [];
        }),
      );
    },
    replaceSources(document, replacements) {
      const byId = new Map(
        replacements.map((replacement) => [replacement.descriptor.id, replacement.path]),
      );
      return {
        ...document,
        tracks: document.tracks.map((track) => ({
          ...track,
          elements: track.elements.map((element) => {
            const nextPath = byId.get(element.id);
            return nextPath && 'src' in element ? { ...element, src: nextPath } : element;
          }),
        })),
      };
    },
  };
}

void createProjectFileDiagnostic;
