import { describe, expect, it } from 'vitest';
import {
  CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS,
  createCanvasTextFilePreviewRequest,
  formatCanvasTextFilePreview,
  parseCanvasTextFilePreviewResult,
  resolveCanvasTextFilePreviewKind,
} from '../canvas-text-file-preview';

const identity = {
  projectId: 'project',
  workspaceId: 'workspace',
  windowId: 'window',
  viewId: 'view',
  viewInstanceId: 'view-instance',
  documentId: 'document',
  sessionId: 'session',
  rendererSessionId: 'renderer',
} as const;

describe('Canvas text-file preview contract', () => {
  it('recognizes only explicit supported text formats', () => {
    expect(resolveCanvasTextFilePreviewKind({ path: 'data/project.json' })).toBe('json');
    expect(resolveCanvasTextFilePreviewKind({ path: 'notes/readme.md' })).toBe('markdown');
    expect(resolveCanvasTextFilePreviewKind({ path: 'notes/run.log' })).toBe('plain');
    expect(
      resolveCanvasTextFilePreviewKind({
        path: 'opaque/data.bin',
        mediaType: 'text/plain; charset=utf-8',
      }),
    ).toBe('plain');
    expect(
      resolveCanvasTextFilePreviewKind({ path: 'image.json', mediaType: 'image/png' }),
    ).toBeUndefined();
    expect(resolveCanvasTextFilePreviewKind({ path: 'opaque/data.bin' })).toBeUndefined();
  });

  it('formats JSON and bounds the presentation text', () => {
    const formatted = formatCanvasTextFilePreview({
      requestId: 'request',
      nodeId: 'node',
      kind: 'json',
      bytes: new TextEncoder().encode('{"nested":{"value":1}}'),
    });
    expect(formatted).toEqual({
      requestId: 'request',
      nodeId: 'node',
      status: 'ready',
      kind: 'json',
      text: '{\n  "nested": {\n    "value": 1\n  }\n}',
      truncated: false,
      empty: false,
    });

    const bounded = formatCanvasTextFilePreview({
      requestId: 'request',
      nodeId: 'node',
      kind: 'plain',
      bytes: new TextEncoder().encode('x'.repeat(CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS + 10)),
    });
    expect(bounded.status).toBe('ready');
    if (bounded.status !== 'ready') throw new Error('Expected a ready bounded preview.');
    expect(bounded.text).toHaveLength(CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS);
    expect(bounded.truncated).toBe(true);
  });

  it('keeps malformed JSON and invalid UTF-8 fail-visible without raw fallback', () => {
    expect(
      formatCanvasTextFilePreview({
        requestId: 'request',
        nodeId: 'node',
        kind: 'json',
        bytes: new TextEncoder().encode('{broken'),
      }),
    ).toEqual({
      requestId: 'request',
      nodeId: 'node',
      status: 'unavailable',
      diagnostic: { code: 'canvas-text-preview-invalid-json' },
    });
    expect(
      formatCanvasTextFilePreview({
        requestId: 'request',
        nodeId: 'node',
        kind: 'plain',
        bytes: new Uint8Array([0xc3, 0x28]),
      }),
    ).toEqual({
      requestId: 'request',
      nodeId: 'node',
      status: 'unavailable',
      diagnostic: { code: 'canvas-text-preview-invalid-utf8' },
    });
  });

  it('represents empty text explicitly and rejects extra contract fields', () => {
    expect(
      formatCanvasTextFilePreview({
        requestId: 'request',
        nodeId: 'node',
        kind: 'plain',
        bytes: new Uint8Array(),
      }),
    ).toMatchObject({ status: 'ready', text: '', empty: true });

    expect(() =>
      createCanvasTextFilePreviewRequest({
        requestId: 'request',
        identity,
        nodeId: 'node',
        locator: { kind: 'workspace-file', path: 'notes/readme.md' },
        extra: true,
      } as never),
    ).toThrow('unsupported fields');
    expect(() =>
      parseCanvasTextFilePreviewResult(
        {
          requestId: 'different',
          nodeId: 'node',
          status: 'unsupported',
        },
        'request',
        'node',
      ),
    ).toThrow('request identity does not match');
  });
});
