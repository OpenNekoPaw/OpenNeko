import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
export const LEGACY_DATA_FIXTURE_ROOT = resolve(scriptRoot, 'fixtures/legacy-data-protection');
const manifestPath = join(LEGACY_DATA_FIXTURE_ROOT, 'manifest.json');

export async function readLegacyDataProtectionManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

export async function hashLegacyDataProtectionFixture(relativePath) {
  const bytes = await readFile(join(LEGACY_DATA_FIXTURE_ROOT, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

export async function assertLegacyDataProtectionFixtureUnchanged() {
  const manifest = await readLegacyDataProtectionManifest();
  for (const [relativePath, expectedHash] of Object.entries(manifest)) {
    const actualHash = await hashLegacyDataProtectionFixture(relativePath);
    if (actualHash !== expectedHash) {
      throw new Error(
        `Legacy data fixture '${relativePath}' changed: expected ${expectedHash}, received ${actualHash}.`,
      );
    }
  }
}

export async function runLegacyDataProtectionOperation(operation) {
  const before = await readLegacyDataProtectionManifest();
  await operation();
  const after = {};
  for (const relativePath of Object.keys(before)) {
    after[relativePath] = await hashLegacyDataProtectionFixture(relativePath);
  }
  for (const [relativePath, expectedHash] of Object.entries(before)) {
    if (after[relativePath] !== expectedHash) {
      throw new Error(
        `Legacy data fixture '${relativePath}' changed during protected operation: expected ${expectedHash}, received ${after[relativePath]}.`,
      );
    }
  }
}

export function describeLegacyDataProtectionFixture(relativePath) {
  const resolved = resolve(LEGACY_DATA_FIXTURE_ROOT, relativePath);
  if (!resolved.startsWith(`${LEGACY_DATA_FIXTURE_ROOT}/`)) {
    throw new Error(`Legacy data fixture path escapes fixture root: ${relativePath}`);
  }
  return relative(LEGACY_DATA_FIXTURE_ROOT, resolved);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assertLegacyDataProtectionFixtureUnchanged();
  console.log('Legacy data protection fixture hashes are unchanged.');
}
