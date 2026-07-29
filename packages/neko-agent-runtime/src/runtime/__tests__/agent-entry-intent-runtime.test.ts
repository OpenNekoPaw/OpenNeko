import { describe, expect, it } from 'vitest';
import {
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildAgentPromptCommandMessage,
  buildAgentScriptCommandMessage,
  inferAgentCreationIntentFromFilePath,
  inferAgentFileContextType,
} from '../agent-entry-intent-runtime';

describe('agent entry intent runtime', () => {
  it('builds generic Agent command messages', () => {
    expect(buildAgentPromptCommandMessage({ kind: 'generate-image', prompt: 'cat' })).toBe(
      'Generate an image: cat',
    );
    expect(buildAgentScriptCommandMessage({ kind: 'optimize', text: 'draft' })).toBe(
      'Optimize this script: draft',
    );
    expect(buildAgentCreationMessage({ intent: 'Create', sourceFilePath: 'story.md' })).toBe(
      'Create. Source file: story.md',
    );
  });

  it('builds generic file context without domain-specific execution policy', () => {
    expect(inferAgentCreationIntentFromFilePath('story.md')).toBe('Create a video from this text');
    expect(inferAgentFileContextType('frame.png')).toBe('image');
    expect(
      buildAgentFileContextPayload({
        filePath: '/workspace/story.md',
        relativePath: 'story.md',
        now: () => 7,
      }),
    ).toEqual({
      type: 'file',
      id: 'file:/workspace/story.md:7',
      label: 'story.md',
      summary: 'File: story.md',
      data: { filePath: '/workspace/story.md', relativePath: 'story.md' },
    });
  });
});
