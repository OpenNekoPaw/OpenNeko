import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JviProjectLoader } from '../project/JviProjectLoader';

const tempRoots: string[] = [];

describe('JviProjectLoader workspace media paths', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves .jvi media paths from the owning workspace before document directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-cut-jvi-'));
    tempRoots.push(root);
    const projectDir = path.join(root, 'projects', 'cut');
    const workspaceClip = path.join(root, 'cases', 'clip.mp4');
    const legacyClip = path.join(root, 'projects', 'cases', 'legacy.mp4');
    fs.mkdirSync(path.dirname(workspaceClip), { recursive: true });
    fs.mkdirSync(path.dirname(legacyClip), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(workspaceClip, '');
    fs.writeFileSync(legacyClip, '');

    const projectPath = path.join(projectDir, 'project.nkv');
    const loader = new JviProjectLoader(projectPath, {
      owningWorkspaceRoot: root,
      workspaceRoots: [root],
      documentDir: projectDir,
      allowedRoots: [root],
    });

    expect(loader.resolvePath('cases/clip.mp4')).toBe(workspaceClip);
    expect(loader.resolvePath('../cases/legacy.mp4')).toBe(legacyClip);
  });
});
