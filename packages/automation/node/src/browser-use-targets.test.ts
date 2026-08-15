import { describe, expect, it } from 'vitest';
import { createIsolatedBrowserTargetDiscovery } from './browser-use-targets';

describe('isolated Browser Use target discovery', () => {
  it('projects one session-owned target from an exact canonical origin', async () => {
    const discovery = createIsolatedBrowserTargetDiscovery();
    const targets = await discovery.listCandidates({
      sessionId: 'session-1',
      targetHint: { origin: 'https://example.test' },
    });

    expect(targets).toEqual([
      {
        kind: 'browser',
        targetKey: 'browser-target:session-1',
        browserProfileId: 'browser-profile:session-1',
        browserSessionId: 'session-1',
        tabId: 'browser-page:session-1',
        origin: 'https://example.test',
        allowedDomains: ['example.test'],
        label: 'https://example.test',
      },
    ]);
    await expect(discovery.revalidate({ target: targets[0]! })).resolves.toEqual(targets[0]);
  });

  it.each([
    undefined,
    {},
    { origin: 'https://example.test/path' },
    { origin: 'file:///tmp/example' },
    { origin: 'https://example.test', extra: true },
  ])('rejects a non-canonical or ambiguous target hint: %j', async (targetHint) => {
    const discovery = createIsolatedBrowserTargetDiscovery();
    await expect(discovery.listCandidates({ sessionId: 'session-1', targetHint })).rejects.toThrow(
      /target origin|canonical HTTP\(S\) origin/u,
    );
  });

  it('does not allow one session to claim another session target', async () => {
    const discovery = createIsolatedBrowserTargetDiscovery();
    const [target] = await discovery.listCandidates({
      sessionId: 'session-1',
      targetHint: { origin: 'https://example.test' },
    });
    await expect(
      discovery.revalidate({
        target: { ...target!, browserSessionId: 'session-2' },
      }),
    ).rejects.toThrow('identity is invalid or changed');
  });
});
