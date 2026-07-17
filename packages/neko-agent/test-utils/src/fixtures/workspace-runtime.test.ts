import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAgentWorkspaceRuntimeFixture,
  writeAgentWorkspaceRuntimeFixture,
} from './workspace-runtime';

describe('agent workspace runtime fixtures', () => {
  it('writes standard user/workspace config, skills, commands, and cache files', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-runtime-'));
    const fixture = createAgentWorkspaceRuntimeFixture({ rootDir });

    await writeAgentWorkspaceRuntimeFixture(fixture);

    await expect(fs.stat(fixture.paths.userConfigPath)).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
    await expect(fs.stat(fixture.paths.workspaceConfigPath)).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
    await expect(
      fs.readFile(
        path.join(fixture.paths.workspaceSkillsDir, 'project-review', 'SKILL.md'),
        'utf-8',
      ),
    ).resolves.toContain('project-review');
    await expect(
      fs.readFile(path.join(fixture.paths.workspaceCommandsDir, 'project-check.md'), 'utf-8'),
    ).resolves.toContain('Project check');
    await expect(fs.readFile(fixture.paths.resourceCacheManifestPath, 'utf-8')).resolves.toContain(
      '"entries": []',
    );
  });
});
