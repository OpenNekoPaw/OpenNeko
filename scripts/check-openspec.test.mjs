import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { inspectOpenSpecPolicy } from './check-openspec.mjs';

test('checks active proposal structure and completion against actual files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openneko-proposal-policy-'));
  try {
    const write = async (path, content) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    };
    await write('openspec/changes/capability/proposal.md', '# Capability');
    await write('openspec/changes/capability/specs/capability/spec.md', '# Requirements');
    await write('openspec/changes/capability/tasks.md', '- [x] First milestone\n- [ ] Acceptance');
    assert.deepEqual(inspectOpenSpecPolicy(root), []);

    await write('openspec/changes/capability/tasks.md', '- [x] Acceptance');
    await write('openspec/changes/capability/evidence.json', '{}');
    await mkdir(join(root, 'openspec/changes/archive'));
    await mkdir(join(root, 'docs/status'), { recursive: true });
    assert.deepEqual(
      inspectOpenSpecPolicy(root)
        .map((finding) => finding.path)
        .sort(),
      [
        'capability/evidence.json',
        'capability/tasks.md',
        'docs/status',
        'openspec/changes/archive',
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
