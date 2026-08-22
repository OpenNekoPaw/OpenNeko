import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const FILES = [
  new URL('./app-host.ts', import.meta.url),
  new URL('./index.ts', import.meta.url),
  new URL('./ipc.ts', import.meta.url),
  new URL('../preload/index.ts', import.meta.url),
  new URL('../renderer/DesktopShell.tsx', import.meta.url),
  new URL('../shared/global.d.ts', import.meta.url),
];

describe('retired Plugin and Automation management composition poison', () => {
  it('does not expose retired Plugin authorities or Automation management services from Desktop', async () => {
    for (const file of FILES) {
      const source = await readFile(file, 'utf8');
      expect(source).not.toMatch(/@neko\/agent-runtime\/extensions/);
      expect(source).not.toMatch(/AgentExtensionManager|PersonalSkillManager|createAgentExtensionManager|createPersonalSkillManager/);
      expect(source).not.toMatch(/executeExtensionManagement|extensionManager|personalSkillManager|selectLocalPluginDirectory/);
      expect(source).not.toMatch(/plugin_states|pluginStates|plugin\.install|plugin\.enable|plugin\.remove/);
      expect(source).not.toMatch(/automationLocalRuntimes|automationPermissions/);
      expect(source).not.toMatch(/local-runtime-management|permission-management/);
    }
  });
});
