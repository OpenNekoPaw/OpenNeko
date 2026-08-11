import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceContentLocator } from '../workspace-content-locator';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('resolveWorkspaceContentLocator', () => {
  it('authorizes an immutable generated output only when its digest matches', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-generated-output-path-'));
    roots.push(workspacePath);
    const relativePath = 'neko/generated/image/frame.png';
    const bytes = Buffer.from('generated-image');
    await mkdir(path.dirname(path.join(workspacePath, relativePath)), { recursive: true });
    await writeFile(path.join(workspacePath, relativePath), bytes);
    const locator = {
      kind: 'generated-output' as const,
      outputId: 'generated-frame-1',
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      path: relativePath,
    };

    await expect(resolveWorkspaceContentLocator(workspace(workspacePath), locator)).resolves.toBe(
      await realpath(path.join(workspacePath, relativePath)),
    );
    await expect(
      resolveWorkspaceContentLocator(workspace(workspacePath), {
        ...locator,
        digest: 'sha256:stale-generated-frame',
      }),
    ).rejects.toThrow('Generated output content is unavailable: content-changed.');
  });

  it('rejects locator kinds without a file-backed Workspace path', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-non-file-content-path-'));
    roots.push(workspacePath);

    await expect(
      resolveWorkspaceContentLocator(workspace(workspacePath), {
        kind: 'package-resource',
        packageId: 'package-1',
        revision: 'release-1',
        resourcePath: 'image.png',
      }),
    ).rejects.toThrow('workspace-file or generated-output ContentLocator');
  });
});

function workspace(workspacePath: string) {
  return {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative' as const, value: '.' },
  };
}
