import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DesktopApplicationSettingsContractError,
} from '../shared/application-settings-contract';
import {
  DesktopApplicationSettingsRepository,
  type DesktopApplicationSettingsFilePort,
} from './application-settings-repository';
import { DesktopApplicationSettingsService } from './application-settings-service';

describe('Desktop application settings persistence', () => {
  it('uses Desktop-only defaults without reading Agent configuration', async () => {
    const file = createMemoryFile();
    const repository = new DesktopApplicationSettingsRepository(file);

    await expect(repository.read()).resolves.toEqual({
      schemaVersion: 1,
      storageRevision: 0,
      preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
    });
    expect(file.reads()).toBe(1);
  });

  it('persists complete validated settings and rejects stale updates', async () => {
    const file = createMemoryFile();
    const service = new DesktopApplicationSettingsService(
      new DesktopApplicationSettingsRepository(file),
    );
    await service.initialize();
    const events: number[] = [];
    service.subscribe((event) => events.push(event.sequence));

    const projection = await service.update(0, {
      theme: 'dark',
      locale: 'zh-cn',
      startupTarget: 'home',
      resourceBrowserView: 'grid',
    });

    expect(projection).toMatchObject({
      revision: 1,
      eventSequence: 1,
      preferences: {
        theme: 'dark',
        locale: 'zh-cn',
        startupTarget: 'home',
        resourceBrowserView: 'grid',
      },
    });
    expect(events).toEqual([1]);
    expect(file.content()).not.toContain('provider');
    expect(file.content()).not.toContain('apiKey');
    await expect(
      service.update(0, DEFAULT_DESKTOP_APPLICATION_PREFERENCES),
    ).rejects.toBeInstanceOf(DesktopApplicationSettingsContractError);
  });

  it('fails visibly for invalid JSON and cross-authority fields', async () => {
    const invalidJson = createMemoryFile('{');
    await expect(
      new DesktopApplicationSettingsRepository(invalidJson).read(),
    ).rejects.toThrow(/not valid JSON/);

    const agentPolluted = createMemoryFile(
      JSON.stringify({
        schemaVersion: 1,
        storageRevision: 1,
        preferences: {
          ...DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          providers: [],
        },
      }),
    );
    await expect(
      new DesktopApplicationSettingsRepository(agentPolluted).read(),
    ).rejects.toThrow(/unexpected fields/);
  });
});

function createMemoryFile(initial: string | null = null): DesktopApplicationSettingsFilePort & {
  readonly content: () => string;
  readonly reads: () => number;
} {
  let content = initial;
  let reads = 0;
  return {
    readTextIfExists: async () => {
      reads += 1;
      return content;
    },
    writeTextAtomic: async (next) => {
      content = next;
    },
    content: () => content ?? '',
    reads: () => reads,
  };
}
