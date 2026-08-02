export function resolveMacOSForgeTrust() {
  return {
    osxSign: {
      identity: '-',
      identityValidation: false,
      optionsForFile: () =>
        ({ additionalArguments: ['--options', '0'], hardenedRuntime: false }),
    },
  };
}
