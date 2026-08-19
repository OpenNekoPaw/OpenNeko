import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FILES = ['app-host.ts', 'index.ts', 'ipc.ts'];

describe('retired Extension/Personal Skill composition poison', () => {
  it('does not import or instantiate retired Extension/Personal Skill managers in Desktop Main', async () => {
    for (const file of FILES) {
      const source = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/@neko\/agent-runtime\/extensions/);
      expect(source).not.toMatch(/AgentExtensionManager|PersonalSkillManager|createAgentExtensionManager|createPersonalSkillManager/);
      expect(source).not.toMatch(/executeExtensionManagement|extensionManager|personalSkillManager|selectLocalPluginDirectory/);
    }
  });
});
