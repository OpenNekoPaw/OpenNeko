export class PoisonPathError extends Error {
  constructor(readonly pathName: string) {
    super(`Poisoned path was invoked: ${pathName}`);
    this.name = 'PoisonPathError';
  }
}

export interface PoisonPath {
  readonly name: string;
  readonly calls: readonly (readonly unknown[])[];
  call(...args: readonly unknown[]): never;
  callAsync(...args: readonly unknown[]): Promise<never>;
  assertNotHit(): void;
}

export type AgentPoisonPathName =
  | 'readlineInteractiveResume'
  | 'tuiRawConfigRead'
  | 'tuiLocalSkillDirectoryLoad'
  | 'resultOnlyCommandSuccessPath'
  | 'cumulativeTimelineSnapshotPerDelta'
  | 'timelineStringPrefixMerge'
  | 'perChunkCompactionCheck'
  | 'directLegacyMarkdownParse'
  | 'concurrentConversationStorageWrite';

export type AgentPoisonPaths = Readonly<Record<AgentPoisonPathName, PoisonPath>>;

export function createPoisonPath(name: string): PoisonPath {
  const calls: (readonly unknown[])[] = [];
  const record = (args: readonly unknown[]): PoisonPathError => {
    calls.push([...args]);
    return new PoisonPathError(name);
  };

  return {
    name,
    get calls() {
      return calls.map((args) => [...args]);
    },
    call(...args) {
      throw record(args);
    },
    async callAsync(...args) {
      throw record(args);
    },
    assertNotHit() {
      if (calls.length > 0) {
        throw new Error(`Expected poisoned path "${name}" not to be hit; calls: ${calls.length}`);
      }
    },
  };
}

export function createAgentPoisonPaths(): AgentPoisonPaths {
  return {
    readlineInteractiveResume: createPoisonPath('readline interactive resume'),
    tuiRawConfigRead: createPoisonPath('TUI raw config read'),
    tuiLocalSkillDirectoryLoad: createPoisonPath('TUI local Skill directory load'),
    resultOnlyCommandSuccessPath: createPoisonPath('result-only command success path'),
    cumulativeTimelineSnapshotPerDelta: createPoisonPath(
      'cumulative Timeline snapshot per provider delta',
    ),
    timelineStringPrefixMerge: createPoisonPath('Timeline string-prefix merge inference'),
    perChunkCompactionCheck: createPoisonPath('context compaction check per provider chunk'),
    directLegacyMarkdownParse: createPoisonPath('direct legacy Agent Webview Markdown parse'),
    concurrentConversationStorageWrite: createPoisonPath(
      'concurrent same-storage conversation write',
    ),
  };
}
