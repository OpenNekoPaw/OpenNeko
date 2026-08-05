import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopAssistantPreviewRuntime } from './desktop-assistant-preview-runtime';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop Assistant Preview runtime', () => {
  it('registers a supported conversation-owned file without projecting its path', async () => {
    const fixture = await createFixture('result.txt', 'hello');
    const projection = await fixture.runtime.authorize({
      identity: identity(),
      artifact: artifact('result.txt'),
    });

    expect(projection).toMatchObject({
      status: 'ready',
      identity: { owner: { kind: 'assistant-scratch', scratchArtifactId: 'scratch:1' } },
      descriptor: { contentKind: 'text', displayName: 'result.txt' },
    });
    expect(JSON.stringify(projection)).not.toContain(fixture.root);
    const canonicalRoot = await realpath(fixture.root);
    expect(fixture.registerFile).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: projection.identity.previewSessionId }),
      expect.objectContaining({ absolutePath: path.join(canonicalRoot, 'result.txt') }),
    );
  });

  it('keeps unsupported refs visible and rejects path or symlink escape', async () => {
    const unsupported = await createFixture('archive.bin', 'bytes');
    await expect(
      unsupported.runtime.authorize({
        identity: identity(),
        artifact: artifact('archive.bin'),
      }),
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(unsupported.registerFile).not.toHaveBeenCalled();

    const escaped = await createFixture('safe.txt', 'safe');
    await expect(
      escaped.runtime.authorize({
        identity: identity(),
        artifact: artifact('../outside.txt'),
      }),
    ).rejects.toThrow('single managed filename');
    const outside = path.join(path.dirname(escaped.root), 'outside.txt');
    roots.push(outside);
    await writeFile(outside, 'outside');
    await symlink(outside, path.join(escaped.root, 'linked.txt'));
    await expect(
      escaped.runtime.authorize({
        identity: identity(),
        artifact: artifact('linked.txt'),
      }),
    ).rejects.toThrow('escapes its conversation-owned root');
  });

  it('releases exact sessions on request and Window detach', async () => {
    const fixture = await createFixture('result.txt', 'hello');
    const first = await fixture.runtime.authorize({
      identity: identity(),
      artifact: artifact('result.txt'),
    });
    fixture.runtime.release({
      identity: identity(),
      previewSessionId: first.identity.previewSessionId,
    });
    expect(fixture.releaseSession).toHaveBeenCalledWith(first.identity.previewSessionId);

    const second = await fixture.runtime.authorize({
      identity: identity(),
      artifact: artifact('result.txt'),
    });
    fixture.runtime.detachWindow('window:1');
    expect(fixture.releaseSession).toHaveBeenCalledWith(second.identity.previewSessionId);
    expect(() =>
      fixture.runtime.read({
        identity: identity(),
        previewSessionId: second.identity.previewSessionId,
      }),
    ).toThrow('does not match its owner');
  });
});

async function createFixture(fileName: string, content: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-assistant-preview-'));
  roots.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, fileName), content);
  let sequence = 0;
  const registerFile = vi.fn(async () => ({
    url: `openneko://resource/${String(++sequence).padStart(32, '0')}`,
    release: vi.fn(),
  }));
  const releaseSession = vi.fn();
  return {
    root,
    registerFile,
    releaseSession,
    runtime: createDesktopAssistantPreviewRuntime({
      resolveScratchRoot: () => root,
      resources: { registerFile, releaseSession },
      createIdentity: () => `identity:${++sequence}`,
    }),
  };
}

function identity() {
  return { assistantSpaceId: 'assistant:1', conversationId: 'conversation:1', windowId: 'window:1' };
}

function artifact(label: string) {
  return {
    schemaVersion: 1 as const,
    scratchArtifactId: 'scratch:1',
    assistantSpaceId: 'assistant:1',
    conversationId: 'conversation:1',
    label,
    state: 'recoverable' as const,
  };
}
