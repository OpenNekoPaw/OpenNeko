import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveElectronApplicationRegistration } from './electron-app-host.mjs';

describe('Electron application functional host registration', () => {
  it('resolves Home through its canonical application root', () => {
    assert.deepEqual(
      resolveElectronApplicationRegistration('@neko/app-home', '/repo'),
      {
        applicationId: 'home',
        rootSegments: ['apps', 'neko-home'],
        workspaceEnvironmentVariable: 'NEKO_HOME_WORKSPACE',
        targetTitle: 'OpenNeko Home',
        ownerPackage: '@neko/app-home',
        applicationRoot: '/repo/apps/neko-home',
      },
    );
  });

  it('rejects unregistered Electron product owners before launch', () => {
    assert.throws(
      () => resolveElectronApplicationRegistration('@neko/app-studio', '/repo'),
      /not registered/u,
    );
  });
});
