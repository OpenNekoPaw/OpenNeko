export interface MacOSForgeTrust {
  readonly osxSign: {
    readonly identity: string;
    readonly identityValidation: boolean;
    readonly continueOnError: boolean;
    readonly optionsForFile: () => {
      readonly hardenedRuntime: boolean;
      readonly additionalArguments?: string[];
    };
  };
}

export function resolveMacOSForgeTrust(): MacOSForgeTrust;
