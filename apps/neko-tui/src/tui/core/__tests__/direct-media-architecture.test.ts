import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('direct media CLI architecture', () => {
  it('does not import or execute AgentSession runtime paths', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'direct-media-command.ts'),
      'utf8',
    );

    for (const forbidden of [
      'AgentSession',
      'createAgentRuntimeSession',
      'buildAgentWorkspaceRuntimeSessionAssemblyInput',
      '.execute(',
      'submitPrompt',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps media kinds flat without music or TTS command branches', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', '..', 'cli.tsx'),
      'utf8',
    );

    expect(source).toContain("['image', 'video', 'audio'] as const");
    expect(source).not.toMatch(/\.command\(['"](?:generate|music|tts)['"]\)/i);
  });
});
