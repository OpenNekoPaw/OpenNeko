export interface MacOSForgeTrust {
  readonly release: boolean;
  readonly osxSign: {
    readonly identity: string;
    readonly identityValidation: boolean;
    readonly keychain?: string;
    readonly optionsForFile: () => {
      readonly hardenedRuntime: boolean;
      readonly additionalArguments?: string[];
    };
  };
  readonly osxNotarize?: {
    readonly appleId: string;
    readonly appleIdPassword: string;
    readonly teamId: string;
  };
}

export function resolveMacOSForgeTrust(
  environment?: Readonly<Record<string, string | undefined>>,
): MacOSForgeTrust;
