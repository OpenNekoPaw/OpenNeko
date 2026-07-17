import { describe, expect, it } from 'vitest';
import {
  projectCanvasBoardSummaryForIndex,
  validateCanvasBoardRef,
} from '../canvas-creative-scope';

describe('canvas creative scope contracts', () => {
  it('accepts portable board refs and rejects runtime refs', () => {
    expect(validateCanvasBoardRef({ kind: 'workspace-path', path: 'boards/seq-1.nkc' })).toEqual(
      [],
    );
    expect(
      validateCanvasBoardRef({ kind: 'workspace-path', path: 'vscode-webview://runtime/board' }),
    ).toEqual([
      expect.objectContaining({
        code: 'unsafe-board-ref',
      }),
    ]);
  });

  it('projects compact board summaries for dashboard grouping', () => {
    expect(
      projectCanvasBoardSummaryForIndex({
        canvasId: 'canvas-1',
        name: 'Episode 1 Sequence A',
        scope: {
          kind: 'sequence',
          workId: 'seq-a',
          title: 'Sequence A',
          episodeId: 'episode-1',
          sequenceId: 'seq-a',
          sceneIds: ['scene-1', 'scene-2'],
        },
        relatedBoards: [
          {
            role: 'scene',
            ref: { kind: 'workspace-path', path: 'boards/scene-1.nkc' },
            label: 'Scene 1',
          },
        ],
        nodeTypeSummary: { scene: 2, shot: 6 },
      }),
    ).toEqual({
      canvasId: 'canvas-1',
      name: 'Episode 1 Sequence A',
      scopeKind: 'sequence',
      workId: 'seq-a',
      title: 'Sequence A',
      episodeId: 'episode-1',
      sequenceId: 'seq-a',
      sceneIds: ['scene-1', 'scene-2'],
      relatedBoardCount: 1,
      nodeTypeSummary: { scene: 2, shot: 6 },
    });
  });
});
