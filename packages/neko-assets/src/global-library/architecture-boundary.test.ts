import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Global Library architecture boundary', () => {
  it('keeps browser-safe package entries free of Electron and Node runtime imports', async () => {
    const sources = await Promise.all(
      ['contract.ts', 'controller.ts', 'root.tsx', 'labels.ts'].map((file) =>
        readFile(new URL(file, import.meta.url), 'utf8'),
      ),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/from ['"]electron['"]/u);
      expect(source).not.toMatch(/from ['"]node:/u);
    }
  });

  it('keeps the Desktop renderer adapter on package public entries', async () => {
    const surface = await readFile(
      new URL(
        '../../../../apps/neko-desktop/src/renderer/DesktopGlobalLibrarySurface.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(surface).toContain("import('neko-assets/global-library/root')");
    expect(surface).not.toContain('packages/neko-assets/src');
  });

  it('registers and deterministically releases every global-library IPC route', async () => {
    const ipc = await readFile(
      new URL('../../../../apps/neko-desktop/src/main/ipc.ts', import.meta.url),
      'utf8',
    );
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
