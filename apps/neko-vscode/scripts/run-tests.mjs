import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const forwardedArguments = process.argv.slice(2);
const unsupportedArguments = forwardedArguments.filter(
  (argument) => argument !== '--' && argument !== '--coverage' && argument !== '--run',
);
if (unsupportedArguments.length > 0) {
  throw new Error(`Unsupported neko-suite test arguments: ${unsupportedArguments.join(', ')}`);
}

const nodeArguments = ['--test'];
if (forwardedArguments.includes('--coverage')) {
  nodeArguments.push('--experimental-test-coverage');
}
nodeArguments.push(
  fileURLToPath(new URL('./manifest.test.mjs', import.meta.url)),
  fileURLToPath(new URL('../src/scoped-extension-context.test.ts', import.meta.url)),
);

const result = spawnSync(process.execPath, nodeArguments, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
