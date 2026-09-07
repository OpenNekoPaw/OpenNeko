import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const desktopRequire = createRequire(
  new URL('../../apps/neko-desktop/package.json', import.meta.url),
);
const cliRequire = createRequire(desktopRequire.resolve('@electron-forge/cli/package.json'));
const forgeRequire = createRequire(cliRequire.resolve('@electron-forge/core'));
const packagerRequire = createRequire(forgeRequire.resolve('@electron/packager'));
const signingEntry = packagerRequire.resolve('@electron/osx-sign');

it(
  'scans the complete signing tree under a low file descriptor limit',
  {
    skip: process.platform === 'win32' ? 'requires a POSIX file descriptor limit' : false,
  },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-signing-traversal-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const contents = join(root, 'OpenNeko.app', 'Contents');
    const payload = join(contents, 'Resources', 'dsh-runtime', 'darwin-arm64', 'payload');
    const framework = join(contents, 'Frameworks', 'Example.framework');
    const helper = join(framework, 'Helpers', 'Helper.app');
    const binary = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]);
    const expected = [];
    for (let group = 0; group < 16; group += 1) {
      const directory = join(payload, `dependency-${group}`);
      await mkdir(directory, { recursive: true });
      for (let file = 0; file < 64; file += 1) {
        const filePath = join(directory, `file-${file}`);
        await writeFile(filePath, file % 2 === 0 ? binary : 'export const value = true;\n');
        if (file % 2 === 0) expected.push(filePath);
      }
    }
    await mkdir(helper, { recursive: true });
    const helperBinary = join(helper, 'helper');
    await writeFile(helperBinary, binary);
    expected.push(framework, helper, helperBinary);
    const temporarySignature = join(framework, 'signature.cstemp');
    await writeFile(temporarySignature, binary);
    const runner = join(root, 'scan.cjs');
    await writeFile(
      runner,
      `
    const assert = require('node:assert/strict');
    const { walkAsync } = require(process.argv[2]);
    (async () => {
      const files = await walkAsync(process.argv[3]);
      await assert.rejects(walkAsync(process.argv[3] + '/missing'), { code: 'ENOENT' });
      process.stdout.write(JSON.stringify(files));
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `,
    );
    const { stdout } = await executeFile('/bin/sh', [
      '-c',
      'ulimit -n 64 && exec "$@"',
      'signing-scan',
      process.execPath,
      runner,
      signingEntry,
      contents,
    ]);
    const paths = JSON.parse(stdout);
    assert.deepEqual([...paths].sort(), expected.sort());
    assert.ok(paths.indexOf(helperBinary) < paths.indexOf(helper));
    assert.ok(paths.indexOf(helper) < paths.indexOf(framework));
    await assert.rejects(readFile(temporarySignature), { code: 'ENOENT' });
    assert.deepEqual(await readFile(join(payload, 'dependency-0', 'file-0')), binary);
  },
);
