import type { AuthorizedWorkspaceWriter, ContentReadService } from '@neko/content';
import { describe, expect, it } from 'vitest';
import { TextDocumentError } from './contracts';
import { TextDocumentSession, TextDocumentSessionManager } from './text-document-session';

const locator = { kind: 'workspace-file' as const, path: 'scripts/main.fountain' };
const identity = {
  owner: { kind: 'window' as const, windowId: 'window-1', projectId: 'project-1' },
  workspaceId: 'workspace-1',
  documentId: 'scripts/main.fountain',
  locator,
};

describe('TextDocumentSession', () => {
  it('admits UTF-8, applies exact revisioned edits and projects Fountain', async () => {
    const { reader, writer } = memoryContent('.内景 客厅 - 夜\n\n@小橘\n你好。');
    const session = await TextDocumentSession.open(identity, {
      reader,
      writer,
      createSessionId: () => 'session-1',
    });
    const initial = session.project();
    const changed = session.applyEdits({
      identity,
      sessionId: initial.sessionId,
      requestId: 'request-1',
      expectedEditSequence: initial.editSequence,
      changes: [{ from: initial.source.length, to: initial.source.length, insert: '\n' }],
    });
    expect(changed).toMatchObject({ editSequence: 1, dirty: true, mode: 'fountain' });
    expect(changed.screenplay?.characters[0]?.name).toBe('小橘');
    expect(() =>
      session.applyEdits({
        identity,
        sessionId: initial.sessionId,
        requestId: 'request-2',
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 0, insert: '!' }],
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostic: { code: 'text-document-stale-edit-sequence', severity: 'error' },
      }),
    );
  });

  it('saves through fingerprint CAS and preserves CRLF plus BOM', async () => {
    const state = memoryContent('{\r\n  "ok": true\r\n}', true);
    const jsonIdentity = {
      ...identity,
      documentId: 'data.json',
      locator: { ...locator, path: 'data.json' },
    };
    const session = await TextDocumentSession.open(jsonIdentity, {
      ...state,
      createSessionId: () => 'json-1',
    });
    const admitted = session.project();
    expect(admitted.source).toBe('{\n  "ok": true\n}');
    const trueOffset = admitted.source.indexOf('true');
    session.applyEdits({
      identity: jsonIdentity,
      sessionId: 'json-1',
      requestId: 'edit-1',
      expectedEditSequence: 0,
      changes: [{ from: trueOffset, to: trueOffset + 4, insert: 'false' }],
    });
    const saved = await session.save(1);
    expect(saved.dirty).toBe(false);
    expect(state.writes).toHaveLength(1);
    expect([...state.writes[0]!.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(state.writes[0]!.bytes.slice(3))).toContain('\r\n');
    expect(state.writes[0]!.expected.value).toBe('base');
  });

  it('preserves a dirty buffer on an external save conflict', async () => {
    const state = memoryContent('before');
    state.conflict.value = true;
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const session = await TextDocumentSession.open(textIdentity, {
      ...state,
      createSessionId: () => 'text-1',
    });
    session.applyEdits({
      identity: textIdentity,
      sessionId: 'text-1',
      requestId: 'edit-1',
      expectedEditSequence: 0,
      changes: [{ from: 0, to: 6, insert: 'after' }],
    });
    await expect(session.save(1)).rejects.toMatchObject({
      diagnostic: { code: 'text-document-save-conflict', severity: 'error' },
    } satisfies Partial<TextDocumentError>);
    expect(session.project()).toMatchObject({ source: 'after', dirty: true, conflict: true });
    session.applyEdits({
      identity: textIdentity,
      sessionId: 'text-1',
      requestId: 'edit-2',
      expectedEditSequence: 1,
      changes: [{ from: 5, to: 5, insert: '!' }],
    });
    expect(session.project()).toMatchObject({ source: 'after!', dirty: true, conflict: true });
  });

  it('adopts an external change only while the buffer is clean', async () => {
    const state = memoryContent('before');
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const session = await TextDocumentSession.open(textIdentity, {
      ...state,
      createSessionId: () => 'external-clean-1',
    });

    expect(await session.observeExternalChange()).toBeUndefined();
    state.replaceReadContent('after');
    await expect(session.observeExternalChange()).resolves.toMatchObject({
      source: 'after',
      editSequence: 1,
      dirty: false,
      conflict: false,
    });
  });

  it('keeps dirty source and projects a conflict on an external change', async () => {
    const state = memoryContent('before');
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const session = await TextDocumentSession.open(textIdentity, {
      ...state,
      createSessionId: () => 'external-dirty-1',
    });
    session.applyEdits({
      identity: textIdentity,
      sessionId: 'external-dirty-1',
      requestId: 'edit-before-external-change',
      expectedEditSequence: 0,
      changes: [{ from: 0, to: 6, insert: 'draft' }],
    });
    state.replaceReadContent('external');

    await expect(session.observeExternalChange()).resolves.toMatchObject({
      source: 'draft',
      editSequence: 1,
      dirty: true,
      conflict: true,
    });
    expect(await session.observeExternalChange()).toBeUndefined();
  });

  it('keeps current source and projects a local diagnostic when an external read fails', async () => {
    const state = memoryContent('current');
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const session = await TextDocumentSession.open(textIdentity, {
      ...state,
      createSessionId: () => 'external-unavailable-1',
    });
    state.readUnavailable.value = true;

    await expect(session.observeExternalChange()).resolves.toMatchObject({
      source: 'current',
      dirty: false,
      diagnostics: [{ code: 'text-document-external-change-unavailable', severity: 'error' }],
    });
    expect(await session.observeExternalChange()).toBeUndefined();
  });

  it('adopts the reloaded BOM and line-ending convention for subsequent saves', async () => {
    const state = memoryContent('first\n');
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const session = await TextDocumentSession.open(textIdentity, {
      ...state,
      createSessionId: () => 'reload-1',
    });
    state.replaceReadContent('外部\r\n内容\r\n', true);

    const reloaded = await session.reload(false);
    expect(reloaded.source).toBe('外部\n内容\n');
    session.applyEdits({
      identity: textIdentity,
      sessionId: 'reload-1',
      requestId: 'edit-after-reload',
      expectedEditSequence: reloaded.editSequence,
      changes: [{ from: reloaded.source.length, to: reloaded.source.length, insert: '追加\n' }],
    });
    await session.save(reloaded.editSequence + 1);

    const savedBytes = state.writes.at(-1)?.bytes;
    if (!savedBytes) throw new Error('Expected the reloaded document to be saved.');
    expect([...savedBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(savedBytes.slice(3))).toBe('外部\r\n内容\r\n追加\r\n');
  });

  it('focuses one exact session and releases only clean sessions', async () => {
    const state = memoryContent('text');
    const textIdentity = {
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    };
    const manager = new TextDocumentSessionManager({ ...state, createSessionId: () => 'text-1' });
    const first = await manager.open(textIdentity);
    const second = await manager.open(textIdentity);
    expect(second.sessionId).toBe(first.sessionId);
    expect(manager.releaseClean(first.sessionId)).toBe(true);
    expect(() => manager.require(first.sessionId)).toThrowError(
      expect.objectContaining({
        diagnostic: { code: 'text-document-session-missing', severity: 'error' },
      }),
    );
  });

  it('does not reuse a Window session across distinct Project owners', async () => {
    const state = memoryContent('text');
    let sessionOrdinal = 0;
    const manager = new TextDocumentSessionManager({
      ...state,
      createSessionId: () => `text-${++sessionOrdinal}`,
    });
    const first = await manager.open({
      ...identity,
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    });
    const second = await manager.open({
      ...identity,
      owner: { ...identity.owner, projectId: 'project-2' },
      documentId: 'note.txt',
      locator: { ...locator, path: 'note.txt' },
    });

    expect(second.sessionId).not.toBe(first.sessionId);
  });
});

function memoryContent(initial: string, bom = false) {
  const conflict = { value: false };
  const readUnavailable = { value: false };
  const writes: { bytes: Uint8Array; expected: { strategy: 'provider'; value: string } }[] = [];
  let bytes = encodeFixture(initial, bom);
  let fingerprintValue = 'base';
  const reader: ContentReadService = {
    async stat() {
      throw new Error('stat is not used');
    },
    async read(requested) {
      if (readUnavailable.value) {
        return {
          status: 'unavailable',
          locator: requested,
          diagnostic: { code: 'content-missing' as const },
        };
      }
      return {
        status: 'ready',
        locator: requested,
        bytes,
        offset: 0,
        fingerprint: { strategy: 'provider', value: fingerprintValue },
      };
    },
  };
  const writer: AuthorizedWorkspaceWriter = {
    async write(requested, nextBytes, options) {
      if (conflict.value)
        return {
          status: 'unavailable',
          locator: requested,
          diagnostic: { code: 'content-changed' },
        };
      if (!options.expectedFingerprint) throw new Error('expected fingerprint missing');
      writes.push({
        bytes: nextBytes,
        expected: options.expectedFingerprint as { strategy: 'provider'; value: string },
      });
      return {
        status: 'written',
        locator: requested,
        byteLength: nextBytes.byteLength,
        fingerprint: { strategy: 'provider', value: 'written' },
      };
    },
  };
  return {
    reader,
    writer,
    writes,
    conflict,
    readUnavailable,
    replaceReadContent(source: string, nextBom = false) {
      bytes = encodeFixture(source, nextBom);
      fingerprintValue = `external:${fingerprintValue}`;
    },
  };
}

function encodeFixture(source: string, bom: boolean): Uint8Array {
  const encoded = new TextEncoder().encode(source);
  return bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...encoded]) : encoded;
}
