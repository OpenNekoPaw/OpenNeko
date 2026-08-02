import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveMacOSForgeTrust } from '../resolve-macos-forge-trust.mjs';

const RELEASE_ENVIRONMENT = Object.freeze({
  OPENNEKO_MACOS_RELEASE: 'true',
  MACOS_SIGNING_IDENTITY: 'Developer ID Application: OpenNeko (TEAMID1234)',
  MACOS_KEYCHAIN_PATH: '/tmp/openneko-release.keychain-db',
  APPLE_ID: 'release@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'app-specific-password',
  APPLE_TEAM_ID: 'TEAMID1234',
});

describe('macOS Forge trust configuration', () => {
  it('keeps local packages explicitly ad-hoc signed', () => {
    const trust = resolveMacOSForgeTrust({});
    assert.equal(trust.release, false);
    assert.equal(trust.osxSign.identity, '-');
    assert.equal(trust.osxSign.identityValidation, false);
    assert.equal(trust.osxNotarize, undefined);
    assert.equal(Object.isFrozen(trust.osxSign), false);
    assert.deepEqual(trust.osxSign.optionsForFile(), {
      additionalArguments: ['--options', '0'],
      hardenedRuntime: false,
    });
  });

  it('requires every release credential without an ad-hoc fallback', () => {
    for (const name of [
      'MACOS_SIGNING_IDENTITY',
      'MACOS_KEYCHAIN_PATH',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
    ]) {
      const environment = { ...RELEASE_ENVIRONMENT };
      delete environment[name];
      assert.throws(
        () => resolveMacOSForgeTrust(environment),
        new RegExp(`Missing required macOS release environment: ${name}`, 'u'),
      );
    }
  });

  it('enables Developer ID hardened runtime and notarization only in release mode', () => {
    const trust = resolveMacOSForgeTrust(RELEASE_ENVIRONMENT);
    assert.equal(trust.release, true);
    assert.equal(Object.isFrozen(trust.osxSign), false);
    assert.equal(Object.isFrozen(trust.osxNotarize), false);
    assert.deepEqual(trust.osxSign, {
      identity: RELEASE_ENVIRONMENT.MACOS_SIGNING_IDENTITY,
      identityValidation: true,
      keychain: RELEASE_ENVIRONMENT.MACOS_KEYCHAIN_PATH,
      optionsForFile: trust.osxSign.optionsForFile,
    });
    assert.deepEqual(trust.osxSign.optionsForFile(), { hardenedRuntime: true });
    assert.deepEqual(trust.osxNotarize, {
      appleId: RELEASE_ENVIRONMENT.APPLE_ID,
      appleIdPassword: RELEASE_ENVIRONMENT.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: RELEASE_ENVIRONMENT.APPLE_TEAM_ID,
    });
  });

  it('rejects an ambiguous release-mode value', () => {
    assert.throws(
      () => resolveMacOSForgeTrust({ OPENNEKO_MACOS_RELEASE: '1' }),
      /OPENNEKO_MACOS_RELEASE must be exactly 'true'/u,
    );
  });
});
