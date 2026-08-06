import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeDesktopFunctionalWorkspaceSelection,
  resolveDesktopAgentAutomationLaunch,
  resolveDesktopFunctionalCutExport,
  resolveDesktopFunctionalWorkspace,
  resolveDesktopFunctionalWindowMode,
  resolveDesktopRuntimeHome,
} from './desktop-functional-fixture';

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('Desktop functional fixture home', () => {
  it('keeps the system home for ordinary Desktop startup', () => {
    expect(
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: [],
        environment: {},
      }),
    ).toBe('/Users/example');
  });

  it('keeps ordinary and functional startup visible unless isolated hidden mode is explicit', () => {
    expect(resolveDesktopFunctionalWindowMode([])).toBe('visible');
    expect(resolveDesktopFunctionalWindowMode(['--openneko-functional-fixture'])).toBe('visible');
    expect(
      resolveDesktopFunctionalWindowMode([
        '--openneko-functional-fixture',
        '--openneko-functional-hidden',
      ]),
    ).toBe('hidden');
    expect(() => resolveDesktopFunctionalWindowMode(['--openneko-functional-hidden'])).toThrow(
      'explicit fixture argument',
    );
  });

  it('accepts only an explicitly enabled, isolated absolute fixture root', () => {
    expect(
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: ['--openneko-functional-fixture'],
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_HOME:
            '/private/tmp/openneko-desktop-functional-library-browser',
        },
      }),
    ).toBe('/private/tmp/openneko-desktop-functional-library-browser');

    for (const environment of [
      { OPENNEKO_DESKTOP_FUNCTIONAL_HOME: 'relative-fixture' },
      { OPENNEKO_DESKTOP_FUNCTIONAL_HOME: '/Users/example' },
    ]) {
      expect(() =>
        resolveDesktopRuntimeHome({
          systemHome: '/Users/example',
          argv: ['--openneko-functional-fixture'],
          environment,
        }),
      ).toThrow('functional fixture home');
    }
  });

  it('rejects a fixture launch before storage can fall back to the system home', () => {
    expect(() =>
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: ['--openneko-functional-fixture'],
        environment: {},
      }),
    ).toThrow('explicit isolated fixture home');
  });

  it('rejects an environment override without the explicit fixture argument', () => {
    expect(() =>
      resolveDesktopRuntimeHome({
        systemHome: '/Users/example',
        argv: [],
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_HOME:
            '/private/tmp/openneko-desktop-functional-library-browser',
        },
      }),
    ).toThrow('explicit fixture argument');
  });

  it('accepts a functional workspace only inside the isolated fixture home', () => {
    const fixtureHome = '/private/tmp/openneko-desktop-functional-media';
    expect(
      resolveDesktopFunctionalWorkspace({
        argv: ['--openneko-functional-fixture'],
        fixtureHome,
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: `${fixtureHome}/workspace`,
        },
      }),
    ).toBe(`${fixtureHome}/workspace`);

    for (const workspace of [
      'relative-workspace',
      '/private/tmp/unrelated-workspace',
      fixtureHome,
    ]) {
      expect(() =>
        resolveDesktopFunctionalWorkspace({
          argv: ['--openneko-functional-fixture'],
          fixtureHome,
          environment: { OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: workspace },
        }),
      ).toThrow('functional workspace');
    }
  });

  it('consumes exact queued Workspace selections only inside the isolated fixture', async () => {
    const fixtureHome = await mkdtemp(join(tmpdir(), 'openneko-desktop-functional-queue-'));
    fixtureRoots.push(fixtureHome);
    await Promise.all([
      mkdir(join(fixtureHome, 'workspace-a')),
      mkdir(join(fixtureHome, 'workspace-b')),
    ]);
    await writeFile(
      join(fixtureHome, '.openneko-functional-workspace-queue.json'),
      `${JSON.stringify(['workspace-a', 'workspace-b'])}\n`,
      'utf8',
    );
    const input = { argv: ['--openneko-functional-fixture'], fixtureHome };

    await expect(consumeDesktopFunctionalWorkspaceSelection(input)).resolves.toBe(
      join(fixtureHome, 'workspace-a'),
    );
    await expect(consumeDesktopFunctionalWorkspaceSelection(input)).resolves.toBe(
      join(fixtureHome, 'workspace-b'),
    );
    await expect(consumeDesktopFunctionalWorkspaceSelection(input)).resolves.toBeUndefined();
  });

  it('rejects a functional workspace override without the explicit fixture argument', () => {
    expect(() =>
      resolveDesktopFunctionalWorkspace({
        argv: [],
        fixtureHome: '/private/tmp/openneko-desktop-functional-media',
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE:
            '/private/tmp/openneko-desktop-functional-media/workspace',
        },
      }),
    ).toThrow('explicit fixture argument');
  });

  it('accepts a Cut export only inside an explicitly isolated fixture Workspace', () => {
    const workspace = '/private/tmp/openneko-desktop-functional-cut/workspace';
    expect(
      resolveDesktopFunctionalCutExport({
        argv: ['--openneko-functional-fixture'],
        workspace,
        environment: {
          OPENNEKO_DESKTOP_FUNCTIONAL_CUT_EXPORT: `${workspace}/exports/qualified.mp4`,
        },
      }),
    ).toBe('exports/qualified.mp4');
    for (const target of [
      'relative.mp4',
      '/private/tmp/outside.mp4',
      `${workspace}/exports/invalid.txt`,
    ]) {
      expect(() =>
        resolveDesktopFunctionalCutExport({
          argv: ['--openneko-functional-fixture'],
          workspace,
          environment: { OPENNEKO_DESKTOP_FUNCTIONAL_CUT_EXPORT: target },
        }),
      ).toThrow('functional Cut export');
    }
  });

  it('enables Agent automation only for a fixture Workspace and contained userData', () => {
    const fixtureHome = '/private/tmp/openneko-desktop-functional-agent';
    expect(
      resolveDesktopAgentAutomationLaunch({
        argv: [],
        fixtureHome,
        userDataRoot: `${fixtureHome}/electron-user-data`,
        workspace: `${fixtureHome}/workspace`,
      }),
    ).toBe(false);
    expect(
      resolveDesktopAgentAutomationLaunch({
        argv: ['--openneko-functional-fixture'],
        fixtureHome,
        userDataRoot: `${fixtureHome}/electron-user-data`,
        workspace: `${fixtureHome}/workspace`,
      }),
    ).toBe(true);
    expect(() =>
      resolveDesktopAgentAutomationLaunch({
        argv: ['--openneko-functional-fixture'],
        fixtureHome,
        userDataRoot: '/private/tmp/shared-user-data',
        workspace: `${fixtureHome}/workspace`,
      }),
    ).toThrow('isolated Electron userData');
  });
});
