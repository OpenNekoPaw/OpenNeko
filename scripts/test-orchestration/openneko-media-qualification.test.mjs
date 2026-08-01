import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  createOpenNekoQualificationCommands,
  runOpenNekoQualification,
} from '../run-desktop-openneko-qualification.mjs';

describe('OpenNeko media qualification launcher', () => {
  it('builds and launches the isolated Electron qualification entry', () => {
    const commands = createOpenNekoQualificationCommands({
      platform: 'darwin',
      bundlePath: '/tmp/openneko-media-qualification-fixture/qualification.cjs',
    });

    assert.equal(commands.build.command, 'pnpm');
    assert.deepEqual(commands.build.args, [
      'exec',
      'esbuild',
      'apps/neko-desktop/src/main/desktop-openneko-qualification.ts',
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node24',
      '--external:electron',
      '--outfile=/tmp/openneko-media-qualification-fixture/qualification.cjs',
    ]);
    assert.deepEqual(commands.electron, {
      command: 'pnpm',
      args: [
        '--filter',
        '@neko/app-desktop',
        'exec',
        'electron',
        '/tmp/openneko-media-qualification-fixture/qualification.cjs',
      ],
    });
    assert.equal(
      createOpenNekoQualificationCommands({
        platform: 'win32',
        bundlePath: 'D:\\openneko-media-qualification-fixture\\qualification.cjs',
      }).electron.command,
      'pnpm.cmd',
    );
  });

  it('reads the passed report and always removes the isolated fixture root', async () => {
    const testRoot = await mkdtemp(join(tmpdir(), 'openneko-qualification-launcher-test-'));
    const fixtureRoot = join(testRoot, 'openneko-media-qualification-fixture');
    const reportPath = join(testRoot, 'reports', 'report.json');
    const launches = [];
    const removedRoots = [];
    await mkdir(dirname(reportPath), { recursive: true });

    try {
      const result = await runOpenNekoQualification({
        createTemporaryRoot: async () => fixtureRoot,
        reportPath,
        removeTemporaryRoot: async (root) => {
          removedRoots.push(root);
        },
        spawnProcess(command, args, options) {
          const child = new EventEmitter();
          launches.push({ command, args, environment: options.env });
          queueMicrotask(async () => {
            if (options.env.OPENNEKO_MEDIA_QUALIFICATION_REPORT) {
              await writeFile(
                options.env.OPENNEKO_MEDIA_QUALIFICATION_REPORT,
                JSON.stringify({ status: 'passed', runtime: { packaged: false } }),
              );
            }
            child.emit('exit', 0, null);
          });
          return child;
        },
      });

      assert.equal(result.reportPath, reportPath);
      assert.equal(result.report.status, 'passed');
      assert.equal(launches.length, 2);
      assert.equal(launches[1].environment.OPENNEKO_MEDIA_QUALIFICATION_ROOT, fixtureRoot);
      assert.equal(launches[1].environment.OPENNEKO_MEDIA_QUALIFICATION_REPORT, reportPath);
      assert.deepEqual(removedRoots, [fixtureRoot]);
      assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).status, 'passed');
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});
