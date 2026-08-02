const RELEASE_MODE_ENVIRONMENT = 'OPENNEKO_MACOS_RELEASE';
const REQUIRED_RELEASE_ENVIRONMENT = Object.freeze([
  'MACOS_SIGNING_IDENTITY',
  'MACOS_KEYCHAIN_PATH',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]);

export function resolveMacOSForgeTrust(environment = process.env) {
  const releaseMode = environment[RELEASE_MODE_ENVIRONMENT];
  if (releaseMode === undefined) {
    return {
      release: false,
      osxSign: {
        identity: '-',
        identityValidation: false,
        optionsForFile: () =>
          ({ additionalArguments: ['--options', '0'], hardenedRuntime: false }),
      },
      osxNotarize: undefined,
    };
  }
  if (releaseMode !== 'true') {
    throw new Error(`${RELEASE_MODE_ENVIRONMENT} must be exactly 'true' when provided.`);
  }

  const values = Object.fromEntries(
    REQUIRED_RELEASE_ENVIRONMENT.map((name) => [name, readRequiredEnvironment(environment, name)]),
  );
  return {
    release: true,
    osxSign: {
      identity: values.MACOS_SIGNING_IDENTITY,
      identityValidation: true,
      keychain: values.MACOS_KEYCHAIN_PATH,
      optionsForFile: () => ({ hardenedRuntime: true }),
    },
    osxNotarize: {
      appleId: values.APPLE_ID,
      appleIdPassword: values.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: values.APPLE_TEAM_ID,
    },
  };
}

function readRequiredEnvironment(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required macOS release environment: ${name}.`);
  }
  return value;
}
