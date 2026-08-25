import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertLegacyDataProtectionFixtureUnchanged,
  describeLegacyDataProtectionFixture,
  readLegacyDataProtectionManifest,
  runLegacyDataProtectionOperation,
} from './legacy-data-protection-fixture.mjs';

describe('legacy data protection fixture', () => {
  it('has an independently reviewable hash manifest for every retired data class', async () => {
    const manifest = await readLegacyDataProtectionManifest();
    assert.deepEqual(Object.keys(manifest).sort(), [
      '.neko/opaque.dat',
      'pi-rows.sql',
      'pi-session.jsonl',
      'retired.db',
    ]);
    for (const hash of Object.values(manifest)) assert.match(hash, /^[a-f0-9]{64}$/u);
  });

  for (const operation of ['startup', 'list', 'open', 'clear', 'compact', 'failure']) {
    it(`${operation} leaves every retired fixture byte-identical`, async () => {
      await runLegacyDataProtectionOperation(async () => undefined);
    });
  }

  it('rejects fixture paths outside the protected root', () => {
    assert.throws(() => describeLegacyDataProtectionFixture('../user-data'), /escapes fixture root/);
  });
});
