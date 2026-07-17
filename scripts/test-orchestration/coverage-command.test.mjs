import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const ROOT_PACKAGE_PATH = 'package.json';
const CANVAS_DOMAIN_PACKAGE_PATH = 'packages/neko-canvas/packages/domain/package.json';

describe('coverage command orchestration', () => {
  it('does not duplicate the Vitest run mode owned by a package', async () => {
    const [rootPackage, canvasDomainPackage] = await Promise.all([
      readPackageJson(ROOT_PACKAGE_PATH),
      readPackageJson(CANVAS_DOMAIN_PACKAGE_PATH),
    ]);
    const coverageCommand = rootPackage.scripts?.['test:coverage'];
    const packageTestCommand = canvasDomainPackage.scripts?.test;

    assert.equal(typeof coverageCommand, 'string', 'root test:coverage script must exist');
    assert.equal(typeof packageTestCommand, 'string', 'Canvas domain test script must exist');

    const forwardedArguments = coverageCommand.split(' -- ')[1]?.trim().split(/\s+/u) ?? [];
    const effectiveArguments = [...packageTestCommand.trim().split(/\s+/u), ...forwardedArguments];
    const runModeCount = effectiveArguments.filter(
      (argument) => argument === 'run' || argument === '--run',
    ).length;

    assert.deepEqual(forwardedArguments, ['--coverage']);
    assert.equal(runModeCount, 1, 'Vitest run mode must be selected exactly once');
  });
});

async function readPackageJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
