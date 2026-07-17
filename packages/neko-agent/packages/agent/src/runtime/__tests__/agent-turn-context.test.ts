import { describe, expect, it } from 'vitest';
import { createAgentTurnContext, inferAgentTurnProjectType } from '../turn/agent-turn-context';

describe('agent turn context', () => {
  it('infers supported project types from active editor snapshots', () => {
    expect(inferAgentTurnProjectType({ type: 'video' })).toBe('video');
    expect(inferAgentTurnProjectType({ type: 'storyboard' })).toBe('storyboard');
    expect(inferAgentTurnProjectType({ type: 'image' })).toBe('image');
    expect(inferAgentTurnProjectType({ type: 'text' })).toBe('unknown');
    expect(inferAgentTurnProjectType(undefined)).toBe('unknown');
  });

  it('creates the default mutable agent turn context shape', () => {
    const activeEditor = { type: 'video', id: 'editor-1' };
    expect(
      createAgentTurnContext({
        activeEditor,
        workspaceRoot: '/workspace',
      }),
    ).toEqual({
      activeEditor,
      workspaceRoot: '/workspace',
      selection: undefined,
      openFiles: [],
      projectType: 'video',
      userPreferences: {},
      custom: {},
    });
  });
});
