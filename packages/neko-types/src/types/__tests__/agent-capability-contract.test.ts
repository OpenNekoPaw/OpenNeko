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

describe('agent capability host-agnostic contracts', () => {
  it('models runtime requirements for TUI filtering', () => {
    const requirements: AgentCapabilityRuntimeRequirements = {
      vscode: false,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    };

    expect(requirements).toEqual({
      vscode: false,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    });
  });

  it('models provider and declaration runtime requirements', () => {
    const provider: AgentCapabilityProvider = {
      id: 'neko-assets',
      version: '1.0.0',
      hostRequirements: [{ host: 'tui' }],
      requirements: {
        contentAccess: true,
        vscode: false,
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
      reason: 'requires-vscode',
      message: 'Tool is unavailable in TUI because it requires VSCode.',
      requirement: 'vscode',
      host: 'tui',
    };

    expect(diagnostic.reason).toBe('requires-vscode');
    expect(diagnostic.host).toBe('tui');
  });

  it('models provider availability summaries', () => {
    const diagnostic: AgentCapabilityAvailabilityDiagnostic = {
      level: 'warn',
      providerId: 'neko-cut',
      contributionKind: 'provider',
      code: 'capability.unavailable',
      reason: 'host-not-supported',
      message: 'Provider is unavailable in TUI.',
      host: 'tui',
    };
    const summary: AgentCapabilityProviderAvailabilitySummary = {
      providerId: 'neko-cut',
      version: '1.0.0',
      loaded: [{ kind: 'tool', name: 'assets.list' }],
      skipped: [diagnostic],
    };

    expect(summary.loaded).toEqual([{ kind: 'tool', name: 'assets.list' }]);
    expect(summary.skipped).toEqual([diagnostic]);
  });

  it('models terminal-safe reference contributors', async () => {
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
