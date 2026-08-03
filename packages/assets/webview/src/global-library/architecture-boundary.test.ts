import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../../..');

describe('Asset Management architecture boundary', () => {
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
      resolve(workspaceRoot, 'apps/neko-desktop/src/renderer/DesktopAssetManagementSurface.tsx'),
      'utf8',
    );
    expect(surface).toContain("import('@neko/assets-webview/asset-management/root')");
    expect(surface).not.toContain('packages/assets/domain/src');
  });

  it('uses one package-owned Asset Center IPC route and poisons Home asset routes', async () => {
    const ipc = await readFile(resolve(workspaceRoot, 'apps/neko-desktop/src/main/ipc.ts'), 'utf8');
    const disposeStart = ipc.indexOf('return () => {');
    expect(disposeStart).toBeGreaterThan(0);
    const registration = ipc.slice(0, disposeStart);
    const disposal = ipc.slice(disposeStart);
    expect(registration).toContain('ASSET_CENTER_HOST_CHANNEL');
    expect(disposal).toContain('ASSET_CENTER_HOST_CHANNEL');
    expect(ipc).not.toMatch(
      /DESKTOP_HOME_MANAGEMENT_CHANNELS\.(?:assets|libraryThumbnail|mediaLibraries)/u,
    );
  });
});
