import { describe, expect, it } from 'vitest';

import {
  inspectLegacyAssetCatalog,
  type LegacyAssetInspectionFileInput,
  type LegacyAssetInspectionReader,
} from '../legacy-asset-catalog-inspector';

const catalogFile: LegacyAssetInspectionFileInput = {
  sourceId: 'asset-catalog',
  role: 'asset-catalog',
  workspacePath: 'neko/assets/library.json',
  required: true,
};

const files: readonly LegacyAssetInspectionFileInput[] = [
  catalogFile,
  {
    sourceId: 'entity-bindings',
    role: 'entity-bindings',
    workspacePath: 'neko/entity-bindings.json',
    required: true,
  },
  {
    sourceId: 'canvas-main',
    role: 'canvas-document',
    workspacePath: 'boards/main.nkc',
  },
  {
    sourceId: 'cut-main',
    role: 'cut-project',
    workspacePath: 'edits/main.nkv',
  },
  {
    sourceId: 'agent-facts',
    role: 'agent-data',
    workspacePath: 'neko/agent/facts.json',
  },
];

describe('legacy Asset catalog inspector', () => {
  it('reads every legacy input without resolving references or mutating storage', async () => {
    const reader = new MemoryReader(
      new Map([
        [
          'neko/assets/library.json',
          jsonBytes({
            version: 1,
            entities: [
              {
                id: 'asset-alice',
                variants: [
                  {
                    id: 'variant-alice',
                    files: [{ id: 'file-alice', path: 'project://assets/asset-alice' }],
                  },
                ],
              },
            ],
          }),
        ],
        [
          'neko/entity-bindings.json',
          jsonBytes({
            version: 1,
            bindings: [
              {
                id: 'binding-alice',
                entityId: 'char_alice',
                assetRef: 'project://assets/asset-alice',
              },
            ],
          }),
        ],
        ['boards/main.nkc', jsonBytes({ nodes: [{ assetRef: 'project://assets/asset-alice' }] })],
        ['edits/main.nkv', jsonBytes({ clips: [{ source: 'project://assets/asset-alice' }] })],
        [
          'neko/agent/facts.json',
          jsonBytes({ mentions: [{ reference: 'project://assets/asset-alice' }] }),
        ],
      ]),
    );

    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader,
      files,
      searchProjection: {
        sourceId: 'asset-search',
        revision: 'search-revision-1',
        records: [
          {
            partition: 'asset-library',
            source: { uri: 'project://assets/asset-alice' },
          },
        ],
      },
    });

    expect(reader.reads).toEqual(files.map((file) => file.workspacePath));
    expect(session.inspection).toMatchObject({
      version: 1,
      status: 'ready',
      legacyRecordCount: 11,
      sources: [
        { sourceId: 'asset-catalog', role: 'asset-catalog', schemaVersion: '1' },
        { sourceId: 'entity-bindings', role: 'entity-bindings', schemaVersion: '1' },
        { sourceId: 'canvas-main', role: 'canvas-document' },
        { sourceId: 'cut-main', role: 'cut-project' },
        { sourceId: 'agent-facts', role: 'agent-data' },
        { sourceId: 'asset-search', kind: 'local-projection', partition: 'asset-library' },
      ],
      diagnostics: [],
    });
    expect(session.findings.map((finding) => finding.kind)).toEqual([
      'asset-entity-record',
      'asset-variant-record',
      'asset-file-record',
      'project-asset-reference',
      'entity-asset-binding',
      'project-asset-reference',
      'project-asset-reference',
      'project-asset-reference',
      'project-asset-reference',
      'asset-search-record',
      'project-asset-reference',
    ]);
    expect(session.archiveInputs).toHaveLength(6);

    const safeProjection = JSON.stringify({
      inspection: session.inspection,
      findings: session.findings,
    });
    expect(safeProjection).not.toContain('project://assets/');
    expect(safeProjection).not.toContain('/Users/');
  });

  it('fails visibly for required missing inputs without exposing a physical path', async () => {
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: new MemoryReader(new Map()),
      files: [catalogFile],
    });

    expect(session.inspection).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'source-missing',
          severity: 'error',
          message: 'A legacy migration source is unavailable.',
          sourceId: 'asset-catalog',
        },
      ],
    });
  });

  it('blocks unsupported catalog versions and preserves the exact bytes for archive only', async () => {
    const bytes = jsonBytes({ version: 99, entities: [] });
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: new MemoryReader(new Map([['neko/assets/library.json', bytes]])),
      files: [catalogFile],
    });

    expect(session.inspection.status).toBe('blocked');
    expect(session.inspection.diagnostics).toEqual([
      {
        code: 'unsupported-version',
        severity: 'error',
        message: 'Legacy Asset data uses an unsupported schema version.',
        sourceId: 'asset-catalog',
      },
    ]);
    expect(session.archiveInputs).toEqual([
      {
        kind: 'project-file',
        sourceId: 'asset-catalog',
        workspacePath: 'neko/assets/library.json',
        bytes,
      },
    ]);
  });

  it('rejects absolute input paths before invoking the reader', async () => {
    const reader = new MemoryReader(new Map());
    await expect(
      inspectLegacyAssetCatalog({
        projectRevision: 'revision-1',
        inspectedAt: '2026-07-21T01:00:00.000Z',
        reader,
        files: [
          {
            sourceId: 'asset-catalog',
            role: 'asset-catalog',
            workspacePath: '/Users/private/neko/assets/library.json',
          },
        ],
      }),
    ).rejects.toThrow('normalized workspace-relative path');
    expect(reader.reads).toEqual([]);
  });
});

class MemoryReader implements LegacyAssetInspectionReader {
  readonly reads: string[] = [];

  constructor(private readonly files: ReadonlyMap<string, Uint8Array>) {}

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    this.reads.push(workspacePath);
    return this.files.get(workspacePath)?.slice();
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
