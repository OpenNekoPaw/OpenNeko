import { describe, expect, it } from 'vitest';
import {
  projectCreatorVisibleArtifactFacts,
  projectGeneratedOutputLifecycleArtifactFacts,
  projectToolResultArtifactFacts,
} from './artifact-fact-projector';
import { createGeneratedAssetRevisionRef } from '@neko/shared';

describe('projectCreatorVisibleArtifactFacts', () => {
  it('projects document-entry sources and native image analysis provenance', () => {
    const documentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/Blame.epub' },
      entryPath: 'OEBPS/images/page-01.jpg',
    };

    const facts = projectCreatorVisibleArtifactFacts([
      {
        artifactId: 'page-01',
        revision: 'attachment:page-01',
        role: 'source',
        kind: 'image',
        title: 'Page 1',
        sourceId: 'document:page-01',
        contentLocator: documentLocator,
      },
      {
        artifactId: 'analysis-01',
        revision: 'markdown:analysis-01',
        role: 'analysis',
        kind: 'markdown',
        title: 'Storyboard Analysis',
        sourceId: 'artifact:analysis-01',
        sourceArtifactIds: ['page-01'],
        markdown: '# Storyboard Analysis\n\nFindings.',
        provenanceSource: 'native-image-analysis',
      },
    ]);

    expect(facts).toEqual([
      expect.objectContaining({
        ref: 'page-01',
        kind: 'content-locator',
        contentLocator: documentLocator,
        provenance: { source: 'source-file' },
        validator: { id: 'content-locator', status: 'valid' },
      }),
      expect.objectContaining({
        ref: 'analysis-01',
        kind: 'composite-artifact',
        provenance: { source: 'native-image-analysis' },
        validator: { id: 'composite-artifact-schema', status: 'valid' },
      }),
    ]);
  });
});

describe('projectToolResultArtifactFacts', () => {
  it('projects generated-output locator identity, digest, revision, and provenance', () => {
    const contentLocator = {
      kind: 'generated-output' as const,
      outputId: 'asset-1',
      revision: 'rev-1',
      digest: 'sha256:content',
      path: 'neko/generated/image/cat.png',
    };
    const [fact] = projectToolResultArtifactFacts(
      {
        success: true,
        attachments: [
          {
            type: 'image',
            path: '/tmp/runtime-preview.png',
            mimeType: 'image/png',
            contentLocator,
            assetRef: {
              assetId: 'asset-1',
              uri: 'assets/generated/cat.png',
              mimeType: 'image/png',
              contentLocator,
            },
          },
        ],
      },
      'tool-call-1',
    );
    expect(fact).toEqual(
      expect.objectContaining({
        ref: 'asset-1',
        kind: 'generated-asset',
        contentLocator,
        digest: 'sha256:content',
        revision: 'rev-1',
        provenance: expect.objectContaining({
          source: 'generated-output',
          toolCallId: 'tool-call-1',
        }),
        deliveryStatus: 'delivered',
        validator: { id: 'content-locator', status: 'valid' },
      }),
    );
    expect(JSON.stringify(fact)).not.toContain('/tmp/runtime-preview.png');
  });

  it('rejects runtime-only attachment paths without projecting the path', () => {
    const [fact] = projectToolResultArtifactFacts(
      {
        success: true,
        attachments: [{ type: 'image', path: '/Users/example/.neko/cache/preview.png' }],
      },
      'tool-call-1',
    );
    expect(fact).toMatchObject({
      kind: 'file',
      validator: { id: 'durable-artifact-path', status: 'invalid' },
      diagnostics: [expect.objectContaining({ code: 'runtime-artifact-path-rejected' })],
    });
    expect(fact?.relativePath).toBeUndefined();
  });

  it('classifies durable project revision identity from ResourceRef metadata', () => {
    const [fact] = projectToolResultArtifactFacts(
      {
        success: true,
        attachments: [
          {
            type: 'image',
            path: 'projects/story/output.png',
            assetRef: {
              assetId: 'project-output',
              uri: 'projects/story/output.png',
              mimeType: 'image/png',
              resourceRef: {
                id: 'resource:project:story:rev-3',
                scope: 'project',
                provider: 'story-project',
                kind: 'generated',
                source: {
                  kind: 'generated-asset',
                  generatedAssetId: 'project-output',
                  metadata: { projectRevision: 'rev-3', contentDigest: 'sha256:project' },
                },
                fingerprint: { strategy: 'hash', value: 'sha256:project' },
              },
            },
          },
        ],
      },
      'tool-call-project',
    );
    expect(fact).toMatchObject({
      kind: 'project-revision',
      revision: 'rev-3',
      digest: 'sha256:project',
      validator: { status: 'valid' },
    });
  });

  it('hashes and validates composite artifact snapshots without Market identity', () => {
    const [fact] = projectToolResultArtifactFacts(
      {
        success: true,
        artifacts: [
          {
            type: 'artifactSnapshot',
            artifact: {
              schemaVersion: 1,
              kind: 'composite-artifact',
              artifactId: 'artifact-1',
              title: 'Storyboard',
              blocks: [],
              provenance: {
                source: 'skill',
                skillId: 'storyboard',
                skillVersion: 'market-version-must-not-project',
                packageId: 'market-package-must-not-project',
                toolCallId: 'tool-call-1',
              },
            },
          },
        ],
      },
      'tool-call-1',
    );
    expect(fact).toMatchObject({
      ref: 'artifact-1',
      kind: 'composite-artifact',
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      provenance: { source: 'skill', skillId: 'storyboard', toolCallId: 'tool-call-1' },
      validator: { id: 'composite-artifact-schema', status: 'valid' },
    });
    expect(JSON.stringify(fact)).not.toContain('market-version-must-not-project');
    expect(JSON.stringify(fact)).not.toContain('market-package-must-not-project');
  });
});

describe('projectGeneratedOutputLifecycleArtifactFacts', () => {
  it('projects delivered generated-output locator evidence without Host paths', () => {
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:content',
      contentPath: 'neko/generated/image/generated-1.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-1', providerId: 'image-provider' },
    });

    expect(projectGeneratedOutputLifecycleArtifactFacts([lifecycle])).toEqual([
      expect.objectContaining({
        ref: lifecycle.assetId,
        kind: 'generated-asset',
        contentLocator: lifecycle.contentLocator,
        digest: 'sha256:content',
        revision: lifecycle.revision,
        provenance: expect.objectContaining({
          source: 'generated-output',
          operationId: 'operation-1',
          providerId: 'image-provider',
        }),
        deliveryStatus: 'delivered',
        validator: { id: 'content-locator', status: 'valid' },
      }),
    ]);
    expect(JSON.stringify(projectGeneratedOutputLifecycleArtifactFacts([lifecycle]))).not.toContain(
      '/private/',
    );
  });
});
