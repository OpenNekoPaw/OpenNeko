import { describe, expect, it } from 'vitest';
import {
  deriveInputSuggestionMenu,
  selectInputSuggestion,
  type InputSuggestionSources,
} from './input-suggestions';

const sources: InputSuggestionSources = {
  commands: [
    { name: 'model', description: 'Select model' },
    { name: 'media', description: 'Select media model' },
    { name: 'status', description: 'Show status' },
  ],
  skills: [
    { trigger: '$', name: 'review', description: 'Review changes', kind: 'skill' },
    { trigger: '$', name: 'storyboard', description: 'Storyboard helper', kind: 'skill' },
  ],
  references: [
    {
      trigger: '@',
      name: 'script.md',
      description: 'workspace file',
      kind: 'file',
      matchText: 'docs/script.md',
      insertText: '@script.md ',
    },
    {
      trigger: '@',
      name: 'asset:image:hero',
      description: 'generated image ref',
      kind: 'asset',
    },
  ],
};

describe('deriveInputSuggestionMenu', () => {
  it('filters slash commands without leaking skills', () => {
    const menu = deriveInputSuggestionMenu('/mo', sources);

    expect(menu?.trigger).toBe('/');
    expect(menu?.options.map((option) => option.name)).toEqual(['model']);
    expect(menu?.options.every((option) => option.trigger === '/')).toBe(true);
  });

  it('filters dollar Skill suggestions without leaking slash commands', () => {
    const menu = deriveInputSuggestionMenu('$re', sources);

    expect(menu?.trigger).toBe('$');
    expect(menu?.options.map((option) => option.name)).toEqual(['review']);
    expect(menu?.options.every((option) => option.trigger === '$')).toBe(true);
  });

  it('filters at-reference suggestions without rendering previews', () => {
    const menu = deriveInputSuggestionMenu('@hero', sources);

    expect(menu?.trigger).toBe('@');
    expect(menu?.options).toEqual([
      {
        trigger: '@',
        name: 'asset:image:hero',
        description: 'generated image ref',
        kind: 'asset',
      },
    ]);
  });

  it('matches references by path text without leaking other namespaces', () => {
    const menu = deriveInputSuggestionMenu('@docs', sources);

    expect(menu?.trigger).toBe('@');
    expect(menu?.options.map((option) => option.name)).toEqual(['script.md']);
    expect(menu?.options.every((option) => option.trigger === '@')).toBe(true);
  });

  it('returns null after a trigger token contains a space', () => {
    expect(deriveInputSuggestionMenu('/model ', sources)).toBeNull();
    expect(deriveInputSuggestionMenu('$review ', sources)).toBeNull();
    expect(deriveInputSuggestionMenu('@script.md ', sources)).toBeNull();
  });
});

describe('selectInputSuggestion', () => {
  it('uses trigger-prefixed terminal text for selected suggestions', () => {
    expect(selectInputSuggestion({ trigger: '$', name: 'review' })).toBe('$review ');
    expect(selectInputSuggestion({ trigger: '/', name: 'status' })).toBe('/status ');
  });

  it('uses explicit insert text for references', () => {
    expect(
      selectInputSuggestion({
        trigger: '@',
        name: 'script.md',
        insertText: '@script.md ',
      }),
    ).toBe('@script.md ');
  });
});
