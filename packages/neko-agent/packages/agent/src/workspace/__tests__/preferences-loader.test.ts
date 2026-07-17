import { describe, it, expect } from 'vitest';
import { createNekoPaths } from '../neko-paths';
import { loadPreferences, type PreferencesFsOps } from '../preferences-loader';

function memFs(files: Record<string, string>): PreferencesFsOps {
  return {
    async readFile(path: string): Promise<string> {
      const v = files[path];
      if (v === undefined) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return v;
    },
  };
}

describe('loadPreferences', () => {
  const paths = createNekoPaths('/r');

  it('both files absent → empty merged result', async () => {
    const { merged, warnings } = await loadPreferences({
      paths,
      globalPath: '/h/.neko/preferences.md',
      fsOps: memFs({}),
    });
    expect(merged.project).toBeNull();
    expect(merged.global).toBeNull();
    expect(merged.effective.alwaysApprove).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('project only', async () => {
    const { merged } = await loadPreferences({
      paths,
      fsOps: memFs({
        '/r/.neko/preferences.md': `## Always approve\n- tool:X\n`,
      }),
    });
    expect(merged.project).not.toBeNull();
    expect(merged.global).toBeNull();
    expect(merged.effective.alwaysApprove).toHaveLength(1);
  });

  it('global only', async () => {
    const { merged } = await loadPreferences({
      paths,
      globalPath: '/h/.neko/preferences.md',
      fsOps: memFs({
        '/h/.neko/preferences.md': `## Always approve\n- tool:Y\n`,
      }),
    });
    expect(merged.project).toBeNull();
    expect(merged.global).not.toBeNull();
    expect(merged.effective.alwaysApprove[0]!.value).toBe('Y');
  });

  it('both layers merge', async () => {
    const { merged } = await loadPreferences({
      paths,
      globalPath: '/h/.neko/preferences.md',
      fsOps: memFs({
        '/r/.neko/preferences.md': `## Always approve\n- tool:X\n`,
        '/h/.neko/preferences.md': `## Always approve\n- tool:Y\n## Cost thresholds\n- maxTokens > 1000\n`,
      }),
    });
    expect(merged.effective.alwaysApprove).toHaveLength(2);
    expect(merged.effective.costThresholds.maxTokens).toBe(1000);
  });

  it('warnings prefixed with layer + path', async () => {
    const { warnings } = await loadPreferences({
      paths,
      globalPath: '/h/.neko/preferences.md',
      fsOps: memFs({
        '/r/.neko/preferences.md': `## Cost thresholds\n- maxTokens huh\n`,
        '/h/.neko/preferences.md': `## Default mode\nyolo\n`,
      }),
    });
    expect(warnings.some((w) => w.startsWith('[project]'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('[global]'))).toBe(true);
  });

  it('resolves project path at <root>/.neko/preferences.md (not under a subdir)', async () => {
    let requestedPath = '';
    const fsOps: PreferencesFsOps = {
      async readFile(path: string): Promise<string> {
        requestedPath = path;
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      },
    };
    await loadPreferences({ paths, fsOps });
    expect(requestedPath).toBe('/r/.neko/preferences.md');
  });
});
