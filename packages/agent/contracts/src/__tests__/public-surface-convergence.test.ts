import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

const PACKAGE_ROOT = join(__dirname, '..', '..');

const REMOVED_CONTRACT_FILES = [
  'agent-observation.ts',
  'agent-profile.ts',
  'agent-token-budget.ts',
  'agent-trace.ts',
  'agent-turn-capability.ts',
  'artifact-transfer.ts',
  'comic-animation-indexing.ts',
  'composite-artifact.ts',
  'composite-content-contract.ts',
  'creative-domain.ts',
  'decision-rationale.ts',
  'enabled-state.ts',
  'message.ts',
  'multimodal-context.ts',
  'multimodal-tooling.ts',
  'perception-card.ts',
  'phase.ts',
  'platform.ts',
  'plugin-transfer-contract.ts',
  'provider-card.ts',
  'provider.ts',
  'recovery-guidance.ts',
  'retired-conversation-unavailable.ts',
  'shot-image-prep.ts',
  'settings.ts',
  'storyboard-plan-overlay.ts',
  'tool-names.ts',
  'tool-planning.ts',
  'tool-summary.ts',
  'tool.ts',
] as const;

describe('Agent Contracts public surface convergence', () => {
  it('keeps the canonical DSH and Agent Entry codecs reachable', () => {
    expect(contracts).toHaveProperty('decodeDshAcpDomainToolRequest');
    expect(contracts).toHaveProperty('decodeDshAcpSessionEventNotification');
    expect(contracts).toHaveProperty('AGENT_ENTRY_MODES');
    expect(contracts).toHaveProperty('parseAgentEntryTargetBinding');
    expect(contracts).toHaveProperty('parseAgentInputTrigger');
  });

  it('keeps retired pre-DSH runtime models out of the root entry', () => {
    for (const removed of [
      'NEKO_PLUGIN_IDS',
      'resolveAgentTokenBudget',
      'validateAgentProfileDescriptorSet',
      'buildComicAnimationReviewArtifact',
      'parseCompositeContentJson',
      'projectRetiredConversationUnavailable',
      'getToolSummary',
    ]) {
      expect(contracts).not.toHaveProperty(removed);
    }
  });

  it('deletes the retired contract files instead of retaining compatibility modules', () => {
    for (const file of REMOVED_CONTRACT_FILES) {
      expect(existsSync(join(PACKAGE_ROOT, 'src', file)), file).toBe(false);
    }
  });

  it('drops cross-domain dependencies owned only by the retired graph', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    for (const dependency of [
      '@neko/chara-domain',
      '@neko/entity-domain',
      '@neko/media',
      '@neko/search-domain',
    ]) {
      expect(manifest.dependencies).not.toHaveProperty(dependency);
    }
  });
});
