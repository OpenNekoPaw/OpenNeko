import { describe, expect, it } from 'vitest';
import {
  getAgentInputTriggerKind,
  isAgentInputTriggerBoundary,
  normalizeAgentInputTriggerName,
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

  it('normalizes trigger names consistently with legacy slash normalization', () => {
    expect(normalizeAgentInputTriggerName('$Quality-Review')).toBe('quality-review');
    expect(normalizeSlashCommandName('/Status')).toBe('status');
  });
});
