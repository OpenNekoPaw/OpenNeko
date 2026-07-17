import { describe, expect, it } from 'vitest';
import {
  projectGeneratedOutputLifecycleArtifactFacts,
  projectTaskOutputArtifactFacts,
  projectToolResultArtifactFacts,
} from './artifact-fact-projector';
import { createGeneratedAssetRevisionRef } from '@neko/shared';

describe('projectToolResultArtifactFacts', () => {
  it('projects durable generated ResourceRef identity, digest, revision, and provenance', () => {
    const [fact] = projectToolResultArtifactFacts(
      {
        success: true,
        attachments: [
          {
            type: 'image',
            path: '/tmp/runtime-preview.png',
            mimeType: 'image/png',
            assetRef: {
              assetId: 'asset-1',
              uri: 'assets/generated/cat.png',
              mimeType: 'image/png',
              resourceRef: {
                id: 'resource:asset-1:rev-1',
                scope: 'project',
                provider: 'generated-asset',
                kind: 'generated',
                source: {
                  kind: 'generated-asset',
                  generatedAssetId: 'asset-1',
                  metadata: { revision: 'rev-1', contentDigest: 'sha256:content' },
                },
                locator: { kind: 'generated-asset', assetId: 'asset-1' },
                fingerprint: { strategy: 'hash', value: 'sha256:content' },
              },
            },
          },
        ],
      },
      'tool-call-1',
    );
    expect(fact).toEqual(
      expect.objectContaining({
        ref: 'resource:asset-1:rev-1',
        kind: 'generated-asset',
        digest: 'sha256:content',
        revision: 'rev-1',
        provenance: expect.objectContaining({
          source: 'generated-asset',
          toolCallId: 'tool-call-1',
          providerId: 'generated-asset',
        }),
        deliveryStatus: 'delivered',
        validator: { id: 'durable-resource-ref', status: 'valid' },
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

describe('projectTaskOutputArtifactFacts', () => {
  it('projects a revision-bound generated-output identity without exposing its local path', () => {
    const [fact] = projectTaskOutputArtifactFacts([
      {
        scope: {
          conversationId: 'conversation-1',
          runId: 'run-1',
          parentRunId: 'run-1',
          childRunId: 'task-1',
          childKind: 'task',
        },
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        input: { type: 'image_generation', payload: {} },
        output: {
          data: {
            assets: [
              {
                id: 'generated-1',
                localPath: '/private/runtime/generated-1.png',
                resourceRef: {
                  id: 'resource:generated-1:rev-1',
                  scope: 'project',
                  provider: 'generated-asset',
                  kind: 'generated',
                  source: {
                    kind: 'generated-asset',
                    generatedAssetId: 'generated-1',
                    metadata: { revision: 'rev-1', contentDigest: 'sha256:content' },
                  },
                  locator: { kind: 'generated-asset', assetId: 'generated-1' },
                  fingerprint: { strategy: 'hash', value: 'sha256:content' },
                },
              },
            ],
          },
        },
        progress: 100,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    expect(fact).toMatchObject({
      ref: 'resource:generated-1:rev-1',
      kind: 'generated-asset',
      digest: 'sha256:content',
      revision: 'rev-1',
      provenance: {
        source: 'generated-asset',
        taskId: 'task-1',
        providerId: 'generated-asset',
      },
      deliveryStatus: 'delivered',
      validator: { id: 'durable-resource-ref', status: 'valid' },
    });
    expect(JSON.stringify(fact)).not.toContain('/private/runtime');
  });
});

describe('projectGeneratedOutputLifecycleArtifactFacts', () => {
  it('projects delivered stable resource evidence without Host paths', () => {
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:content',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1', providerId: 'image-provider' },
    });

    expect(projectGeneratedOutputLifecycleArtifactFacts([lifecycle])).toEqual([
      expect.objectContaining({
        ref: lifecycle.resourceRef.id,
        kind: 'generated-asset',
        digest: 'sha256:content',
        revision: lifecycle.revision,
        provenance: expect.objectContaining({
          source: 'generated-asset',
          taskId: 'task-1',
        }),
        deliveryStatus: 'delivered',
        validator: { id: 'durable-resource-ref', status: 'valid' },
      }),
    ]);
    expect(JSON.stringify(projectGeneratedOutputLifecycleArtifactFacts([lifecycle]))).not.toContain(
      '/private/',
    );
  });
});
