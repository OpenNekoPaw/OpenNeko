import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(engineRoot, '..', '..');
const cargo = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
  cwd: engineRoot,
  encoding: 'utf8',
});

if (cargo.error) {
  throw cargo.error;
}
if (cargo.status !== 0) {
  throw new Error(cargo.stderr || `cargo metadata exited with status ${cargo.status}`);
}

const metadata = JSON.parse(cargo.stdout);
const packagesById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const workspacePackages = metadata.workspace_members.map((id) => packagesById.get(id));
const missingPackages = workspacePackages.filter((pkg) => pkg === undefined);
if (missingPackages.length > 0) {
  throw new Error('Cargo metadata contains unresolved workspace package identifiers.');
}

const expectedWorkspacePackages = new Set([
  'neko-engine-types',
  'neko-engine-codec',
  'neko-engine-audio',
  'neko-engine-gpu',
  'neko-runtime-media',
  'neko-engine-kernel',
  'neko-host-api',
  'neko-host-http',
  'neko-host-cli',
  'neko-host-napi',
]);
const actualWorkspacePackages = new Set(workspacePackages.map((pkg) => pkg.name));

for (const name of expectedWorkspacePackages) {
  if (!actualWorkspacePackages.has(name)) {
    throw new Error(`Missing retained Engine workspace package: ${name}`);
  }
}
for (const name of actualWorkspacePackages) {
  if (!expectedWorkspacePackages.has(name)) {
    throw new Error(`Unexpected Engine workspace package: ${name}`);
  }
}

const forbiddenDependencies = new Set([
  'neko-engine-scene-renderer',
  'neko-engine-puppet-renderer',
  'neko-engine-panoramic-renderer',
  'neko-runtime-scene',
  'neko-runtime-puppet',
  'neko-runtime-device',
  'neko-runtime-ml',
  'bevy_ecs',
  'gltf',
  'ort',
  'ndarray',
  'rustfft',
  'cpal',
  'hound',
  'zip',
]);

for (const pkg of workspacePackages) {
  for (const dependency of pkg.dependencies) {
    if (forbiddenDependencies.has(dependency.name)) {
      throw new Error(`${pkg.name} retains forbidden dependency ${dependency.name}`);
    }
  }
}

const publicSurfaceFiles = [
  'packages/neko-client/src/EngineClient.ts',
  'packages/neko-client/src/engine/types.ts',
  'packages/neko-engine/packages/extension/src/agentCapabilityProvider.ts',
  'packages/neko-agent/packages/extension/src/services/engineClientProvider.ts',
];
const forbiddenSurfacePatterns = [
  /readFileEntry/,
  /createDocumentLowLevelAccess/,
  /\.perception\.(?:transcribe|similarity|classify|detectShots)/,
  /['"](?:models|model-preview|scenes|puppets|viewport|live-compositor|cameras|midi|gamepad)['"]/,
];

for (const relativePath of publicSurfaceFiles) {
  const source = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  for (const pattern of forbiddenSurfacePatterns) {
    if (pattern.test(source)) {
      throw new Error(`${relativePath} retains removed Engine surface ${pattern}`);
    }
  }
}

process.stdout.write('Rust Media Engine dependency closure is valid.\n');
