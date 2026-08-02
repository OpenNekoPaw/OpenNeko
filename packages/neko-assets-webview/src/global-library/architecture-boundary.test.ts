import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

describe('Global Library architecture boundary', () => {
  it('keeps browser-safe package entries free of Electron and Node runtime imports', async () => {
    const sources = await Promise.all(
      ['root.tsx', 'labels.ts'].map((file) =>
        readFile(resolve(packageRoot, 'src/global-library', file), 'utf8'),
      ),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/from ['"]electron['"]/u);
      expect(source).not.toMatch(/from ['"]node:/u);
    }
  });

  it('keeps the Desktop renderer adapter on package public entries', async () => {
    const surface = await readFile(
      resolve(workspaceRoot, 'apps/neko-desktop/src/renderer/DesktopGlobalLibrarySurface.tsx'),
      'utf8',
    );
    expect(surface).toContain("import('@neko-assets/webview/global-library/root')");
    expect(surface).not.toContain('packages/neko-assets-domain/src');
  });

  it('registers and deterministically releases every global-library IPC route', async () => {
    const ipc = await readFile(resolve(workspaceRoot, 'apps/neko-desktop/src/main/ipc.ts'), 'utf8');
    const disposeStart = ipc.indexOf('return () => {');
    expect(disposeStart).toBeGreaterThan(0);
    const registration = ipc.slice(0, disposeStart);
    const disposal = ipc.slice(disposeStart);
    for (const channel of [
      'assetsSearch',
      'assetsImport',
      'assetsRemove',
      'libraryThumbnailResolve',
      'mediaLibrariesSearch',
      'mediaLibrariesChildren',
      'mediaLibrariesAdd',
      'mediaLibrariesRelink',
      'mediaLibrariesRemove',
      'mediaLibrariesReveal',
    ]) {
      const route = `DESKTOP_HOME_MANAGEMENT_CHANNELS.${channel}`;
      expect(registration).toContain(route);
      expect(disposal).toContain(route);
    }
  });
});
