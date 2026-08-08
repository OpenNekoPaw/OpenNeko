import { describe, expect, it } from 'vitest';
import {
  getAgentInputTriggerKind,
  isAgentInputCatalogEntryExecutable,
  isAgentInputTriggerBoundary,
  normalizeAgentInputTriggerName,
  parseAgentInputCatalog,
  parseAgentInputCatalogEntry,
  parseAgentInputTrigger,
} from '../agent-input-trigger';
import { normalizeSlashCommandName } from '../slash-command-utils';

describe('agent input triggers', () => {
  it('parses slash commands and dollar skills as separate namespaces', () => {
    expect(parseAgentInputTrigger('/review changed files')).toEqual({
      trigger: 'command',
      prefix: '/',
      name: 'review',
      args: 'changed files',
      startIndex: 0,
      endIndex: 7,
      rawToken: 'review',
    });

    expect(parseAgentInputTrigger('$review changed files')).toEqual({
      trigger: 'skill',
      prefix: '$',
      name: 'review',
      args: 'changed files',
      startIndex: 0,
      endIndex: 7,
      rawToken: 'review',
    });
  });

  it('parses at mentions without routing them as command or skill triggers', () => {
    expect(parseAgentInputTrigger('@scene.md')).toEqual({
      trigger: 'mention',
      prefix: '@',
      name: 'scene.md',
      startIndex: 0,
      endIndex: 9,
      rawToken: 'scene.md',
    });
  });

  it('returns null for unknown trigger tokens', () => {
    expect(parseAgentInputTrigger('#review')).toBeNull();
    expect(getAgentInputTriggerKind('#')).toBeUndefined();
  });

  it('extracts trailing arguments while preserving token end positions', () => {
    expect(parseAgentInputTrigger('  $commit-helper fix parser')).toEqual({
      trigger: 'skill',
      prefix: '$',
      name: 'commit-helper',
      args: 'fix parser',
      startIndex: 2,
      endIndex: 16,
      rawToken: 'commit-helper',
    });
  });

  it('requires trigger token boundaries by default', () => {
    expect(parseAgentInputTrigger('cost is $5')).toBeNull();
    expect(parseAgentInputTrigger('email/foo')).toBeNull();
    expect(isAgentInputTriggerBoundary('hello $skill', 6)).toBe(true);
    expect(isAgentInputTriggerBoundary('hello$skill', 5)).toBe(false);
  });

  it('supports explicit parsing from a known boundary index', () => {
    expect(parseAgentInputTrigger('ask $quality-review now', { startIndex: 4 })).toEqual({
      trigger: 'skill',
      prefix: '$',
      name: 'quality-review',
      args: 'now',
      startIndex: 4,
      endIndex: 19,
      rawToken: 'quality-review',
    });
  });

  it('normalizes trigger names consistently across input utilities', () => {
    expect(normalizeAgentInputTriggerName('$Quality-Review')).toBe('quality-review');
    expect(normalizeSlashCommandName('/Status')).toBe('status');
  });

  it('parses exact phase, binding, provenance and executable identities', () => {
    const entry = parseAgentInputCatalogEntry({
      id: 'skill:project:review',
      name: 'review',
      description: 'Review the current project.',
      trigger: 'skill',
      prefix: '$',
      phaseRequirement: 'any',
      bindingRequirement: 'workspace',
      source: { kind: 'project', workspaceId: 'workspace-1', sourceId: 'skills/review' },
      availability: { status: 'available' },
      executable: {
        kind: 'skill',
        skillName: 'review',
        activationId: 'skill-activation:workspace-1:review',
      },
    });

    expect(entry.source).toEqual({
      kind: 'project',
      workspaceId: 'workspace-1',
      sourceId: 'skills/review',
    });
    expect(
      isAgentInputCatalogEntryExecutable({
        entry,
        phase: 'draft',
        bindingKind: 'workspace',
      }),
    ).toBe(true);
    expect(
      isAgentInputCatalogEntryExecutable({
        entry,
        phase: 'draft',
        bindingKind: 'assistant',
      }),
    ).toBe(false);
  });

  it('projects compact as Session-only and fail-visible in Draft', () => {
    const compact = parseAgentInputCatalogEntry({
      id: 'command:builtin:compact',
      name: 'compact',
      description: 'Compact this Conversation context.',
      trigger: 'command',
      prefix: '/',
      phaseRequirement: 'session',
      bindingRequirement: 'any',
      source: { kind: 'builtin', sourceId: 'compact' },
      availability: {
        status: 'unavailable',
        diagnostic: {
          code: 'session-required',
          owner: 'agent-runtime',
          message: 'Compact requires an exact Conversation.',
        },
      },
      executable: {
        kind: 'command',
        commandId: 'compact',
        handlerId: 'builtin:compact',
      },
    });

    expect(compact.availability).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'session-required' },
    });
  });

  it('rejects duplicate or incomplete catalog identities per item boundary', () => {
    const entry = {
      id: 'command:builtin:help',
      name: 'help',
      description: 'Show help.',
      trigger: 'command',
      prefix: '/',
      phaseRequirement: 'any',
      bindingRequirement: 'any',
      source: { kind: 'builtin', sourceId: 'help' },
      availability: { status: 'available' },
      executable: { kind: 'command', commandId: 'help', handlerId: 'builtin:help' },
    };
    expect(() => parseAgentInputCatalog([entry, entry])).toThrow('Duplicate Agent input catalog');
    expect(() => parseAgentInputCatalogEntry({ ...entry, source: { kind: 'plugin' } })).toThrow(
      'unsupported fields',
    );
  });
});
