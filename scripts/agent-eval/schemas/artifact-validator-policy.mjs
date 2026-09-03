export const SUPPORTED_FILE_VALIDATOR_IDS = Object.freeze([
  'json-document',
  'utf8-text',
  'canvas-json',
]);

const SUPPORTED_RUNTIME_VALIDATOR_IDS = Object.freeze([
  'content-locator',
  'composite-artifact-schema',
  'artifact-execution-summary',
]);

export function assertSupportedArtifactValidators(checks) {
  for (const check of checks) {
    if (
      check.kind === 'canvas-file-reference' ||
      check.kind === 'file-absent' ||
      check.kind === 'directory-files'
    )
      continue;
    const supported =
      check.kind === 'file' ? SUPPORTED_FILE_VALIDATOR_IDS : SUPPORTED_RUNTIME_VALIDATOR_IDS;
    if (!supported.includes(check.validatorId)) {
      throw new Error(
        `unsupported public artifact validator ${check.validatorId} for ${check.kind}; dynamic modules, commands, and target-package imports are forbidden`,
      );
    }
  }
}
