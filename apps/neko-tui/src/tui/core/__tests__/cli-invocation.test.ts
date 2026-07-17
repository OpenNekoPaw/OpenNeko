import { describe, expect, it } from 'vitest';
import { joinPromptParts, resolveDefaultCliInvocation } from '../cli-invocation';

describe('resolveDefaultCliInvocation', () => {
  it('keeps a single existing directory argument as the positional workDir', () => {
    expect(
      resolveDefaultCliInvocation(['/workspace/project'], {
        isDirectory: (value) => value === '/workspace/project',
      }),
    ).toEqual({ positionalWorkDir: '/workspace/project' });
  });

  it('treats non-directory top-level arguments as an initial prompt', () => {
    expect(
      resolveDefaultCliInvocation(['draft', 'a', 'shot', 'list'], {
        isDirectory: () => false,
      }),
    ).toEqual({ prompt: 'draft a shot list' });
  });

  it('supports an existing directory followed by an initial prompt', () => {
    expect(
      resolveDefaultCliInvocation(['/workspace/project', 'draft', 'a', 'shot', 'list'], {
        isDirectory: (value) => value === '/workspace/project',
      }),
    ).toEqual({
      positionalWorkDir: '/workspace/project',
      prompt: 'draft a shot list',
    });
  });
});

describe('joinPromptParts', () => {
  it('returns undefined for empty prompt input', () => {
    expect(joinPromptParts([])).toBeUndefined();
    expect(joinPromptParts(undefined)).toBeUndefined();
  });
});
