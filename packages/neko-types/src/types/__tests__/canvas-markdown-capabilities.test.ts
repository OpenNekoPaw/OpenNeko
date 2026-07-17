import { describe, expect, it } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  isCanvasCreativeTableFieldRole,
  isCanvasMarkdownCapabilityInput,
  isCanvasMarkdownCapabilityResult,
  isCanvasMarkdownIngestIntent,
  isCanvasMarkdownResolvedKind,
  isRuntimeOnlyCanvasMarkdownResourceValue,
  validateCanvasMarkdownCapabilityInput,
  type CanvasMarkdownCapabilityInput,
  type CanvasMarkdownCapabilityResult,
  type DocumentArchiveResourceRef,
  type ResourceRef,
} from '../index';

describe('canvas markdown capability contracts', () => {
  const resourceRef = createTestResourceRef();
  const documentResourceRef = createTestDocumentResourceRef();

  it('accepts a unified Markdown ingest input with creative table hints', () => {
    const input: CanvasMarkdownCapabilityInput = {
      capabilityId: 'canvas.ingestMarkdown',
      markdown: '| source | prompt | action |\n| --- | --- | --- |\n| P1 | neon door | review |',
      title: 'Creative Plan',
      sourceFormat: 'gfm-table',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      resources: [{ token: 'P1', resourceRef }],
      provenance: { source: 'webview', label: 'assistant-markdown-block' },
    };

    expect(validateCanvasMarkdownCapabilityInput(input)).toEqual([]);
    expect(isCanvasMarkdownCapabilityInput(input)).toBe(true);
    expect(isCanvasMarkdownIngestIntent(input.intentHint)).toBe(true);
    expect(isCanvasMarkdownResolvedKind('creative-table')).toBe(true);
    expect(isCanvasCreativeTableFieldRole('plan')).toBe(true);
  });

  it('accepts a supported storyboard operation hint', () => {
    const input: CanvasMarkdownCapabilityInput = {
      capabilityId: 'canvas.validateMarkdownStoryboard',
      markdown: [
        '| scene | shot | videoPrompt |',
        '| --- | --- | --- |',
        '| Opening | 1 | slow reveal |',
      ].join('\n'),
      operationHint: 'video.scene.generate',
    };

    expect(validateCanvasMarkdownCapabilityInput(input)).toEqual([]);
    expect(isCanvasMarkdownCapabilityInput(input)).toBe(true);
  });

  it('accepts a valid Markdown note capability input with stable resources', () => {
    const input: CanvasMarkdownCapabilityInput = {
      capabilityId: 'canvas.createMarkdownNote',
      markdown: '## Plan\n\n![cover](assets/cover.png)',
      title: 'Plan',
      sourceFormat: 'markdown',
      target: {
        containerId: 'board-1',
        insertionPoint: { x: 100, y: 120 },
        mode: 'insert',
      },
      resources: [
        {
          token: 'cover',
          label: 'Cover',
          role: 'reference',
          sourcePath: 'assets/cover.png',
          resourceRef,
        },
        {
          token: 'P1',
          label: 'Page 1',
          documentResourceRef,
        },
      ],
      provenance: {
        source: 'agent',
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
    };

    expect(validateCanvasMarkdownCapabilityInput(input)).toEqual([]);
    expect(isCanvasMarkdownCapabilityInput(input)).toBe(true);
  });

  it('accepts attachResource input without markdown', () => {
    const input: CanvasMarkdownCapabilityInput = {
      capabilityId: 'canvas.attachResource',
      target: { nodeId: 'shot-1', mode: 'apply' },
      resource: {
        token: 'cover',
        resourceRef,
      },
      role: 'reference',
    };

    expect(validateCanvasMarkdownCapabilityInput(input)).toEqual([]);
    expect(isCanvasMarkdownCapabilityInput(input)).toBe(true);
  });

  it('diagnoses unknown capability and unsupported source format', () => {
    const unknownCapability = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.createEverything',
      markdown: 'hello',
    });
    const removedStoryboardDraftCapability = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
      markdown: '| scene | shot |\n| --- | --- |\n| Opening | 1 |',
    });
    const unsupportedFormat = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.createMarkdownNote',
      markdown: 'hello',
      sourceFormat: 'html',
    });

    expect(unknownCapability.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-unknown-capability',
    ]);
    expect(removedStoryboardDraftCapability.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-unknown-capability',
    ]);
    expect(unsupportedFormat.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-unsupported-source-format',
    ]);
  });

  it('diagnoses unsupported operation hints', () => {
    const diagnostics = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.validateMarkdownStoryboard',
      markdown: '| scene | shot |\n| --- | --- |\n| Opening | 1 |',
      operationHint: 'video.remote.unknown',
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-unsupported-operation-hint',
        fieldKey: 'operationHint',
      }),
    ]);
  });

  it('diagnoses unsupported ingest intent hints', () => {
    const diagnostics = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.ingestMarkdown',
      markdown: '| A |\n| --- |\n| value |',
      intentHint: 'execute-immediately',
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-unsupported-ingest-intent',
    ]);
  });

  it('rejects runtime-only resource identity and missing stable refs', () => {
    const diagnostics = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.ingestMarkdown',
      markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      resources: [
        {
          token: 'vscode-webview://panel/image.png',
          sourcePath: '/workspace/.neko/.cache/resources/page.png',
        },
        {
          token: 'P2',
        },
        {
          token: 'P3',
          sourcePath: '/var/folders/tmp/page.png',
        },
      ],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-runtime-resource-token',
      'canvas-markdown-runtime-resource-path',
      'canvas-markdown-missing-stable-resource',
      'canvas-markdown-runtime-resource-path',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.resourceIndex)).toEqual([0, 0, 1, 2]);
  });

  it('classifies runtime-only resource values', () => {
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('vscode-webview://panel/image.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('blob:vscode/preview')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/tmp/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/var/folders/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/workspace/.neko/.cache/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('assets/cover.png')).toBe(false);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('${MEDIA}/cover.png')).toBe(false);
  });

  it('accepts a valid capability result with diagnostics and actions', () => {
    const result: CanvasMarkdownCapabilityResult = {
      capabilityId: 'canvas.ingestMarkdown',
      status: 'needs-review',
      tableNodeId: 'table-1',
      nodeIds: ['table-1'],
      diagnostics: [
        {
          severity: 'warning',
          code: 'canvas-markdown-missing-resource-token',
          message: 'Resource token P3 is unresolved.',
          token: 'P3',
          candidates: [
            {
              token: 'P3',
              label: 'Page 3',
              width: 1024,
              height: 768,
              resourceRef,
            },
          ],
        },
      ],
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
      preview: {
        title: 'Opening',
        tableCount: 1,
        rowCount: 3,
        resourceTokenCount: 3,
        unresolvedResourceTokenCount: 1,
        resolvedKind: 'creative-table',
        profileId: 'storyboard',
        displayFallback: false,
        table: {
          profileId: 'storyboard',
          displayName: 'Storyboard',
          reviewKind: 'storyboard',
          consumedColumns: [
            {
              fieldId: 'prompt',
              columnId: 'prompt',
              label: 'Prompt',
              role: 'plan',
              valueType: 'prompt',
            },
            {
              fieldId: 'action',
              columnId: 'next-action',
              label: 'Next Action',
              role: 'execution',
              valueType: 'action',
            },
          ],
          unknownColumns: [{ id: 'decision-reason', label: 'Decision Reason' }],
        },
      },
    };

    expect(isCanvasMarkdownCapabilityResult(result)).toBe(true);
    expect(
      isCanvasMarkdownCapabilityResult({
        ...result,
        status: 'done',
      }),
    ).toBe(false);
    expect(
      isCanvasMarkdownCapabilityResult({
        ...result,
        preview: {
          ...result.preview,
          table: {
            consumedColumns: [
              {
                fieldId: 'prompt',
                columnId: 'prompt',
                label: 'Prompt',
                role: 'review',
              },
            ],
          },
        },
      }),
    ).toBe(false);
  });
});

function createTestResourceRef(): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: {
      kind: 'file',
      filePath: '${MEDIA}/cover.png',
      projectRelativePath: 'assets/cover.png',
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'cover-v1' }),
  });
}

function createTestDocumentResourceRef(): DocumentArchiveResourceRef {
  return {
    kind: 'document-entry',
    source: {
      filePath: '${BOOKS}/comic.cbz',
      format: 'cbz',
      fileId: 'comic-1',
    },
    entryPath: 'OPS/page-1.jpg',
    versionPolicy: 'read-only-source',
  };
}
