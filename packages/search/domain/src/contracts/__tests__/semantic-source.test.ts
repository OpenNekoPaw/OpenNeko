import { describe, expect, it } from 'vitest';
import {
  isCompactMediaSemanticIndex,
  isSemanticEvidenceProjection,
  isSemanticSourceDescriptor,
  isSemanticSourceScope,
} from '../semantic-source';

describe('semantic source contracts', () => {
  it('accepts portable registered scopes and source descriptors', () => {
    expect(
      isSemanticSourceScope({
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        portableRoot: '${WORKSPACE}',
        analysisMode: 'link-existing',
        priority: 0,
      }),
    ).toBe(true);
    expect(
      isSemanticSourceDescriptor({
        sourceId: 'workspace:docs/story.md',
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        relativePath: 'docs/story.md',
        portablePath: '${WORKSPACE}/docs/story.md',
        format: 'markdown',
        analysisMode: 'link-existing',
        fingerprint: 'sha256:source-content',
        sizeBytes: 120,
        modifiedAtMs: 10,
      }),
    ).toBe(true);
  });

  it('accepts every discovery owner and rejects active-path identity', () => {
    for (const rootKind of ['workspace', 'document', 'managed-asset', 'media-library'] as const) {
      expect(
        isSemanticSourceScope({
          workspaceId: 'workspace-1',
          rootId: `root-${rootKind}`,
          rootKind,
          portableRoot: `\${${rootKind.toUpperCase().replace('-', '_')}}`,
          analysisMode: 'discover-candidates',
          priority: 0,
        }),
      ).toBe(true);
    }
    expect(
      isSemanticSourceScope({
        workspaceId: '',
        rootId: 'active-workspace',
        rootKind: 'workspace',
        portableRoot: '/tmp/workspace',
        analysisMode: 'link-existing',
        priority: -1,
      }),
    ).toBe(false);
    expect(
      isSemanticSourceDescriptor({
        sourceId: 'workspace:config.json',
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        relativePath: 'config.json',
        portablePath: '${WORKSPACE}/config.json',
        format: 'json',
        analysisMode: 'link-existing',
        fingerprint: 'sha256:source-content',
        sizeBytes: 120,
        modifiedAtMs: 10,
      }),
    ).toBe(false);
  });

  it('accepts compact evidence and rejects body-bearing payloads', () => {
    const evidence = {
      evidenceId: 'segment-1',
      unitId: 'page-1',
      kind: 'paragraph',
      sourceRef: {
        kind: 'document',
        source: { filePath: '${WORKSPACE}/story.md', format: 'markdown' },
      },
      locator: {
        file: { authority: 'workspace', path: 'story.md' },
        selector: { kind: 'text-range', startChar: 0, endChar: 3 },
      },
      contentHash: 'fnv1a32:12345678',
      provenance: { providerId: 'neko.text-entity.deterministic', sourceKind: 'document' },
    };
    expect(isSemanticEvidenceProjection(evidence)).toBe(true);
    expect(isSemanticEvidenceProjection({ ...evidence, text: 'Rin' })).toBe(false);
    expect(isSemanticEvidenceProjection({ ...evidence, metadata: { snippet: 'Rin' } })).toBe(false);
  });

  it('accepts only semantic indexes without a persistent textSegments field', () => {
    const index = {
      indexId: 'semantic:story',
      assetId: 'story',
      sourceRef: {
        kind: 'document',
        source: { kind: 'file', projectRelativePath: 'docs/story.md' },
      },
      updatedAt: '2026-07-18T00:00:00.000Z',
    };
    expect(isCompactMediaSemanticIndex(index)).toBe(true);
    expect(isCompactMediaSemanticIndex({ ...index, textSegments: [] })).toBe(false);
  });

  it('rejects unknown creative schema and semantic index fields', () => {
    expect(
      isSemanticSourceDescriptor({
        sourceId: 'workspace:story.json',
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        relativePath: 'story.json',
        portablePath: '${WORKSPACE}/story.json',
        format: 'json',
        analysisMode: 'link-existing',
        fingerprint: 'sha256:story',
        sizeBytes: 120,
        modifiedAtMs: 10,
        creativeSchema: {
          schemaId: 'openneko.story',
          unexpectedField: 'value',
        },
      }),
    ).toBe(false);
    expect(
      isCompactMediaSemanticIndex({
        unexpectedField: 1,
        assetId: 'story',
        sourceRef: { kind: 'file', path: '${WORKSPACE}/story.json' },
      }),
    ).toBe(false);
  });
});
