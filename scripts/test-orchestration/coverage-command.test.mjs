import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const ROOT_PACKAGE_PATH = 'package.json';
const TEST_OWNERSHIP_PATH = 'quality/test-ownership.json';

describe('coverage command orchestration', () => {
  it('keeps every owned Vitest package non-interactive with one effective run mode', async () => {
    const [rootPackage, testOwnership] = await Promise.all([
      readPackageJson(ROOT_PACKAGE_PATH),
      readPackageJson(TEST_OWNERSHIP_PATH),
    ]);
    const coverageCommand = rootPackage.scripts?.['test:coverage'];

    assert.equal(typeof coverageCommand, 'string', 'root test:coverage script must exist');
    const forwardedArguments = coverageCommand.split(' -- ')[1]?.trim().split(/\s+/u) ?? [];
    assert.deepEqual(forwardedArguments, ['--coverage']);

    for (const workspace of testOwnership.workspaces) {
      const packagePath = `${workspace.path}/package.json`;
      const packageJson = await readPackageJson(packagePath);
      const packageTestCommand = packageJson.scripts?.test;
      assert.equal(typeof packageTestCommand, 'string', `${packagePath} must define scripts.test`);

      const effectiveArguments = [
        ...packageTestCommand.trim().split(/\s+/u),
        ...forwardedArguments,
      ];
      const runModeCount = effectiveArguments.filter(
        (argument) => argument === 'run' || argument === '--run',
      ).length;

      assert.match(packageTestCommand, /^vitest\s+(?:run|--run)(?:\s|$)/u, packagePath);
      assert.equal(runModeCount, 1, `${packagePath} must select the Vitest run mode exactly once`);
    }

    assert.doesNotMatch(
      rootPackage.scripts?.['check:fast'] ?? '',
      /pnpm\s+test\s+--\s+--run/u,
      'the root must not forward a second run mode into package-owned test commands',
    );
  });
});

async function readPackageJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
