import { describe, expect, it } from 'vitest';
import {
  MarkdownStreamingSession,
  assertMarkdownResolutionAssociation,
  createMarkdownSessionId,
  type MarkdownNode,
  type MarkdownStreamingSnapshot,
} from '../index';

function snapshot(
  result: ReturnType<MarkdownStreamingSession['append']>,
): MarkdownStreamingSnapshot {
  if (result.status !== 'ready') throw new Error('Expected ready streaming snapshot.');
  return result.snapshot;
}

function findNode(root: MarkdownNode, type: MarkdownNode['type']): MarkdownNode | undefined {
  if (root.type === type) return root;
  if ('children' in root) {
    for (const child of root.children) {
      const found = findNode(child, type);
      if (found) return found;
    }
  }
  return undefined;
}

describe('MarkdownStreamingSession', () => {
  it('keeps one session, monotonic revisions, and stable-prefix node identities', () => {
    const session = new MarkdownStreamingSession({ sessionId: createMarkdownSessionId('stable') });
    const first = snapshot(session.append('First paragraph.\n\n'));
    const firstParagraph = findNode(first.document.root, 'paragraph');
    if (!firstParagraph) throw new Error('Expected first paragraph.');
    expect(first.stableEndOffset).toBe(first.source.length);
    expect(Object.isFrozen(first.document)).toBe(true);
    expect(Object.isFrozen(first.document.root)).toBe(true);

    const second = snapshot(session.append('Second paragraph'));
    const secondFirstParagraph = second.document.root.children[0];
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(second.stableEndOffset).toBe(first.source.length);
    expect(secondFirstParagraph?.id).toBe(firstParagraph.id);
    expect(second.mutableRange).toEqual({
      startOffset: first.source.length,
      endOffset: second.source.length,
    });
  });

  it('holds incomplete fenced code and active tables in the mutable tail', () => {
    const fenceSession = new MarkdownStreamingSession();
    const beforeFence = snapshot(fenceSession.append('Stable.\n\n'));
    const openFence = snapshot(fenceSession.append('```ts\nconst value = 1;'));
    expect(openFence.stableEndOffset).toBe(beforeFence.source.length);
    expect(openFence.mutableRange.startOffset).toBe(beforeFence.source.length);

    const tableSession = new MarkdownStreamingSession();
    const table = snapshot(tableSession.append('| a | b |\n| - | - |\n| 1 | 2 |'));
    expect(findNode(table.document.root, 'table')).toBeDefined();
    expect(table.stableEndOffset).toBe(0);
    const completed = snapshot(tableSession.append('\n\nDone'));
    expect(completed.stableEndOffset).toBe(table.source.length + 2);
  });

  it('keeps unfinished list structure mutable until a following stable boundary', () => {
    const session = new MarkdownStreamingSession();
    const list = snapshot(session.append('- one\n- two'));
    expect(findNode(list.document.root, 'list')).toBeDefined();
    expect(list.stableEndOffset).toBe(0);
    const withBoundary = snapshot(session.append('\n\nnext'));
    expect(withBoundary.stableEndOffset).toBe(list.source.length + 2);
  });

  it('finalizes the existing session and makes the full source stable', () => {
    const session = new MarkdownStreamingSession({
      sessionId: createMarkdownSessionId('finalize'),
    });
    const streaming = snapshot(session.append('**bold'));
    const result = session.finalize('**bold**');
    if (result.status !== 'ready') throw new Error('Expected final snapshot.');
    expect(result.snapshot.sessionId).toBe(streaming.sessionId);
    expect(result.snapshot.revision).toBeGreaterThan(streaming.revision);
    expect(result.snapshot.isFinal).toBe(true);
    expect(result.snapshot.stableEndOffset).toBe(result.snapshot.source.length);
    expect(result.snapshot.mutableRange).toEqual({
      startOffset: result.snapshot.source.length,
      endOffset: result.snapshot.source.length,
    });
    expect(session.isFinalized).toBe(true);
    expect(() => session.append('!')).toThrow(/finalized/u);
    expect(() => session.finalize()).toThrow(/already been finalized/u);
  });

  it('rejects non-append updates and cross-session results', () => {
    const session = new MarkdownStreamingSession({ sessionId: createMarkdownSessionId('a') });
    const current = snapshot(session.append('prefix'));
    expect(() => session.updateSource('replacement')).toThrow(/append-only/u);
    expect(() =>
      assertMarkdownResolutionAssociation(
        {
          sessionId: current.sessionId,
          revision: current.revision,
          resolutions: [],
          handoffRefs: [],
          diagnostics: [],
        },
        createMarkdownSessionId('b'),
        current.revision,
      ),
    ).toThrow(/cannot be associated/u);
  });

  it('returns the latest snapshot for an empty coalesced delta', () => {
    const session = new MarkdownStreamingSession();
    const first = snapshot(session.append('value'));
    const coalesced = snapshot(session.append(''));
    expect(coalesced).toBe(first);
  });
});
