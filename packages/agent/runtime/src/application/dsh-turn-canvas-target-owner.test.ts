import { describe, expect, it } from 'vitest';
import { createDshTurnCanvasTargetOwner } from './dsh-turn-canvas-target-owner';

describe('DSH turn Canvas target owner', () => {
  it('binds admitted targets to real turns in FIFO order', () => {
    const owner = createDshTurnCanvasTargetOwner();
    owner.admit('dsh-1', {
      kind: 'exact-canvas',
      workspaceId: 'workspace-1',
      canvasId: 'boards/story.nkc',
    });
    owner.admit('dsh-1', { kind: 'workspace-board', workspaceId: 'workspace-1' });

    owner.bindStartedTurn('dsh-1', 4);
    owner.bindStartedTurn('dsh-1', 5);

    expect(owner.read('dsh-1', 4)).toEqual({
      kind: 'exact-canvas',
      workspaceId: 'workspace-1',
      canvasId: 'boards/story.nkc',
    });
    expect(owner.read('dsh-1', 5)).toEqual({
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });
  });

  it('releases an admission that failed before turn start', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const stale = owner.admit('dsh-1', {
      kind: 'exact-canvas',
      workspaceId: 'workspace-1',
      canvasId: 'boards/stale.nkc',
    });
    owner.releaseAdmission(stale.admissionId);
    owner.admit('dsh-1', { kind: 'workspace-board', workspaceId: 'workspace-1' });
    owner.bindStartedTurn('dsh-1', 1);
    expect(owner.read('dsh-1', 1)).toEqual({
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });
  });

  it('removes the exact queued admission when its Inbox message is deleted', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const removed = owner.admit('dsh-1', {
      kind: 'exact-canvas',
      workspaceId: 'workspace-1',
      canvasId: 'boards/removed.nkc',
    });
    owner.bindQueuedMessage(removed.admissionId, 'message-1');
    owner.admit('dsh-1', { kind: 'workspace-board', workspaceId: 'workspace-1' });

    owner.releaseQueuedMessage('message-1');
    owner.bindStartedTurn('dsh-1', 1);

    expect(owner.read('dsh-1', 1)).toEqual({
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });
  });

  it('accepts a queued-message identity that arrives after the turn already started', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const admission = owner.admit('dsh-1', {
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });

    owner.bindStartedTurn('dsh-1', 1);

    expect(() => owner.bindQueuedMessage(admission.admissionId, 'message-1')).not.toThrow();
  });

  it('releases a turn that started before its submitting operation failed', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const admission = owner.admit('dsh-1', {
      kind: 'workspace-board',
      workspaceId: 'workspace-1',
    });
    owner.bindStartedTurn('dsh-1', 1);

    owner.releaseAdmission(admission.admissionId);

    expect(() => owner.read('dsh-1', 1)).toThrow('has no bound Canvas target admission');
  });

  it('fails visibly when a turn starts outside the admission path', () => {
    const owner = createDshTurnCanvasTargetOwner();
    expect(() => owner.bindStartedTurn('dsh-1', 1)).toThrow(
      'started without a Canvas target admission',
    );
  });
});
