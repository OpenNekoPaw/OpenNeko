import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import forgeConfig from '../../forge.config';
import {
  DESKTOP_BUILTIN_SKILL_RESOURCE_DIRECTORY,
  resolveDesktopBuiltinSkillRoot,
} from './desktop-builtin-skill-root';

describe('Desktop builtin Skill root', () => {
  it('resolves the monorepo Skill source in development', () => {
    expect(
      resolveDesktopBuiltinSkillRoot({
        appPath: '/repo/apps/neko-desktop',
        isPackaged: false,
        resourcesPath: '/ignored',
      }),
    ).toBe(resolve('/repo/apps/neko-desktop', '../../packages/skills/skills'));
  });

  it('resolves the copied application resource in a packaged build', () => {
    expect(
      resolveDesktopBuiltinSkillRoot({
        appPath: '/ignored',
        isPackaged: true,
        resourcesPath: '/Applications/OpenNeko.app/Contents/Resources',
      }),
    ).toBe(
      join(
        '/Applications/OpenNeko.app/Contents/Resources',
        DESKTOP_BUILTIN_SKILL_RESOURCE_DIRECTORY,
      ),
    );
  });

  it('registers the real builtin Skill source as an Electron package resource', async () => {
    const sourceRoot = resolveDesktopBuiltinSkillRoot({
      appPath: resolve(import.meta.dirname, '../..'),
      isPackaged: false,
      resourcesPath: '/ignored',
    });
    const bundledExtensionRoot = resolve(import.meta.dirname, '../../resources/extensions');
    const dshRuntimeStageRoot = resolve(import.meta.dirname, '../../.vite/runtime-stage/dsh-runtime');

    await expect(access(join(sourceRoot, 'storyboard', 'SKILL.md'))).resolves.toBeUndefined();
    await expect(
      access(join(bundledExtensionRoot, 'plugins', 'browser-use', 'plugin.json')),
    ).resolves.toBeUndefined();
    expect(forgeConfig.packagerConfig?.extraResource).toEqual([
      sourceRoot,
      bundledExtensionRoot,
      dshRuntimeStageRoot,
    ]);
  });
});
