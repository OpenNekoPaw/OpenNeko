import { describe, expect, it } from 'vitest';
import type { CanvasNode, GalleryCanvasNode, TableCanvasNode } from '@neko/shared';
import {
  CANVAS_AGENT_CHILD_PRESETS,
  CANVAS_AGENT_CONTAINER_PRESETS,
  CANVAS_AGENT_NODE_PRESETS,
  createResourceFingerprint,
  createResourceRef,
  getBuiltInCanvasNodePresetMetadata,
  getDefaultCanvasNodePresetName,
} from '@neko/shared';
import { buildCanvasNode } from './nodeFactory';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from './canvasPresetRegistry';

describe('nodeFactory gallery container', () => {
  it('creates gallery node without inline cells', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 3,
      },
    });

    expect(node.type).toBe('gallery');
    const galleryNode = node as GalleryCanvasNode;
    expect(galleryNode.data.preset).toBe('character-3view');
    expect(galleryNode.data.cols).toBe(3);
    expect(galleryNode.data.rows).toBe(1);
    expect('cells' in galleryNode.data).toBe(false);
  });

  it('preserves characterProfile data', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 3,
        characterProfile: {
          description: 'A tall elf',
          tags: ['elf', 'tall'],
        },
      },
    });

    const galleryNode = node as GalleryCanvasNode;
    expect(galleryNode.data.characterProfile).toEqual({
      description: 'A tall elf',
      tags: ['elf', 'tall'],
    });
  });
});

describe('nodeFactory composable presets', () => {
  it('preserves Canvas-owned Markdown table review metadata', () => {
    const node = buildCanvasNode({
      type: 'table',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'table.basic',
      data: {
        label: 'Storyboard Draft',
        columnCount: 2,
        rowCount: 1,
        showHeader: true,
        markdown: {
          sourceFormat: 'gfm-table',
          rows: [{ rowIndex: 0, cells: { scene: 'Opening', prompt: 'neon door' } }],
          diagnostics: [{ severity: 'info', code: 'review', message: 'Needs review' }],
        },
      },
    });

    expect(node.type).toBe('table');
    const tableNode = node as TableCanvasNode;
    expect(tableNode.data.markdown).toEqual({
      sourceFormat: 'gfm-table',
      rows: [{ rowIndex: 0, cells: { scene: 'Opening', prompt: 'neon door' } }],
      diagnostics: [{ severity: 'info', code: 'review', message: 'Needs review' }],
    });
  });

  it('creates narrative start and ending nodes with default data', () => {
    const start = buildCanvasNode({
      type: 'narrative-start',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {},
    });
    const ending = buildCanvasNode({
      type: 'narrative-ending',
      position: { x: 0, y: 120 },
      zIndex: 1,
      data: {},
    });

    expect(start).toMatchObject({
      type: 'narrative-start',
      size: { width: 200, height: 100 },
      data: { label: 'Start', description: '' },
    });
    expect(ending).toMatchObject({
      type: 'narrative-ending',
      size: { width: 220, height: 110 },
      data: { endingType: 'normal', endingLabel: 'Ending', statisticsSummary: true },
    });
  });

  it('registers migrated core presets without legacy core escape hatches', () => {
    expect(getBuiltInCanvasNodePresetMetadata('shot.basic')).toMatchObject({
      nodeType: 'shot',
    });
    expect(getBuiltInCanvasNodePresetMetadata('scene.basic')).toMatchObject({
      nodeType: 'scene',
      containerPolicy: 'scene',
    });
    expect(getBuiltInCanvasNodePresetMetadata('gallery.basic')).toMatchObject({
      nodeType: 'gallery',
    });
    expect(getBuiltInCanvasNodePresetMetadata('media.basic')).toMatchObject({
      nodeType: 'media',
    });
    expect(getBuiltInCanvasNodePresetMetadata('project.basic')).toMatchObject({
      nodeType: 'project',
    });
    expect(getBuiltInCanvasNodePresetMetadata('annotation.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('text.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('shot.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('scene.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('gallery.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('media.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('storyboard.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('script.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('document.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('model.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('canvas-embed.legacy')).toBeUndefined();
    expect(CANVAS_AGENT_NODE_PRESETS).toContain('shot.basic');
    expect(CANVAS_AGENT_NODE_PRESETS).toContain('project.basic');
    expect(CANVAS_AGENT_NODE_PRESETS).not.toContain('annotation.legacy');
    expect(CANVAS_AGENT_NODE_PRESETS).not.toContain('text.legacy');
    expect(CANVAS_AGENT_NODE_PRESETS).not.toContain('shot.legacy');
    expect(CANVAS_AGENT_NODE_PRESETS).not.toContain('storyboard.legacy');
    expect(CANVAS_AGENT_CHILD_PRESETS).toContain('gallery.basic');
    expect(CANVAS_AGENT_CONTAINER_PRESETS).toContain('scene.basic');
    expect(getDefaultCanvasNodePresetName('project')).toBe('project.basic');
    expect(getDefaultCanvasNodePresetName('group')).toBe('group.container');
  });

  it('adds composable content for the low-risk annotation preset', () => {
    const node = buildCanvasNode({
      type: 'annotation',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'annotation.basic',
      data: { content: 'Draft note' },
    });

    expect(node.type).toBe('annotation');
    expect(node.preset).toBe('annotation.basic');
    expect(node.content?.blocks?.[0]?.binding?.path).toBe('/content');
  });

  it('rejects removed core legacy presets', () => {
    expect(() =>
      buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.legacy',
        data: { visualDescription: 'Legacy shot' },
      }),
    ).toThrow(/Unsupported preset/);
  });

  it('applies the migrated shot preset without moving authored data out of node.data', () => {
    const node = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'shot.basic',
      data: {
        shotNumber: 7,
        visualDescription: 'A bright doorway',
        referenceImagePath: 'assets/reference.png',
        generationPrompt: 'animated doorway',
        visualStyle: 'noir',
        vfx: ['glow'],
        textCues: [{ cueId: 'text-1', kind: 'caption', text: 'Doorway' }],
        voiceCues: [{ cueId: 'voice-1', kind: 'voiceOver', text: 'The door opens.' }],
        visualOccurrences: [
          {
            schemaVersion: 1,
            kind: 'visual-occurrence',
            occurrenceId: 'occ-1',
            sourceRef: { kind: 'asset', assetId: 'page-1' },
            appearanceText: 'Mika in a red coat',
            confidence: 0.74,
            reviewState: 'needs-review',
          },
        ],
        characterCandidates: [
          {
            candidateId: 'candidate-1',
            entityRef: { entityId: 'char-mika', entityKind: 'character' },
            displayName: 'Mika',
            confidence: 0.8,
          },
        ],
        continuityDiagnostics: [
          {
            severity: 'warning',
            code: 'conflict',
            path: ['characters', 0],
            message: 'Outfit differs from previous panel.',
          },
        ],
        batchExecutionPlan: {
          schemaVersion: 1,
          kind: 'batch-execution-plan',
          planId: 'batch-1',
          targetDomain: 'asset-indexing',
          items: [
            {
              itemId: 'item-1',
              targetRef: 'page-1',
              capabilityId: 'perception.ocr',
              status: 'blocked',
              providerId: 'local-ocr',
            },
          ],
          approvalPolicy: { mode: 'explicit' },
          executionPolicy: { maxConcurrency: 1 },
          status: 'needs-approval',
        },
        sourceMediaRefs: [
          {
            refId: 'source-1',
            role: 'source',
            locator: { type: 'tool-result', toolCallId: 'readimage', assetIndex: 0 },
          },
        ],
        generatedImage: 'assets/shot-7.png',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'assets/shot-7.png',
            prompt: 'doorway',
            timestamp: 1,
            selected: true,
          },
        ],
      },
    });

    expect(node.type).toBe('shot');
    expect(node.preset).toBe('shot.basic');
    expect(node.content?.sections?.some((section) => section.id === 'shot-controls')).toBe(true);
    expect(node.content?.sections?.some((section) => section.id === 'shot-preview')).toBe(true);
    expect(
      node.content?.sections?.find((section) => section.id === 'shot-generation'),
    ).toMatchObject({
      defaultCollapsed: true,
    });
    expect(node.content?.sections?.find((section) => section.id === 'shot-media')).toMatchObject({
      defaultCollapsed: true,
    });
    expect(node.preview).toMatchObject({
      title: 'Shot 7',
      subtitle: 'A bright doorway',
      role: 'generation-candidate',
      thumbnailVariantId: 'candidate-1',
      metadata: {
        selectedAssetId: undefined,
      },
    });
    expect(node.preview?.nodeId).toBe('');
    expect(node.ports?.[0]?.id).toBe('img-out');
    if (node.type !== 'shot') {
      throw new Error('Expected shot node');
    }
    expect(node.data.visualDescription).toBe('A bright doorway');
    expect(node.data.referenceImagePath).toBe('assets/reference.png');
    expect(node.data.generationPrompt).toBe('animated doorway');
    expect(node.data.visualStyle).toBe('noir');
    expect(node.data.vfx).toEqual(['glow']);
    expect(node.data.textCues).toEqual([{ cueId: 'text-1', kind: 'caption', text: 'Doorway' }]);
    expect(node.data.voiceCues).toEqual([
      { cueId: 'voice-1', kind: 'voiceOver', text: 'The door opens.' },
    ]);
    expect(node.data.visualOccurrences?.[0]).toMatchObject({
      occurrenceId: 'occ-1',
      appearanceText: 'Mika in a red coat',
      reviewState: 'needs-review',
    });
    expect(node.data.characterCandidates?.[0]).toMatchObject({
      candidateId: 'candidate-1',
      displayName: 'Mika',
    });
    expect(node.data.continuityDiagnostics?.[0]).toMatchObject({
      code: 'conflict',
      message: 'Outfit differs from previous panel.',
    });
    expect(node.data.batchExecutionPlan).toMatchObject({
      planId: 'batch-1',
      targetDomain: 'asset-indexing',
      status: 'needs-approval',
    });
    expect(node.data.sourceMediaRefs).toEqual([
      {
        refId: 'source-1',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'readimage', assetIndex: 0 },
      },
    ]);
  });

  it('applies the migrated scene preset with container capability and child slot content', () => {
    const node = buildCanvasNode({
      type: 'scene',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'scene.basic',
      data: {
        sceneTitle: 'Arrival',
        sceneNumber: 2,
        location: 'Station',
        timeOfDay: 'Night',
      },
    });

    expect(node.type).toBe('scene');
    expect(node.preset).toBe('scene.basic');
    expect(node.container).toMatchObject({
      policy: 'scene',
      childIds: [],
      layout: { mode: 'sequence' },
      acceptedChildren: { nodeTypes: ['shot'] },
    });
    expect(node.content?.childSlots?.[0]).toMatchObject({
      id: 'scene-children',
      summaryRole: 'node-summary',
      filter: { nodeTypes: ['shot'] },
    });
    expect(node.preview).toMatchObject({
      title: 'Arrival',
      subtitle: 'Station · Night',
      role: 'node-summary',
    });
  });

  it('applies the migrated gallery preset with childSlots and container metadata', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'gallery.basic',
      data: {
        characterName: 'Mika',
        preset: 'character-3view',
        rows: 1,
        cols: 3,
      },
    });

    expect(node.type).toBe('gallery');
    expect(node.preset).toBe('gallery.basic');
    const contentSection = node.content?.sections?.find((s) => s.id === 'gallery-content');
    const childSlot = contentSection?.childSlots?.find((s) => s.id === 'gallery-children');
    expect(childSlot).toBeDefined();
    expect(childSlot?.layout).toBe('gallery');
    expect(node.container?.policy).toBe('gallery');
    expect(node.preview).toMatchObject({
      title: 'Mika',
      role: 'collection',
    });
  });

  it('applies the group container preset by default with child slot content', () => {
    const node = buildCanvasNode({
      type: 'group',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        label: 'Review',
      },
    });

    expect(node.type).toBe('group');
    expect(node.preset).toBe('group.container');
    expect(node.container).toMatchObject({
      policy: 'group',
      childIds: [],
      deleteBehavior: 'release-children',
    });
    expect(node.content?.childSlots?.[0]).toMatchObject({
      id: 'group-children',
      summaryRole: 'node-summary',
    });
    expect(node.preview).toMatchObject({
      title: 'Review',
      role: 'node-summary',
    });
  });

  it('refreshes migrated preview descriptors from authoritative node data', () => {
    const node = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Initial',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'blob:runtime-url',
              prompt: 'initial',
              timestamp: 1,
              selected: true,
              assetId: 'asset-1',
            },
          ],
        },
      }),
      id: 'shot-3',
    } as CanvasNode);

    const refreshed = refreshCanvasNodePreview({
      ...node,
      data: {
        ...node.data,
        visualDescription: 'Updated',
        generationHistory: [
          {
            id: 'candidate-2',
            dataUrl: 'blob:runtime-url-2',
            prompt: 'updated',
            timestamp: 2,
            selected: true,
            assetId: 'asset-2',
          },
        ],
      },
    } as CanvasNode);

    expect(refreshed.preview).toMatchObject({
      nodeId: 'shot-3',
      title: 'Shot 3',
      subtitle: 'Updated',
      thumbnailVariantId: 'candidate-2',
      metadata: {
        selectedAssetId: 'asset-2',
      },
    });
    expect(JSON.stringify(refreshed.preview)).not.toContain('blob:runtime-url');
  });

  it('keeps Gallery and Media previews stable without runtime URLs', () => {
    const gallery = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-1',
      container: {
        policy: 'gallery',
        childIds: ['child-1', 'child-2'],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
      },
    } as CanvasNode);
    const media = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: 'assets/ref.png',
          thumbnailPath: 'assets/thumb.png',
          mediaType: 'image',
        },
      }),
      id: 'media-1',
    } as CanvasNode);

    expect(gallery.preview).toMatchObject({
      nodeId: 'gallery-1',
      title: 'Mika',
      role: 'collection',
    });
    expect(media.preview).toMatchObject({
      nodeId: 'media-1',
      title: 'ref.png',
      thumbnailVariantId: 'assets/thumb.png',
      role: 'image',
    });
    expect(JSON.stringify(media.preview)).not.toContain('blob:runtime');
  });

  it('keeps document-linked media references stable while carrying runtime preview paths', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export' as const,
    };
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        document: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        filePath: '${BOOKS}/comic.epub',
      },
      locator: { kind: 'document', entryPath: 'image/page-1.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic:image/page-1.jpg',
        providerId: 'document-archive',
      }),
    });

    const media = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: '',
          documentResourceRef,
          resourceRef,
          runtimeAssetPath:
            'https://file+.vscode-resource.vscode-cdn.net/workspace/.neko/.cache/resources/documents/doc_demo/5289df737df57326fcdd22597afb1fac.jpg',
          mediaType: 'image',
        },
      }),
      id: 'media-doc-entry',
    } as CanvasNode);

    expect(media.data).toMatchObject({
      assetPath: '',
      documentResourceRef,
      resourceRef,
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/workspace/.neko/.cache/resources/documents/doc_demo/5289df737df57326fcdd22597afb1fac.jpg',
    });
    expect(media.preview).toMatchObject({
      title: 'page-1.jpg',
      capabilities: [
        expect.objectContaining({
          kind: 'asset-identity',
          path: undefined,
        }),
        expect.objectContaining({ kind: 'preview' }),
      ],
      metadata: { documentResourceRef, resourceRef },
    });
    expect(media.preview?.capabilities?.[0]).not.toHaveProperty('uri');
    expect(JSON.stringify(media.preview)).not.toContain('vscode-resource.vscode-cdn.net');
  });

  it('applies the migrated media preset with asset preview capability', () => {
    const node = buildCanvasNode({
      type: 'media',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'media.basic',
      data: {
        assetPath: 'assets/ref.png',
        mediaType: 'image',
      },
    });

    expect(node.type).toBe('media');
    expect(node.preset).toBe('media.basic');
    expect(node.content?.sections?.[0]?.blocks?.[0]).toMatchObject({
      id: 'media-asset-preview',
      kind: 'asset-preview',
      binding: { path: '/assetPath' },
      metadata: {
        alternateResourceRefPaths: ['/documentResourceRef', '/resourceRef'],
      },
    });
    expect(node.preview).toMatchObject({
      title: 'ref.png',
      subtitle: 'image',
      role: 'image',
    });
  });

  it('applies the migrated project preset by default with asset preview capability', () => {
    const node = buildCanvasNode({
      type: 'project',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        projectPath: 'projects/demo.nkv',
        projectTitle: 'Demo',
        projectType: 'nkv',
      },
    });

    expect(node.type).toBe('project');
    expect(node.preset).toBe('project.basic');
    expect(node.content?.sections?.[0]?.blocks?.[0]).toMatchObject({
      id: 'project-asset-preview',
      kind: 'asset-preview',
      binding: { path: '/projectPath' },
    });
    expect(node.preview).toMatchObject({
      title: 'Demo',
      subtitle: 'nkv',
      role: 'project-thumbnail',
    });
  });

  it('hydrates preset preview descriptors with the real node id at creation boundary', () => {
    const node = buildCanvasNode({
      type: 'media',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'media.basic',
      data: { assetPath: 'assets/ref.png', mediaType: 'image' },
    });

    const hydrated = hydrateCanvasNodePreview({ ...node, id: 'media-1' } as CanvasNode);

    expect(hydrated.preview?.nodeId).toBe('media-1');
  });

  it('rejects unknown presets so API callers get typed failures', () => {
    expect(() =>
      buildCanvasNode({
        type: 'annotation',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'unknown.preset',
        data: { content: 'Legacy note' },
      }),
    ).toThrow(/Unsupported preset/);
  });
});
