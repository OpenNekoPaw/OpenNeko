import { describe, expect, it, vi } from 'vitest';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import { handleCanvasEntityRoute, isCanvasEntityRouteMessage } from './canvasEntityRoutes';

describe('canvas entity routes', () => {
  it('rejects invalid route payloads', () => {
    expect(
      isCanvasEntityRouteMessage({ type: 'entity.summary', entityRef: { entityId: '' } }),
    ).toBe(false);
    expect(isCanvasEntityRouteMessage({ type: 'entity.confirmCandidate', candidateId: '' })).toBe(
      false,
    );
  });

  it('returns bounded confirmed entity summary through facade command', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      entity: {
        id: 'char-rin',
        kind: 'character',
        canonicalName: 'Rin',
        displayName: 'Rin',
        aliases: ['R'],
        status: 'confirmed',
        metadata: {
          appearanceSummary: 'Blue scarf.',
          ignored: 'nope',
        },
      },
      candidates: [{ id: 'candidate-1' }],
      bindings: [
        {
          id: 'binding-portrait',
          entityId: 'char-rin',
          entityKind: 'character',
          representation: {
            kind: 'workspace-file',
            path: 'neko/assets/Characters/rin-portrait.png',
          },
          role: 'portrait',
          status: 'confirmed',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
          source: 'user',
          updatedAt: '2026-06-10T00:00:00.000Z',
        },
      ],
      visualDrafts: [],
    });

    const result = await handleCanvasEntityRoute(
      {
        type: 'entity.summary',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
      },
      { projectRoot: '/workspace', contextUri: 'file:///workspace/board.nkc' },
      { executeCommand },
    );

    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.getEntityDetail, {
      projectRoot: '/workspace',
      contextUri: 'file:///workspace/board.nkc',
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
    });
    expect(result).toEqual({
      ok: true,
      summary: {
        status: 'confirmed',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
        kind: 'character',
        displayName: 'Rin',
        aliases: ['R'],
        metadata: { appearanceSummary: 'Blue scarf.' },
        candidateCount: 1,
        defaultRepresentation: {
          role: 'portrait',
          representation: {
            kind: 'workspace-file',
            path: 'neko/assets/Characters/rin-portrait.png',
          },
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        },
      },
    });
  });

  it('returns facade command failures as route diagnostics', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      code: 'not-found',
      message: 'Missing candidate.',
      diagnostics: ['candidate missing'],
    });

    const result = await handleCanvasEntityRoute(
      {
        type: 'entity.confirmCandidate',
        candidateId: 'candidate-missing',
      },
      { projectRoot: '/workspace' },
      { executeCommand },
    );

    expect(result).toEqual({
      ok: false,
      message: 'Missing candidate.',
      diagnostics: ['candidate missing'],
    });
  });

  it('confirms candidate through facade and returns changed entity ref', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      ok: true,
      action: 'confirm-candidate',
      changedRefs: [
        {
          kind: 'candidate',
          id: 'candidate-rin',
          entityRef: { entityId: 'char-rin', entityKind: 'character' },
        },
      ],
    });

    const result = await handleCanvasEntityRoute(
      {
        type: 'entity.confirmCandidate',
        candidateId: 'candidate-rin',
      },
      { projectRoot: '/workspace' },
      { executeCommand },
    );

    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.confirmCandidate, {
      projectRoot: '/workspace',
      candidateId: 'candidate-rin',
    });
    expect(result).toEqual({
      ok: true,
      candidateId: 'candidate-rin',
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
    });
  });

  it('opens persistent Inspector through the inspect command', async () => {
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });

    const result = await handleCanvasEntityRoute(
      {
        type: 'entity.inspect',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
      },
      {
        projectRoot: '/workspace',
        contextUri: 'file:///workspace/board.nkc',
        surfaceNodeId: 'shot-1',
      },
      { executeCommand },
    );

    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.inspectEntity, {
      projectRoot: '/workspace',
      contextUri: 'file:///workspace/board.nkc',
      context: {
        projectRoot: '/workspace',
        contextUri: 'file:///workspace/board.nkc',
        surface: 'canvas',
        nodeId: 'shot-1',
      },
      entityRef: { entityId: 'char-rin', entityKind: 'character' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('reports unavailable Inspector command without throwing', async () => {
    const executeCommand = vi.fn().mockRejectedValue(new Error('Command not found'));

    const result = await handleCanvasEntityRoute(
      {
        type: 'entity.inspect',
        candidateId: 'candidate-rin',
      },
      { projectRoot: '/workspace' },
      { executeCommand },
    );

    expect(result).toEqual({ ok: false, message: 'Command not found' });
  });
});
