import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

import { resolveMacOSForgeTrust } from '../resolve-macos-forge-trust.mjs';

describe('macOS Forge trust configuration', () => {
  it('keeps every preview package explicitly ad-hoc signed', () => {
    const trust = resolveMacOSForgeTrust();
    assert.equal(trust.osxSign.identity, '-');
    assert.equal(trust.osxSign.identityValidation, false);
    assert.equal(trust.osxNotarize, undefined);
    assert.equal(Object.isFrozen(trust.osxSign), false);
    assert.deepEqual(trust.osxSign.optionsForFile(), {
      additionalArguments: ['--options', '0'],
      hardenedRuntime: false,
    });
  });

  it('has no paid Apple credential or notarization branch', async () => {
    const source = await readFile('scripts/resolve-macos-forge-trust.mjs', 'utf8');
    assert.doesNotMatch(
      source,
      /OPENNEKO_MACOS_RELEASE|MACOS_SIGNING_IDENTITY|MACOS_KEYCHAIN_PATH|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|osxNotarize/u,
    );
  });

  it('allows the DMG maker native dependency to build during frozen installs', async () => {
    const workspace = parse(await readFile('pnpm-workspace.yaml', 'utf8'));
    assert.equal(workspace.allowBuilds?.['fs-xattr'], true);
    assert.equal(workspace.allowBuilds?.['macos-alias'], true);
  });
});
