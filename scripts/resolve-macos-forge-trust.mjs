const PACKAGED_DSH_PAYLOAD_SEGMENT = '/Contents/Resources/dsh-runtime/darwin-arm64/payload/';

export function preservePackagedDshRuntimeSignature(filePath) {
  return filePath.includes(PACKAGED_DSH_PAYLOAD_SEGMENT);
}

export function resolveMacOSForgeTrust() {
  return {
    osxSign: {
      identity: '-',
      identityValidation: false,
      // Packager otherwise hides signing failures in Forge's quiet mode.
      continueOnError: false,
      ignore: preservePackagedDshRuntimeSignature,
      optionsForFile: () => ({ additionalArguments: ['--options', '0'], hardenedRuntime: false }),
    },
  };
}
