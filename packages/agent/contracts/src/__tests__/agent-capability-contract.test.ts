import { describe, expect, it } from 'vitest';
import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProvider,
  AgentCapabilityProviderAvailabilitySummary,
  AgentCapabilityRuntimeRequirements,
  AgentReferenceCandidate,
  AgentReferenceContributor,
  CapabilityDeclaration,
} from '../index';

describe('agent capability Desktop contracts', () => {
  it('models Desktop runtime requirements', () => {
    const requirements: AgentCapabilityRuntimeRequirements = {
      desktop: true,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    };

    expect(requirements).toEqual({
      desktop: true,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    });
  });

  it('models provider and declaration runtime requirements', () => {
    const provider: AgentCapabilityProvider = {
      id: 'neko-assets',
      hostRequirements: [{ host: 'desktop' }],
      requirements: {
        contentAccess: true,
        desktop: true,
      },
      getTools: () => [],
    };
    const declaration: CapabilityDeclaration = {
      type: 'tool',
      name: 'assets.list',
      description: 'List assets',
      requirements: {
        writableProject: false,
      },
    };

    expect(provider.requirements?.contentAccess).toBe(true);
    expect(declaration.requirements?.writableProject).toBe(false);
  });

  it('models fail-visible availability diagnostics', () => {
    const diagnostic: AgentCapabilityAvailabilityDiagnostic = {
      level: 'warn',
      providerId: 'neko-cut',
      contributionKind: 'tool',
      contributionName: 'cut.revealTimeline',
      code: 'capability.unavailable',
      reason: 'requires-content-access',
      message: 'Tool is unavailable because Desktop content access is not ready.',
      requirement: 'contentAccess',
      host: 'desktop',
    };

    expect(diagnostic.reason).toBe('requires-content-access');
    expect(diagnostic.host).toBe('desktop');
  });

  it('models provider availability summaries', () => {
    const diagnostic: AgentCapabilityAvailabilityDiagnostic = {
      level: 'warn',
      providerId: 'neko-cut',
      contributionKind: 'provider',
      code: 'capability.unavailable',
      reason: 'host-not-supported',
      message: 'Provider is unavailable in Desktop.',
      host: 'desktop',
    };
    const summary: AgentCapabilityProviderAvailabilitySummary = {
      providerId: 'neko-cut',
      loaded: [{ kind: 'tool', name: 'assets.list' }],
      skipped: [diagnostic],
    };

    expect(summary.loaded).toEqual([{ kind: 'tool', name: 'assets.list' }]);
    expect(summary.skipped).toEqual([diagnostic]);
  });

  it('models reference contributors', async () => {
    const candidate: AgentReferenceCandidate = {
      id: 'asset:hero',
      label: 'Hero',
      source: 'assets',
      kind: 'asset',
      insertText: '@asset:hero',
      description: 'Main character reference',
      metadata: {
        category: 'character',
      },
    };
    const contributor: AgentReferenceContributor = {
      id: 'neko-assets',
      displayName: 'Assets',
      search: async () => ({ candidates: [candidate], diagnostics: [] }),
    };

    await expect(contributor.search({ query: 'hero', limit: 5 })).resolves.toEqual({
      candidates: [candidate],
      diagnostics: [],
    });
  });
});
