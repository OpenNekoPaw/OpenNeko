import { LocalMetadataError, type LocalMetadataStore } from './contracts';

export interface LocalMetadataRevisionCursorPollResult {
  readonly changedDomains: readonly string[];
  readonly revisions: Readonly<Record<string, number>>;
}

export interface LocalMetadataRevisionCursor {
  initialize(): Promise<void>;
  poll(): Promise<LocalMetadataRevisionCursorPollResult>;
}

export function createLocalMetadataRevisionCursor(options: {
  readonly store: Pick<LocalMetadataStore, 'readPartitionRevision'>;
  readonly workspaceId: string;
  readonly domains: readonly string[];
}): LocalMetadataRevisionCursor {
  const workspaceId = options.workspaceId.trim();
  if (!workspaceId) throw new Error('Local metadata revision cursor requires a workspace id.');
  const domains = options.domains.map((domain) => domain.trim());
  if (
    domains.length === 0 ||
    domains.some((domain) => !domain) ||
    new Set(domains).size !== domains.length
  ) {
    throw new Error('Local metadata revision cursor domains must be unique non-empty strings.');
  }
  const observed = new Map<string, number>();
  let initialized = false;

  async function readRevisions(): Promise<readonly [string, number][]> {
    return Promise.all(
      domains.map(async (domain) => {
        const revision = await options.store.readPartitionRevision({
          scope: 'workspace',
          workspaceId,
          domain,
        });
        return [domain, revision?.revision ?? 0] as const;
      }),
    );
  }

  return {
    async initialize() {
      for (const [domain, revision] of await readRevisions()) observed.set(domain, revision);
      initialized = true;
    },
    async poll() {
      if (!initialized) {
        throw new Error('Local metadata revision cursor must be initialized before polling.');
      }
      const changedDomains: string[] = [];
      const revisions: Record<string, number> = {};
      for (const [domain, revision] of await readRevisions()) {
        const previous = observed.get(domain);
        if (previous === undefined) {
          throw new Error(`Local metadata revision cursor lost its baseline for ${domain}.`);
        }
        if (revision < previous) {
          throw new LocalMetadataError({
            code: 'metadata-transaction-failed',
            operation: 'poll-partition-revision',
            message: `Local metadata revision regressed for ${domain}: ${previous} -> ${revision}.`,
          });
        }
        if (revision > previous) {
          observed.set(domain, revision);
          changedDomains.push(domain);
          revisions[domain] = revision;
        }
      }
      return { changedDomains, revisions };
    },
  };
}
