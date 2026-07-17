import { describe, expect, it } from 'vitest';
import { PoisonPathError, createAgentPoisonPaths, createPoisonPath } from './poison-paths';

describe('poison path helpers', () => {
  it('records and throws when a poisoned path is invoked', () => {
    const poison = createPoisonPath('legacy path');

    expect(() => poison.assertNotHit()).not.toThrow();
    expect(() => poison.call('arg')).toThrow(PoisonPathError);
    expect(poison.calls).toEqual([['arg']]);
    expect(() => poison.assertNotHit()).toThrow(
      'Expected poisoned path "legacy path" not to be hit',
    );
  });

  it('creates named legacy Agent poison paths', () => {
    const paths = createAgentPoisonPaths();

    expect(Object.keys(paths).sort()).toEqual([
      'concurrentConversationStorageWrite',
      'cumulativeTimelineSnapshotPerDelta',
      'directLegacyMarkdownParse',
      'perChunkCompactionCheck',
      'readlineInteractiveResume',
      'resultOnlyCommandSuccessPath',
      'timelineStringPrefixMerge',
      'tuiLocalSkillDirectoryLoad',
      'tuiRawConfigRead',
    ]);
    expect(() => paths.readlineInteractiveResume.assertNotHit()).not.toThrow();
  });
});
