import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSupportedArtifactValidators,
  evaluateArtifactChecks,
  resolveContainedArtifactFile,
} from './artifact-checks.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('v2 contained artifact checks', () => {
  it('passes contained absence checks and fails when the path exists', async () => {
    const workspace = await createWorkspace();
    const check = {
      id: 'absent',
      kind: 'file-absent',
      evidenceRef: 'artifact-facts',
      path: 'output/forbidden.txt',
    };
    expect(await evaluateArtifactChecks([check], { workspace, facts: {} })).toEqual([
      expect.objectContaining({ id: 'absent', status: 'pass' }),
    ]);
    await fs.mkdir(join(workspace, 'output'), { recursive: true });
    await fs.writeFile(join(workspace, 'output', 'forbidden.txt'), 'exists');
    expect(await evaluateArtifactChecks([check], { workspace, facts: {} })).toEqual([
      expect.objectContaining({ id: 'absent', status: 'fail' }),
    ]);
  });

  it('proves a contained directory has generated regular files without fixed names', async () => {
    const workspace = await createWorkspace();
    const check = {
      id: 'generated-files',
      kind: 'directory-files',
      evidenceRef: 'generated-file-facts',
      path: 'neko/generated/image',
      minFiles: 1,
    };

    expect(await evaluateArtifactChecks([check], { workspace, facts: {} })).toEqual([
      expect.objectContaining({ status: 'fail' }),
    ]);

    await fs.mkdir(join(workspace, 'neko/generated/image'), { recursive: true });
    await fs.writeFile(join(workspace, 'neko/generated/image/generated-output.png'), 'image');

    expect(await evaluateArtifactChecks([check], { workspace, facts: {} })).toEqual([
      expect.objectContaining({
        status: 'pass',
        details: expect.objectContaining({
          path: 'neko/generated/image',
          fileCount: 1,
          validatorId: 'contained-regular-files',
        }),
      }),
    ]);
  });

  it('validates a real contained JSON file through an audited public CLI', async () => {
    const workspace = await createWorkspace();
    const content = '{"ok":true}\n';
    await fs.mkdir(join(workspace, 'output'), { recursive: true });
    await fs.writeFile(join(workspace, 'output/result.json'), content);

    const [result] = await evaluateArtifactChecks(
      [
        {
          id: 'json',
          kind: 'file',
          evidenceRef: 'artifact-facts',
          path: 'output/result.json',
          digest: digest(content),
          validatorId: 'json-document-v1',
        },
      ],
      { workspace, facts: {} },
    );

    expect(result).toMatchObject({
      status: 'pass',
      details: {
        ref: 'output/result.json',
        path: 'output/result.json',
        digest: digest(content),
        validatorId: 'json-document-v1',
        validatorStatus: 'valid',
      },
    });
  });

  it('rejects traversal and symlink crossings inside the fixture workspace', async () => {
    const workspace = await createWorkspace();
    const outside = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-outside-'));
    temporaryDirectories.push(outside);
    await fs.writeFile(join(outside, 'secret.txt'), 'outside');
    await fs.symlink(outside, join(workspace, 'linked'));

    await expect(resolveContainedArtifactFile(workspace, '../escape.json')).rejects.toThrow(
      'contained fixture-relative path',
    );
    await expect(resolveContainedArtifactFile(workspace, 'linked/secret.txt')).rejects.toThrow(
      'crosses a symlink',
    );
  });

  it('rejects secret-bearing files without reflecting the secret value', async () => {
    const workspace = await createWorkspace();
    const content = 'apiKey=SHOULD_NOT_LEAK_123456\n';
    await fs.writeFile(join(workspace, 'result.txt'), content);
    const [result] = await evaluateArtifactChecks(
      [
        {
          id: 'text',
          kind: 'file',
          evidenceRef: 'artifact-facts',
          path: 'result.txt',
          digest: digest(content),
          validatorId: 'utf8-text-v1',
        },
      ],
      { workspace, facts: {} },
    );

    expect(result).toMatchObject({
      status: 'fail',
      message: 'artifact contains secret-bearing content: result.txt',
    });
    expect(JSON.stringify(result)).not.toContain('SHOULD_NOT_LEAK');
  });

  it('rejects target-package validators and dynamic business imports', () => {
    expect(() =>
      assertSupportedArtifactValidators([
        {
          kind: 'file',
          validatorId: '@neko/agent/validation',
        },
      ]),
    ).toThrow('dynamic modules, commands, and target-package imports are forbidden');
  });

  it('validates stable generated-asset facts and fails incomplete evidence', async () => {
    const workspace = await createWorkspace();
    const check = {
      id: 'asset',
      kind: 'generated-asset',
      evidenceRef: 'artifact-facts',
      ref: 'asset:scene-1',
      digest: `sha256:${'a'.repeat(64)}`,
      validatorId: 'durable-resource-ref',
    };
    const facts = {
      artifacts: [
        {
          ref: check.ref,
          kind: check.kind,
          digest: check.digest,
          provenance: { source: 'generated-asset' },
          deliveryStatus: 'delivered',
          validator: { id: check.validatorId, status: 'valid' },
        },
      ],
      evidenceCompleteness: { artifacts: { limit: 512, droppedCount: 0 } },
    };

    await expect(evaluateArtifactChecks([check], { workspace, facts })).resolves.toEqual([
      expect.objectContaining({ status: 'pass' }),
    ]);
    facts.evidenceCompleteness.artifacts.droppedCount = 1;
    await expect(evaluateArtifactChecks([check], { workspace, facts })).resolves.toEqual([
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('artifact evidence is incomplete'),
      }),
    ]);
  });

  it('reports public validator rejection as a case failure without exposing file content', async () => {
    const workspace = await createWorkspace();
    const content = '{not-json}\n';
    await fs.writeFile(join(workspace, 'invalid.json'), content);
    const [result] = await evaluateArtifactChecks(
      [
        {
          id: 'json',
          kind: 'file',
          evidenceRef: 'artifact-facts',
          path: 'invalid.json',
          digest: digest(content),
          validatorId: 'json-document-v1',
        },
      ],
      { workspace, facts: {} },
    );
    expect(result).toMatchObject({
      status: 'fail',
      message: 'public artifact validator json-document-v1 rejected artifact',
    });
    expect(JSON.stringify(result)).not.toContain(content.trim());
  });
});

async function createWorkspace() {
  const workspace = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-artifact-'));
  temporaryDirectories.push(workspace);
  return workspace;
}

function digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
