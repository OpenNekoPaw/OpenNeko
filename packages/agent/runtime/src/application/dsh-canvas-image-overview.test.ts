import { describe, expect, it, vi } from 'vitest';
import {
  collectDshCanvasArtifactCompletedToolArtifacts,
  type DshCanvasArtifactDeliveryInput,
} from './dsh-canvas-artifact-delivery';
import { materializeDshCanvasImageOverviews } from './dsh-canvas-image-overview';

const attachment = {
  attachmentId: 'stored-overview',
  mediaType: 'image/png' as const,
  bytes: 4,
  width: 8,
  height: 8,
};
const sources = [{ file: { authority: 'workspace', path: 'page.png' } }];

function input(): DshCanvasArtifactDeliveryInput {
  const result = collectDshCanvasArtifactCompletedToolArtifacts({
    toolCallId: 'overview',
    events: [
      {
        kind: 'tool',
        sessionId: 'session',
        turn: 1,
        turnStartedAt: 1,
        toolCallId: 'overview',
        title: 'openneko_read_images',
        status: 'completed',
        rawInput: { sources },
        rawOutput: [{ type: 'image', attachment }],
      },
    ],
  });
  return {
    workspaceId: 'workspace',
    conversationId: 'conversation',
    dshSessionId: 'session',
    turn: 1,
    createdAt: 1,
    canvasTurnTarget: { workspaceId: 'workspace', canvasId: 'board.nkc' },
    delivery: { kind: 'completed-tool', toolCallId: 'overview' },
    artifacts: result.batch!.artifacts,
  };
}

describe('Canvas overview attachment boundary', () => {
  it.each(['denied', 'wrong-identity', 'wrong-format', 'conflicting-file'])(
    'rejects %s without writing or affecting a later valid request',
    async (failure) => {
      let invalid = true;
      const write = vi.fn(async (locator) => ({
        status: 'written' as const,
        locator,
        byteLength: 4,
      }));
      const readAttachment = vi.fn(async () => {
        if (invalid && failure === 'denied') throw new Error('attachment denied');
        return {
          attachment: {
            ...attachment,
            ...(invalid && failure === 'wrong-identity'
              ? { attachmentId: 'other-session-output' }
              : {}),
            ...(invalid && failure === 'wrong-format' ? { mediaType: 'image/jpeg' as const } : {}),
          },
          data: Buffer.from('data').toString('base64'),
        };
      });
      const read = vi.fn(async (locator) =>
        invalid && failure === 'conflicting-file'
          ? {
              status: 'ready' as const,
              locator,
              bytes: Buffer.from('user'),
              offset: 0,
              fingerprint: { strategy: 'sha256' as const, value: 'user-content' },
            }
          : {
              status: 'unavailable' as const,
              locator,
              diagnostic: { code: 'content-missing' as const },
            },
      );
      const ports = {
        readAttachment,
        writer: { write },
        contentRead: {
          read,
          stat: vi.fn(async (): Promise<never> => {
            throw new Error('Unexpected stat.');
          }),
        },
      };
      await expect(materializeDshCanvasImageOverviews(input(), ports)).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
      invalid = false;
      await expect(materializeDshCanvasImageOverviews(input(), ports)).resolves.toBeUndefined();
      expect(readAttachment).toHaveBeenLastCalledWith('session', attachment.attachmentId);
      expect(write).toHaveBeenCalledExactlyOnceWith(
        input().artifacts[0]!.contentLocator,
        Buffer.from('data'),
        { conflict: 'fail-if-exists', maxBytes: 4 },
      );
    },
  );

  it.each([
    { rawOutput: [] },
    {
      rawOutput: [
        { type: 'image', attachment },
        { type: 'image', attachment },
      ],
    },
  ])('rejects missing or duplicate overview image blocks', ({ rawOutput }) => {
    const result = collectDshCanvasArtifactCompletedToolArtifacts({
      toolCallId: 'overview',
      events: [
        {
          kind: 'tool',
          sessionId: 'session',
          turn: 1,
          turnStartedAt: 1,
          toolCallId: 'overview',
          title: 'openneko_read_images',
          status: 'completed',
          rawInput: { sources },
          rawOutput,
        },
      ],
    });
    expect(result.batch).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain('exactly one');
  });
});
