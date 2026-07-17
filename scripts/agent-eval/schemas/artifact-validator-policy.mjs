export const SUPPORTED_FILE_VALIDATOR_IDS = Object.freeze([
  'json-document-v1',
  'utf8-text-v1',
  'canvas-json-v1',
]);

export const SUPPORTED_RUNTIME_VALIDATOR_IDS = Object.freeze([
  'durable-resource-ref',
  'composite-artifact-schema',
  'artifact-execution-summary',
]);

export function assertSupportedArtifactValidators(checks) {
  for (const check of checks) {
    if (check.kind === 'file-absent' || check.kind === 'directory-files') continue;
    const supported =
      check.kind === 'file' ? SUPPORTED_FILE_VALIDATOR_IDS : SUPPORTED_RUNTIME_VALIDATOR_IDS;
    if (!supported.includes(check.validatorId)) {
      throw new Error(
        `unsupported public artifact validator ${check.validatorId} for ${check.kind}; dynamic modules, commands, and target-package imports are forbidden`,
      );
    }
  }
}
