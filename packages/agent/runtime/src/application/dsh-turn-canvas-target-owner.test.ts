import { describe, expect, it } from 'vitest';
import { createDshTurnCanvasTargetOwner } from './dsh-turn-canvas-target-owner';

describe('DSH turn Canvas target owner', () => {
  it('binds admitted targets to real turns in FIFO order', () => {
    const owner = createDshTurnCanvasTargetOwner();
    owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/story.nkc',
    });
    owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });

    owner.bindStartedTurn('dsh-1', 4);
    owner.bindStartedTurn('dsh-1', 5);

    expect(owner.read('dsh-1', 4)).toEqual({
      workspaceId: 'workspace-1',
      canvasId: 'boards/story.nkc',
    });
    expect(owner.read('dsh-1', 5)).toEqual({
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });
  });

  it('releases an admission that failed before turn start', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const stale = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/stale.nkc',
    });
    owner.releaseAdmission(stale.admissionId);
    owner.admit('dsh-1', { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' });
    owner.bindStartedTurn('dsh-1', 1);
    expect(owner.read('dsh-1', 1)).toEqual({
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });
  });

  it('removes the exact queued admission when its Inbox message is deleted', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const removed = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/removed.nkc',
    });
    owner.bindQueuedMessage(removed.admissionId, 'message-1');
    owner.admit('dsh-1', { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' });

    owner.releaseQueuedMessage('message-1');
    owner.bindStartedTurn('dsh-1', 1);

    expect(owner.read('dsh-1', 1)).toEqual({
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });
  });

  it('prioritizes the exact queued admission and can roll its order back', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const first = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/first.nkc',
    });
    const selected = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/selected.nkc',
    });
    owner.bindQueuedMessage(first.admissionId, 'message-1');
    owner.bindQueuedMessage(selected.admissionId, 'message-2');

    const reservation = owner.prioritizeQueuedMessage('message-2');
    reservation.rollback();
    reservation.rollback();
    owner.bindStartedTurn('dsh-1', 1);
    owner.bindStartedTurn('dsh-1', 2);

    expect(owner.read('dsh-1', 1)).toMatchObject({ canvasId: 'boards/first.nkc' });
    expect(owner.read('dsh-1', 2)).toMatchObject({ canvasId: 'boards/selected.nkc' });
  });

  it('keeps a prioritized queued admission first after a successful reservation', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const first = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/first.nkc',
    });
    const selected = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'boards/selected.nkc',
    });
    owner.bindQueuedMessage(first.admissionId, 'message-1');
    owner.bindQueuedMessage(selected.admissionId, 'message-2');

    owner.prioritizeQueuedMessage('message-2');
    owner.bindStartedTurn('dsh-1', 1);
    owner.bindStartedTurn('dsh-1', 2);

    expect(owner.read('dsh-1', 1)).toMatchObject({ canvasId: 'boards/selected.nkc' });
    expect(owner.read('dsh-1', 2)).toMatchObject({ canvasId: 'boards/first.nkc' });
  });

  it('rejects a stale queued identity without changing sibling admission order', () => {
    const owner = createDshTurnCanvasTargetOwner();
    owner.admit('dsh-1', { workspaceId: 'workspace-1', canvasId: 'neko/boards/workspace.nkc' });

    expect(() => owner.prioritizeQueuedMessage('message-stale')).toThrow(
      'has no pending Canvas target admission',
    );
    owner.bindStartedTurn('dsh-1', 1);
    expect(owner.read('dsh-1', 1)).toMatchObject({ canvasId: 'neko/boards/workspace.nkc' });
  });

  it('accepts a queued-message identity that arrives after the turn already started', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const admission = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });

    owner.bindStartedTurn('dsh-1', 1);

    expect(() => owner.bindQueuedMessage(admission.admissionId, 'message-1')).not.toThrow();
  });

  it('releases a turn that started before its submitting operation failed', () => {
    const owner = createDshTurnCanvasTargetOwner();
    const admission = owner.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
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
