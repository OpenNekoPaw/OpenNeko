import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../../..');

describe('World production path boundaries', () => {
  it('keeps the basic runtime bound to exact WorldVersion authority', () => {
    const runtimeService = readFileSync(
      resolve(packageRoot, 'src/application/world-runtime-service.ts'),
      'utf8',
    );
    const worldContract = readFileSync(resolve(packageRoot, 'src/contracts/world.ts'), 'utf8');

    expect(runtimeService).toContain('readPublication(input.worldVersionId');
    expect(runtimeService).toContain('publication.worldVersionId !== input.worldVersionId');
    expect(runtimeService).not.toMatch(/worldExperienceVersion/iu);
    expect(runtimeService).not.toMatch(/(?:latest|active|recent|first)WorldVersion/iu);
    expect(worldContract).not.toContain('parseWorldExperienceVersion');
  });

  it('does not promote a Foundation Run into complete World Experience availability', () => {
    const shellService = readFileSync(
      resolve(repositoryRoot, 'packages/host/src/desktop-shell-service.ts'),
      'utf8',
    );

    expect(shellService).toContain('World Experience');
    expect(shellService).toContain('unavailable');
    expect(shellService).not.toMatch(
      /WorldRun.*WorldExperienceVersion|WorldExperienceVersion.*WorldRun/su,
    );
  });

  it('keeps production management off the broad Foundation snapshot and command path', () => {
    const managementRoot = readFileSync(
      resolve(repositoryRoot, 'packages/world/webview/src/management.tsx'),
      'utf8',
    );
    const desktopShell = readFileSync(
      resolve(repositoryRoot, 'apps/neko-desktop/src/renderer/DesktopShell.tsx'),
      'utf8',
    );
    const durableCatalog = readFileSync(
      resolve(packageRoot, 'src/application/world-durable-catalog.ts'),
      'utf8',
    );

    expect(managementRoot).toContain('OpenNekoDesktopWorldManagementBridge');
    expect(managementRoot).not.toMatch(/WorldFoundationSnapshot|WorldFoundationCommand/u);
    expect(desktopShell).toContain('window.openNekoDesktop.worldManagement');
    expect(durableCatalog).not.toContain('createWorldDurableCatalogPort');
    expect(durableCatalog).not.toContain('WorldDurableCatalogPort');
  });

  it('keeps authoring preview pure and deletes preview-to-runtime creation', () => {
    const previewService = readFileSync(
      resolve(packageRoot, 'src/application/world-authoring-preview-service.ts'),
      'utf8',
    );
    const authoringContract = readFileSync(
      resolve(packageRoot, 'src/contracts/world-authoring-host.ts'),
      'utf8',
    );
    const worldWebview = readFileSync(
      resolve(repositoryRoot, 'packages/world/webview/src/authoring.tsx'),
      'utf8',
    );

    expect(previewService).not.toMatch(/WorldRuntime|repository|createRun|WorldSave|WorldEvent/u);
    expect(existsSync(resolve(packageRoot, 'src/contracts/world-foundation-host.ts'))).toBe(false);
    expect(
      existsSync(resolve(packageRoot, 'src/application/world-foundation-command-service.ts')),
    ).toBe(false);
    for (const source of [authoringContract, worldWebview]) {
      expect(source).not.toContain('world-preview-run-create');
      expect(source).not.toMatch(/WorldFoundationSnapshot|WorldFoundationCommand/u);
    }
  });

  it('does not register the deleted mixed Foundation bridge in Desktop production', () => {
    const sources = [
      'apps/neko-desktop/src/main/app-host.ts',
      'apps/neko-desktop/src/main/ipc.ts',
      'apps/neko-desktop/src/preload/index.ts',
      'apps/neko-desktop/src/shared/global.d.ts',
      'packages/world/webview/src/root.tsx',
    ].map((path) => readFileSync(resolve(repositoryRoot, path), 'utf8'));

    for (const source of sources) {
      expect(source).not.toMatch(
        /OpenNekoDesktopWorldBridge|WORLD_FOUNDATION_HOST_CHANNEL|worldFoundation|WorldFoundationRoot/u,
      );
    }
  });

  it('keeps runtime mutation behind the World owner commit boundary', () => {
    const management = readFileSync(
      resolve(repositoryRoot, 'packages/world/webview/src/management.tsx'),
      'utf8',
    );
    const authoring = readFileSync(
      resolve(repositoryRoot, 'packages/world/webview/src/authoring.tsx'),
      'utf8',
    );
    const runtimePresentation = readFileSync(
      resolve(repositoryRoot, 'packages/world/webview/src/runtime.tsx'),
      'utf8',
    );
    const runtimeOwner = readFileSync(
      resolve(packageRoot, 'src/application/world-runtime-workbench-service.ts'),
      'utf8',
    );

    for (const source of [management, authoring]) {
      expect(source).not.toMatch(/commitAction|appendEvent|mutateRuntime|WorldState/u);
    }
    expect(runtimePresentation).toContain('host.submitAction');
    expect(runtimePresentation).not.toMatch(/appendEvent|mutateRuntime|useReducer/u);
    expect(runtimeOwner).toContain('this.options.runtime.commitAction');
  });
});
