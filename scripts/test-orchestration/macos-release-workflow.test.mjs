import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

describe('macOS release publication boundary', () => {
  it('keeps native Desktop builds and release publication out of GitHub Actions', async () => {
    const workflowNames = (await readdir('.github/workflows')).filter((name) =>
      /\.ya?ml$/u.test(name),
    );
    assert.ok(workflowNames.includes('ci.yml'));
    assert.equal(workflowNames.includes('release.yml'), false);

    const workflowSources = await Promise.all(
      workflowNames.map((name) => readFile(`.github/workflows/${name}`, 'utf8')),
    );
    const ciWorkflow = parse(
      workflowSources[workflowNames.findIndex((name) => name === 'ci.yml')],
    );
    assert.deepEqual(Object.keys(ciWorkflow.on).sort(), ['pull_request', 'workflow_dispatch']);
    assert.equal(ciWorkflow.on.push, undefined);
    assert.equal(ciWorkflow.jobs?.['desktop-package'], undefined);

    for (const source of workflowSources) {
      for (const forbidden of [
        'package:desktop',
        'make:desktop',
        'electron-forge',
        'openneko-darwin-arm64',
        'apps/neko-desktop/out',
        'gh release create',
        '--prerelease',
      ]) {
        assert.doesNotMatch(source, new RegExp(escapeRegExp(forbidden), 'u'));
      }
    }
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
