import { describe, expect, it } from 'vitest';
import {
  projectStoryboardScenesAssetBatch,
  projectStoryboardTableAssetBatch,
  projectStoryboardTableCanvasAuthoringHandoff,
  projectStoryboardTableCutTimelinePayload,
} from '../storyboard-transfer-presenter';
import type { StoryboardTableRichData } from '../composite-content-presenter';

describe('storyboard transfer presenter', () => {
  it('projects storyboard scenes to an image asset batch', () => {
    expect(
      projectStoryboardScenesAssetBatch([
        {
          sceneIndex: 2,
          heading: 'EXT. STREET - NIGHT',
          shots: [
            {
              url: 'webview://shot-1.png',
              localPath: '${WORKSPACE}/shots/shot-1.png',
              shotIndex: 1,
            },
            { url: 'webview://shot-2.png', shotIndex: 2 },
          ],
        },
      ]),
    ).toEqual({
      kind: 'assetBatch',
      assets: [
        {
          path: '${WORKSPACE}/shots/shot-1.png',
          mediaType: 'image',
          name: 'scene-2-shot-1',
        },
      ],
    });
  });

  it('does not transfer scene cache paths as image assets', () => {
    const scenes = [
      {
        sceneIndex: 2,
        heading: 'EXT. STREET - NIGHT',
        shots: [
          {
            url: 'webview://shot-1.png',
            localPath: '/repo/.neko/.cache/generated/shot-1.png',
            shotIndex: 1,
          },
          {
            url: 'webview://shot-2.png',
            localPath: 'blob:webview-shot-2',
            shotIndex: 2,
          },
        ],
      },
    ];

    expect(projectStoryboardScenesAssetBatch(scenes)).toBeNull();
  });

  it('does not project composite-only storyboard sections to cut storyboard payloads', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          content: 'Wide establishing frame',
          media: [
            {
              id: 'media-1',
              toolCallId: 'call-1',
              assetIndex: 0,
              type: 'image',
              src: 'webview://asset.png',
              stableUri: '${WORKSPACE}/assets/asset.png',
              caption: 'Wide',
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    expect(projectStoryboardTableAssetBatch(data)).toEqual({
      kind: 'assetBatch',
      assets: [{ path: '${WORKSPACE}/assets/asset.png', mediaType: 'image', name: 'Wide' }],
    });

    expect(projectStoryboardTableCutTimelinePayload(data)).toBeNull();
  });

  it('projects typed storyboard tables to cut storyboard payloads', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Opening',
      diagnostics: [],
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        title: 'Opening',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Opening',
            shots: [
              {
                shotNumber: 1,
                duration: 4,
                visualDescription: 'Wide establishing frame',
                characterAction: 'The character looks across the hallway.',
                imageStrategy: 'reuse-original',
                mediaRefs: [
                  {
                    refId: 'asset-1',
                    role: 'source',
                    locator: {
                      type: 'workspace-path',
                      path: '${WORKSPACE}/assets/asset.png',
                    },
                    mimeType: 'image/png',
                  },
                ],
              },
            ],
          },
        ],
      },
      sections: [
        {
          id: 'section-0',
          index: 0,
          heading: 'Shot 1',
          content: 'Wide establishing frame',
          media: [
            {
              id: 'media-1',
              toolCallId: 'readimage-current-result',
              assetIndex: 0,
              assetId: 'asset-1',
              type: 'image',
              src: 'webview://asset.png',
              stableUri: '${WORKSPACE}/assets/asset.png',
              caption: 'Wide',
            },
          ],
          diagnostics: [],
        },
      ],
    };

    expect(projectStoryboardTableCutTimelinePayload(data)).toEqual({
      kind: 'cutStoryboard',
      storyboard: {
        projectName: 'Opening',
        shots: [
          {
            id: 'scene-1-shot-1',
            shotNumber: 1,
            duration: 4,
            imagePath: '${WORKSPACE}/assets/asset.png',
            label: '#001 Opening',
          },
        ],
      },
    });
  });

  it('projects canonical storyboard hierarchy and stable image refs to Canvas without asset flattening', () => {
    const data: StoryboardTableRichData = {
      template: 'storyboard-table',
      title: 'Two Scenes',
      diagnostics: [],
      storyboardTable: {
        schemaVersion: 1,
        kind: 'storyboard-table',
        contractVersion: 1,
        sourceProfile: 'from-script',
        sourceTrace: [
          {
            traceId: 'trace-script-1',
            sourceProfile: 'from-script',
            sourceRef: {
              id: 'resource-script-source',
              scope: 'project',
              provider: 'workspace',
              kind: 'document',
              source: { kind: 'file', projectRelativePath: 'scripts/story.md' },
              locator: { kind: 'file', path: '${WORKSPACE}/scripts/story.md' },
              fingerprint: { strategy: 'hash', value: 'sha256:story-source' },
            },
          },
        ],
        revision: {
          revisionId: 'storyboard-rev-1',
          sequence: 1,
          contentDigest: 'sha256:storyboard-rev-1',
          createdAt: '2026-07-12T00:00:00.000Z',
        },
        title: 'Two Scenes',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Hallway',
            shots: [
              {
                shotId: 'shot-1',
                shotNumber: 1,
                duration: 3,
                visualDescription: 'A cat enters the hallway.',
                characterAction: 'The cat pads forward.',
                imageStrategy: 'use-as-reference',
                imagePrompt: 'orange cat in a sunlit hallway',
                videoPrompt: 'The cat enters, pauses, then looks toward the next room.',
                sourceMediaRefs: [
                  {
                    refId: 'source-image-1',
                    role: 'source',
                    locator: { type: 'workspace-path', path: '${WORKSPACE}/assets/cat.png' },
                    resourceRef: {
                      id: 'resource-cat-source',
                      scope: 'project',
                      provider: 'workspace',
                      kind: 'media',
                      source: {
                        kind: 'file',
                        projectRelativePath: 'assets/cat.png',
                      },
                      locator: { kind: 'file', path: '${WORKSPACE}/assets/cat.png' },
                      fingerprint: { strategy: 'hash', value: 'sha256:cat-source' },
                    },
                  },
                ],
              },
              {
                shotId: 'shot-2',
                shotNumber: 2,
                duration: 2,
                visualDescription: 'The cat bats a toy.',
                characterAction: 'The cat jumps.',
                imageStrategy: 'generate-new',
                imagePrompt: 'orange cat jumping after a red toy',
                generatedMediaRefs: [
                  {
                    refId: 'generated-image-2',
                    role: 'generated',
                    locator: { type: 'asset', assetId: 'generated-image-2' },
                    resourceRef: {
                      id: 'resource-cat-generated',
                      scope: 'project',
                      provider: 'generated-assets',
                      kind: 'generated',
                      source: { kind: 'generated-asset', generatedAssetId: 'generated-image-2' },
                      locator: { kind: 'generated-asset', assetId: 'generated-image-2' },
                      fingerprint: { strategy: 'provider', value: 'generated-image-2' },
                    },
                  },
                ],
              },
            ],
          },
          {
            sceneId: 'scene-2',
            sceneTitle: 'Living Room',
            shots: [
              {
                shotId: 'shot-3',
                shotNumber: 1,
                duration: 4,
                visualDescription: 'The cat lands on a rug.',
                characterAction: 'The cat rolls over.',
                imageStrategy: 'generate-new',
                imagePrompt: 'orange cat rolling on a living room rug',
              },
            ],
          },
        ],
      },
      sections: [],
    };

    const handoff = projectStoryboardTableCanvasAuthoringHandoff(data);

    expect(handoff).toMatchObject({
      sourceKind: 'structured-content',
      sourceFormat: 'composite-artifact',
      canonicalStoryboard: {
        revision: { revisionId: 'storyboard-rev-1' },
        scenes: [
          {
            sceneId: 'scene-1',
            shots: [
              {
                shotId: 'shot-1',
                imagePrompt: 'orange cat in a sunlit hallway',
                videoPrompt: 'The cat enters, pauses, then looks toward the next room.',
                sourceMediaRefs: [
                  expect.objectContaining({
                    refId: 'source-image-1',
                    resourceRef: expect.objectContaining({ id: 'resource-cat-source' }),
                  }),
                ],
              },
              {
                shotId: 'shot-2',
                generatedMediaRefs: [
                  expect.objectContaining({
                    refId: 'generated-image-2',
                    resourceRef: expect.objectContaining({ id: 'resource-cat-generated' }),
                  }),
                ],
              },
            ],
          },
          { sceneId: 'scene-2', shots: [{ shotId: 'shot-3' }] },
        ],
      },
    });
    expect(handoff).not.toHaveProperty('kind', 'assetBatch');
    expect(JSON.stringify(handoff)).not.toMatch(/vscode-webview:|blob:|\.neko\/.cache/);
  });

  it('poisons old Markdown storyboard compiler transfer paths for new Canvas requests', async () => {
    const moduleExports = (await import('../storyboard-transfer-presenter')) as Record<
      string,
      unknown
    >;
    expect(moduleExports.projectStoryboardScenesCutTimelinePayload).toBeUndefined();
    expect(moduleExports.projectMarkdownStoryboardTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasTransferPayload).toBeUndefined();
    expect(moduleExports.projectAssistantMarkdownCanvasDraftPayload).toBeUndefined();
  });
});
